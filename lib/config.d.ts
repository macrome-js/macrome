export declare type Options = {
    quiet?: boolean;
    root?: string;
    configPath?: string;
    alwaysIgnored?: string | Array<string>;
    generators?: Array<string | [string, Record<string, any>]>;
};
export declare type BuiltOptions = {
    quiet: boolean;
    root: string;
    configPath: string | null;
    alwaysIgnored?: Array<string>;
    generators: Array<[string, Record<string, any>]>;
};
export declare function buildOptions(apiOptions?: Options): BuiltOptions;
