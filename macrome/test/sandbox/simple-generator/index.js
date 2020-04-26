'use strict';

const { Generator } = require('macrome');

const { dirname, join, basename } = require('path');

class GeneratorApplyBabelMacros extends Generator {
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

  generatePath({ ast, path }, destPath) {
    return ast;
  }
}

module.exports = GeneratorApplyBabelMacros;
