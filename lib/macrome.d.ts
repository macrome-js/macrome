/// <reference types="node" />
import type { FileHandle } from 'fs/promises';
import type { FileState, Accessor, Generator, Change, Annotations, AsymmetricMMatchExpressionWithSuffixes } from './types';
import Queue from '@iter-tools/queue';
import { WatchmanClient } from './watchman';
import { Api, GeneratorApi } from './apis';
import { Options, BuiltOptions } from './config';
import { VCSConfig } from './vcs-configs';
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
    queue: Queue<Change> | null;
    accessorsByFileType: Map<string, Accessor>;
    state: Map<string, FileState>;
    constructor(apiOptions: Options);
    get logger(): any;
    protected __initialize(): Promise<void>;
    protected get generatorInstances(): IterableIterator<Generator<unknown>>;
    protected __instantiateGenerators(generatorPath: string): Promise<void>;
    protected __forMatchingGenerators(path: string, cb: (generator: Generator<unknown>, meta: GeneratorMeta) => unknown): Promise<void>;
    protected __getBaseExpression(): AsymmetricMMatchExpressionWithSuffixes;
    protected __decorateChangeWithAnnotations(change: Change): Promise<Change>;
    protected __scanChanges(): Promise<Array<Change>>;
    accessorFor(path: string): Accessor | null;
    getAnnotations(path: string, options?: {
        fd?: FileHandle;
    }): Promise<Annotations | null>;
    clean(): Promise<void>;
    enqueue(change: Change): void;
    __enqueue(change: Change): void;
    processChanges(): Promise<void>;
    __build(changes: Array<Change>): Promise<void>;
    build(): Promise<void>;
    watch(): Promise<void>;
    stopWatching(): void;
    check(): Promise<boolean>;
    relative(path: string): string;
    resolve(path: string): string;
}
export {};
