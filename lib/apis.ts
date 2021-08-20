import type { Macrome } from './macrome';
import type { WriteOptions, ReadOptions, Accessor, File } from './types';
import type { Changeset } from './changeset';

import { relative, dirname } from 'path';

import { UPDATE } from './operations';
import { buildReadOptions } from './utils/fs';

const _ = Symbol.for('private members');

type ApiProtected = {
  destroyed: boolean;
  macrome: Macrome;
};

class ApiError extends Error {
  verb: string;

  constructor(message: string, verb: string) {
    super(message);
    this.verb = verb;
  }
}

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
    this.__assertNotDestroyed('write');

    const accessor = this.accessorFor(path)!;
    const file: File = {
      header: {
        annotations: this.getAnnotations(path),
      },
      content,
    };
    try {
      await accessor.write(this.resolve(path), file, options);
    } catch (e) {
      throw this.decorateError(e, 'write');
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

class MapApiError extends ApiError {
  generatorPath: string;
  destPath?: string;

  constructor(message: string, verb: string, generatorPath: string, destPath?: string) {
    super(message, verb);
    this.generatorPath = generatorPath;
    if (destPath) this.destPath = destPath;
  }
}

type MapChangeApiProtected = GeneratorApiProtected & {
  changeset: Changeset;
};

export class MapChangeApi extends GeneratorApi {
  protected [_]: MapChangeApiProtected;

  constructor(macrome: Macrome, generatorPath: string, changeset: Changeset) {
    super(macrome, generatorPath);
    this[_].changeset = changeset;
  }

  static fromGeneratorApi(generatorApi: GeneratorApi, changeset: Changeset): MapChangeApi {
    const { macrome, generatorPath } = generatorApi[_];
    return new MapChangeApi(macrome, generatorPath, changeset);
  }

  protected decorateError(error: Error, verb: string): MapApiError {
    const { generatorPath } = this[_];

    return new MapApiError(error.message, verb, generatorPath);
  }

  getAnnotations(destPath: string): Map<string, any> {
    const { changeset } = this[_];

    const relPath = relative(dirname(destPath), changeset.root);

    return new Map([
      ...super.getAnnotations(destPath),
      ['generated-from', relPath.startsWith('.') ? relPath : `./${relPath}`],
    ]);
  }

  async write(path: string, content: string, options: WriteOptions): Promise<void> {
    const { changeset } = this[_];

    changeset.add({
      path,
      operation: UPDATE,
    });

    await super.write(path, content, options);
  }
}
