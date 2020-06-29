'use strict';

const { relative } = require('path');
const recursiveRead = require('recursive-readdir');
const { matcher } = require('./matchable');

const alwaysIgnored = ['.git', 'node_modules'];

function asArray(glob) {
  return Array.isArray(glob) ? glob : glob ? [glob] : [];
}

function traverse(root, { ignored } = {}) {
  const ignoredMatcher = matcher({ files: [...alwaysIgnored, ...asArray(ignored)] });

  return recursiveRead(root, [(path) => ignoredMatcher(relative(root, path))]).then(
    (initialPaths) => {
      return initialPaths.map((path) => relative(root, path));
    },
  );
}

module.exports = { traverse };
