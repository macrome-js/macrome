/// <reference types="node" />
import { Errawr } from 'errawr';
import type { Macrome } from './macrome';
import type { WriteOptions, ReadOptions, Accessor, Change, Annotations } from './types';
import { FileHandle } from 'fs/promises';
declare const _: unique symbol;
export declare class ApiError extends Errawr {
    get name(): string;
}
declare type ApiProtected = {
    destroyed: boolean;
    macrome: Macrome;
};
/**
 * Api is a facade over the Macrome class which exposes the functionality which should be accessible to generators
 */
export declare class Api {
    protected [_]: ApiProtected;
    constructor(macrome: Macrome);
    protected __assertNotDestroyed(methodName: string): void;
    get macrome(): Macrome;
    get destroyed(): boolean;
    destroy(): void;
    protected decorateError(error: Error, verb: string): Error;
    buildAnnotations(_destPath?: string): Map<string, any>;
    resolve(path: string): string;
    accessorFor(path: string): Accessor | null;
    getAnnotations(path: string, options?: {
        fd?: FileHandle;
    }): Promise<Annotations | null>;
    read(path: string, options: ReadOptions): Promise<string>;
    write(path: string, content: string, options: WriteOptions): Promise<void>;
}
declare type GeneratorApiProtected = ApiProtected & {
    generatorPath: string;
};
export declare class GeneratorApi extends Api {
    protected [_]: GeneratorApiProtected;
    static fromApi(api: Api, generatorPath: string): GeneratorApi;
    constructor(macrome: Macrome, generatorPath: string);
    get generatorPath(): string;
    buildAnnotations(_destPath?: string): Map<string, any>;
}
declare type MapChangeApiProtected = GeneratorApiProtected & {
    change: Change;
};
export declare class MapChangeApi extends GeneratorApi {
    protected [_]: MapChangeApiProtected;
    static fromGeneratorApi(generatorApi: GeneratorApi, change: Change): MapChangeApi;
    constructor(macrome: Macrome, generatorPath: string, change: Change);
    get change(): Change;
    protected decorateError(error: Error, verb: string): Error;
    buildAnnotations(destPath: string): Map<string, any>;
}
export {};
