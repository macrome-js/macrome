import { relative, join } from 'path';
import invariant from 'invariant';
import { Client as BaseWatchmanClient } from 'fb-watchman';
import { when, map } from 'iter-tools-es';

import { Matchable } from './types';
import { logger as baseLogger } from './utils/logger';

const logger = baseLogger.get('watchman');

const matchSettings = {
  includedotfiles: true,
  noescape: true,
};

function noneOf(files: Iterable<Array<any>>) {
  const files_ = [...files];
  return files_ && files_.length ? [['not', ['anyof', ...files_]]] : [];
}

type SubscriptionOptions = {
  expression: any;
  since?: string;
  fields?: Array<string>;
  drop?: Array<string>;
  defer?: Array<string>;
  defer_vcs?: boolean;
  relative_root?: string;
};

type File = {
  exists: boolean;
  new: boolean;
  name: string;
};

export function expressionFromMatchable(matchable: Matchable): any {
  const { files, excludeFiles } = matchable;
  const fileExpr = (glob: string) => ['match', glob, 'wholename', matchSettings];

  return ['allof', ['type', 'f'], ...noneOf(map(fileExpr, excludeFiles)), ...map(fileExpr, files)];
}

type SubscriptionEvent = {
  subscription: string;
  files: Array<File>;
};

type OnEvent = (files: Array<File>) => Promise<unknown>;

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
      if (subscription && files && files.length) await this.onEvent(files);
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

  async watchProject(path: string): Promise<any> {
    const resp = await this.command('watch-project', path);
    this.watchRoot = resp.watch;
    return resp;
  }

  async version(options: { required?: Array<string> } = {}): Promise<any> {
    return await this.command('version', options);
  }

  async clock(): Promise<any> {
    return await this.command('clock', this.watchRoot);
  }

  async flushSubscriptions(options = { sync_timeout: 2000 }): Promise<any> {
    return await this.command('flush-subscriptions', this.watchRoot, options);
  }

  async subscribe(
    path: string,
    subscriptionName: string,
    options: SubscriptionOptions,
    onEvent: OnEvent,
  ): Promise<WatchmanSubscription> {
    const { expression, ...options_ } = options;

    invariant(this.watchRoot, 'You must call macrome.watchProject() before macrome.subscribe()');

    const response = await this.command('subscribe', this.watchRoot, subscriptionName, {
      ...options_,
      relative_root: relative(this.watchRoot, join(this.root, path)),
      ...when(expression, { expression }),
    });

    const subscription = new WatchmanSubscription(response, onEvent);

    this.subscriptions.set(subscriptionName, subscription);

    return subscription;
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
}
