'use strict';

const { MapAstGenerator } = require('macrome');

const { dirname, join, basename } = require('path');

class SimpleGenerator extends MapAstGenerator {
  constructor(macrome, options) {
    super(macrome, options);

    this.included = ['lib/*.js'];
    this.ignored = [...this.ignored, '**/generated-*'];
  }

  getDestPath(path) {
    const dir = dirname(path);
    const base = basename(path);
    return join(dir, `generated-${base}`);
  }

  mapAst(ast) {
    return ast;
  }
}

module.exports = SimpleGenerator;
