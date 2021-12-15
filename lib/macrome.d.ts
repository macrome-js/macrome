/// <reference types="node" />
import type { FileHandle } from 'fs/promises';
import type { Accessor, Generator, Change, Annotations, AsymmetricMMatchExpressionWithSuffixes } from './types';
import Queue from '@iter-tools/queue';
import { WatchmanClient } from './watchman';
import { Api, GeneratorApi } from './apis';
import { Options, BuiltOptions } from './config';
import { VCSConfig } from './vcs-configs';
import { CacheEntry } from './fs-cache';
declare type GeneratorMeta = {
    api: GeneratorApi;
    mappings: Map<string, unknown>;
};
export declare class Macrome {
    options: BuiltOptions;
    initialized: boolean;
    progressive: boolean;
    root: string;
    watchRoot: string;
    api: Api;
    vcsConfig: VCSConfig | null;
    watchClient: WatchmanClient | null;
    generators: Map<string, Array<Generator<unknown>>>;
    generatorsMeta: WeakMap<Generator<unknown>, GeneratorMeta>;
    queue: Queue<{
        change: Change;
        cacheEntry: CacheEntry | undefined;
    }> | null;
    enqueueLock: Promise<void> | null;
    accessorsByFileType: Map<string, Accessor>;
    constructor(apiOptions: Options);
    protected initialize(): Promise<void>;
    protected get generatorInstances(): IterableIterator<Generator<unknown>>;
    get logger(): any;
    protected instantiateGenerators(generatorPath: string): Promise<void>;
    accessorFor(path: string): Accessor | null;
    getAnnotations(path: string, options?: {
        fd?: FileHandle;
    }): Promise<Annotations | null>;
    protected forMatchingGenerators(path: string, cb: (generator: Generator<unknown>, meta: GeneratorMeta) => unknown): Promise<void>;
    protected getBaseExpression(): AsymmetricMMatchExpressionWithSuffixes;
    enqueue(change: Change): Promise<void>;
    __enqueue(change: Change): Promise<void>;
    processChanges(): Promise<void>;
    build(): Promise<void>;
    watch(): Promise<void>;
    stopWatching(): void;
    clean(): Promise<void>;
    check(): Promise<boolean>;
    relative(path: string): string;
    resolve(path: string): string;
}
export {};
