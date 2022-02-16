/// <reference types="node" />
import type { FileHandle } from 'fs/promises';
import type { FileState, Accessor, Generator, ReportedChange, AnnotatedChange, EnqueuedChange, Annotations, AsymmetricMMatchExpressionWithSuffixes } from './types';
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
    generators: Map<string, Array<Generator<unknown, unknown>>>;
    generatorsMeta: WeakMap<Generator<unknown, unknown>, GeneratorMeta>;
    queue: Queue<EnqueuedChange> | null;
    accessorsByFileType: Map<string, Accessor>;
    state: Map<string, FileState>;
    constructor(apiOptions: Options);
    get logger(): any;
    protected __initialize(): Promise<void>;
    protected get generatorInstances(): IterableIterator<Generator<unknown, unknown>>;
    protected __instantiateGenerators(generatorPath: string): Promise<void>;
    protected __forMatchingGenerators(path: string, cb: (generator: Generator<unknown, unknown>, meta: GeneratorMeta) => unknown): Promise<void>;
    protected __getBaseExpression(): AsymmetricMMatchExpressionWithSuffixes;
    protected __decorateChangeWithAnnotations(change: ReportedChange): Promise<AnnotatedChange>;
    protected __scanChanges(): Promise<Array<AnnotatedChange>>;
    accessorFor(path: string): Accessor | null;
    readAnnotations(path: string, options?: {
        fd?: FileHandle;
    }): Promise<Annotations | null>;
    enqueue(change: AnnotatedChange): void;
    __enqueue(change: AnnotatedChange): void;
    processChanges(): Promise<void>;
    clean(): Promise<void>;
    __build(changes: Array<AnnotatedChange>): Promise<void>;
    build(): Promise<void>;
    watch(): Promise<void>;
    stopWatching(): void;
    check(): Promise<boolean>;
    relative(path: string): string;
    resolve(path: string): string;
}
export {};
