import type { Macrome } from './macrome';
import type {
  WriteOptions,
  ReadOptions,
  Accessor,
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
import { objectValues } from 'iter-tools-es';
import { buildOptions } from './utils/fs';
import { printRelative } from './utils/path';
import { logger as baseLogger } from './utils/logger';

const _ = Symbol.for('private members');

const logger = baseLogger.get('macrome:api');

type PromiseDict = { [key: string]: Promise<any> };

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

  get macrome(): Macrome {
    return this[_].macrome;
  }

  get destroyed(): boolean {
    return this[_].destroyed;
  }

  destroy(): void {
    this[_].destroyed = true;
  }

  protected decorateError(error: Error, verb: string): Error {
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
    const escaped = stack.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    return `throw new Error(\`${escaped}\`);`;
  }

  resolve(path: string): string {
    return this[_].macrome.resolve(path);
  }

  accessorFor(path: string): Accessor | null {
    return this[_].macrome.accessorFor(path);
  }

  async getAnnotations(path: string, options?: { fd?: FileHandle }): Promise<Annotations | null> {
    return await this[_].macrome.getAnnotations(path, options);
  }

  async read(path: string, options: ReadOptions): Promise<string> {
    this.__assertNotDestroyed('read');

    const { encoding = 'utf8', ..._options } = buildOptions(options);
    const accessor = this.accessorFor(path)!;

    try {
      const result = await accessor.read(this.resolve(path), { encoding, ..._options });

      return result.content;
    } catch (e: any) {
      throw this.decorateError(e, 'read');
    }
  }

  async write(path: string, content: string | Error, options: WriteOptions = {}): Promise<void> {
    this.__assertNotDestroyed('write');

    const annotations =
      content instanceof Error ? this.buildErrorAnnotations(path) : this.buildAnnotations(path);

    const { macrome } = this[_];
    const accessor = this.accessorFor(path);

    if (!accessor) {
      throw new Errawr(rawr('macrome has no accessor for writing to {ext} files'), {
        info: { ext: extname(path), path },
      });
    }

    await mkdir(dirname(path), { recursive: true });

    const file: File = {
      header: {
        annotations,
      },
      content: content instanceof Error ? this.buildErrorContent(content) : content,
    };
    const before = Date.now();

    let fd;
    try {
      fd = await open(this.resolve(path), 'a+');
      const mtimeMs = Math.floor((await fd.stat()).mtimeMs);
      // -100 because Travis showed a 3ms discrepancy for reasons unknown
      // Is there a better way to implement this?
      const new_ = mtimeMs >= before - 100;

      let annotations = null;
      if (!new_) {
        annotations = await accessor.readAnnotations(this.resolve(path), { fd });
        if (annotations === null) {
          throw new Errawr(rawr('macrome cannot overwrite non-generated {path}'), {
            info: { path, mtimeMs, before },
          });
        }
      }

      await fd.truncate();

      await accessor.write(path, file, { ...buildOptions(options), fd });

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
          path,
          mtimeMs,
        },
        annotations,
      } as AnnotatedAddChange | AnnotatedModifyChange);
    } catch (e: any) {
      await fd?.close();
      throw this.decorateError(e, 'write');
    }
  }

  async generate(
    path: string,
    cb: (path: string, deps: Record<string, never>) => Promise<string>,
  ): Promise<void>;
  async generate<D extends PromiseDict>(
    path: string,
    deps: D,
    cb: (path: string, resolvedDeps: D) => Promise<string>,
  ): Promise<void>;
  async generate(path: string, ...args: Array<any>): Promise<void> {
    let deps: PromiseDict = {};
    let cb: <D>(path: string, resolvedDeps: D) => Promise<string>;
    if (args.length <= 1) {
      cb = args[0];
    } else {
      deps = args[0];
      cb = args[1];
    }

    for (const dep of objectValues(deps)) {
      invariant(
        dep instanceof Promise,
        'deps argument to api.generate must be {[key]: string => Promise}',
      );
    }

    let content = null;
    try {
      await Promise.all(objectValues(deps));

      content = await cb(path, deps);
    } catch (e: any) {
      logger.warn(`Failed generating {path: ${path}}`);
      content = asError(e);
    }
    if (content != null) {
      await this.write(path, content);
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

    return new Map<string, any>([
      ...super.buildAnnotations(),
      ['generatedby', `/${generatorPath}`],
    ]);
  }

  buildErrorAnnotations(_destPath?: string): Map<string, any> {
    const { generatorPath } = this[_];

    return new Map<string, any>([
      ...super.buildErrorAnnotations(),
      ['generatedby', `/${generatorPath}`],
    ]);
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

  protected decorateError(error: Error, verb: string): Error {
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

  async generate(
    path: string,
    cb: (path: string, deps: Record<string, never>) => Promise<string>,
  ): Promise<void>;
  async generate<D extends { [key: string]: Promise<any> }>(
    path: string,
    deps: D,
    cb: (path: string, resolvedDeps: D) => Promise<string>,
  ): Promise<void>;
  async generate(path: string, ...args: Array<any>): Promise<void> {
    const { macrome, change } = this;
    let deps: Record<string, any> = {};
    let cb: <D>(path: string, resolvedDeps: D) => Promise<string>;
    if (args.length <= 1) {
      cb = args[0];
    } else {
      deps = args[0];
      cb = args[1];
    }

    let handle;
    try {
      handle = await open(path, 'r');
      const stats = await handle.stat();
      const targetMtime = Math.floor(stats.mtimeMs);
      const targetAnnotations = await this.getAnnotations(path, { fd: handle });

      const targetGeneratedFrom = targetAnnotations?.get('generatedfrom');

      if (targetGeneratedFrom) {
        const [fromPath, version] = targetGeneratedFrom.split('#');
        if (
          this.resolve(change.path) === resolve(dirname(this.resolve(path)), fromPath) &&
          String(change.reported.mtimeMs) === version
        ) {
          // The target is already generated from this version of this source

          if (change.op === 'A') {
            // Since we are not generating the target, make sure its info is loaded
            macrome.state.set(path, {
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

    return super.generate(path, deps, cb);
  }
}
