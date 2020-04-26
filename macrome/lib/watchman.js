'use strict';

const { join, relative } = require('path');
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

class MacromeWatchmanClient extends WatchmanClient {
  constructor(projectRoot, vcsRoot, vcsConfig) {
    super();
    this.projectRoot = projectRoot;

    this.root = null;
    this.vcsRoot = vcsRoot;
    this.vcsRootRelative = null;
    this.projectRootRelative = null;
    this.vcsConfig = vcsConfig;

    this.subscriptionCallbacks = new Map();

    this.on('subscription', async (message) => {
      if (message.subscription && message.files && message.files.length) {
        await this.subscriptionCallbacks.get(message.subscription)(
          message.files.map((file) =>
            Object.assign(file, { name: join(this.vcsRootRelative, file.name) }),
          ),
        );
      }
    });
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
    await this.command('watch-project', this.vcsRoot).then((resp) => {
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

  async subscribe(path, subscriptionName, { ignored = [], expression, ...options }, cb) {
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

    this.subscriptionCallbacks.set(subscriptionName, cb);

    await this.command('subscribe', join(this.root, path), subscriptionName, {
      ...options,
      expression: _expression,
    });
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
