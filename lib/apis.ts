import type { Macrome } from './macrome';
import type { WriteOptions, ReadOptions, Accessor } from './types';
import type { Changeset } from './changeset';

import { relative, dirname } from 'path';

import { UPDATE } from './operations';
import { buildReadOptions } from './utils/fs';

const _ = Symbol.for('private members');

type ApiProtected = {
  destroyed: boolean;
};

class Api {
  protected [_]: {
    destroyed: boolean;
  };

  constructor() {
    this[_] = { destroyed: false };
  }

  __assertNotDestroyed(methodName: string) {
    if (this[_].destroyed) {
      throw new Error(`api.${methodName} cannot be called outside the hook providing the api`);
    }
  }

  __destroy() {
    this[_].destroyed = true;
  }
}

type StaticApiProtected = ApiProtected & {
  macrome: Macrome;
  generatorPath: string;
};

export class StaticApi extends Api {
  protected [_]: StaticApiProtected;

  constructor(macrome: Macrome, generatorPath: string) {
    super();
    this[_].macrome = macrome;
    this[_].generatorPath = generatorPath;
  }

  resolve(path: string): string {
    return this[_].macrome.resolve(path);
  }

  accessorFor(path: string): Accessor | null {
    return this[_].macrome.accessorFor(path);
  }

  getAnnotations(_destPath: string): Map<string, any> {
    const { generatorPath } = this[_];

    return new Map<string, any>([
      ['macrome', true],
      ['generated-by', generatorPath],
    ]);
  }

  async read(path: string, options: ReadOptions): Promise<string> {
    const { encoding = 'utf8', ..._options } = buildReadOptions(options);
    const accessor = this.accessorFor(path)!;
    const result = await accessor.read(this.resolve(path), { encoding, ..._options });

    return result.content;
  }

  async write(path: string, content: string, options: WriteOptions): Promise<void> {
    const accessor = this.accessorFor(path)!;
    await accessor.write(
      this.resolve(path),
      {
        header: {
          annotations: this.getAnnotations(path),
        },
        content,
      },
      options,
    );
  }
}

class MapError extends Error {
  generatorPath: string;
  verb: string;
  destPath?: string;

  constructor(message: string, generatorPath: string, verb: string, destPath?: string) {
    super(message);
    this.generatorPath = generatorPath;
    this.verb = verb;
    if (destPath) this.destPath = destPath;
  }
}

type MapChangeApiProtected = StaticApiProtected & {
  changeset: Changeset;
};

export class MapChangeApi extends StaticApi {
  protected [_]: MapChangeApiProtected;

  constructor(macrome: Macrome, generatorPath: string, changeset: Changeset) {
    super(macrome, generatorPath);
    this[_].changeset = changeset;
  }

  getAnnotations(destPath: string): Map<string, any> {
    const { changeset } = this[_];

    const relPath = relative(dirname(destPath), changeset.root);

    return new Map([
      ...super.getAnnotations(destPath),
      ['generated-from', relPath.startsWith('.') ? relPath : `./${relPath}`],
    ]);
  }

  async read(path: string, options: ReadOptions): Promise<string> {
    const { generatorPath } = this[_];
    try {
      return await super.read(path, options);
    } catch (e) {
      throw new MapError(e.message, generatorPath, 'read');
    }
  }

  async write(path: string, content: string, options: WriteOptions): Promise<void> {
    const { changeset, generatorPath } = this[_];

    this.__assertNotDestroyed('write');
    changeset.add({
      path,
      // operation: this.changed.has(path) ? UPDATE : ADD,
      operation: UPDATE,
    });

    try {
      await super.write(path, content, options);
    } catch (e) {
      throw new MapError(e.message, generatorPath, 'write');
    }
  }
}
