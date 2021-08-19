/// <reference types="node" />
import { ReadOptions } from '../types';
export declare function buildReadOptions(options?: ReadOptions): {
    encoding: BufferEncoding;
    flags?: string;
};
