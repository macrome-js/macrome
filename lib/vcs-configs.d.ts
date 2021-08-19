export declare type VCSConfig = {
    name: string;
    dir: string;
    lock: string;
    isDirty: (dir?: string) => boolean;
};
export declare const vcsConfigs: Array<VCSConfig>;
