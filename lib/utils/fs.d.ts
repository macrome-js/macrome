import type { ReadOptions, WriteOptions } from '../types';
export declare function buildOptions(options?: ReadOptions): Exclude<ReadOptions, string> & {
    encoding: 'utf8';
};
export declare function buildOptions(options?: WriteOptions): Exclude<WriteOptions, string> & {
    encoding: 'utf8';
};
export declare function recursiveReadFiles(root: string, options?: {
    shouldInclude?: (path: string) => boolean | undefined;
    shouldExclude?: (path: string) => boolean | undefined;
}): AsyncGenerator<string>;
