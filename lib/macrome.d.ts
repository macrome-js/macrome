/// <reference types="node" />
import type { FileHandle } from 'fs/promises';
import type { Accessor, Generator, Change, Annotations, AsymmetricMMatchExpressionWithSuffixes } from './types';
import { WatchmanClient } from './watchman';
import { Api, GeneratorApi } from './apis';
import { Options, BuiltOptions } from './config';
import { VCSConfig } from './vcs-configs';
import Queue from '@iter-tools/queue';
export declare class Macrome {
    options: BuiltOptions;
    initialized: boolean;
    root: string;
    watchRoot: string;
    api: Api;
    vcsConfig: VCSConfig | null;
    watchClient: WatchmanClient | null;
    generators: Map<string, Array<Generator<unknown>>>;
    generatorsMeta: WeakMap<Generator<unknown>, {
        api: GeneratorApi;
        mappings: Map<string, unknown>;
    }>;
    queue: Queue<Change> | null;
    accessorsByFileType: Map<string, Accessor>;
    constructor(apiOptions: Options);
    protected initialize(): Promise<void>;
    protected get generatorInstances(): IterableIterator<Generator<unknown>>;
    get logger(): any;
    protected instantiateGenerators(generatorPath: string): Promise<void>;
    accessorFor(path: string): Accessor | null;
    readAnnotations(path: string, { handle }?: {
        handle?: FileHandle | null;
    }): Promise<Annotations | null>;
    protected forMatchingGenerators(path: string, cb: (generator: Generator<unknown>) => unknown): Promise<void>;
    protected getBaseExpression(): AsymmetricMMatchExpressionWithSuffixes;
    enqueue(change: Change): Promise<void>;
    processChanges(): Promise<void>;
    build(): Promise<void>;
    watch(): Promise<void>;
    stopWatching(): void;
    clean(): Promise<void>;
    check(): Promise<boolean>;
    relative(path: string): string;
    resolve(path: string): string;
}
