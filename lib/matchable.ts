import type { AsymmetricMMatchExpression, Matcher, MMatchExpression } from './types';

import picomatch from 'picomatch';
import { notNil } from 'iter-tools-es';

export type { AsymmetricMMatchExpression, Matcher, MMatchExpression };

export const defaultMatchers = {
  include: (): boolean => true,
  exclude: (): boolean => false,
};

const { isArray } = Array;
const isString = (value: any): value is string => typeof value === 'string';

export const asArray = <T>(value: T | null | undefined | Array<T | null | undefined>): Array<T> =>
  value == null ? [] : !isArray(value) ? [value] : value.filter(notNil);

export function expressionMatcher(expr: MMatchExpression, type: 'include' | 'exclude'): Matcher {
  let isMatch;

  if (expr == null || (isArray(expr) && !expr.length)) isMatch = defaultMatchers[type];
  else if (isString(expr)) isMatch = picomatch(expr);
  else if (isArray(expr)) {
    isMatch = picomatch(expr.filter(notNil));
  } else throw new Error('file matching pattern was not a string, Array, or null');

  return isMatch;
}

export const mergeMatchers = (
  a: Matcher | undefined,
  b: Matcher | undefined,
): Matcher | undefined => {
  return a && b ? (path: string) => a(path) && b(path) : a || b;
};

export const mergeExcludeMatchers = (
  a: Matcher | undefined,
  b: Matcher | undefined,
): Matcher | undefined => {
  return a && b ? (path: string) => a(path) || b(path) : a || b;
};

export function expressionMerger(
  exprA: MMatchExpression,
  exprB: MMatchExpression,
): MMatchExpression {
  if (exprB == null) return exprA;
  if (exprA == null) return exprB;

  return [...asArray(exprA), ...asArray(exprB)];
}

const matchableMatchers: WeakMap<AsymmetricMMatchExpression, Matcher> = new WeakMap();

export function matcher(matchable: AsymmetricMMatchExpression): Matcher {
  if (!matchableMatchers.has(matchable)) {
    const includeMatcher = expressionMatcher(matchable.include, 'include');
    const excludeMatcher = expressionMatcher(matchable.exclude, 'exclude');

    matchableMatchers.set(
      matchable,
      (path: string) => includeMatcher(path) && !excludeMatcher(path),
    );
  }
  return matchableMatchers.get(matchable)!;
}

export function matches(path: string, matchable: AsymmetricMMatchExpression): boolean {
  return matcher(matchable)(path);
}
