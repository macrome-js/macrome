"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matches = exports.matcher = void 0;
const micromatch_1 = require("micromatch");
function matchExpression(expr, emptyMatcher) {
    let isMatch;
    const isArray = Array.isArray(expr);
    if (expr == null || (isArray && !expr.length))
        isMatch = emptyMatcher;
    else if (typeof expr === 'string')
        isMatch = micromatch_1.matcher(expr);
    else if (isArray)
        isMatch = micromatch_1.matcher(`(${expr.join('|')})`);
    else
        throw new Error('file matching pattern was not a string, Array, or null');
    return isMatch;
}
const matchableMatchers = new WeakMap();
function matcher(matchable) {
    if (!matchableMatchers.has(matchable)) {
        const includeMatcher = matchExpression(matchable.files, () => true);
        const excludeMatcher = matchExpression(matchable.excludeFiles, () => false);
        matchableMatchers.set(matchable, (path) => includeMatcher(path) && !excludeMatcher(path));
    }
    return matchableMatchers.get(matchable);
}
exports.matcher = matcher;
function matches(path, matchable) {
    return matcher(matchable)(path);
}
exports.matches = matches;
