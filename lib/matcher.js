'use strict';

const { matcher: mmMatcher } = require('micromatch');
const { relative } = require('path');

function matcher(rootDir, glob) {
  let isMatch;
  if (glob == null) return () => true;
  else if (typeof glob === 'string') isMatch = mmMatcher(glob);
  else if (Array.isArray(glob)) isMatch = mmMatcher(`(${glob.join('|')})`);
  else throw new Error('glob configuration was not a string, Array, or null');

  return path => isMatch(relative(rootDir, path));
}

class MatcherCache {
  constructor(rootDir) {
    this.rootDir = rootDir;

    this.cache = new Map();
  }

  get(generator) {
    if (!this.cache.has(generator)) this.miss(generator);

    return this.cache.get(generator);
  }

  miss(generator) {
    const includeMatcher = matcher(this.rootDir, generator.glob);
    const ignoreMatcher = matcher(this.rootDir, generator.ignored);

    this.cache.set(generator, path => includeMatcher(path) && !ignoreMatcher(path));
  }
}

module.exports = { matcher, MatcherCache };
