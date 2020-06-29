'use strict';

const { matcher: mmMatcher } = require('micromatch');

function matchExpression(expr) {
  let isMatch;
  const isArray = Array.isArray(expr);
  if (expr == null || (isArray && !expr.length)) isMatch = () => false;
  else if (typeof expr === 'string') isMatch = mmMatcher(expr);
  else if (isArray) isMatch = mmMatcher(`(${expr.join('|')})`);
  else throw new Error('file matching pattern was not a string, Array, or null');

  return isMatch;
}

const matchableMatchers = new WeakMap();

function matcher(matchable) {
  if (!matchableMatchers.has(matchable)) {
    const includeMatcher = matchExpression(matchable.files);
    const excludeMatcher = matchExpression(matchable.excludeFiles);
    matchableMatchers.set(matchable, (path) => includeMatcher(path) && !excludeMatcher(path));
  }
  return matchableMatchers.get(matchable);
}

function matches(path, matchable) {
  return matcher(matchable)(path);
}

module.exports = { matcher, matches };
