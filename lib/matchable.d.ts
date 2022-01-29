import type { AsymmetricMMatchExpression, Matcher, MMatchExpression } from './types';
export type { AsymmetricMMatchExpression, Matcher, MMatchExpression };
export declare const defaultMatchers: {
    include: () => boolean;
    exclude: () => boolean;
};
export declare const asArray: <T>(value: T | (T | null | undefined)[] | null | undefined) => T[];
export declare function expressionMatcher(expr: MMatchExpression, type: 'include' | 'exclude'): Matcher;
export declare const mergeMatchers: (a: Matcher | undefined, b: Matcher | undefined) => Matcher | undefined;
export declare function expressionMerger(exprA: MMatchExpression, exprB: MMatchExpression): MMatchExpression;
export declare function matcher(matchable: AsymmetricMMatchExpression): Matcher;
export declare function matches(path: string, matchable: AsymmetricMMatchExpression): boolean;
