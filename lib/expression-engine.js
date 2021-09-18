"use strict";
/**
 * Simulate watchman's expression matching engine
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMatcher = void 0;
const micromatch_1 = require("micromatch");
const ignore_1 = __importDefault(require("ignore"));
const path_1 = require("path");
const matchable_1 = require("./matchable");
const { isArray } = Array;
const ignoreFrom = (patterns) => {
    return ignore_1.default().add(patterns);
};
function getMatcher(expr) {
    if (typeof expr === 'string') {
        switch (expr) {
            default:
                throw new Error('no string expression are supported yet');
        }
    }
    else if (isArray(expr)) {
        const [type, ...args] = expr;
        if (typeof type !== 'string') {
            throw new TypeError(`Expr must have a name`);
        }
        switch (type) {
            case 'not': {
                const [expr] = args;
                const matcher = getMatcher(expr);
                return (path) => !matcher(path);
            }
            case 'all': {
                const matchers = args.map(getMatcher);
                return (path) => matchers.every((matcher) => matcher(path));
            }
            case 'any': {
                const matchers = args.map(getMatcher);
                return (path) => !!matchers.find((matcher) => matcher(path));
            }
            case 'suffix': {
                const [suffix] = args;
                const suffixes = new Set(matchable_1.asArray(suffix));
                return (path) => suffixes.has(path_1.extname(path));
            }
            case 'name': {
                const [_names] = args;
                const names = new Set(matchable_1.asArray(_names));
                return (path) => names.has(path);
            }
            // case 'type': {
            //   // ???
            //   const [type] = args;
            //   switch(type) {
            //     case 'f': return (_, stats: Stats) => stats.isDirectory()
            //   }
            // }
            case 'match': {
                const [patterns] = args;
                const ignore = ignoreFrom(patterns);
                return (path) => ignore.ignores(path);
            }
            case 'mmatch': {
                const [pattern] = args;
                const matcher = Array.isArray(pattern) ? micromatch_1.matcher(pattern.join('|')) : micromatch_1.matcher(pattern);
                return (path) => matcher(path);
            }
            default:
                throw new TypeError(`${type} is not a valid type of expression`);
        }
    }
    else {
        throw new TypeError(`Expr must be an array. Received ${expr}`);
    }
}
exports.getMatcher = getMatcher;
