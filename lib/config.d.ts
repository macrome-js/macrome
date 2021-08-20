export declare type Options = {
    quiet?: boolean;
    root?: string;
    configPath?: string;
    alwaysIgnored?: string | Array<string>;
    generators?: Array<string | [string, Record<string, any>]>;
};
export declare type GeneratorStub = {
    options: Record<string, any>;
    path: string;
    resolvedPath: string;
};
export declare type BuiltOptions = {
    quiet: boolean;
    root: string;
    configPath: string | null;
    alwaysIgnored?: Array<string>;
    generators: Map<string, Array<GeneratorStub>>;
};
export declare function buildOptions(apiOptions?: Options): BuiltOptions;
