/// <reference types="node" />
import type { Macrome } from './macrome';
import type { WriteOptions, ReadOptions, Accessor, Change, Annotations } from './types';
import { FileHandle } from 'fs/promises';
declare const _: unique symbol;
declare type ApiProtected = {
    destroyed: boolean;
    macrome: Macrome;
};
export declare class ApiError extends Error {
    verb: string;
    constructor(message: string, verb: string);
}
/**
 * Api is a facade over the Macrome class which exposes the functionality which should be accessible to generators
 */
export declare class Api {
    protected [_]: ApiProtected;
    constructor(macrome: Macrome);
    protected __assertNotDestroyed(methodName: string): void;
    destroy(): void;
    protected decorateError(error: Error, verb: string): Error;
    getAnnotations(_destPath?: string): Map<string, any>;
    resolve(path: string): string;
    accessorFor(path: string): Accessor | null;
    readAnnotations(path: string, options: {
        handle: FileHandle;
    }): Promise<Annotations | null>;
    read(path: string, options: ReadOptions): Promise<string>;
    write(path: string, content: string, options: WriteOptions): Promise<void>;
}
declare type GeneratorApiProtected = ApiProtected & {
    generatorPath: string;
};
export declare class GeneratorApi extends Api {
    protected [_]: GeneratorApiProtected;
    constructor(macrome: Macrome, generatorPath: string);
    static fromApi(api: Api, generatorPath: string): GeneratorApi;
    getAnnotations(_destPath?: string): Map<string, any>;
}
export declare class MapApiError extends ApiError {
    generatorPath: string;
    destPath?: string;
    constructor(message: string, verb: string, generatorPath: string, destPath?: string);
}
declare type MapChangeApiProtected = GeneratorApiProtected & {
    change: Change;
};
export declare class MapChangeApi extends GeneratorApi {
    protected [_]: MapChangeApiProtected;
    constructor(macrome: Macrome, generatorPath: string, change: Change);
    static fromGeneratorApi(generatorApi: GeneratorApi, change: Change): MapChangeApi;
    protected decorateError(error: Error, verb: string): MapApiError;
    getAnnotations(destPath: string): Map<string, any>;
}
export {};
