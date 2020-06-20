'use strict';

const { join, dirname, basename, relative } = require('path');
const fs = require('fs');
const requireFresh = require('import-fresh');
const findUp = require('find-up');

const { traverse } = require('./traverse');
const { MacromeWatchmanClient } = require('./watchman');
const { Changeset } = require('./changeset');
const { concat, filter, map, groupBy } = require('./utils/functional');

const { ADD, REMOVE, UPDATE } = require('./operations');
const { isGeneratedFromTemplate } = require('./comments');
const { vcsConfigs } = require('./vcs-configs');

class Macrome {
  constructor(options = {}) {
    let configOptions = {};
    let { configPath } = options;

    if (configPath === false) {
      if (!options.projectRoot) {
        throw new Error('When configPath: false, a projectRoot path must be specified');
      }
      this.projectRoot = options.projectRoot;
    } else {
      configPath = configPath || findUp.sync('macrome.config.js', { cwd: process.cwd() });

      if (!configPath) {
        throw new Error('Could not find macrome.config.js in cwd or any parent directory');
      }

      configOptions = requireFresh(configPath);

      if (configOptions.configPath) {
        this.logger.warn('configPath is not a valid option in a config file.');
        delete configOptions.configPath;
      }

      this.projectRoot = dirname(configPath);
    }

    this.configPath = configPath;

    const vcsDir = findUp.sync(
      vcsConfigs.map((c) => c.dir),
      {
        type: 'directory',
        cwd: this.projectRoot,
      },
    );

    if (!vcsDir) {
      throw new Error('Macrome expects to be used inside a version controlled project.');
    }

    const vcsDirName = basename(vcsDir);
    this.vcsConfig = vcsConfigs.find(({ dir }) => dir === vcsDirName);
    this.vcsRoot = dirname(vcsDir);

    this.options = {
      rootDir: null,
      quiet: false,
      logger: {
        /* eslint-disable no-console */
        log: (...args) => {
          if (!this.options.quiet) console.log(...args);
        },
        warn: console.warn,
        error: console.error,
        /* eslint-enable no-console */
      },
      ...configOptions,
      ...options,
    };

    this.generatedPaths = new Set();
    this.changeset = null;

    this.generators = new Map();

    this.generatorStubs = groupBy(
      (stub) => stub.resolvedPath,
      this.options.generators.map((generator) => {
        let path;
        let options;
        if (Array.isArray(generator)) {
          [path, options] = generator;
        } else {
          path = generator;
          options = {};
        }

        const resolvedPath = require.resolve(path, { paths: [this.projectRoot] });
        const vcsPath = path.startsWith('.') ? relative(this.vcsRoot, resolvedPath) : path;

        return { options, path, resolvedPath, vcsPath };
      }),
    );

    this.subscribers = [];

    for (const generatorPath of this.generatorStubs.keys()) {
      this.instantiateGenerators(generatorPath);
    }
  }

  get generatorInstances() {
    return concat(...this.generators.values());
  }

  get logger() {
    return this.options.logger;
  }

  instantiateGenerators(generatorPath) {
    const Generator = requireFresh(generatorPath);

    this.generators.set(generatorPath, []);

    for (const stub of this.generatorStubs.get(generatorPath)) {
      const { parser, parseOptions, printOptions } = this.options;
      const generator = new Generator(this, {
        vcsPath: stub.vcsPath,
        parser,
        parseOptions,
        printOptions,
        ...stub.options,
      });

      this.generators.get(generatorPath).push({ generator, pathMap: new Map() });
    }
  }

  watcherProcess(changes) {
    const { generatedPaths } = this;
    // Filter out changes generators make -- changesets handle chaining those
    this.processChangeset(changes.filter((change) => !generatedPaths.has(change.path)));
  }

  initialProcess(changes) {
    this.processChangeset(changes);
  }

  processChangeset(changes) {
    this.changeset = new Changeset(changes);

    for (const change of this.changeset) {
      for (const { generator, pathMap } of this.generatorInstances) {
        if (generator.matches(change.path)) {
          if (change.operation === REMOVE) {
            pathMap.delete(change.path);
          } else {
            pathMap.set(change.path, {
              ...change,
              mapResult: generator.map ? generator.map(change) : change,
            });
          }
        }
      }
    }

    for (const { generator, pathMap } of this.generatorInstances) {
      if (generator.reduce && pathMap.size) {
        generator.reduce(pathMap);
      }
    }

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

  async build() {
    const { alwaysIgnored: ignored } = this.options;

    const initialPaths = await traverse(this.projectRoot, { ignored });

    this.initialProcess(map((path) => ({ path, operation: ADD }), initialPaths));
  }

  async watch() {
    const { alwaysIgnored: ignored } = this.options;

    const watchClient = (this.watchClient = new MacromeWatchmanClient(
      this.projectRoot,
      this.vcsRoot,
      this.vcsConfig,
    ));

    await watchClient.version({
      required: [
        'cmd-watch-project',
        'cmd-subscribe',
        'cmd-state-enter',
        'cmd-state-leave',
        'cmd-clock',
        'cmd-flush-subscriptions',
        'term-allof',
        'term-anyof',
        'term-not',
        'term-match',
        'wildmatch',
        'field-name',
        'field-exists',
        'field-new',
        'field-type',
        'field-mtime_ms',
      ],
    });
    await watchClient.watchMacromeProject();

    await this.build();

    await watchClient.flushSubscriptions();
    const { clock: startClock } = await watchClient.clock();

    this.logger.log('Initial generation completed; watching for changes...');

    await watchClient.watchVCSLock();

    await watchClient.subscribe(
      '',
      'macrome-generators',
      {
        defer: ['vcs_lock_held'],
        defer_vcs: false, // for consistency always do our version
        expression: [
          'name',
          [
            ...filter(
              (resolvedPath) => !resolvedPath.startsWith('..'),
              map(
                (resolvedPath) => relative(this.vcsRoot, resolvedPath),
                this.generatorStubs.keys(),
              ),
            ),
          ],
          'wholename',
        ],
      },
      (files) => {
        for (const file of files) {
          this.instantiateGenerators(join(this.vcsRoot, file.name));
        }
      },
    );

    await watchClient.subscribe(
      '', // **
      'macrome-main',
      {
        ignored,
        drop: ['vcs_lock_held'],
        defer_vcs: false, // Don't try to defer AND drop based on the vcs lock
        fields: ['name', 'mtime_ms', 'exists', 'type', 'new'],
        since: startClock,
      },
      (files) => {
        this.watcherProcess(
          files.map((file) => ({
            operation: !file.exists ? REMOVE : file.new ? ADD : UPDATE,
            path: file.name,
          })),
        );
      },
    );
  }

  async stopWatching() {
    this.watchClient.end();
  }

  async clean() {
    const { alwaysIgnored: ignored } = this.options;

    const paths = await traverse(this.projectRoot, { ignored });

    for (const path of paths) {
      if (isGeneratedFromTemplate(path)) {
        fs.unlinkSync(path);
      }
    }
  }

  async check() {
    if (this.vcsConfig.isDirty()) {
      this.logger.warn('Check was run with vcs changes in the working dir and cannot succeed');
      return false;
    }

    await this.clean();
    await this.build();

    return !this.vcsConfig.isDirty();
  }

  resolve(path) {
    return join(this.projectRoot, path);
  }
}

module.exports = { Macrome };
