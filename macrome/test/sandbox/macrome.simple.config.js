'use strict';

const { join, relative } = require('path');
const parser = require('@macrome/parser-babylon');

module.exports = {
  parser,
  generators: [join(relative(process.cwd(), __dirname), 'simple-generator')],
};
