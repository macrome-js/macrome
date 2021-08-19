import { Client as BaseWatchmanClient } from 'fb-watchman';
import { Matchable } from './types';
declare type SubscriptionOptions = {
    expression: any;
    since?: string;
    fields?: Array<string>;
    drop?: Array<string>;
    defer?: Array<string>;
    defer_vcs?: boolean;
    relative_root?: string;
};
declare type File = {
    exists: boolean;
    new: boolean;
    name: string;
};
export declare function expressionFromMatchable(matchable: Matchable): any;
declare type SubscriptionEvent = {
    subscription: string;
    files: Array<File>;
};
declare type OnEvent = (files: Array<File>) => Promise<unknown>;
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
    constructor(root: string);
    get rootRelative(): string | null;
    watchProject(path: string): Promise<any>;
    version(options?: {
        required?: Array<string>;
    }): Promise<any>;
    clock(): Promise<any>;
    flushSubscriptions(options?: {
        sync_timeout: number;
    }): Promise<any>;
    subscribe(path: string, subscriptionName: string, options: SubscriptionOptions, onEvent: OnEvent): Promise<WatchmanSubscription>;
    command(command: string, ...args: Array<any>): Promise<any>;
}
export {};
