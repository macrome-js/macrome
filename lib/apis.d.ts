/// <reference types="node" />
import type { Macrome } from './macrome';
import type { WriteOptions, ReadOptions, MappableChange, Annotations, EnqueuedChange } from './types';
import { FileHandle } from 'fs/promises';
import { Errawr } from 'errawr';
declare const _: unique symbol;
declare type PromiseDict = {
    [key: string]: Promise<any>;
};
declare type ResolvedPromiseDict<D> = {
    [K in keyof D]: Awaited<D[K]>;
};
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
    __destroy(): void;
    protected __decorateError(error: Error, verb: string): Error;
    buildAnnotations(_destPath?: string): Map<string, any>;
    buildErrorAnnotations(_destPath?: string): Map<string, any>;
    buildErrorContent(error: Error): string;
    resolve(path: string): string;
    readAnnotations(path: string, options?: {
        fd?: FileHandle;
    }): Promise<Annotations | null>;
    read(path: string, options: ReadOptions): Promise<string>;
    write(path: string, content: string | Error, options?: WriteOptions): Promise<void>;
    generate(path: string, cb: (props: {
        destPath: string;
    } & Record<string, never>) => Promise<string | null>): Promise<void>;
    generate<D extends PromiseDict>(path: string, deps: D, cb: (props: {
        destPath: string;
    } & ResolvedPromiseDict<D>) => Promise<string | null>): Promise<void>;
    __generate(destPath: string, deps: PromiseDict, cb: (props: {
        destPath: string;
    } & Record<string, any>) => Promise<string | null>): Promise<void>;
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
    buildErrorAnnotations(_destPath?: string): Map<string, any>;
}
declare type MapChangeApiProtected = GeneratorApiProtected & {
    change: MappableChange;
};
export declare class MapChangeApi extends GeneratorApi {
    protected [_]: MapChangeApiProtected;
    static fromGeneratorApi(generatorApi: GeneratorApi, change: MappableChange): MapChangeApi;
    constructor(macrome: Macrome, generatorPath: string, change: MappableChange);
    get change(): EnqueuedChange;
    get version(): string;
    protected __decorateError(error: Error, verb: string): Error;
    buildAnnotations(destPath: string): Map<string, any>;
    buildErrorAnnotations(destPath: string): Map<string, any>;
    write(path: string, content: string, options: WriteOptions): Promise<void>;
    __generate(path: string, deps: PromiseDict, cb: (resolvedDeps: {
        destPath: string;
    } & Record<string, any>) => Promise<string | null>): Promise<void>;
}
export {};
