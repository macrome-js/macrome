import type { Macrome } from './macrome';
import type { WriteOptions, ReadOptions, Accessor } from './types';
import type { Changeset } from './changeset';
declare const _: unique symbol;
declare type ApiProtected = {
    destroyed: boolean;
};
declare class Api {
    protected [_]: {
        destroyed: boolean;
    };
    constructor();
    __assertNotDestroyed(methodName: string): void;
    __destroy(): void;
}
declare type StaticApiProtected = ApiProtected & {
    macrome: Macrome;
    generatorPath: string;
};
export declare class StaticApi extends Api {
    protected [_]: StaticApiProtected;
    constructor(macrome: Macrome, generatorPath: string);
    resolve(path: string): string;
    accessorFor(path: string): Accessor | null;
    getAnnotations(_destPath: string): Map<string, any>;
    read(path: string, options: ReadOptions): Promise<string>;
    write(path: string, content: string, options: WriteOptions): Promise<void>;
}
declare type MapChangeApiProtected = StaticApiProtected & {
    changeset: Changeset;
};
export declare class MapChangeApi extends StaticApi {
    protected [_]: MapChangeApiProtected;
    constructor(macrome: Macrome, generatorPath: string, changeset: Changeset);
    getAnnotations(destPath: string): Map<string, any>;
    read(path: string, options: ReadOptions): Promise<string>;
    write(path: string, content: string, options: WriteOptions): Promise<void>;
}
export {};
