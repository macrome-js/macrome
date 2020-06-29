'use strict';

class Generator {
  constructor(api, options) {
    this.api = api;
    this.options = options;

    this.files = [];
    this.excludedFiles = [];
  }

  get logger() {
    return this.options.logger;
  }

  resolve(path) {
    return this.api.resolve(path);
  }

  parserFor(path) {
    return this.api.parserFor(path);
  }

  // map(api, change) {}

  // reduce(api, changeMap) {}
}

module.exports = { Generator };
