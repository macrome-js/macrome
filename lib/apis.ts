import type { Macrome } from './macrome';
import type { WriteOptions, ReadOptions, Accessor, File, Change, Annotations } from './types';

import { relative, dirname } from 'path';
import { promises as fsPromises } from 'fs';

import { buildReadOptions } from './utils/fs';
import { FileHandle } from 'fs/promises';

const { open } = fsPromises;

const _ = Symbol.for('private members');

type ApiProtected = {
  destroyed: boolean;
  macrome: Macrome;
};

export class ApiError extends Error {
  verb: string;

  constructor(message: string, verb: string) {
    super(message);
    this.verb = verb;
  }
}

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

  destroy(): void {
    this[_].destroyed = true;
  }

  protected decorateError(error: Error, verb: string): Error {
    return new ApiError(error.message, verb);
  }

  getAnnotations(_destPath?: string): Map<string, any> {
    return new Map<string, any>([['macrome', true]]);
  }

  resolve(path: string): string {
    return this[_].macrome.resolve(path);
  }

  accessorFor(path: string): Accessor | null {
    return this[_].macrome.accessorFor(path);
  }

  async readAnnotations(
    path: string,
    options: { handle: FileHandle },
  ): Promise<Annotations | null> {
    return await this[_].macrome.readAnnotations(path, options);
  }

  async read(path: string, options: ReadOptions): Promise<string> {
    this.__assertNotDestroyed('read');

    const { encoding = 'utf8', ..._options } = buildReadOptions(options);
    const accessor = this.accessorFor(path)!;

    try {
      const result = await accessor.read(this.resolve(path), { encoding, ..._options });

      return result.content;
    } catch (e) {
      throw this.decorateError(e, 'read');
    }
  }

  async write(path: string, content: string, options: WriteOptions): Promise<void> {
    const { macrome } = this[_];

    this.__assertNotDestroyed('write');

    const accessor = this.accessorFor(path)!;
    const file: File = {
      header: {
        annotations: this.getAnnotations(path),
      },
      content,
    };
    const now = Date.now();

    let handle;
    try {
      handle = await open(this.resolve(path), 'a+');
      const { mtimeMs } = await handle.stat();
      const new_ = mtimeMs > now; // is there a better way to implement this?

      const annotations = await accessor.readAnnotations(handle);
      if (annotations === null) {
        throw new Error('macrome will not overwrite non-generated files');
      }

      await handle.truncate();

      await accessor.write(handle, file, options);

      macrome.enqueue({
        path,
        exists: true,
        new: new_,
        mtimeMs,
      });
    } catch (e) {
      throw this.decorateError(e, 'write');
    } finally {
      handle?.close();
    }
  }
}

type GeneratorApiProtected = ApiProtected & {
  generatorPath: string;
};

export class GeneratorApi extends Api {
  protected [_]: GeneratorApiProtected;

  constructor(macrome: Macrome, generatorPath: string) {
    super(macrome);
    this[_].generatorPath = generatorPath;
  }

  static fromApi(api: Api, generatorPath: string): GeneratorApi {
    const { macrome } = api[_];
    return new GeneratorApi(macrome, generatorPath);
  }

  getAnnotations(_destPath?: string): Map<string, any> {
    const { generatorPath } = this[_];

    return new Map<string, any>([...super.getAnnotations(), ['generated-by', `/${generatorPath}`]]);
  }
}

export class MapApiError extends ApiError {
  generatorPath: string;
  destPath?: string;

  constructor(message: string, verb: string, generatorPath: string, destPath?: string) {
    super(message, verb);
    this.generatorPath = generatorPath;
    if (destPath) this.destPath = destPath;
  }
}

type MapChangeApiProtected = GeneratorApiProtected & {
  change: Change;
};

export class MapChangeApi extends GeneratorApi {
  protected [_]: MapChangeApiProtected;

  constructor(macrome: Macrome, generatorPath: string, change: Change) {
    super(macrome, generatorPath);
    this[_].change = change;
  }

  static fromGeneratorApi(generatorApi: GeneratorApi, change: Change): MapChangeApi {
    const { macrome, generatorPath } = generatorApi[_];
    return new MapChangeApi(macrome, generatorPath, change);
  }

  protected decorateError(error: Error, verb: string): MapApiError {
    const { generatorPath } = this[_];

    return new MapApiError(error.message, verb, generatorPath);
  }

  getAnnotations(destPath: string): Map<string, any> {
    const { macrome } = this[_];

    const relPath = relative(dirname(destPath), macrome.root);

    return new Map([
      ...super.getAnnotations(destPath),
      ['generated-from', relPath.startsWith('.') ? relPath : `./${relPath}`],
    ]);
  }
}
