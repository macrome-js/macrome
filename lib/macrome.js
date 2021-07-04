'use strict';

const { join, dirname, basename, extname, relative } = require('path');
const { unlink } = require('fs').promises;
const requireFresh = require('import-fresh');
const findUp = require('find-up');
const {
  filter,
  map,
  flat,
  find,
  arrayFromAsync,
  asyncFilter,
  asyncMap,
  flatMap,
} = require('iter-tools-es');

const accessors = require('./accessors');

const { traverse } = require('./traverse');
const { MacromeWatchmanClient } = require('./watchman');
const { MapChangeApi } = require('./apis');
const { Changeset } = require('./changeset');
const { matches } = require('./matchable');
const { groupBy } = require('./utils/map');
const { EphemeralSet } = require('./utils/ephemeral');

const { buildOptions } = require('./config');
const { ADD, REMOVE, UPDATE } = require('./operations');
const { vcsConfigs } = require('./vcs-configs');

class Macrome {
  constructor(apiOptions) {
    const options = buildOptions(apiOptions);
    const { rootPath, logger: projectLogger } = options;

    const vcsDir = findUp.sync(
      vcsConfigs.map((c) => c.dir),
      {
        type: 'directory',
        cwd: rootPath,
      },
    );

    if (!vcsDir) {
      throw new Error('Macrome expects to be used inside a version controlled project.');
    }

    const vcsDirName = basename(vcsDir);
    this.vcsConfig = vcsConfigs.find(({ dir }) => dir === vcsDirName);
    this.vcsRoot = dirname(vcsDir);

    this.options = options;
    this.rootPath = rootPath;
    this.generators = new Map();
    this.changesets = new Map();
    this.duplicatePaths = null;

    const stubs = options.generators.map(([path, { logger = projectLogger, ...options_ }]) => {
      const options = { logger, ...options_ };
      const resolvedPath = require.resolve(path, { paths: [this.rootPath] });
      const vcsPath = path.startsWith('.') ? relative(this.vcsRoot, resolvedPath) : path;

      return { options, path, resolvedPath, vcsPath };
    });

    this.generatorStubs = groupBy((stub) => stub.resolvedPath, stubs);

    this.accessorsByFileType = new Map(
      // we do not yet have types for which more than one accessor may be valid
      flatMap((axr) => map((type) => [type, axr], axr.supportedFileTypes), accessors),
    );

    for (const generatorPath of this.generatorStubs.keys()) {
      this.instantiateGenerators(generatorPath);
    }
  }

  get generatorInstances() {
    return flat(1, this.generators.values());
  }

  get logger() {
    return this.options.logger;
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
    const ext = extname(path).slice(1);

    const accessor = this.accessorsByFileType.get(ext);

    if (!accessor) {
      throw new Error(`No accessor supports files with extension \`${ext}\`\n  path: ${path}`);
    }

    return accessor;
  }

  async watcherProcess(changes) {
    const { duplicatePaths } = this;

    // Filter out changes generators make -- changesets handle chaining those
    const externalChanges = changes.filter(({ path }) => !duplicatePaths.has(path));

    if (externalChanges.length) {
      await this.processChanges(externalChanges);
    }
  }

  async initialProcess(changes) {
    await this.processChanges(changes);
  }

  // where the magic happens
  async processChanges(rootChanges) {
    const { changesets } = this;
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
              await unlink(path);
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
        changesets.set(path, changeset);

        // apis expand queue as processing is done
        for (const change of changeset.queue) {
          // Generator loop is inside change queue loop
          for (const { generator, vcsPath: genPath, paths: genPaths } of this.generatorInstances) {
            if (matches(change.path, generator)) {
              // Changes made through this api feed back into the queue
              const api = new MapChangeApi(this, changeset, genPath, change.path);

              // generator.map()
              const mapResult = generator.map ? await generator.map(api, change) : change;

              genPaths.set(change.path, { ...change, mapResult });
            }
          }
        }
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

    const initialPaths = await traverse(this.rootPath, { ignored });
    const rootPaths = asyncFilter(async (path) => {
      return (
        find(({ generator }) => matches(path, generator), this.generatorInstances) &&
        !(await this.hasHeader(path))
      );
    }, initialPaths);
    const rootChanges = await arrayFromAsync(
      asyncMap((path) => ({ path, operation: ADD }), rootPaths),
    );

    await this.initialProcess(rootChanges);

    // TODO remove files which had headers but have not been generated
  }

  async watch() {
    const { alwaysIgnored: ignored } = this.options;
    const watchClient = new MacromeWatchmanClient(this.rootPath, this.vcsRoot, this.vcsConfig, {
      logger: this.logger,
    });
    const duplicatePaths = new EphemeralSet();

    this.watchClient = watchClient;
    this.duplicatePaths = duplicatePaths;

    await watchClient.version({
      required: [
        'cmd-watch-project',
        'cmd-subscribe',
        'cmd-state-enter',
        'cmd-state-leave',
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
      ],
    });
    await watchClient.watchMacromeProject();

    await this.build();

    await watchClient.flushSubscriptions();
    const { clock: startClock } = await watchClient.clock();

    this.logger.log('Initial generation completed; watching for changes...');

    await watchClient.watchVCSLock();

    await watchClient.subscribe(
      '',
      'macrome-generators',
      {
        defer: ['vcs_lock_held'],
        defer_vcs: false, // for consistency always do our version
        expression: [
          'name',
          [
            ...filter(
              (resolvedPath) => !resolvedPath.startsWith('..'),
              map(
                (resolvedPath) => relative(this.vcsRoot, resolvedPath),
                this.generatorStubs.keys(),
              ),
            ),
          ],
          'wholename',
        ],
      },
      (files) => {
        for (const file of files) {
          this.instantiateGenerators(join(this.vcsRoot, file.name));
        }
      },
    );

    await watchClient.subscribe(
      '', // **
      'macrome-main',
      {
        ignored,
        drop: ['vcs_lock_held'],
        defer_vcs: false, // Don't try to defer AND drop based on the vcs lock
        fields: ['name', 'mtime_ms', 'exists', 'type', 'new'],
        since: startClock,
      },
      async (files) => {
        await this.watcherProcess(
          files.map((file) => ({
            operation: !file.exists ? REMOVE : file.new ? ADD : UPDATE,
            path: file.name,
          })),
        );
      },
    );
  }

  async stopWatching() {
    this.watchClient.end();
  }

  async hasHeader(path) {
    const accessor = this.accessorsByFileType.get(extname(path).slice(1));

    if (!accessor) return false;

    const annotations = await this.accessorFor(path).readAnnotations(path);
    return annotations === null ? false : !!annotations.get('macrome');
  }

  async clean() {
    const { alwaysIgnored: ignored } = this.options;

    const paths = await traverse(this.rootPath, { ignored });

    for (const path of paths) {
      if (await this.hasHeader(path)) {
        await unlink(path);
      }
    }
  }

  async check() {
    if (this.vcsConfig.isDirty()) {
      this.logger.warn('Check was run with vcs changes in the working dir and cannot succeed');
      return false;
    }

    await this.clean();
    await this.build();

    return !this.vcsConfig.isDirty();
  }

  relative(path) {
    return relative(this.rootPath, path);
  }

  resolve(path) {
    return join(this.rootPath, path);
  }
}

module.exports = { Macrome };
