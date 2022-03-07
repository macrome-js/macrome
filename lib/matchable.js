"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.matches = exports.matcher = exports.expressionMerger = exports.mergeExcludeMatchers = exports.mergeMatchers = exports.expressionMatcher = exports.asArray = exports.defaultMatchers = void 0;
const picomatch_1 = __importDefault(require("picomatch"));
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
        isMatch = (0, picomatch_1.default)(expr);
    else if (isArray(expr)) {
        isMatch = (0, picomatch_1.default)(expr.filter(iter_tools_es_1.notNil));
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
const mergeExcludeMatchers = (a, b) => {
    return a && b ? (path) => a(path) || b(path) : a || b;
};
exports.mergeExcludeMatchers = mergeExcludeMatchers;
function expressionMerger(exprA, exprB) {
    if (exprB == null)
        return exprA;
    if (exprA == null)
        return exprB;
    return [...(0, exports.asArray)(exprA), ...(0, exports.asArray)(exprB)];
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
