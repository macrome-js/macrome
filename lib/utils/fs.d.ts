/// <reference types="node" />
import type { ReadOptions } from '../types';
import type { FileHandle } from 'fs/promises';
import type { ReadStream } from 'fs';
export declare function buildReadOptions(options?: ReadOptions): {
    encoding: BufferEncoding;
    flags?: string;
};
export declare function createReadStream(path: string | FileHandle): Promise<ReadStream>;
export declare function recursiveReadFiles(root: string, options?: {
    shouldInclude?: (path: string) => boolean | undefined;
    shouldExclude?: (path: string) => boolean | undefined;
}): AsyncGenerator<string>;
