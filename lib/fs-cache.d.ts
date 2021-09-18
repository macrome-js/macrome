import { Annotations } from './types';
declare type CacheEntry = {
    mtimeMs: number;
    annotations: Annotations | null;
    generatedPaths: Set<string>;
};
export declare const fsCache: Map<string, CacheEntry>;
export {};
