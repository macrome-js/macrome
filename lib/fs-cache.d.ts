import { Annotations } from './types';
export declare type CacheEntry = {
    path: string;
    mtimeMs: number;
    annotations: Annotations | null;
    generatedPaths: Set<string>;
};
export declare const fsCache: Map<string, CacheEntry>;
