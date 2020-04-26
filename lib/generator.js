'use strict';

const fs = require('fs');

const { handleError, debounce } = require('./utils');
const operations = require('./operations');

const { REMOVE } = operations;

class Generator {
  get operations() {
    return operations;
  }

  constructor() {
    this.ignored = [];
    this.debouncedMethods = [];
    this.glob = '**';
    this._macrome = undefined;
  }

  get macrome() {
    if (!this._macrome) {
      throw new Error('Attempted to access macrome before it was injected');
    }
    return this._macrome;
  }

  set macrome(macrome) {
    if (this._macrome) {
      throw new Error('Attempted to inject macrome twice');
    }
    this._macrome = macrome;
  }

  get generatedPaths() {
    return this.macrome.generatedPaths;
  }

  debounce(method) {
    const debounced = debounce(method.bind(this), 50);

    this.debouncedMethods.push(debounced);
    return debounced;
  }

  process(change) {
    const { path, operation } = change;
    if (this.recordChange) this.recordChange(change);
    if (!this.getDestPath) return;

    const destPath = this.getDestPath(path);

    if (operation === REMOVE) {
      this.unlink(destPath);
    } else {
      try {
        const content = this.generatePath(path, destPath);
        if (content !== null) {
          this.write(destPath, content);
        }
      } catch (e) {
        console.warn(`Failed generating ${destPath}`);
        handleError(e);
      }
    }
  }

  resolve(path) {
    return this.macrome.resolve(path);
  }

  write(path, content) {
    this.macrome.write(path, content);
  }

  unlink(path) {
    this.macrome.unlink(path);
  }

  writeMonolithic(path, content) {
    if (this.generatedPaths.isStale(path, content)) {
      fs.writeFileSync(this.resolve(path), content);
      this.generatedPaths.cache(path, { monolithic: true });
    }
  }
}

module.exports = { Generator };
