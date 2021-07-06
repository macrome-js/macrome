'use strict';

const { relative, dirname } = require('path');

const { ADD, REMOVE, UPDATE } = require('./operations');

const _ = Symbol('private members');

class Api {
  constructor() {
    this[_] = {
      destroyed: false,
    };
  }

  __assertNotDestroyed(methodName) {
    if (this[_].destroyed) {
      throw new Error(`api.${methodName} cannot be called outside the hook providing the api`);
    }
  }

  __destroy() {
    this[_].destroyed = true;
  }
}

class StaticApi extends Api {
  constructor(macrome) {
    super();
    this[_].macrome = macrome;
  }

  resolve(path) {
    return this[_].macrome.resolve(path);
  }

  accessorFor(path) {
    return this[_].macrome.accessorFor(path);
  }

  async read(path, options = {}) {
    const { encoding = 'utf8', ..._options } = options;
    const accessor = this.accessorFor(path);
    const result = await accessor.read(this.resolve(path), { encoding, ..._options });

    return result.content;
  }

  async write(path, { header, content }, options) {
    const accessor = this.accessorFor(path);
    await accessor.write(this.resolve(path), { header, content }, options);
  }
}

class MapError extends Error {
  constructor(message, generator, operation, destPath) {
    super(message);
    this.generator = generator;
    this.operation = operation;
    if (destPath) this.destPath = destPath;
  }
}

class MapChangeApi extends StaticApi {
  constructor(macrome, changeset, generatorPath, rootChangePath) {
    super(macrome);
    this[_].changeset = changeset;
    this[_].generatorPath = generatorPath;
    this[_].rootChangePath = rootChangePath;
  }

  getAnnotations(destPath) {
    const { changeset, generatorPath } = this[_];

    const relPath = relative(dirname(destPath), changeset.root);

    return new Map([
      ['macrome', true],
      ['generated-from', relPath.startsWith('.') ? relPath : `./${relPath}`],
      ['generated-by', generatorPath],
    ]);
  }

  async read(path, options) {
    const { generatorPath } = this[_];
    try {
      return await super.read(path, options);
    } catch (e) {
      throw new MapError(e.message, generatorPath, 'read');
    }
  }

  async write(path, content, options) {
    const { changeset } = this[_];

    this.__assertNotDestroyed('write');
    changeset.add({
      path,
      // operation: this.changed.has(path) ? UPDATE : ADD,
      operation: UPDATE,
    });

    await this.accessorFor(path).write(
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

  // unlink(path) {
  //   this.__assertNotDestroyed('unlink');
  //   this[_].changeset.add({ path, operation: REMOVE });

  //   fs.unlinkSync(this.resolve(path));
  // }
}

class ReducerChangeApi extends StaticApi {
  getAnnotations() {
    return new Map([
      ['macrome', true],
      ['generated-by', this[_].generatorPath],
    ]);
  }

  write(path, content, options) {
    const { changeset } = this[_];

    this.__assertNotDestroyed('write');

    changeset.add({
      path,
      operation: this.changed.has(path) ? UPDATE : ADD,
    });

    this.accessorFor(path).write(
      this.resolve(path),
      {
        header: {
          annotations: getAnnotations(path),
        },
        content,
      },
      options,
    );
  }
}

module.exports = { StaticApi, MapChangeApi, ReducerChangeApi };
