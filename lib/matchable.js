"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matches = exports.matcher = exports.expressionMerger = exports.mergeMatchers = exports.expressionMatcher = exports.asArray = exports.defaultMatchers = void 0;
const micromatch_1 = require("micromatch");
const iter_tools_es_1 = require("iter-tools-es");
exports.defaultMatchers = {
    include: () => true,
    exclude: () => false,
};
const { isArray } = Array;
const isString = (value) => typeof value === 'string';
const asArray = (value) => value == null ? [] : !isArray(value) ? [value] : value.filter(iter_tools_es_1.notNil);
exports.asArray = asArray;
function expressionMatcher(expr, type) {
    let isMatch;
    if (expr == null || (isArray(expr) && !expr.length))
        isMatch = exports.defaultMatchers[type];
    else if (isString(expr))
        isMatch = micromatch_1.matcher(expr);
    else if (isArray(expr)) {
        isMatch = micromatch_1.matcher(`(${iter_tools_es_1.stringFrom(iter_tools_es_1.joinWithSeq('|', iter_tools_es_1.filter(isString, expr)))})`);
    }
    else
        throw new Error('file matching pattern was not a string, Array, or null');
    return isMatch;
}
exports.expressionMatcher = expressionMatcher;
const mergeMatchers = (a, b) => {
    return a && b ? (path) => a(path) && b(path) : a || b;
};
exports.mergeMatchers = mergeMatchers;
function expressionMerger(exprA, exprB) {
    if (exprB == null)
        return exprA;
    if (exprA == null)
        return exprB;
    return [...exports.asArray(exprA), ...exports.asArray(exprB)];
}
exports.expressionMerger = expressionMerger;
const matchableMatchers = new WeakMap();
function matcher(matchable) {
    if (!matchableMatchers.has(matchable)) {
        const includeMatcher = expressionMatcher(matchable.include, 'include');
        const excludeMatcher = expressionMatcher(matchable.exclude, 'exclude');
        matchableMatchers.set(matchable, (path) => includeMatcher(path) && !excludeMatcher(path));
    }
    return matchableMatchers.get(matchable);
}
exports.matcher = matcher;
function matches(path, matchable) {
    return matcher(matchable)(path);
}
exports.matches = matches;
