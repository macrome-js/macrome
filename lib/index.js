const { Macrome } = require('./macrome');
const { Generator } = require('./generator');
const { ADD, REMOVE, UPDATE } = require('./operations');
const { SourceControlGit } = require('./source-control');

module.exports = { Macrome, Generator, ADD, REMOVE, UPDATE, SourceControlGit };
