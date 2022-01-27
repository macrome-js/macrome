import type { FileHandle } from 'fs/promises';
import type {
  Accessor,
  Generator,
  Change,
  Annotations,
  AsymmetricMMatchExpressionWithSuffixes,
} from './types';

import { join, dirname, basename, extname, relative, resolve } from 'path';
import { unlink } from 'fs/promises';
import requireFresh from 'import-fresh';
import findUp from 'find-up';
import { map, flat, flatMap, wrap, asyncMap, asyncToArray } from 'iter-tools-es';
import Queue from '@iter-tools/queue';

import { WatchmanClient, standaloneQuery } from './watchman';
import { Api, GeneratorApi, MapChangeApi } from './apis';
import { matches } from './matchable';
import { logger } from './utils/logger';
import { buildOptions, Options, BuiltOptions } from './config';

import accessors from './accessors';
import { vcsConfigs, VCSConfig } from './vcs-configs';
import { get } from './utils/map';
import { openKnownFileForReading } from './utils/fs';

export type FilesEntry = {
  path: string;
  mtimeMs: number;
  annotations: Annotations | null;
  generatedPaths: Set<string>;
};

const verbFor = (change: Change) => (change.exists ? (change.new ? 'add' : 'update') : 'remove');

type GeneratorMeta = {
  api: GeneratorApi;
  mappings: Map<string, unknown>; // path -> map() result
};

export class Macrome {
  options: BuiltOptions;
  initialized = false; // Has initialize() been run
  progressive = false; // Are we watching for incremental updates
  root: string;
  watchRoot: string;
  api: Api;
  vcsConfig: VCSConfig | null = null;
  watchClient: WatchmanClient | null = null;
  generators: Map<string, Array<Generator<unknown>>>;
  generatorsMeta: WeakMap<Generator<unknown>, GeneratorMeta>;
  queue: Queue<{ change: Change; filesEntry: FilesEntry | undefined }> | null = null;
  accessorsByFileType: Map<string, Accessor>;
  files: Map<string, FilesEntry>;

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
    this.files = new Map();

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

  get logger(): any {
    return logger;
  }

  protected async __initialize(): Promise<void> {
    for (const generatorPath of this.options.generators.keys()) {
      await this.__instantiateGenerators(generatorPath);
    }

    this.initialized = true;
  }

  protected get generatorInstances(): IterableIterator<Generator<unknown>> {
    return flat(1, this.generators.values());
  }

  protected async __instantiateGenerators(generatorPath: string): Promise<void> {
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

  protected async __forMatchingGenerators(
    path: string,
    cb: (generator: Generator<unknown>, meta: GeneratorMeta) => unknown,
  ): Promise<void> {
    const { generatorsMeta } = this;

    for (const generator of this.generatorInstances) {
      // Cache me!
      if (matches(path, generator)) {
        await cb(generator, generatorsMeta.get(generator)!);
      }
    }
  }

  protected __getBaseExpression(): AsymmetricMMatchExpressionWithSuffixes {
    const { alwaysExclude: exclude } = this.options;

    return {
      suffixes: [...this.accessorsByFileType.keys()],
      exclude,
    };
  }

  protected async __decorateChangeWithAnnotations(change: Change): Promise<Change> {
    const path = this.resolve(change.path);
    const accessor = this.accessorFor(path);
    if (accessor && change.exists) {
      const fd = await openKnownFileForReading(path, change.mtimeMs);
      const annotations = await accessor.readAnnotations(path, { fd });
      await fd.close();
      return { ...change, annotations };
    } else {
      return change;
    }
  }

  protected async __scanChanges(): Promise<Array<Change>> {
    const changes = await standaloneQuery(this.root, this.__getBaseExpression());

    return await asyncToArray(
      asyncMap((change) => this.__decorateChangeWithAnnotations(change), changes),
    );
  }

  accessorFor(path: string): Accessor | null {
    const ext = extname(path).slice(1);

    return this.accessorsByFileType.get(ext) || null;
  }

  async getAnnotations(path: string, options?: { fd?: FileHandle }): Promise<Annotations | null> {
    const accessor = this.accessorsByFileType.get(extname(path).slice(1));

    if (!accessor) return null;

    return await accessor.readAnnotations(this.resolve(path), options);
  }

  async clean(): Promise<void> {
    const changes = await this.__scanChanges();

    for (const change of changes) {
      if (change.exists && change.annotations != null) {
        await unlink(this.resolve(change.path));
      }
    }
  }

  enqueue(change: Change): void {
    const { path } = change;
    const filesEntry = this.files.get(path) || undefined;

    if (change.exists ? filesEntry?.mtimeMs === change.mtimeMs : !filesEntry) {
      // This is an "echo" change: the watcher is re-reporting it but it was already enqueued.
      return;
    }

    try {
      this.__enqueue(change);
    } catch (e) {}
  }

  __enqueue(change: Change): void {
    const { path } = change;
    const filesEntry = this.files.get(path) || undefined;

    if (change.exists) {
      const { annotations = null } = change;

      const { mtimeMs } = change;
      const generatedPaths = filesEntry ? filesEntry.generatedPaths : new Set<string>();

      this.files.set(path, { path, mtimeMs, annotations, generatedPaths });
    } else {
      this.files.delete(path);
    }

    logger.debug(`enqueueing ${verbFor(change)} ${path}`);
    this.queue!.push({ change, filesEntry });
  }

  // Where the magic happens.
  async processChanges(): Promise<void> {
    const { queue, options, generatorsMeta } = this;
    const processedPaths = []; // just for debugging

    if (!queue) {
      throw new Error('processChanges() called with no queue');
    }

    const { settleTTL } = options;
    let ttl = settleTTL;
    // TODO parallelize
    // may want to factor out runners, parallel and non-parallel a la jest
    while (queue.size) {
      // Handle bouncing between states: map -> reduce -> map -> reduce
      if (ttl === 0) {
        this.queue = null;
        throw new Error(
          `Macrome state has not settled after ${settleTTL} cycles, likely indicating an infinite loop`,
        );
      }

      const generatorsToReduce = new Set();

      while (queue.size) {
        const { change, filesEntry } = queue.shift()!;

        const { path } = change;
        const prevGeneratedPaths = filesEntry && filesEntry.generatedPaths;
        const generatedPaths = new Set<string>();

        if (change.exists) {
          await this.__forMatchingGenerators(path, async (generator, { mappings, api: genApi }) => {
            // Changes made through this api feed back into the queue
            const api = MapChangeApi.fromGeneratorApi(genApi, change);

            // generator.map()
            const mapResult = generator.map ? await generator.map(api, change) : change;

            api.destroy();

            mappings.set(change.path, mapResult);
            generatorsToReduce.add(generator);
          });
        } else {
          await this.__forMatchingGenerators(path, async (generator, { mappings }) => {
            // Free any map results the file made
            mappings.delete(path);
            generatorsToReduce.add(generator);
          });
        }

        for (const path of wrap(prevGeneratedPaths)) {
          // Ensure the user hasn't deleted our annotations and started manually editing this file
          if (!generatedPaths.has(path) && (await this.getAnnotations(path)) !== null) {
            await unlink(this.resolve(path));

            await this.enqueue({ path, exists: false });
          }
        }

        processedPaths.push(path);
      }

      for (const generator of this.generatorInstances) {
        if (generatorsToReduce.has(generator)) {
          const { mappings, api } = generatorsMeta.get(generator)!;

          await generator.reduce?.(api, mappings);
        }
      }

      ttl--;
    }
  }

  async __build(changes: Array<Change>): Promise<void> {
    if (!this.initialized) await this.__initialize();

    this.queue = new Queue();

    for (const change of changes) {
      if (change.exists && !change.annotations) {
        await this.enqueue(change);
      }
    }

    await this.processChanges();

    for (const change of changes) {
      // remove @generated files which were not generated
      if (change.exists && change.annotations) {
        if (!this.files.has(change.path)) {
          await unlink(this.resolve(change.path));
        }
      }
    }

    await this.processChanges();

    this.queue = null;
  }

  async build(): Promise<void> {
    await this.__build(await this.__scanChanges());
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

    const expression = this.__getBaseExpression();

    const { files: changes, clock: start } = await client.query('/', expression, { fields });

    this.__build(changes);

    this.progressive = true;
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
      '/',
      'macrome-main',
      expression,
      {
        drop: ['vcs_lock_held'],
        defer_vcs: false, // for consistency use our version
        fields,
        since: start,
      },
      async (changes) => {
        const noQueue = this.queue === null;
        if (noQueue) {
          this.queue = new Queue();
        }
        for (const change of changes) {
          this.enqueue(await this.__decorateChangeWithAnnotations(change));
        }
        if (noQueue) {
          await this.processChanges();
          this.queue = null;
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
