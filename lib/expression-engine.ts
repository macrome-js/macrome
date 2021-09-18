/**
 * Simulate watchman's expression matching engine
 */

import { matcher as mMatcher } from 'micromatch';
import ignoreFactory from 'ignore';
import { extname } from 'path';
import { asArray } from './matchable';
import { Matcher } from './types';

const { isArray } = Array;

const ignoreFrom = (patterns: string | Array<string>) => {
  return ignoreFactory().add(patterns as any);
};

export function getMatcher(expr: unknown): Matcher {
  if (typeof expr === 'string') {
    switch (expr) {
      default:
        throw new Error('no string expression are supported yet');
    }
  } else if (isArray(expr)) {
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
        const suffixes = new Set(asArray(suffix));
        return (path) => suffixes.has(extname(path));
      }
      case 'name': {
        const [_names] = args;
        const names = new Set(asArray(_names));
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
        const matcher = Array.isArray(pattern) ? mMatcher(pattern.join('|')) : mMatcher(pattern);
        return (path) => matcher(path);
      }
      default:
        throw new TypeError(`${type} is not a valid type of expression`);
    }
  } else {
    throw new TypeError(`Expr must be an array. Received ${expr}`);
  }
}
