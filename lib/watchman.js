'use strict';

const invariant = require('invariant');
const { relative, join } = require('path');
const { Client: BaseWatchmanClient } = require('fb-watchman');
const { when, map } = require('iter-tools-es');

const { logger } = require('./utils/logger');

const matchSettings = {
  includedotfiles: true,
  noescape: true,
};

function noneOf(files) {
  return files && files.length ? [['not', ['anyof', files]]] : [];
}

function expressionFromMatchable({ files, excludeFiles }) {
  const fileExpr = (file) => ['match', file, 'wholename', matchSettings];

  return ['allof', ['type', 'f'], ...noneOf(map(fileExpr, excludeFiles)), ...map(fileExpr, files)];
}

class WatchmanSubscription {
  constructor(subscription, onEvent) {
    this.name = subscription.subscribe;
    this.onEvent = onEvent;

    this.__onEvent = this.__onEvent.bind(this);
  }

  async __onEvent(message) {
    try {
      const { files, subscription } = message;
      if (subscription && files && files.length) this.onEvent(files);
    } catch (e) {
      // TODO use new EventEmitter({ captureRejections: true }) once stable
      logger.error(e.stack);
    }
  }
}

class WatchmanClient extends BaseWatchmanClient {
  constructor(root) {
    super();
    this.root = root;
    this.subscriptions = new Map();

    this.watchRoot = null;

    this.on('subscription', (event) => {
      logger.debug(event);
      const subscription = this.subscriptions.get(event.subscription);
      if (subscription) subscription.__onEvent(event);
    });
    this.on('error', (e) => {
      logger.error(e.stack);
    });
  }

  get rootRelative() {
    return this.watchRoot && relative(this.watchRoot, this.root);
  }

  async watchProject(path) {
    const { watch } = await this.command('watch-project', path);
    this.watchRoot = watch;
  }

  async version(...args) {
    return await this.command('version', ...args);
  }

  async clock() {
    return await this.command('clock', this.watchRoot);
  }

  async flushSubscriptions(options = { sync_timeout: 2000 }) {
    return await this.command('flush-subscriptions', this.watchRoot, options);
  }

  async subscribe(path, subscriptionName, { matchable, ...options }, onEvent) {
    invariant(this.watchRoot, 'call watchProject() before subscribe()');

    const response = await this.command('subscribe', this.watchRoot, subscriptionName, {
      ...options,
      relative_root: relative(this.watchRoot, join(this.root, path)),
      ...when(matchable, () => ({
        expression: expressionFromMatchable(matchable),
      })),
    });

    const subscription = new WatchmanSubscription(response, onEvent);

    this.subscriptions.set(subscriptionName, subscription);

    return subscription;
  }

  async command(command, ...args) {
    const fullCommand = [command, ...args];

    return await new Promise((resolve, reject) => {
      try {
        super.command(fullCommand, (err, resp) => {
          if (err) {
            reject(
              new Error(
                `watchman returned an error response. Response:\n${JSON.stringify(
                  err.watchmanResponse,
                  null,
                  2,
                )}\nCommand: ${JSON.stringify(fullCommand, null, 2)}`,
              ),
            );
          } else {
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

module.exports = { WatchmanClient, expressionFromMatchable };
