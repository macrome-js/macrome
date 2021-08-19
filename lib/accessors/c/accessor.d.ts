import { Accessor, Annotations, File, ReadOptions, WriteOptions } from '../../types';
import { CCommentParser } from './parser';
export declare class CAccessor implements Accessor {
    supportedFileTypes: string[];
    commentParser: CCommentParser;
    readAnnotations(path: string): Promise<Annotations>;
    read(path: string, options?: ReadOptions): Promise<File>;
    write(path: string, file: File, options: WriteOptions): Promise<void>;
}
