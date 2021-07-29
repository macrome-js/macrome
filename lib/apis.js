'use strict';

const { dirname, relative } = require('path');

const { UPDATE } = require('./operations');

const _ = Symbol('private members');

const localPath = (path) => (path.startsWith('.') ? path : `./${path}`);

class StaticApi {
  constructor(macrome) {
    this[_] = { macrome };
  }

  bindChangeset(changeset) {
    return new ChangesetApi(this, changeset);
  }

  resolve(path) {
    return this[_].macrome.resolve(path);
  }

  relative(path) {
    return this[_].macrome.relative(path);
  }

  accessorFor(path) {
    return this[_].macrome.accessorFor(path);
  }

  getAnnotations() {
    return new Map([['macrome', true]]);
  }

  async read(path, options = {}) {
    const { encoding = 'utf8', ..._options } = options;
    const accessor = this.accessorFor(path);
    const result = await accessor.read(this.resolve(path), { encoding, ..._options });

    return result.content;
  }

  async __write(path, { header = {}, content }, options) {
    const accessor = this.accessorFor(path);

    await accessor.write(this.resolve(path), { header, content }, options);
  }

  async write(path, content, options) {
    const header = {
      annotations: this.getAnnotations(path),
    };

    await this.__write(path, { header, content }, options);
  }
}

class ChangesetApi extends StaticApi {
  constructor(macrome, changeset) {
    super(macrome);

    this[_].changeset = changeset;
    this[_].destroyed = false;
  }

  static fromStaticApi(staticApi, changeset) {
    const { macrome } = staticApi[_];

    return new ChangesetApi(macrome, changeset);
  }

  async __write(path, { header, content }, options) {
    const { changeset } = this[_];

    this.__assertNotDestroyed('write');
    changeset.add({
      path,
      // operation: this.changed.has(path) ? UPDATE : ADD,
      operation: UPDATE,
    });

    await super.__write(path, { header, content }, options);
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

class MapError extends Error {
  constructor(message, generator, operation, destPath) {
    super(message);
    this.generator = generator;
    this.operation = operation;
    if (destPath) this.destPath = destPath;
  }
}

class MapChangeApi extends ChangesetApi {
  constructor(macrome, changeset, generatorPath, changePath) {
    super(macrome, changeset);

    this[_].generatorPath = generatorPath;
    this[_].changePath = changePath;
  }

  // Copy constructor: these classes extend from each other but they have different lifecycles
  static fromChangesetApi(changesetApi, generatorPath, changePath) {
    const { macrome, changeset } = changesetApi[_];

    changesetApi.__assertNotDestroyed('clone');

    return new MapChangeApi(macrome, changeset, generatorPath, changePath);
  }

  getAnnotations(destPath) {
    const { generatorPath, changePath } = this[_];

    return [
      ...super.getAnnotations(),
      ['generated-from', localPath(relative(dirname(destPath), changePath))],
      ['generated-by', generatorPath],
    ];
  }

  async read(path, options) {
    const { generatorPath } = this[_];
    try {
      return await super.read(path, options);
    } catch (e) {
      throw new MapError(e.message, generatorPath, 'read');
    }
  }
}

class ReduceChangeApi extends StaticApi {
  getAnnotations() {
    return [...super.getAnnotations(), ['generated-by', this[_].generatorPath]];
  }
}

module.exports = { StaticApi, ChangesetApi, MapChangeApi, ReduceChangeApi };
