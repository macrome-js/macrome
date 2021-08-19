import { Matchable } from './types';

import { matcher as mmMatcher } from 'micromatch';

export { Matchable };

export type Matcher = (path: string) => boolean;

function matchExpression(
  expr: string | Array<string> | undefined,
  emptyMatcher: () => boolean,
): Matcher {
  let isMatch;
  const isArray = Array.isArray(expr);

  if (expr == null || (isArray && !expr.length)) isMatch = emptyMatcher;
  else if (typeof expr === 'string') isMatch = mmMatcher(expr);
  else if (isArray) isMatch = mmMatcher(`(${expr.join('|')})`);
  else throw new Error('file matching pattern was not a string, Array, or null');

  return isMatch;
}

const matchableMatchers: WeakMap<Matchable, Matcher> = new WeakMap();

export function matcher(matchable: Matchable): Matcher {
  if (!matchableMatchers.has(matchable)) {
    const includeMatcher = matchExpression(matchable.files, () => true);
    const excludeMatcher = matchExpression(matchable.excludeFiles, () => false);

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
