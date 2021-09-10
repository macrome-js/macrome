import type { Matchable, Matcher, MatchExpression } from './types';

import { matcher as mmMatcher } from 'micromatch';
import { filter, joinWithSeq, stringFrom } from 'iter-tools-es';

export type { Matchable, Matcher, MatchExpression };

export const defaultMatchers = {
  include: (): boolean => true,
  exclude: (): boolean => false,
};

const { isArray } = Array;
const isString = (value: any): value is string => typeof value === 'string';

export const asArray = <T>(value: T | Array<T>): Array<T> => (!isArray(value) ? [value] : value);

export function expressionMatcher(expr: MatchExpression, type: 'include' | 'exclude'): Matcher {
  let isMatch;

  if (expr == null || (isArray(expr) && !expr.length)) isMatch = defaultMatchers[type];
  else if (isString(expr)) isMatch = mmMatcher(expr);
  else if (isArray(expr)) {
    isMatch = mmMatcher(`(${stringFrom(joinWithSeq('|', filter(isString, expr)))})`);
  } else throw new Error('file matching pattern was not a string, Array, or null');

  return isMatch;
}

export function expressionMerger(exprA: MatchExpression, exprB: MatchExpression): MatchExpression {
  if (exprB == null) return exprA;
  if (exprA == null) return exprB;

  return [...asArray(exprA), ...asArray(exprB)];
}

const matchableMatchers: WeakMap<Matchable, Matcher> = new WeakMap();

export function matcher(matchable: Matchable): Matcher {
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

export function matches(path: string, matchable: Matchable): boolean {
  return matcher(matchable)(path);
}
