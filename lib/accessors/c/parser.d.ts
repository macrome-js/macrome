import { FileHeader } from '../../types';
export declare class CCommentParser {
    _parser: any;
    constructor();
    parse(text: string): FileHeader;
    print({ annotations, content }: FileHeader): string;
}
