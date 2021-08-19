import { join, dirname, basename, extname, relative } from 'path';
import { promises as fsPromises } from 'fs';
import requireFresh from 'import-fresh';
import findUp from 'find-up';
import { map, flat, filter, arrayFromAsync, asyncFilter, asyncMap, flatMap } from 'iter-tools-es';

import { traverse } from './traverse';
import { WatchmanClient, expressionFromMatchable } from './watchman';
import { MapChangeApi } from './apis';
import { Changeset } from './changeset';
import { matches } from './matchable';
import { groupBy } from './utils/map';
import { logger } from './utils/logger';
import { buildOptions, Options, BuiltOptions } from './config';

import accessors from './accessors';
import { ADD, Operation, REMOVE, UPDATE } from './operations';
import { vcsConfigs, VCSConfig } from './vcs-configs';
import { Accessor, Generator, Change } from './types';

const { unlink } = fsPromises;

type GeneratorStub = {
  options: Record<string, any>;
  path: string;
  resolvedPath: string;
  vcsPath: string;
};

export class Macrome {
  vcsConfig: VCSConfig | null;
  watchRoot: string;

  options: BuiltOptions;
  root: string;
  generatorStubs: Map<string, Array<GeneratorStub>>;
  generators: Map<
    string,
    Array<{
      generator: Generator<unknown>;
      vcsPath: string;
      paths: Map<string, { change: Change; mapResult: unknown }>;
    }>
  >;
  changesets: Map<string, Changeset>;
  watchClient: WatchmanClient | null;

  accessorsByFileType: Map<string, Accessor>;

  constructor(apiOptions: Options) {
    const options = buildOptions(apiOptions);

    this.options = options;

    const { root, quiet } = options;

    if (quiet) logger.notice.disable();

    const vcsDir = findUp.sync(
      vcsConfigs.map((c) => c.dir),
      {
        type: 'directory',
        cwd: root,
      },
    );

    this.root = root;
    this.watchRoot = dirname(vcsDir || root);
    this.generators = new Map();
    this.changesets = new Map();
    this.watchClient = null;
    this.vcsConfig = null;

    if (vcsDir) {
      const vcsDirName = basename(vcsDir);
      const vcsConfig = vcsConfigs.find(({ dir }) => dir === vcsDirName) || null;

      this.vcsConfig = vcsConfig;
    }

    const stubs = options.generators.map(([path, options]) => {
      const _options = { ...options, logger };
      const resolvedPath = require.resolve(path, { paths: [this.root] });
      const vcsPath = path.startsWith('.') ? relative(this.watchRoot, resolvedPath) : path;

      return { options: _options, path, resolvedPath, vcsPath };
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

  private get generatorInstances() {
    return flat(1, this.generators.values());
  }

  get logger(): any {
    return logger;
  }

  instantiateGenerators(generatorPath: string): void {
    const Generator: Generator<unknown> = requireFresh(generatorPath);

    this.generators.set(generatorPath, []);

    const stubs = this.generatorStubs.get(generatorPath)!;

    for (const stub of stubs) {
      const { vcsPath } = stub;
      const paths = new Map();
      const generator = new Generator(stub.options);

      this.generators.get(generatorPath)!.push({ generator, vcsPath, paths });
    }
  }

  accessorFor(path: string): Accessor | null {
    const ext = extname(path).slice(1);

    return this.accessorsByFileType.get(ext) || null;
  }

  // where the magic happens
  async processChanges(rootChanges: Array<Change>): Promise<void> {
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
              await unlink(this.resolve(path));
            }
          }
          // Remove any map results the file made
          for (const { generator, paths: genPaths } of this.generatorInstances) {
            if (matches(change.path, generator)) {
              genPaths.delete(change.path);
            }
          }
          changesets.delete(path);
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
              const api = new MapChangeApi(this, genPath, changeset);

              // generator.map()
              const mapResult = generator.map ? await generator.map(api, change) : change;

              genPaths.set(change.path, { change, mapResult });
            }
          }
        }
      }
    }

    for (const { generator, paths: genPaths } of this.generatorInstances) {
      if (generator.reduce && genPaths.size) {
        await generator.reduce(null!, genPaths);
      }
    }
  }

  async build(): Promise<void> {
    const { alwaysIgnored: ignored } = this.options;

    const initialPaths = [
      ...filter(
        (path) => !!this.accessorFor(path),
        await traverse(this.root, { excludeFiles: ignored }),
      ),
    ];
    const roots = asyncFilter(async (path) => !(await this.hasHeader(path)), initialPaths);
    const rootChanges = await arrayFromAsync(
      asyncMap((path) => ({ path, operation: ADD as Operation }), roots),
    );

    await this.processChanges(rootChanges);

    const generatedPaths = new Set(flatMap(({ paths }) => paths, this.changesets.values()));

    // remove files which had headers but were not generated
    for (const path of initialPaths) {
      if (!generatedPaths.has(path)) {
        await unlink(this.resolve(path));
      }
    }
  }

  async watch(): Promise<void> {
    const { root, options, vcsConfig, watchRoot } = this;
    const { alwaysIgnored: ignored } = options;
    const client = new WatchmanClient(root);

    this.watchClient = client;

    await client.version({
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
        'relative_root',
      ],
    });

    await client.watchProject(watchRoot);

    await this.build();

    await client.flushSubscriptions();
    const { clock: startClock } = await client.clock();

    logger.notice('Initial generation completed; watching for changes...');

    if (vcsConfig) {
      await client.subscribe(
        watchRoot,
        'macrome-vcs-lock',
        {
          expression: expressionFromMatchable({ files: [join(vcsConfig.dir, vcsConfig.lock)] }),
          fields: ['name', 'exists'],
          defer_vcs: false,
        },
        async (files) => {
          const [lock] = files;

          return await client.command(
            lock.exists ? 'state-enter' : 'state-leave',
            watchRoot,
            'vcs_lock_held',
          );
        },
      );
    }

    // await client.subscribe(
    //   '',
    //   'macrome-generators',
    //   {
    //     defer: ['vcs_lock_held'],
    //     defer_vcs: false, // for consistency use our version
    //     matchable: {
    //       files: [
    //         ...filter(
    //           (resolvedPath) => !resolvedPath.startsWith('..'),
    //           map((resolvedPath) => relative(watchRoot, resolvedPath), this.generatorStubs.keys()),
    //         ),
    //       ],
    //     },
    //   },
    //   (files) => {
    //     for (const file of files) {
    //       this.instantiateGenerators(join(watchRoot, file.name));
    //     }
    //   },
    // );

    // Establish one watch for all changes. Separate watches per generator would cause each
    // generator to run on all its inputs before anoteher generator could begin.
    // This would prevent parallelization.
    await client.subscribe(
      '/',
      'macrome-main',
      {
        expression: expressionFromMatchable({ excludeFiles: ignored }),
        drop: ['vcs_lock_held'],
        defer_vcs: false, // for consistency use our version
        fields: ['name', 'mtime_ms', 'exists', 'type', 'new'],
        since: startClock,
      },
      async (files) => {
        await this.processChanges(
          files.map((file) => ({
            operation: !file.exists ? REMOVE : file.new ? ADD : UPDATE,
            path: file.name,
          })),
        );
      },
    );
  }

  stopWatching(): void {
    if (this.watchClient) {
      this.watchClient.end();
      this.watchClient = null;
    }
  }

  async hasHeader(path: string): Promise<boolean> {
    const accessor = this.accessorsByFileType.get(extname(path).slice(1));

    if (!accessor) return false;

    const annotations = await accessor.readAnnotations(this.resolve(path));
    return annotations === null ? false : !!annotations.get('macrome');
  }

  async clean(): Promise<void> {
    const { alwaysIgnored: ignored } = this.options;

    const paths = await traverse(this.root, { excludeFiles: ignored });

    for (const path of paths) {
      if (await this.hasHeader(path)) {
        await unlink(this.resolve(path));
      }
    }
  }

  async check(): Promise<boolean> {
    if (!this.vcsConfig) {
      throw new Error(
        'macrome.check() will soon work without version control, but it does not yet.',
      );
    }

    if (this.vcsConfig.isDirty(this.root)) {
      logger.warn('Check was run with vcs changes in the working dir and cannot succeed');
      return false;
    }

    await this.clean();
    await this.build();

    return !this.vcsConfig.isDirty(this.root);
  }

  relative(path: string): string {
    return relative(this.root, path);
  }

  resolve(path: string): string {
    return path.startsWith('/') ? path : join(this.root, path);
  }
}
