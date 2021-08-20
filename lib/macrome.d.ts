import { WatchmanClient } from './watchman';
import { Api, GeneratorApi } from './apis';
import { Changeset } from './changeset';
import { Options, BuiltOptions } from './config';
import { VCSConfig } from './vcs-configs';
import { Accessor, Generator, Change } from './types';
declare type GeneratorStub = {
    options: Record<string, any>;
    path: string;
    resolvedPath: string;
    vcsPath: string;
};
export declare class Macrome {
    options: BuiltOptions;
    initialized: boolean;
    root: string;
    watchRoot: string;
    api: Api;
    vcsConfig: VCSConfig | null;
    watchClient: WatchmanClient | null;
    generatorStubs: Map<string, Array<GeneratorStub>>;
    generators: Map<string, Array<{
        generator: Generator<unknown>;
        api: GeneratorApi;
        vcsPath: string;
        paths: Map<string, {
            change: Change;
            mapResult: unknown;
        }>;
    }>>;
    changesets: Map<string, Changeset>;
    accessorsByFileType: Map<string, Accessor>;
    constructor(apiOptions: Options);
    private initialize;
    private get generatorInstances();
    get logger(): any;
    instantiateGenerators(generatorPath: string): Promise<void>;
    accessorFor(path: string): Accessor | null;
    processChanges(rootChanges: Array<Change>): Promise<void>;
    build(): Promise<void>;
    watch(): Promise<void>;
    stopWatching(): void;
    hasHeader(path: string): Promise<boolean>;
    clean(): Promise<void>;
    check(): Promise<boolean>;
    relative(path: string): string;
    resolve(path: string): string;
}
export {};
