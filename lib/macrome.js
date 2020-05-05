'use strict';

const loglevel = require('loglevel');
const { join, basename } = require('path');
const fs = require('fs');
const requireFresh = require('import-fresh');
const { Client: WatchmanClient } = require('fb-watchman');
const { promisify } = require('util');
const findUp = require('find-up');

const { traverse } = require('./traverse');
const { FileCache } = require('./file-cache');
const { MatcherCache } = require('./matcher');
const { Changeset } = require('./changeset');
const { concat, map, handleError } = require('./utils');

const { ADD, REMOVE, UPDATE } = require('./operations');
const { isGeneratedFromTemplate } = require('./comments');

const log = loglevel.getLogger('generator');

const defaultOptions = {
  alwaysIgnored: ['.git/**', '.hg/**'],
  rootDir: null,
  sourceControl: 'none',
  quiet: false,
};

const vcsLockPaths = {
  git: '.git/index.lock',
  hg: '.hg/wlock',
};

class Macrome {
  constructor(generators, options) {
    this.options = {
      ...defaultOptions,
      ...options,
      alwaysIgnored: [...defaultOptions.alwaysIgnored, ...options.alwaysIgnored],
    };

    const { rootDir, quiet } = this.options;

    if (!rootDir) {
      throw new Error('rootDir is a required option to Macrome');
    }

    const vcsDir = findUp.sync(['.hg', '.git'], {
      cwd: rootDir,
      allowSymlinks: false,
      type: 'directory',
    });

    this.vcsType = vcsDir ? basename(vcsDir).slice(1) : null;

    this.debouncedMethods = [];
    this.generatedPaths = new FileCache(rootDir);
    this.matcherCache = new MatcherCache(rootDir);
    this.changeset = null;

    log.setLevel(quiet ? 'error' : 'info');

    this.generators = [];

    this.generatorStubs = generators.map((generator, i) => {
      let path;
      let options;
      if (Array.isArray(generator)) {
        [path, options] = generator;
      } else {
        path = generator;
        options = {};
      }

      return { i, options, path };
    });

    for (const stub of this.generatorStubs) {
      this.instantiateGeneratorFromStub(stub);
      // this.watch(stub.path, () => {
      //   this.instantiateGeneratorFromStub(stub);
      // });
    }
  }

  get vcsLockPath() {
    const { vcsType } = this;
    return vcsType && vcsLockPaths[vcsType];
  }

  instantiateGeneratorFromStub(stub) {
    const { i, options, path } = stub;

    const Generator = requireFresh(this.resolve(path));

    this.generators[i] = new Generator(this, options);
  }

  pathsChanged() {
    for (const gen of this.generators) {
      gen.pathsChanged && gen.pathsChanged();
    }
  }

  watcherProcess(changes) {
    const { generatedPaths } = this;
    this.processChangeset(changes.filter(change => !generatedPaths.has(change.path)));
  }

  initialProcess(changes) {
    this.processChangeset(changes);
  }

  processChangeset(changes) {
    let pathsChanged = false;

    this.changeset = new Changeset(changes);

    const { matcherCache } = this;
    for (const change of this.changeset) {
      for (const generator of this.generators) {
        if (matcherCache.get(generator)(change.path)) {
          generator.process(change);
        }
      }

      pathsChanged = pathsChanged || change.operation !== UPDATE;
    }

    if (pathsChanged) this.pathsChanged();

    this.changeset = null;
  }

  write(path, content) {
    const operation = this.generatedPaths.has(path) ? UPDATE : ADD;

    if (operation === ADD) this.generatedPaths.add(path);

    fs.writeFileSync(this.resolve(path), content);

    if (!this.changeset) {
      throw new Error('Generators must write synchronously');
    }

    this.changeset.add([{ path, operation }]);
  }

  unlink(path) {
    this.generatedPaths.delete(path);

    try {
      if (isGeneratedFromTemplate(path)) {
        fs.unlinkSync(path);
      }
    } catch (e) {}

    if (!this.changeset) {
      throw new Error('Generators must delete synchronously');
    }

    this.changeset.add([{ path, operation: REMOVE }]);
  }

  generate() {
    const { rootDir, watch: shouldWatch, alwaysIgnored: ignored } = this.options;

    let watchClient;

    const initialPromise = Promise.resolve({})
      .then(ctx => {
        if (!shouldWatch) return ctx;

        watchClient = this.watchClient = new WatchmanClient(rootDir);

        watchClient.command = promisify(watchClient.command);

        return watchClient
          .command(['version', { required: ['wildmatch', 'cmd-state-enter', 'cmd-state-leave'] }])
          .then(() => {
            return watchClient
              .command(['watch-project', rootDir])
              .then(({ watch, relativePath }) => ({ ...ctx, watch, relativePath }));
          });
      })
      .then(ctx => {
        // We always run our own initial traversal. Watchman could do it for us, but we don't
        // want to require watchman to be installed on CI, and we don't want two code paths.
        return traverse(rootDir, { ignored }).then(initialPaths => ({
          ...ctx,
          initialPaths,
        }));
      })
      .then(ctx => {
        this.initialProcess(map(path => ({ path, operation: ADD }), ctx.initialPaths));

        for (const debounced of concat(...map(gen => gen.debouncedMethods, this.generators))) {
          debounced.flush();
        }
        return ctx;
      })
      .catch(handleError);

    if (!shouldWatch) {
      // We're all done
      return;
    }

    initialPromise
      .then(ctx => {
        if (!shouldWatch) return ctx;

        return watchClient.command(['clock', ctx.watch]).then(({ clock }) => ({ ...ctx, clock }));
      })
      .then(ctx => {
        log.info('Initial generation completed; watching for changes...');

        watchClient.on('subscription', ({ root, subscription, files = [] }) => {
          if (!files.length) {
            return;
          } else if (subscription === 'macrome-vcs-lock') {
            const [lock] = files;

            watchClient
              .command([lock.exists ? 'state-enter' : 'state-leave', root, 'vcs_lock_held'])
              .catch(handleError);
          } else {
            console.log(files);
            // this.watcherProcess({ path, operation: ADD });
            // this.watcherProcess({ path, operation: REMOVE });
            // this.watcherProcess({ path, operation: UPDATE });
          }
        });

        return this.vcsType
          ? watchClient
              .command([
                'subscribe',
                ctx.watch,
                'macrome-vcs-lock',
                {
                  expression: ['match', this.vcsLockPath, 'wholename', { includedotfiles: true }],
                  fields: ['name', 'exists'],
                  defer_vcs: false,
                },
              ])
              .then(() => ctx)
          : ctx;
      })
      .then(ctx => {
        return watchClient.command([
          'subscribe',
          ctx.watch,
          'macrome-main',
          {
            expression: [
              'allof',
              ['type', 'f'],
              ...(ignored.length
                ? [['not', ['anyof', ...ignored.map(ignored => ['match', ignored, 'wholename'])]]]
                : []),
            ],
            drop: ['vcs_lock_held'],
            defer_vcs: false, // Don't try to defer AND drop based on the vcs lock
            fields: ['name', 'mtime_ms', 'exists', 'type'],
            since: ctx.clock,
          },
        ]);
      })
      .catch(handleError);
  }

  clean() {
    const { rootDir, ignored } = this.options;

    traverse(rootDir, { ignored })
      .then(paths => {
        for (const path of paths) {
          if (isGeneratedFromTemplate(path)) {
            fs.unlinkSync(path);
          }
        }
      })
      .catch(handleError);
  }

  getSaneOptions() {
    const { poll, watchman, watchmanPath } = this.options;
    return { poll, watchman, watchmanPath };
  }

  resolve(path) {
    return join(this.options.rootDir, path);
  }
}

module.exports = { Macrome };
