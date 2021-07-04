'use strict';

const { join, relative, resolve } = require('path');
const { Client: WatchmanClient } = require('fb-watchman');

function joinGlob(path, glob) {
  // ./foo => ./path/foo
  // /foo => ./path/foo
  // foo => **/foo/**

  const [prefix] = /^\.?\/?/.exec(glob);

  const start = prefix ? [prefix, path] : ['**'];

  return join(...start, glob.slice(prefix.length), '**');
}

const matchSettings = {
  includedotfiles: true,
  noescape: true,
};

class WatchmanSubscription {
  constructor(subscription, onEvent, { logger }) {
    console.log(subscription);
    this.name = subscription.subscribe;
    this.onEvent = onEvent;
    this.path = path;
    this.logger = logger;

    this.relativePath = null;

    this.__onEvent = this.__onEvent.bind(this);
  }

  async __onEvent(message) {
    try {
      const { files, subscription, root } = message;
      if (subscription && files && files.length) {
        if (this.onSubscription) {
          this.onEvent(
            files.map((file) =>
              Object.assign(file, { name: join(this.vcsRootRelative, file.name) }),
            ),
          );
        }
      }
    } catch (e) {
      // TODO use new EventEmitter({ captureRejections: true }) once stable
      this.logger.error(e);
    }
  }
}

class MacromeWatchmanClient extends WatchmanClient {
  constructor(projectRoot, vcsRoot, vcsConfig, { logger }) {
    super();
    this.projectRoot = projectRoot;

    this.root = null;
    this.vcsRoot = vcsRoot;
    this.vcsRootRelative = null;
    this.projectRootRelative = null;
    this.vcsConfig = vcsConfig;
    this.logger = logger;

    this.subscriptionCallbacks = new Map();

    this.on('subscription', logger.debug);
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

  async watchMacromeProject() {
    this.logger.log(resolve(this.vcsRoot));
    await this.command('watch-project', this.vcsRoot).then((resp) => {
      this.logger.log(resp);
      this.root = resp.watch;
      this.vcsRootRelative = relative(this.root, this.vcsRoot);
      this.projectRootRelative = relative(this.root, this.projectRoot);
      return resp;
    });
  }

  async watchVCSLock() {
    if (this.vcsType) return;

    await this.subscribe(
      this.vcsRootRelative,
      'macrome-vcs-lock',
      {
        expression: ['name', join(this.vcsConfig.dir, this.vcsConfig.lock), 'wholename'],
        fields: ['name', 'exists'],
        defer_vcs: false,
      },
      async (files) => {
        const [lock] = files;

        return await this.command(
          lock.exists ? 'state-enter' : 'state-leave',
          this.vcsRoot,
          'vcs_lock_held',
        );
      },
    );
  }

  async subscribe(path, name, { ignored = [], expression, ...options }, onEvent) {
    const { logger } = this;

    const _expression = [
      'allof',
      ['type', 'f'],
      ...(ignored.length
        ? [
            [
              'not',
              [
                'anyof',
                ...ignored.map((ignored) => [
                  'match',
                  joinGlob(join(this.watchRootRelative, path), ignored),
                  'wholename',
                  matchSettings,
                ]),
              ],
            ],
          ]
        : []),
      ...(expression ? [expression] : []),
    ];

    const response = await this.command('subscribe', path, name, {
      ...options,
      expression: _expression,
    });

    const subscription = new WatchmanSubscription(response, onEvent, { logger });

    // I think subscription is a poor name for an event
    this.on('subscription', subscription.__onEvent);

    return subscription;
  }

  async command(command, ...args) {
    const fullCommand = [command, ...args];
    return await new Promise((resolve, reject) => {
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
    });
  }
}

module.exports = { MacromeWatchmanClient };
