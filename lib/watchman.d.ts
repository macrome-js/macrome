import type { AsymmetricWatchmanExpression, Change, WatchmanExpression } from './types';
import { Client as BaseWatchmanClient } from 'fb-watchman';
export declare const matchExpr: (expr: Array<unknown>) => Array<unknown>;
declare type QueryOptions = {
    since?: string;
    fields?: Array<string>;
};
declare type SubscriptionOptions = QueryOptions & {
    drop?: string | Array<string>;
    defer?: string | Array<string>;
    defer_vcs?: boolean;
};
export declare function symmetricExpressionFromAsymmetric(asymmetric: AsymmetricWatchmanExpression): WatchmanExpression;
declare type SubscriptionEvent = {
    subscription: string;
    files: Array<any>;
};
declare type OnEvent = (changes: Array<Change>) => Promise<unknown>;
declare class WatchmanSubscription {
    name: string;
    onEvent: OnEvent;
    constructor(subscription: any, onEvent: OnEvent);
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
    query(path: string, expression?: AsymmetricWatchmanExpression | null, options?: QueryOptions): Promise<any>;
    subscribe(path: string, subscriptionName: string, expression: AsymmetricWatchmanExpression, options: SubscriptionOptions, onEvent: OnEvent): Promise<WatchmanSubscription>;
}
export declare function standaloneQuery(root: string, expression?: AsymmetricWatchmanExpression | null): Promise<Array<Change>>;
export {};
