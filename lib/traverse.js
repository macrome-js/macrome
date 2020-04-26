'use strict';

const { relative } = require('path');
const recursiveRead = require('recursive-readdir');
const sane = require('sane');
const { matcher } = require('./matcher');

const alwaysIgnored = ['.git', 'node_modules'];

function asArray(glob) {
  return Array.isArray(glob) ? glob : glob ? [glob] : [];
}

function traverse(root, { ignored, glob } = {}) {
  const matchesGlob = matcher(root, glob);

  return recursiveRead(root, [matcher(root, [...alwaysIgnored, ...asArray(ignored)])]).then(
    initialPaths => {
      return initialPaths.filter(matchesGlob).map(path => relative(root, path));
    },
  );
}

function watch(root, { ignored, glob } = {}) {
  return sane(root, { ignored: [...alwaysIgnored, ...asArray(ignored)], glob });
}

module.exports = { traverse, watch };
