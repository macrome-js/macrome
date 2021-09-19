import type { FileHandle } from 'fs/promises';
import type {
  Accessor,
  Generator,
  Change,
  Annotations,
  AsymmetricMMatchExpressionWithSuffixes,
} from './types';

import { join, dirname, basename, extname, relative } from 'path';
import { promises as fsPromises } from 'fs';
import requireFresh from 'import-fresh';
import findUp from 'find-up';
import { map, flat, flatMap } from 'iter-tools-es';

import { WatchmanClient, standaloneQuery } from './watchman';
import { Api, GeneratorApi, MapChangeApi } from './apis';
import { matches } from './matchable';
import { logger } from './utils/logger';
import { buildOptions, Options, BuiltOptions } from './config';

import accessors from './accessors';
import { vcsConfigs, VCSConfig } from './vcs-configs';
import { get } from './utils/map';
import Queue from '@iter-tools/queue';
import { fsCache } from './fs-cache';

const { unlink } = fsPromises;

export class Macrome {
  options: BuiltOptions;
  initialized = false;
  root: string;
  watchRoot: string;
  api: Api;
  vcsConfig: VCSConfig | null = null;
  watchClient: WatchmanClient | null = null;
  generators: Map<string, Array<Generator<unknown>>>;
  generatorsMeta: WeakMap<
    Generator<unknown>,
    {
      api: GeneratorApi;
      mappings: Map<string, unknown>; // path -> map() result
    }
  >;
  queue: Queue<Change> | null = null;
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
    this.api = new Api(this);
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

  protected async initialize(): Promise<void> {
    for (const generatorPath of this.options.generators.keys()) {
      await this.instantiateGenerators(generatorPath);
    }

    this.initialized = true;
  }

  protected get generatorInstances(): IterableIterator<Generator<unknown>> {
    return flat(1, this.generators.values());
  }

  get logger(): any {
    return logger;
  }

  protected async instantiateGenerators(generatorPath: string): Promise<void> {
    const Generator: Generator<unknown> = requireFresh(generatorPath);

    for (const generator of get(this.generators, generatorPath, [])) {
      const { api } = this.generatorsMeta.get(generator)!;
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

  async getAnnotations(
    path: string,
    { handle }: { handle?: FileHandle | null } = {},
  ): Promise<Annotations | null> {
    const accessor = this.accessorsByFileType.get(extname(path).slice(1));
    const cacheEntry = fsCache.get(path);

    if (!accessor) return null;
    if (cacheEntry) return cacheEntry.annotations;

    const resolved = handle != null ? handle : this.resolve(path);
    return await accessor.readAnnotations(resolved);
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

  protected getBaseExpression(): AsymmetricMMatchExpressionWithSuffixes {
    const { alwaysExclude: exclude } = this.options;

    return {
      suffixes: [...this.accessorsByFileType.keys()],
      exclude,
    };
  }

  async enqueue(change: Change): Promise<void> {
    const { path } = change;

    if (change.exists) {
      const { mtimeMs } = change;
      const cacheEntry = fsCache.get(path);
      const generatedPaths = cacheEntry ? cacheEntry.generatedPaths : new Set<string>();
      const annotations = await this.getAnnotations(path);

      fsCache.set(path, { path, mtimeMs, annotations, generatedPaths });
    } else {
      fsCache.delete(path);
    }

    this.queue!.push(change);
  }

  // Where the magic happens.
  async processChanges(): Promise<void> {
    // Assumption: two input changes will not both write the same output file
    //   we could detect this and error (or warn and let the later gen overwrite?)
    //     allows us to parallelize

    const { queue, options, generatorInstances, generatorsMeta } = this;

    const { settleTTL } = options;
    let ttl = settleTTL;
    // TODO parallelize
    // may want to factor out runners, parallel and non-parallel a la jest
    while (true) {
      // Handle bouncing between states: map -> reduce -> map -> reduce
      // We always enqueue changes before the watcher reports them, primarily to
      // ensure that this error is never subject to a race condition.
      if (ttl === 0) {
        throw new Error(
          `Macrome state has not settled after ${settleTTL} cycles, likely indicating an infinite loop`,
        );
      }

      for (const change of queue!) {
        const { path } = change;

        const cacheItem = fsCache.get(path)!;
        const { generatedPaths: prevGeneratedPaths } = cacheItem;
        const generatedPaths = (cacheItem.generatedPaths = new Set());

        if (!change.exists) {
          // Remove the root file and files it caused to be generated
          for (const prevPath of prevGeneratedPaths) {
            // Ensure the user hasn't deleted our annotations and started manually editing this file
            if ((await this.getAnnotations(prevPath)) !== null) {
              await unlink(this.resolve(path));

              await this.enqueue({
                path: prevPath,
                exists: false,
              });
            }
          }
          // Free any map results the file made
          this.forMatchingGenerators(path, (generator) => {
            generatorsMeta.get(generator)!.mappings.delete(path);
          });
        } else {
          // Generator loop is inside change queue loop
          for (const generator of generatorInstances) {
            const { mappings, api: genApi } = generatorsMeta.get(generator)!;

            if (matches(change.path, generator)) {
              // Changes made through this api feed back into the queue
              const api = MapChangeApi.fromGeneratorApi(genApi, change);

              // generator.map()
              const mapResult = generator.map ? await generator.map(api, change) : change;

              api.destroy();

              mappings.set(change.path, mapResult);
            }
          }

          for (const path of prevGeneratedPaths) {
            if (!generatedPaths.has(path)) {
              await unlink(this.resolve(path));

              await this.enqueue({
                path,
                exists: false,
              });
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

      ttl--;
    }
  }

  async build(): Promise<void> {
    const changes = await standaloneQuery(this.root, this.getBaseExpression());

    if (!this.initialized) await this.initialize();

    this.queue = new Queue();

    for (const change of changes) {
      // reading of annotations already happens in enque
      // instead use a read-through cache?
      if ((await this.getAnnotations(change.path)) === null) {
        await this.enqueue(change);
      }
    }

    await this.processChanges();

    this.queue = null;

    for (const change of changes) {
      //
    }
  }

  async watch(): Promise<void> {
    const { root, vcsConfig, watchRoot } = this;
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
        'term-pcre',
        'field-name',
        'field-exists',
        'field-new',
        'field-type',
        'field-mtime_ms',
        'relative_root',
      ],
      optional: ['suffix-set'],
    });

    await client.watchProject(watchRoot);

    const fields = ['name', 'mtime_ms', 'exists', 'type', 'new'];

    const expression = this.getBaseExpression();

    const { files: changes, clock: start } = await client.query(this.root, expression, { fields });

    if (!this.initialized) await this.initialize();

    this.queue = new Queue();

    for (const change of changes) {
      if (!(await this.getAnnotations(change.path))) {
        await this.enqueue(change);
      }
    }

    await this.processChanges();
    this.queue = null;

    logger.notice('Initial generation completed; watching for changes...');

    if (vcsConfig) {
      await client.subscribe(
        '/',
        'macrome-vcs-lock',
        { include: ['name', join(vcsConfig.dir, vcsConfig.lock)] },
        {
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

    // Establish one watch for all changes. Separate watches per generator would cause each
    // generator to run on all its inputs before another generator could begin.
    // This would prevent parallelization.
    await client.subscribe(
      this.root,
      'macrome-main',
      expression,
      {
        drop: ['vcs_lock_held'],
        defer_vcs: false, // for consistency use our version
        fields,
        since: start,
      },
      async (changes) => {
        if (this.queue === null) {
          this.queue = new Queue(changes);
          await this.processChanges();
          this.queue = null;
        } else {
          for (const change of changes) {
            const { path } = change;
            // filter out "echo" changes: those we already enqueued without waiting for the watcher
            if (change.exists ? fsCache.get(path)?.mtimeMs !== change.mtimeMs : fsCache.has(path)) {
              await this.enqueue(change);
            }
          }
        }
      },
    );
  }

  stopWatching(): void {
    if (this.watchClient) {
      this.watchClient.end();
      this.watchClient = null;
    }
  }

  async clean(): Promise<void> {
    const files = await standaloneQuery(this.root, this.getBaseExpression());

    for (const { path } of files) {
      if ((await this.getAnnotations(path)) != null) {
        await unlink(this.resolve(path));
      }
    }
  }

  async check(): Promise<boolean> {
    if (!this.vcsConfig) {
      throw new Error('macrome.check requires a version controlled project to work');
    }

    if (this.vcsConfig.isDirty(this.root)) {
      logger.warn('Check was run with vcs changes in the working dir and cannot succeed');
      return false;
    }

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
