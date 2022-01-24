import type { AsymmetricMMatchExpressionWithSuffixes, Change, WatchmanExpression } from './types';
import { Client as BaseWatchmanClient } from 'fb-watchman';
export declare type QueryOptions = {
    since?: string;
    fields?: Array<string>;
};
export declare type SubscriptionOptions = QueryOptions & {
    drop?: string | Array<string>;
    defer?: string | Array<string>;
    defer_vcs?: boolean;
};
export declare type SubscriptionEvent = {
    subscription: string;
    files: Array<any>;
};
declare type OnEvent = (changes: Array<Change>) => Promise<unknown>;
export declare class WatchmanSubscription {
    expression: AsymmetricMMatchExpressionWithSuffixes | null;
    name: string;
    onEvent: OnEvent;
    constructor(expression: AsymmetricMMatchExpressionWithSuffixes | null, subscription: any, onEvent: OnEvent);
    __onEvent(message: SubscriptionEvent): Promise<void>;
}
export declare class WatchmanClient extends BaseWatchmanClient {
    root: string;
    watchRoot: string;
    subscriptions: Map<string, WatchmanSubscription>;
    private _capabilities;
    constructor(root: string);
    get rootRelative(): string | null;
    get capabilities(): Record<string, boolean>;
    __expressionFrom(asymmetric: AsymmetricMMatchExpressionWithSuffixes | null | undefined): WatchmanExpression;
    command(command: string, ...args: Array<any>): Promise<any>;
    watchProject(path: string): Promise<any>;
    version(options?: {
        required?: Array<string>;
        optional?: Array<string>;
    }): Promise<{
        version: string;
        capabilities: Record<string, boolean>;
    }>;
    clock(): Promise<any>;
    query(path: string, expression?: AsymmetricMMatchExpressionWithSuffixes | null, options?: QueryOptions): Promise<any>;
    subscribe(path: string, subscriptionName: string, expression: AsymmetricMMatchExpressionWithSuffixes | null, options: SubscriptionOptions, onEvent: OnEvent): Promise<WatchmanSubscription>;
}
export declare function standaloneQuery(root: string, expression?: AsymmetricMMatchExpressionWithSuffixes | null): Promise<Array<Change>>;
export {};
