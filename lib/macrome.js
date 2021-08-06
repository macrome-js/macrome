'use strict';

const { join, dirname, basename, extname, relative } = require('path');
const { unlink } = require('fs').promises;
const requireFresh = require('import-fresh');
const findUp = require('find-up');
const {
  __map,
  map,
  flat,
  asyncToArray,
  asyncFilter,
  asyncMap,
  flatMap,
  execPipe,
  when,
  wrapValues,
} = require('iter-tools-es');

const { traverse } = require('./traverse');
const { WatchmanClient } = require('./watchman');
const { StaticApi, ChangesetApi, MapChangeApi } = require('./apis');
const { Changeset } = require('./changeset');
const { matches } = require('./matchable');
const { groupBy } = require('./utils/map');
const { logger } = require('./utils/logger');
const { buildOptions } = require('./config');

const accessors = require('./accessors');
const { ADD, REMOVE, UPDATE } = require('./operations');
const { vcsConfigs } = require('./vcs-configs');

class Macrome {
  constructor(apiOptions) {
    const options = buildOptions(apiOptions);
    const { root, quiet } = options;

    if (quiet) logger.notice.disable();

    const vcsDir = findUp.sync(
      vcsConfigs.map((c) => c.dir),
      {
        type: 'directory',
        cwd: root,
      },
    );

    if (!vcsDir) {
      throw new Error('Macrome expects to be used inside a version controlled project.');
    }

    const vcsDirName = basename(vcsDir);
    this.vcsConfig = vcsConfigs.find(({ dir }) => dir === vcsDirName);
    this.vcsRoot = dirname(vcsDir);

    this.options = options;
    this.root = root;
    this.generators = new Map();
    this.changesets = new Map();

    const stubs = options.generators.map(([path, options]) => {
      const _options = { ...options, logger };
      const resolvedPath = require.resolve(path, { paths: [this.root] });
      const vcsPath = path.startsWith('.') ? relative(this.vcsRoot, resolvedPath) : path;

      return { options: _options, path, resolvedPath, vcsPath };
    });

    this.generatorStubs = groupBy((stub) => stub.resolvedPath, stubs);

    this.staticApi = new StaticApi(this);

    this.accessorsByFileType = new Map(
      // we do not yet have types for which more than one accessor may be valid
      flatMap((axr) => map((type) => [type, axr], axr.supportedFileTypes), accessors),
    );

    for (const generatorPath of this.generatorStubs.keys()) {
      this.instantiateGenerators(generatorPath);
    }
  }

  get generatorInstances() {
    return flat(1, wrapValues(this.generators));
  }

  get logger() {
    return logger;
  }

  instantiateGenerators(generatorPath) {
    const Generator = requireFresh(generatorPath);

    this.generators.set(generatorPath, []);

    for (const stub of this.generatorStubs.get(generatorPath)) {
      const { vcsPath, options } = stub;
      const { parser } = this.options;

      const paths = new Map();
      const generator = new Generator({
        vcsPath,
        parser,
        ...options,
      });

      this.generators.get(generatorPath).push({ generator, vcsPath, paths });
    }
  }

  accessorFor(path) {
    return this.accessorsByFileType.get(extname(path).slice(1));
  }

  // where the magic happens
  async processChanges(changes) {
    const { changesets, staticApi, generatorInstances } = this;

    const rootChanges = await execPipe(
      changes,
      flatMap((change) => {
        // maybe when should give its first arg to its callback?
        const accessor = this.accessorFor(change.path);
        return when(accessor, [{ ...change, accessor }]);
      }),
      asyncMap(async (change) => {
        const { path, operation, accessor } = change;
        const metadata =
          operation === REMOVE ? null : await accessor.readAnnotations(this.resolve(path));
        return { ...change, metadata };
      }),
      // root changes changes are changes to non-generated files
      asyncFilter(({ metadata }) => !metadata),
      asyncToArray,
    );
    // Assumption: two input changes will not both write the same output file
    //   we could detect this and error (or warn and let the later gen overwrite?)
    //     allows us to parallelize

    // TODO parallelize
    // may want to factor out runners, parallel and non-parallel a la jest
    for (const change of rootChanges) {
      const { path } = change;

      if (change.operation === REMOVE) {
        const changeset = changesets.get(path);

        if (changeset) {
          // Remove the root file and files it caused to be generated
          for (const path of changeset.paths) {
            if (path !== change.path && (await this.hasHeader(path))) {
              await unlink(this.resolve(path));
            }
          }
          // Remove any map results the file made
          for (const { generator, paths: genPaths } of this.generatorInstances) {
            if (matches(change.path, generator)) {
              genPaths.delete(change.path);
            }
          }
          changesets.delete(changeset);
        }
      } else {
        const changeset = new Changeset(change);
        const changesetApi = ChangesetApi.fromStaticApi(staticApi, changeset);
        changesets.set(path, changeset);

        await changeset.transact(async (queue) => {
          // apis expand queue as processing is done
          for (const change of queue) {
            // Generator loop is inside change queue loop
            for (const { generator, vcsPath: genPath, paths: genPaths } of generatorInstances) {
              if (matches(change.path, generator)) {
                const api = MapChangeApi.fromChangesetApi(changesetApi, genPath, change.path);
                // generator.map()
                const mapResult = generator.map ? await generator.map(api, change) : change;

                genPaths.set(change.path, { ...change, mapResult });
              }
            }
          }
        });
      }
    }

    for (const { generator, paths: genPaths } of this.generatorInstances) {
      if (generator.reduce && genPaths.size) {
        await generator.reduce(genPaths);
      }
    }
  }

  async build() {
    const { alwaysIgnored: ignored } = this.options;

    const paths = await traverse(this.root, { ignored });

    await this.processChanges(__map(paths, (path) => ({ path, operation: ADD })));

    // TODO remove files which had headers but have not been generated
    // How?
    // build changeset data structure (paths) from disk the first time around?
    // then we can reuse the diffing algorithm that is usually responsible for pruning
    // prune uncollected nodes
    // gotta build a graph
    // use the metadata cache?
    //   included non-generated files in that cache e.g. as null-valued?
    //   or have a separate set rootPaths?
    //     that exists it's changesets
  }

  async initializeChanges(changes) {
    const { metadataCache, changesets } = this;

    const macromeChanges = flatMap((change) => {
      // maybe when should give its first arg to its callback?
      const accessor = this.accessorFor(change.path);
      return when(accessor, [{ ...change, accessor }]);
    }, changes);

    for (const change of macromeChanges) {
      const { path, operation, accessor } = change;
      if (operation === REMOVE) {
        metadataCache.delete(path);
      } else {
        const metadata = await accessor.readAnnotations(this.resolve(path));
        if (metadata) {
          metadataCache.set(path, metadata);
        } else {
          changesets.set(path, new Changeset(change));
        }
      }
    }

    // move this to changesets
    // keep a "wide" map of changesets here
    const children = new Map(); // A tree, in fact

    for (const [path, metadata] of this.metadataCache) {
      const generatedBy = metadata.get('generatedby');
      if (!children.has(generatedBy)) {
        children.set(generatedBy, []);
      }

      children.get(generatedBy).push(path);
    }
  }

  async getRootChanges(changes) {
    return await execPipe(
      changes,
      flatMap((change) => {
        // maybe when should give its first arg to its callback?
        const accessor = this.accessorFor(change.path);
        return when(accessor, [{ ...change, accessor }]);
      }),
      // root changes changes are changes to non-generated files
      asyncFilter(({ metadata }) => !metadata),
      asyncToArray,
    );
  }

  async watch() {
    const { vcsRoot } = this;
    const { alwaysIgnored: ignored } = this.options;
    const client = new WatchmanClient(this.root);

    this.watchClient = client;

    await client.version({
      required: [
        'cmd-watch-project',
        'cmd-subscribe',
        'cmd-clock',
        'cmd-flush-subscriptions',
        'term-allof',
        'term-anyof',
        'term-not',
        'term-match',
        'wildmatch',
        'field-name',
        'field-exists',
        'field-new',
        'field-type',
        'field-mtime_ms',
        'relative_root',
      ],
    });

    await client.watchProject(vcsRoot);

    await this.build();

    await client.flushSubscriptions();
    const { clock: startClock } = await client.clock();

    logger.notice('Initial generation completed; watching for changes...');

    // await client.subscribe(
    //   '',
    //   'macrome-generators',
    //   {
    //     defer_vcs: true,
    //     expression: expressionFromMatchable({
    //       files: [
    //         ...filter(
    //           (resolvedPath) => !resolvedPath.startsWith('..'),
    //           map((resolvedPath) => relative(vcsRoot, resolvedPath), this.generatorStubs.keys()),
    //         ),
    //       ],
    //     }),
    //   },
    //   (files) => {
    //     for (const file of files) {
    //       this.instantiateGenerators(join(vcsRoot, file.name));
    //     }
    //   },
    // );

    // Establish one watch for all changes. Separate watches per generator would cause each
    // generator to run on all its inputs before another generator could begin.
    // This would prevent parallelization.
    await client.subscribe(
      '', // **
      'macrome-main',
      {
        matchable: { ignored },
        defer_vcs: true,
        fields: ['name', 'mtime_ms', 'exists', 'type', 'new'],
        since: startClock,
      },
      async (files) => {
        await this.processChanges(
          __map(files, ({ name: path, exists, new: new_ }) => ({
            path,
            operation: !exists ? REMOVE : new_ ? ADD : UPDATE,
          })),
        );
      },
    );
  }

  async stopWatching() {
    this.watchClient.end();
  }

  async hasHeader(path) {
    const accessor = this.accessorFor(path);

    return accessor != null && (await accessor.readAnnotations(this.resolve(path))) != null;
  }

  async clean() {
    const { alwaysIgnored: ignored } = this.options;

    const paths = await traverse(this.root, { ignored });

    for (const path of paths) {
      if (await this.hasHeader(path)) {
        await unlink(this.resolve(path));
      }
    }
  }

  async check() {
    if (this.vcsConfig.isDirty(this.root)) {
      logger.warn('Check was run with vcs changes in the working dir and cannot succeed');
      return false;
    }

    await this.build();

    return !this.vcsConfig.isDirty(this.root);
  }

  relative(path) {
    return relative(this.root, path);
  }

  resolve(path) {
    return join(this.root, path);
  }
}

module.exports = { Macrome };
