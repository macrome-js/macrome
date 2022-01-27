/// <reference types="node" />
import type { ReadOptions, WriteOptions } from '../types';
import { FileHandle } from 'fs/promises';
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
export declare function openKnownFileForReading(path: string, expectedMtimeMs: number): Promise<FileHandle>;
