'use strict';

const { dirname, join, basename } = require('path');
const sha1 = require('sha1');

class SimpleGenerator {
  constructor() {
    this.include = ['lib/*.js'];
    this.exclude = ['**/generated-*'];
  }

  getDestPath(path) {
    const dir = dirname(path);
    const base = basename(path);
    return join(dir, `generated-${base}`);
  }

  async map(api, { path }) {
    Object.defineProperty(api, 'version', {
      get() {
        // We can't use the mtime because it will keep changing
        return sha1(this.change.path).slice(0, 6);
      },
    });
    const content = await api.read(path);
    await api.write(this.getDestPath(path), content);
  }
}

module.exports = SimpleGenerator;
