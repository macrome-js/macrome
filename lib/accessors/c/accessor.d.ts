/// <reference types="node" />
import type { FileHandle } from 'fs/promises';
import type { Accessor, Annotations, File, ReadOptions, WriteOptions } from '../../types';
import { CCommentParser } from './parser';
export declare class CAccessor implements Accessor {
    supportedFileTypes: string[];
    commentParser: CCommentParser;
    readAnnotations(path: string | FileHandle): Promise<Annotations | null>;
    read(path: string | FileHandle, options?: ReadOptions): Promise<File>;
    write(path: string | FileHandle, file: File, options: WriteOptions): Promise<void>;
}
