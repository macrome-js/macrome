'use strict';

const { dirname, join, basename } = require('path');

class SimpleGenerator {
  constructor() {
    this.files = ['lib/*.js'];
    this.excludeFiles = ['**/generated-*'];
  }

  getDestPath(path) {
    const dir = dirname(path);
    const base = basename(path);
    return join(dir, `generated-${base}`);
  }

  async map(api, { path }) {
    const content = await api.read(path);
    await api.write(this.getDestPath(path), content);
  }
}

module.exports = SimpleGenerator;
