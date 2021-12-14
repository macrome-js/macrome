import { Errawr, rawr } from 'errawr';

import type { Macrome } from './macrome';
import type { WriteOptions, ReadOptions, Accessor, File, Change, Annotations } from './types';

import { relative, dirname } from 'path';
import { promises as fsPromises } from 'fs';
import { FileHandle } from 'fs/promises';
import { buildOptions } from './utils/fs';

const { open } = fsPromises;

const _ = Symbol.for('private members');

class ApiError extends Errawr {
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
    const now = Date.now();

    let fd;
    try {
      fd = await open(this.resolve(path), 'a+');
      const { mtimeMs } = await fd.stat();
      const new_ = mtimeMs > now; // is there a better way to implement this?

      // if I make this read from the annotations cache
      const annotations = await accessor.readAnnotations(this.resolve(path), { fd });
      if (annotations === null) {
        throw new Error('macrome will not overwrite non-generated files');
      }

      await fd.truncate();

      await accessor.write(path, file, { ...buildOptions(options), fd });

      // We could wait for the watcher to do this, but there are two reasons we don't:
      // First there may not be a watcher, and we want things to work basically the same way when
      // the watcher is and is not present. Second we want to ensure that our causally linked
      // changes are always batched so that we can detect non-terminating cycles.
      macrome.enqueue({
        path,
        exists: true,
        new: new_,
        mtimeMs,
      });
    } catch (e: any) {
      throw this.decorateError(e, 'write');
    } finally {
      fd?.close();
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

  buildAnnotations(_destPath?: string): Map<string, any> {
    const { generatorPath } = this[_];

    return new Map<string, any>([
      ...super.buildAnnotations(),
      ['generatedby', `/${generatorPath}`],
    ]);
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

  protected decorateError(error: Error, verb: string): Error {
    const { generatorPath, change } = this[_];

    return new ApiError(rawr('macrome {{verb}} failed', { rest: true }), {
      cause: error,
      info: { verb, generator: generatorPath, change },
    });
  }

  buildAnnotations(destPath: string): Map<string, any> {
    const { macrome } = this[_];

    const relPath = relative(dirname(destPath), macrome.root);

    return new Map([
      ...super.buildAnnotations(destPath),
      ['generatedfrom', relPath.startsWith('.') ? relPath : `./${relPath}`],
    ]);
  }
}
