import type { Macrome } from './macrome';
import type {
  WriteOptions,
  ReadOptions,
  File,
  MappableChange,
  Annotations,
  AnnotatedAddChange,
  AnnotatedModifyChange,
  EnqueuedChange,
} from './types';

import { relative, resolve, dirname, extname } from 'path';
import { FileHandle, mkdir, open } from 'fs/promises';
import { Errawr, invariant, rawr } from 'errawr';
import { objectEntries, objectValues } from 'iter-tools-es';
import stripAnsi from 'strip-ansi';
import { buildOptions } from './utils/fs';
import { printRelative } from './utils/path';
import { logger as baseLogger } from './utils/logger';

const _ = Symbol.for('private members');

const logger = baseLogger.get('macrome:api');

type PromiseDict = { [key: string]: Promise<any> };
type ResolvedPromiseDict<D> = {
  [K in keyof D]: Awaited<D[K]>;
};

export class ApiError extends Errawr {
  get name(): string {
    return 'ApiError';
  }
}

type ApiProtected = {
  destroyed: boolean;
  macrome: Macrome;
};

const asError = (e: any) => {
  if (e instanceof Error) return e;
  else {
    const error = new Error(e);
    // We don't know where this came from, but it wasn't really here
    error.stack = undefined;
    return error;
  }
};

/**
 * Api is a facade over the Macrome class which exposes the functionality which should be accessible to generators
 */
export class Api {
  protected [_]: ApiProtected;

  constructor(macrome: Macrome) {
    this[_] = { macrome, destroyed: false };
  }

  protected __assertNotDestroyed(methodName: string): void {
    if (this[_].destroyed) {
      throw new Error(`api.${methodName} cannot be called outside the hook providing the api`);
    }
  }

  get destroyed(): boolean {
    return this[_].destroyed;
  }

  __destroy(): void {
    this[_].destroyed = true;
  }

  protected __decorateError(error: Error, verb: string): Error {
    return new ApiError(`macrome ${verb} failed`, { cause: error });
  }

  buildAnnotations(_destPath?: string): Map<string, any> {
    return new Map<string, any>([['macrome', true]]);
  }

  buildErrorAnnotations(_destPath?: string): Map<string, any> {
    return new Map<string, any>([
      ['macrome', true],
      ['generatefailed', true],
    ]);
  }

  buildErrorContent(error: Error): string {
    const stack = error.stack || String(error);
    const escaped = stripAnsi(stack.replace(/\\/g, '\\\\').replace(/`/g, '\\`'));
    return `throw new Error(\`${escaped}\`);`;
  }

  resolve(path: string): string {
    return this[_].macrome.resolve(path);
  }

  async readAnnotations(path: string, options?: { fd?: FileHandle }): Promise<Annotations | null> {
    return await this[_].macrome.readAnnotations(path, options);
  }

  async read(path: string, options: ReadOptions): Promise<string> {
    const { macrome } = this[_];
    this.__assertNotDestroyed('read');

    const { encoding = 'utf8', ..._options } = buildOptions(options);
    const accessor = macrome.accessorFor(path)!;

    try {
      const result = await accessor.read(this.resolve(path), { encoding, ..._options });

      return result.content;
    } catch (e: any) {
      throw this.__decorateError(e, 'read');
    }
  }

  async write(path: string, content: string | Error, options: WriteOptions = {}): Promise<void> {
    const { macrome } = this[_];
    this.__assertNotDestroyed('write');

    const relPath = macrome.relative(path);
    const absPath = macrome.resolve(path);

    const annotations =
      content instanceof Error
        ? this.buildErrorAnnotations(relPath)
        : this.buildAnnotations(relPath);

    const accessor = macrome.accessorFor(relPath);

    if (!accessor) {
      throw new Errawr(rawr('macrome has no accessor for writing to {ext} files'), {
        info: { ext: extname(relPath), relPath },
      });
    }

    await mkdir(dirname(relPath), { recursive: true });

    const file: File = {
      header: {
        annotations,
      },
      content: content instanceof Error ? this.buildErrorContent(content) : content,
    };
    const before = Date.now();

    let fd;
    try {
      fd = await open(absPath, 'a+');
      const mtimeMs = Math.floor((await fd.stat()).mtimeMs);
      // -100 because Travis showed a 3ms discrepancy for reasons unknown
      // Is there a better way to implement this?
      const new_ = mtimeMs >= before - 100;

      let annotations = null;
      if (!new_) {
        annotations = await macrome.readAnnotations(relPath, { fd });
        if (annotations === null) {
          throw new Errawr(rawr('macrome cannot overwrite non-generated {path}'), {
            code: 'macrome_would_overwrite_source',
            info: { path: relPath, mtimeMs, before },
          });
        }
      }

      await fd.truncate();

      await accessor.write(absPath, file, { ...buildOptions(options), fd });

      await fd.close();

      // We could wait for the watcher to do this, but there are two reasons we don't:
      // First there may not be a watcher, and we want things to work basically the same way when
      // the watcher is and is not present. Second we want to ensure that our causally linked
      // changes are always batched so that we can detect non-terminating cycles.
      const op = new_ ? 'A' : 'M';
      macrome.enqueue({
        op,
        reported: {
          op,
          path: relPath,
          mtimeMs,
        },
        annotations,
      } as AnnotatedAddChange | AnnotatedModifyChange);
    } catch (e: any) {
      await fd?.close();
      throw this.__decorateError(e, 'write');
    }
  }

  async generate(
    path: string,
    cb: (props: { destPath: string } & Record<string, never>) => Promise<string | null>,
  ): Promise<void>;
  async generate<D extends PromiseDict>(
    path: string,
    deps: D,
    cb: (props: { destPath: string } & ResolvedPromiseDict<D>) => Promise<string | null>,
  ): Promise<void>;
  async generate(path: string, ...args: Array<any>): Promise<void> {
    let deps: PromiseDict = {};
    let cb: (props: PromiseDict) => Promise<string>;
    if (args.length <= 1) {
      cb = args[0];
    } else {
      deps = args[0];
      cb = args[1];
    }

    return await this.__generate(path, deps, cb);
  }

  async __generate(
    destPath: string,
    deps: PromiseDict,
    cb: (props: { destPath: string } & Record<string, any>) => Promise<string | null>,
  ): Promise<void> {
    const { macrome } = this[_];
    for (const dep of objectValues(deps)) {
      invariant(
        dep instanceof Promise,
        'deps argument to api.generate must be {[key]: string => Promise}',
      );
    }

    let content = null;
    try {
      const props: Record<string, any> & { destPath: string } = { destPath };
      for (const [name, dep] of objectEntries(deps)) {
        props[name] = await dep;
      }

      content = await cb(props);
    } catch (e: any) {
      logger.warn(`Failed generating {destPath: ${macrome.relative(destPath)}}`);
      content = asError(e);
    }
    if (content != null) {
      await this.write(destPath, content);
    }
  }
}

type GeneratorApiProtected = ApiProtected & {
  generatorPath: string;
};

export class GeneratorApi extends Api {
  protected [_]: GeneratorApiProtected;

  static fromApi(api: Api, generatorPath: string): GeneratorApi {
    const { macrome } = api[_];
    return new GeneratorApi(macrome, generatorPath);
  }

  constructor(macrome: Macrome, generatorPath: string) {
    super(macrome);
    this[_].generatorPath = generatorPath;
  }

  get generatorPath(): string {
    return this[_].generatorPath;
  }

  buildAnnotations(_destPath?: string): Map<string, any> {
    const { generatorPath } = this[_];

    return new Map<string, any>([...super.buildAnnotations(), ['generatedby', generatorPath]]);
  }

  buildErrorAnnotations(_destPath?: string): Map<string, any> {
    const { generatorPath } = this[_];

    return new Map<string, any>([...super.buildErrorAnnotations(), ['generatedby', generatorPath]]);
  }
}

type MapChangeApiProtected = GeneratorApiProtected & {
  change: MappableChange;
};

export class MapChangeApi extends GeneratorApi {
  protected [_]: MapChangeApiProtected;

  static fromGeneratorApi(generatorApi: GeneratorApi, change: MappableChange): MapChangeApi {
    const { macrome, generatorPath } = generatorApi[_];
    return new MapChangeApi(macrome, generatorPath, change);
  }

  constructor(macrome: Macrome, generatorPath: string, change: MappableChange) {
    super(macrome, generatorPath);
    this[_].change = change;
  }

  get change(): EnqueuedChange {
    return this[_].change;
  }

  get version(): string {
    return String(this.change.reported.mtimeMs);
  }

  protected __decorateError(error: Error, verb: string): Error {
    const { generatorPath, change } = this[_];

    return new ApiError(rawr('macrome {{verb}} failed', { rest: true }), {
      cause: error,
      info: { verb, generator: generatorPath, change: change.reported },
    });
  }

  buildAnnotations(destPath: string): Map<string, any> {
    const { path } = this.change;
    const relPath = printRelative(relative(dirname(destPath), path));

    return new Map([
      ...super.buildAnnotations(destPath),
      ['generatedfrom', `${relPath}#${this.version}`],
    ]);
  }

  buildErrorAnnotations(destPath: string): Map<string, any> {
    const { path } = this.change;
    const relPath = printRelative(relative(dirname(destPath), path));

    return new Map([
      ...super.buildErrorAnnotations(destPath),
      ['generatedfrom', `${relPath}#${this.version}`],
    ]);
  }

  async write(path: string, content: string, options: WriteOptions): Promise<void> {
    const { state } = this.change;

    await super.write(path, content, options);

    if (state) state.generatedPaths.add(path);
  }

  async __generate(
    destPath: string,
    deps: PromiseDict,
    cb: (resolvedDeps: { destPath: string } & Record<string, any>) => Promise<string | null>,
  ): Promise<void> {
    const { macrome, change } = this[_];

    let handle;
    try {
      handle = await open(destPath, 'r');
      const stats = await handle.stat();
      const targetMtime = Math.floor(stats.mtimeMs);
      const targetAnnotations = await this.readAnnotations(destPath, { fd: handle });

      const targetGeneratedFrom = targetAnnotations?.get('generatedfrom');

      if (targetGeneratedFrom) {
        const [fromPath, version] = targetGeneratedFrom.split('#');
        if (
          this.resolve(change.path) === resolve(dirname(this.resolve(destPath)), fromPath) &&
          String(change.reported.mtimeMs) === version
        ) {
          // The target is already generated from this version of this source

          if (change.op === 'A') {
            // Since we are not generating the target, make sure its info is loaded
            macrome.state.set(destPath, {
              mtimeMs: targetMtime,
              annotations: targetAnnotations,
              generatedPaths: new Set(),
            });
          }

          return;
        }
      }
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    } finally {
      handle?.close();
    }

    const destPath_ = destPath.startsWith('.')
      ? resolve(dirname(this.change.path), destPath)
      : destPath;

    return super.__generate(destPath_, deps, cb);
  }
}
