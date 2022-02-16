import type { FileHandle } from 'fs/promises';
import type {
  FileState,
  Accessor,
  Generator,
  GeneratorStatic,
  ReportedChange,
  AnnotatedChange,
  EnqueuedChange,
  Annotations,
  AsymmetricMMatchExpressionWithSuffixes,
  MappableChange,
  AnnotatedAddChange,
  AnnotatedModifyChange,
} from './types';

import { join, dirname, basename, extname, relative, resolve } from 'path';
import { unlink } from 'fs/promises';
import requireFresh from 'import-fresh';
import findUp from 'find-up';
import {
  map,
  flat,
  flatMap,
  wrap,
  asyncMap,
  asyncToArray,
  execPipe,
  takeLast,
} from 'iter-tools-es';
import Queue from '@iter-tools/queue';
import { Errawr, rawr } from 'errawr';

import { WatchmanClient, standaloneQuery } from './watchman';
import { Api, GeneratorApi, MapChangeApi } from './apis';
import { matches } from './matchable';
import { logger as baseLogger } from './utils/logger';
import { buildOptions, Options, BuiltOptions } from './config';

import accessors from './accessors';
import { vcsConfigs, VCSConfig } from './vcs-configs';
import { get } from './utils/map';
import { openKnownFileForReading } from './utils/fs';

const logger = baseLogger.get('macrome');

// eslint-disable-next-line @typescript-eslint/naming-convention
const verbsByOp = { A: 'add', D: 'remove', M: 'update' };
const verbFor = (change: { op: 'A' | 'D' | 'M' }) => verbsByOp[change.op];

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
  generators: Map<string, Array<Generator<unknown, unknown>>>;
  generatorsMeta: WeakMap<Generator<unknown, unknown>, GeneratorMeta>;
  queue: Queue<EnqueuedChange> | null = null;
  accessorsByFileType: Map<string, Accessor>;
  state: Map<string, FileState>;

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
    this.state = new Map();

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

  protected get generatorInstances(): IterableIterator<Generator<unknown, unknown>> {
    return flat(1, this.generators.values());
  }

  protected async __instantiateGenerators(generatorPath: string): Promise<void> {
    const Generator: GeneratorStatic<unknown> = requireFresh(generatorPath);

    for (const generator of get(this.generators, generatorPath, [])) {
      const { api } = this.generatorsMeta.get(generator)!;
      await generator.destroy?.(api);
      api.__destroy();
    }

    this.generators.set(generatorPath, []);

    const stubs = this.options.generators.get(generatorPath)!;

    for (const { options, path } of stubs) {
      const mappings = new Map();
      const generator = new Generator(options);
      const api = GeneratorApi.fromApi(
        this.api,
        /^[./]/.test(path) ? `/${relative(this.watchRoot, generatorPath)}` : path,
      );

      await generator.initialize?.(api);

      this.generators.get(generatorPath)!.push(generator);
      this.generatorsMeta.set(generator, { mappings, api });
    }
  }

  protected async __forMatchingGenerators(
    path: string,
    cb: (generator: Generator<unknown, unknown>, meta: GeneratorMeta) => unknown,
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

  protected async __decorateChangeWithAnnotations(
    change: ReportedChange,
  ): Promise<AnnotatedChange> {
    const path = this.resolve(change.path);
    const accessor = this.accessorFor(path);

    if (change.op !== 'D') {
      let annotations = null;

      if (accessor) {
        const fd = await openKnownFileForReading(path, change.mtimeMs);

        try {
          annotations = await this.readAnnotations(path, { fd });
        } finally {
          await fd.close();
        }
      }
      return { op: change.op, reported: change, annotations } as  // why is this cast necessary???
        | AnnotatedAddChange
        | AnnotatedModifyChange;
    } else {
      return { op: change.op, reported: change, annotations: null };
    }
  }

  protected async __scanChanges(): Promise<Array<AnnotatedChange>> {
    const changes = await standaloneQuery(this.root, this.__getBaseExpression());

    return await asyncToArray(
      asyncMap((change) => this.__decorateChangeWithAnnotations(change), changes),
    );
  }

  accessorFor(path: string): Accessor | null {
    const ext = extname(path).slice(1);

    return this.accessorsByFileType.get(ext) || null;
  }

  async readAnnotations(path: string, options?: { fd?: FileHandle }): Promise<Annotations | null> {
    const accessor = this.accessorsByFileType.get(extname(path).slice(1));

    if (!accessor) return null;

    logger.get('accessors').debug(`Reading annotations for {path: ${path}}`);

    return await accessor.readAnnotations(this.resolve(path), options);
  }

  enqueue(change: AnnotatedChange): void {
    const { op, reported } = change;
    const { path } = reported;
    const state = this.state.get(path);

    if (op === 'D') {
      if (!state) return;
    } else {
      if (state?.mtimeMs === reported.mtimeMs) {
        // This is an "echo" change: the watcher is reporting it but it was already enqueued synchronously
        return;
      }
    }

    this.__enqueue(change);
  }

  __enqueue(change: AnnotatedChange): void {
    const queue = this.queue!;
    const { reported, annotations } = change;
    const { path } = reported;

    const prevState = this.state.get(path) || null;

    let enquedChange: EnqueuedChange;
    if (change.op !== 'D') {
      const { reported, annotations = null } = change;
      const { mtimeMs } = reported;
      const generatedPaths = prevState ? prevState.generatedPaths : new Set<string>();

      const state = { mtimeMs, annotations, generatedPaths };

      this.state.set(path, state);

      enquedChange = {
        op: change.op,
        path,
        reported,
        annotations,
        state,
        prevState,
      } as MappableChange;
    } else {
      this.state.delete(path);

      enquedChange = {
        op: change.op,
        path,
        reported: change.reported,
        annotations: null,
        state: null,
        prevState: prevState!,
      };
    }

    // We need to update state for these paths, but there's no point in allowing them as inputs
    if (!annotations?.has('generatefailed')) {
      logger.debug(
        `enqueueing ${verbFor(change)} {path: ${path}}` +
          (reported.op !== 'D' ? ` modified at {mtimeMs: ${reported.mtimeMs}}` : ''),
      );
      queue.push(enquedChange);
    }
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
        const change = queue.shift()!;

        const { reported, state, prevState } = change;
        const { path } = reported;
        const prevGeneratedPaths = prevState && prevState.generatedPaths;
        const generatedPaths = new Set<string>();

        if (state) state.generatedPaths = generatedPaths;

        logger.debug(
          `executing ${verbFor(change)} {path: ${path}}` +
            (reported.op !== 'D' ? ` modified at {mtimeMs: ${reported.mtimeMs}}` : ''),
        );

        if (change.op !== 'D') {
          await this.__forMatchingGenerators(path, async (generator, { mappings, api: genApi }) => {
            // Changes made through this api feed back into the queue
            const api = MapChangeApi.fromGeneratorApi(genApi, change);

            try {
              // generator.map()
              const mapResult = generator.map ? await generator.map(api, change) : change;
              mappings.set(path, mapResult);
            } catch (error: any) {
              const rootCause: any = takeLast(Errawr.chain(error));
              if (rootCause?.code === 'macrome-would-overwrite-source') {
                logger.warn(rootCause.message);
              } else {
                logger.error(
                  Errawr.print(
                    new Errawr(
                      rawr(`Error mapping {path}`)({
                        path,
                        generator: api.generatorPath,
                      }),
                      { cause: error },
                    ),
                  ),
                );
              }
            } finally {
              api.__destroy();
              generatorsToReduce.add(generator);
            }
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
          if (!generatedPaths.has(path) && (await this.readAnnotations(path)) !== null) {
            logger.info(`removing {path: ${path}} which is no longer being generated`);

            await unlink(this.resolve(path));

            this.enqueue(
              await this.__decorateChangeWithAnnotations({ op: 'D', path, mtimeMs: null }),
            );
          }
        }

        processedPaths.push(path);
      }

      for (const generator of this.generatorInstances) {
        if (generatorsToReduce.has(generator)) {
          const { mappings, api } = generatorsMeta.get(generator)!;

          try {
            await generator.reduce?.(api, mappings);
          } catch (error) {
            logger.error(
              Errawr.print(
                new Errawr(
                  rawr(`Error reducing {generator}`)({
                    generator: api.generatorPath,
                  }),
                  { cause: error },
                ),
              ),
            );
          }
        }
      }

      ttl--;
    }
  }

  async clean(): Promise<void> {
    const changes = await this.__scanChanges();

    for (const change of changes) {
      if (change.op !== 'D' && change.annotations != null) {
        await unlink(this.resolve(change.reported.path));
      }
    }
  }

  async __build(changes: Array<AnnotatedChange>): Promise<void> {
    if (!this.initialized) await this.__initialize();

    this.queue = new Queue();

    for (const change of changes) {
      if (change.op !== 'D' && !change.annotations) {
        this.enqueue(change);
      }
    }

    await this.processChanges();

    for (const change of changes) {
      const { reported } = change;
      // remove @generated state which were not generated
      if (change.op !== 'D' && change.annotations) {
        if (!this.state.has(reported.path)) {
          logger.warn(`Removing stale generated file {path: ${reported.path}}`);
          await unlink(this.resolve(reported.path));
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

    await this.__build(
      await execPipe(
        changes,
        asyncMap(
          async (change: ReportedChange) => await this.__decorateChangeWithAnnotations(change),
        ),
        asyncToArray,
      ),
    );

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
        async (state) => {
          const [lock] = state;

          return await client.command(
            lock.op !== 'D' ? 'state-enter' : 'state-leave',
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
    return relative(this.root, this.resolve(path));
  }

  resolve(path: string): string {
    return path.startsWith('/') ? path : resolve(this.root, path);
  }
}
