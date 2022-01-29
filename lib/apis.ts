import { Errawr, rawr } from 'errawr';

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
} from './types';

import { relative, dirname } from 'path';
import { FileHandle, open } from 'fs/promises';
import { buildOptions } from './utils/fs';

const _ = Symbol.for('private members');

export class ApiError extends Errawr {
  get name() {
    return 'ApiError';
  }
}

type ApiProtected = {
  destroyed: boolean;
  macrome: Macrome;
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

  get macrome() {
    return this[_].macrome;
  }

  get destroyed() {
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

  async write(path: string, content: string, options: WriteOptions): Promise<void> {
    this.__assertNotDestroyed('write');

    const { macrome } = this[_];
    const accessor = this.accessorFor(path)!;
    const file: File = {
      header: {
        annotations: this.buildAnnotations(path),
      },
      content,
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

  get generatorPath() {
    return this[_].generatorPath;
  }

  buildAnnotations(_destPath?: string): Map<string, any> {
    const { generatorPath } = this[_];

    return new Map<string, any>([
      ...super.buildAnnotations(),
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

  get change() {
    return this[_].change;
  }

  protected decorateError(error: Error, verb: string): Error {
    const { generatorPath, change } = this[_];

    return new ApiError(rawr('macrome {{verb}} failed', { rest: true }), {
      cause: error,
      info: { verb, generator: generatorPath, change: change.annotated.reported },
    });
  }

  buildAnnotations(destPath: string): Map<string, any> {
    const relPath = relative(dirname(destPath), this.change.path);

    return new Map([
      ...super.buildAnnotations(destPath),
      ['generatedfrom', relPath.startsWith('.') ? relPath : `./${relPath}`],
    ]);
  }

  async write(path: string, content: string, options: WriteOptions): Promise<void> {
    const { change } = this[_];
    const { state } = change;

    await super.write(path, content, options);

    state.generatedPaths.add(path);
  }
}
