import { WatchmanClient } from './watchman';
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
    vcsConfig: VCSConfig | null;
    watchRoot: string;
    options: BuiltOptions;
    root: string;
    generatorStubs: Map<string, Array<GeneratorStub>>;
    generators: Map<string, Array<{
        generator: Generator<unknown>;
        vcsPath: string;
        paths: Map<string, {
            change: Change;
            mapResult: unknown;
        }>;
    }>>;
    changesets: Map<string, Changeset>;
    watchClient: WatchmanClient | null;
    accessorsByFileType: Map<string, Accessor>;
    constructor(apiOptions: Options);
    private get generatorInstances();
    get logger(): any;
    instantiateGenerators(generatorPath: string): void;
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
