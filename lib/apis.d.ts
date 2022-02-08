/// <reference types="node" />
import type { Macrome } from './macrome';
import type { WriteOptions, ReadOptions, Accessor, MappableChange, Annotations, EnqueuedChange } from './types';
import { FileHandle } from 'fs/promises';
import { Errawr } from 'errawr';
declare const _: unique symbol;
declare type PromiseDict = {
    [key: string]: Promise<any>;
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
    destroy(): void;
    protected decorateError(error: Error, verb: string): Error;
    buildAnnotations(_destPath?: string): Map<string, any>;
    buildErrorAnnotations(_destPath?: string): Map<string, any>;
    buildErrorContent(error: Error): string;
    resolve(path: string): string;
    accessorFor(path: string): Accessor | null;
    getAnnotations(path: string, options?: {
        fd?: FileHandle;
    }): Promise<Annotations | null>;
    read(path: string, options: ReadOptions): Promise<string>;
    write(path: string, content: string | Error, options?: WriteOptions): Promise<void>;
    generate(path: string, cb: (path: string, deps: Record<string, never>) => Promise<string>): Promise<void>;
    generate<D extends PromiseDict>(path: string, deps: D, cb: (path: string, resolvedDeps: D) => Promise<string>): Promise<void>;
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
    protected decorateError(error: Error, verb: string): Error;
    buildAnnotations(destPath: string): Map<string, any>;
    buildErrorAnnotations(destPath: string): Map<string, any>;
    write(path: string, content: string, options: WriteOptions): Promise<void>;
    generate(path: string, cb: (path: string, deps: Record<string, never>) => Promise<string>): Promise<void>;
    generate<D extends {
        [key: string]: Promise<any>;
    }>(path: string, deps: D, cb: (path: string, resolvedDeps: D) => Promise<string>): Promise<void>;
}
export {};
