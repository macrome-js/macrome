import type { Change } from './types';

import { relative, join } from 'path';
import invariant from 'invariant';
import { Client as BaseWatchmanClient } from 'fb-watchman';
import { when, map, asyncFlatMap, asyncToArray, execPipe } from 'iter-tools-es';

import { promises as fsPromises } from 'fs';
import { recursiveReadFiles } from './utils/fs';

import { Matchable } from './matchable';
import { logger as baseLogger } from './utils/logger';

const { stat } = fsPromises;

const logger = baseLogger.get('watchman');

const matchSettings = {
  includedotfiles: true,
  noescape: true,
};

function noneOf(files: Iterable<Array<any>>) {
  const files_ = [...files];
  return files_ && files_.length ? [['not', ['anyof', ...files_]]] : [];
}

type QueryOptions = {
  expression: any;
  since?: string;
  fields?: Array<string>;
  suffixx?: string | Array<string>; // this is wrong. use suffix expression term
};

type SubscriptionOptions = QueryOptions & {
  drop?: string | Array<string>;
  defer?: string | Array<string>;
  defer_vcs?: boolean;
};

export function expressionFromMatchable(matchable: Matchable): any {
  const { include, exclude } = matchable;
  const fileExpr = (glob: string) => ['match', glob, 'wholename', matchSettings];

  return ['allof', ['type', 'f'], ...noneOf(map(fileExpr, exclude)), ...map(fileExpr, include)];
}

type SubscriptionEvent = {
  subscription: string;
  files: Array<any>;
};

type OnEvent = (changes: Array<Change>) => Promise<unknown>;

class WatchmanSubscription {
  name: string;
  onEvent: OnEvent;

  constructor(subscription: any, onEvent: OnEvent) {
    this.name = subscription.subscribe;
    this.onEvent = onEvent;

    this.__onEvent = this.__onEvent.bind(this);
  }

  async __onEvent(message: SubscriptionEvent): Promise<void> {
    try {
      const { files, subscription } = message;

      const files_ = files.map(({ name: path, exists, new: new_, mtime_ms: mtimeMs }) => ({
        path,
        exists,
        new: new_,
        mtimeMs,
      }));

      if (subscription && files && files.length) await this.onEvent(files_);
    } catch (e) {
      // TODO use new EventEmitter({ captureRejections: true }) once stable
      logger.error(e.stack);
    }
  }
}

export class WatchmanClient extends BaseWatchmanClient {
  root: string;
  watchRoot: string;
  subscriptions: Map<string, WatchmanSubscription>;
  private _capabilities: Record<string, boolean> | null = null;

  constructor(root: string) {
    super();
    this.root = root;
    this.watchRoot = null!;
    this.subscriptions = new Map();

    this.on('subscription', (event) => {
      logger.debug(event);
      const subscription = this.subscriptions.get(event.subscription);
      if (subscription) subscription.__onEvent(event);
    });
  }

  get rootRelative(): string | null {
    return this.watchRoot && relative(this.watchRoot, this.root);
  }

  get capabilities(): Record<string, boolean> {
    const capabilities = this._capabilities;
    if (capabilities == null) {
      throw new Error('You must call watchmanClient.version() with the capabilities you may need');
    }
    return capabilities;
  }

  async command(command: string, ...args: Array<any>): Promise<any> {
    const fullCommand = [command, ...args];

    return await new Promise((resolve, reject) => {
      try {
        logger.debug('->', fullCommand);
        super.command(fullCommand, (err, resp) => {
          if (err) {
            reject(
              new Error(
                `watchman returned an error response. Response:\n${JSON.stringify(
                  (err as any).watchmanResponse,
                  null,
                  2,
                )}\nCommand: ${JSON.stringify(fullCommand, null, 2)}`,
              ),
            );
          } else {
            logger.debug('<-', resp);
            resolve(resp);
          }
        });
      } catch (e) {
        e.message += `\nCommand: ${JSON.stringify(fullCommand, null, 2)}`;
        throw e;
      }
    });
  }

  async watchProject(path: string): Promise<any> {
    const resp = await this.command('watch-project', path);
    this.watchRoot = resp.watch;
    return resp;
  }

  async version(
    options: { required?: Array<string>; optional?: Array<string> } = {},
  ): Promise<{ version: string; capabilities: Record<string, boolean> }> {
    const resp = await this.command('version', options);
    this._capabilities = resp.capabilities;
    return resp;
  }

  async clock(): Promise<any> {
    return await this.command('clock', this.watchRoot);
  }

  async query(path: string, options: QueryOptions): Promise<any> {
    const { expression, ...options_ } = options;

    invariant(this.watchRoot, 'You must call watchman.watchProject() before watchman.query()');

    const response = await this.command('query', this.watchRoot, {
      ...options_,
      relative_root: relative(this.watchRoot, join(this.root, path)),
      ...when(expression, { expression }),
    });
    return response;
  }

  async subscribe(
    path: string,
    subscriptionName: string,
    options: SubscriptionOptions,
    onEvent: OnEvent,
  ): Promise<WatchmanSubscription> {
    const { expression, ...options_ } = options;

    invariant(this.watchRoot, 'You must call watchman.watchProject() before watchman.subscribe()');

    const response = await this.command('subscribe', this.watchRoot, subscriptionName, {
      ...options_,
      relative_root: relative(this.watchRoot, join(this.root, path)),
      ...when(expression, { expression }),
    });

    const subscription = new WatchmanSubscription(response, onEvent);

    this.subscriptions.set(subscriptionName, subscription);

    return subscription;
  }

  async flushSubscriptions(options = { sync_timeout: 2000 }): Promise<any> {
    return await this.command('flush-subscriptions', this.watchRoot, { ...options });
  }
}

// Mimic behavior of watchman's initial build so that `macdrome build` does not rely on the watchman service
export async function dumbTraverse(
  root: string,
  exclude?: string | Array<string> | null,
  suffixes?: Iterable<string>,
): Promise<Array<Change>> {
  return await execPipe(
    recursiveReadFiles(root, exclude, suffixes),
    // TODO asyncFlatMapParallel once it's back
    asyncFlatMap(async (path) => {
      try {
        const stats = await stat(path);
        return [
          {
            path,
            mtimeMs: stats.mtimeMs,
            new: false,
            exists: true,
          },
        ];
      } catch (e) {
        return [];
      }
    }),
    asyncToArray,
  );
}
