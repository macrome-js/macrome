'use strict';

const { Macrome } = require('./macrome');
const { Generator } = require('./generator');
const { MapAstGenerator } = require('./map-ast-generator');
const { ADD, REMOVE, UPDATE } = require('./operations');

module.exports = { Macrome, Generator, MapAstGenerator, ADD, REMOVE, UPDATE };
