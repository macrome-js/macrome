'use strict';

const { matcher: mmMatcher } = require('micromatch');

function matcher(glob) {
  let isMatch;
  if (glob == null) return () => true;
  else if (typeof glob === 'string') isMatch = mmMatcher(glob);
  else if (Array.isArray(glob)) isMatch = mmMatcher(`(${glob.join('|')})`);
  else throw new Error('glob configuration was not a string, Array, or null');

  return isMatch;
}

class Matchable {
  constructor() {
    this.included = ['**'];
    this.ignored = [];
  }

  matches(path) {
    if (!this._matches) {
      const includeMatcher = matcher(this.included);
      const ignoreMatcher = matcher(this.ignored);

      this._matches = (path) => includeMatcher(path) && !ignoreMatcher(path);
    }
    return this._matches(path);
  }
}

module.exports = { matcher, Matchable };
