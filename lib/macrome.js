'use strict';

const loglevel = require('loglevel');
const { join } = require('path');
const fs = require('fs');

const { traverse, watch } = require('./traverse');
const { FileCache } = require('./file-cache');
const { MatcherCache } = require('./matcher');
const { Changeset } = require('./changeset');
const { concat, map, handleError } = require('./utils');
const sourceControlPlugins = require('./source-control');

const { ADD, REMOVE, UPDATE } = require('./operations');
const { isGeneratedFromTemplate } = require('./comments');

const log = loglevel.getLogger('generator');

const defaultOptions = { ignored: [], rootDir: null, sourceControl: 'none', quiet: false };

class Macrome {
  constructor(generators, options) {
    this.generators = generators;
    this.options = Object.assign({}, defaultOptions, options);

    const SourceControlPlugin = sourceControlPlugins[this.options.sourceControl];

    const { rootDir, quiet } = this.options;

    if (!rootDir) {
      throw new Error('rootDir is a required option to Macrome');
    }

    if (!SourceControlPlugin) {
      throw new Error(`${this.options.sourceControl} is not a supported source control system`);
    }

    this.debouncedMethods = [];
    this.sourceControl = new SourceControlPlugin(rootDir);
    this.generatedPaths = new FileCache(rootDir);
    this.matcherCache = new MatcherCache(rootDir);
    this.changeset = null;

    log.setLevel(quiet ? 'error' : 'info');

    // To allow parameterization generators must be constructed externally.
    for (const generator of generators) {
      generator.macrome = this;
    }
  }

  pathsChanged() {
    for (const gen of this.generators) {
      gen.pathsChanged && gen.pathsChanged();
    }
  }

  watcherProcess(change) {
    if (!this.generatedPaths.has(change.path)) {
      try {
        this.sourceControl.acquireLock();
      } catch (e) {
        return;
      }

      this.processChangeset([change]);

      this.sourceControl && this.sourceControl.releaseLock();
    }
  }

  initialProcess(changes) {
    this.sourceControl && this.sourceControl.acquireLock();

    this.processChangeset(changes);

    this.sourceControl && this.sourceControl.releaseLock();
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
    const { rootDir } = this.options;

    return traverse(rootDir, { ignored: this.options.ignored })
      .then(initialPaths => {
        this.process(map(path => ({ path, operation: ADD }), initialPaths));

        for (const debounced of concat(...map(gen => gen.debouncedMethods, this.generators))) {
          debounced.flush();
        }

        if (this.options.watch) {
          log.info('Initial generation completed; watching for changes...');

          const watcher = watch(rootDir, this.getSaneOptions());

          watcher.on('add', path => this.watcherProcess({ path, operation: ADD }));
          watcher.on('delete', path => this.watcherProcess({ path, operation: REMOVE }));
          watcher.on('change', path => this.watcherProcess({ path, operation: UPDATE }));
        }
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
