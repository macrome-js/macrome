import { Matchable } from './types';
export { Matchable };
export declare type Matcher = (path: string) => boolean;
export declare function matcher(matchable: Matchable): Matcher;
export declare function matches(path: string, matchable: Matchable): boolean;
