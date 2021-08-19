import type { Change } from './types';
import Queue from '@iter-tools/queue';
declare const _: unique symbol;
/**
 * This data structure ensures that changes happen in cause => effect order.
 * A cause is a change in a non-generated file, and effects are usually
 * individual generators calling `api.write()`.
 */
export declare class Changeset {
    [_]: {
        rootChange: Change;
        paths: Array<string>;
        queue: Queue<Change>;
    };
    constructor(rootChange: Change);
    add(change: Change): void;
    get root(): string;
    get paths(): Iterable<string>;
    get queue(): Iterable<Change>;
}
export {};
