import { join, dirname, basename, extname, relative } from 'path';
import { promises as fsPromises } from 'fs';
import requireFresh from 'import-fresh';
import findUp from 'find-up';
import { map, flat, filter, arrayFromAsync, asyncFilter, asyncMap, flatMap } from 'iter-tools-es';

import { traverse } from './traverse';
import { WatchmanClient, expressionFromMatchable } from './watchman';
import { Api, GeneratorApi, MapChangeApi } from './apis';
import { matches } from './matchable';
import { logger } from './utils/logger';
import { buildOptions, Options, BuiltOptions } from './config';

import accessors from './accessors';
import { ADD, Operation, REMOVE, UPDATE } from './operations';
import { vcsConfigs, VCSConfig } from './vcs-configs';
import { Accessor, Generator, Change } from './types';
import { get } from './utils/map';
import Queue from '@iter-tools/queue';

const { unlink } = fsPromises;

export class Macrome {
  options: BuiltOptions;
  initialized: boolean;
  root: string;
  watchRoot: string;
  api: Api;
  vcsConfig: VCSConfig | null;
  watchClient: WatchmanClient | null;
  generators: Map<string, Array<Generator<unknown>>>;
  generatorsMeta: WeakMap<
    Generator<unknown>,
    {
      api: GeneratorApi;
      mappings: Map<string, unknown>; // path -> map() result
    }
  >;
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

    this.initialized = false;
    this.root = root;
    this.watchRoot = dirname(vcsDir || root);
    this.api = new Api(this);
    this.vcsConfig = null;
    this.watchClient = null;
    this.generators = new Map();
    this.generatorsMeta = new WeakMap();

    if (vcsDir) {
      const vcsDirName = basename(vcsDir);
      const vcsConfig = vcsConfigs.find(({ dir }) => dir === vcsDirName) || null;

      this.vcsConfig = vcsConfig;
    }

    this.accessorsByFileType = new Map(
      // we do not yet have types for which more than one accessor may be valid
      flatMap((axr) => map((type) => [type, axr], axr.supportedFileTypes), accessors),
    );
  }

  private async initialize() {
    for (const generatorPath of this.options.generators.keys()) {
      await this.instantiateGenerators(generatorPath);
    }
    this.initialized = true;
  }

  private get generatorInstances() {
    return flat(1, this.generators.values());
  }

  get logger(): any {
    return logger;
  }

  async instantiateGenerators(generatorPath: string): Promise<void> {
    const Generator: Generator<unknown> = requireFresh(generatorPath);

    for (const { api, generator } of get(this.generators, generatorPath, [])) {
      await generator.destroy?.(api);
      api.destroy();
    }

    this.generators.set(generatorPath, []);

    const stubs = this.options.generators.get(generatorPath)!;

    for (const stub of stubs) {
      const mappings = new Map();
      const generator = new Generator(stub.options);
      const api = GeneratorApi.fromApi(this.api, this.relative(generatorPath));

      await generator.initialize?.(api);

      this.generators.get(generatorPath)!.push(generator);
      this.generatorsMeta.set(generator, { mappings, api });
    }
  }

  accessorFor(path: string): Accessor | null {
    const ext = extname(path).slice(1);

    return this.accessorsByFileType.get(ext) || null;
  }

  protected async forMatchingGenerators(
    path: string,
    cb: (generator: Generator<unknown>) => unknown,
  ): Promise<void> {
    for (const generator of this.generatorInstances) {
      if (matches(path, generator)) {
        cb(generator);
      }
    }
  }

  // where the magic happens
  // rename this to changeset once the changeset name is no longer in use?
  async processChanges(changeQueue: Queue<Change>): Promise<void> {
    // Assumption: two input changes will not both write the same output file
    //   we could detect this and error (or warn and let the later gen overwrite?)
    //     allows us to parallelize

    const { options, generatorInstances, generatorsMeta } = this;

    let { settleTTL } = options;
    // TODO parallelize
    // may want to factor out runners, parallel and non-parallel a la jest
    while (true) {
      if (!settleTTL) {
        throw new Error(
          'Macrome state has not settled after 20 cycles, likely indicating an infinite loop',
        );
      }

      for (const change of changeQueue) {
        const { path } = change;

        const { generatedPaths = [] } = get(metaCache, path, {});

        if (change.operation === REMOVE) {
          // Remove the root file and files it caused to be generated
          for (const path of generatedPaths) {
            if (path !== change.path && (await this.hasHeader(path))) {
              await unlink(this.resolve(path));
            }
          }
          // Remove any map results the file made
          this.forMatchingGenerators(path, (generator) => {
            generatorsMeta.get(generator)!.mappings.delete(path);
          });

          await unlink(path);
        } else {
          // Generator loop is inside change queue loop
          for (const generator of generatorInstances) {
            const { mappings, api: genApi } = generatorsMeta.get(generator)!;

            if (matches(change.path, generator)) {
              // Changes made through this api feed back into the queue
              const api = MapChangeApi.fromGeneratorApi(genApi, changeQueue, change);

              // generator.map()
              const mapResult = generator.map ? await generator.map(api, change) : change;

              mappings.set(change.path, mapResult);

              api.destroy();
            }
          }
        }
      }

      for (const generator of this.generatorInstances) {
        const { mappings, api } = generatorsMeta.get(generator)!;
        if (mappings.size) {
          // what happens if the changes reduce makes are mappable?
          await generator.reduce?.(api, mappings);
        }
      }

      settleTTL--;
    }
  }

  async build(): Promise<void> {
    const { alwaysIgnored: ignored } = this.options;

    if (!this.initialized) await this.initialize();

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
