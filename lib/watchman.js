'use strict';

const invariant = require('invariant');
const { relative, join } = require('path');
const { Client: BaseWatchmanClient } = require('fb-watchman');
const { when, map } = require('iter-tools-es');

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

class WatchmanClient extends BaseWatchmanClient {
  constructor(root, { logger }) {
    super();
    this.projectRoot = root;

    this.root = null;
    this.logger = logger;

    this.subscriptions = new Map();

    // on is from node events EventEmitter
    this.on('subscription', async (message) => {
      const { root, subscription, files } = message;

      logger.log(message);

      invariant(root === this.root, 'Watch root changed unexpectedly');

      try {
        if (subscription && files && files.length) {
          const cb = this.subscriptions.get(subscription);
          await cb(files);
        }
      } catch (e) {
        // TODO use new EventEmitter({ captureRejections: true }) once stable
        console.error(e);
      }
    });
  }

  get rootRelative() {
    return this.root && relative(this.root, this.projectRoot);
  }

  async watchProject(path) {
    const { watch } = await this.command('watch-project', path);
    this.root = watch;
  }

  async version(...args) {
    return await this.command('version', ...args);
  }

  async clock() {
    return await this.command('clock', this.root);
  }

  async flushSubscriptions(options = { sync_timeout: 2000 }) {
    return await this.command('flush-subscriptions', this.root, options);
  }

  async subscribe(path, subscriptionName, { matchable, ...options }, cb) {
    invariant(this.root, 'call watchProject() before subscribe()');

    this.subscriptions.set(subscriptionName, cb);

    await this.command('subscribe', this.root, subscriptionName, {
      ...options,
      relative_root: relative(this.root, join(this.projectRoot, path)),
      ...when(matchable, () => ({
        expression: expressionFromMatchable(matchable),
      })),
    });
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

module.exports = { WatchmanClient };
