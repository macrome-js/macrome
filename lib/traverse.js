'use strict';

const { relative } = require('path');
const recursiveRead = require('recursive-readdir');
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

module.exports = { traverse };
