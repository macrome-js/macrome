/**
 * Simulate watchman's expression matching engine
 */

import { matcher } from 'micromatch';
import { extname } from 'path';
import { asArray } from './matchable';
import { Matcher } from './types';

const { isArray } = Array;

export function matchExpression(expr: unknown): Matcher {
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
        const matcher = matchExpression(expr);
        return (path) => !matcher(path);
      }
      case 'all': {
        const matchers = args.map(matchExpression);
        return (path) => matchers.every((matcher) => matcher(path));
      }
      case 'any': {
        const matchers = args.map(matchExpression);
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
      // case 'mmatch': ???
      // watchman can't actually do this, so we'd essentially have to factor this out of expressions
      default:
        throw new TypeError(`${type} is not a valid type of expression`);
    }
  } else {
    throw new TypeError(`Expr must be an array. Received ${expr}`);
  }
}
