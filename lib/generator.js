'use strict';

const fs = require('fs');
const { relative, dirname } = require('path');
const { EOL } = require('os');

const { handleError, debounce } = require('./utils');
const operations = require('./operations');
const errorTemplate = require('./generation-error-template');

const { REMOVE } = operations;

class Generator {
  get operations() {
    return operations;
  }

  constructor(macrome, options) {
    this.ignored = [];
    this.debouncedMethods = [];
    this.glob = '**';
    this._macrome = macrome;
    this.options = options;
  }

  get macrome() {
    return this._macrome;
  }

  get generatedPaths() {
    return this.macrome.generatedPaths;
  }

  debounce(method) {
    const debounced = debounce(method.bind(this), 50);

    this.debouncedMethods.push(debounced);
    return debounced;
  }

  process(change) {
    const { path, operation } = change;
    if (this.recordChange) this.recordChange(change);
    if (!this.getDestPath) return;

    const destPath = this.getDestPath(path);

    if (operation === REMOVE) {
      this.unlink(destPath);
    } else {
      let content;
      try {
        content = this.generatePath(path, destPath);
      } catch (e) {
        console.warn(`Failed generating ${destPath}`);
        content = this.decorate(errorTemplate(e), {
          'generate-failed': null,
          ...this.getAnnotations(path, destPath),
        });
      }

      try {
        if (content !== null) {
          this.write(destPath, this.decorate(content, this.getAnnotations(path, destPath)));
        }
      } catch (e) {
        console.warn(`Failed generating ${destPath}`);
        handleError(e);
      }
    }
  }

  /**
   * Given a file prepends annotation comments to the initial doc comment block, creating an
   * initial comment if necessary. Assumes a javascript-like comment and annotation sytnax.
   * To support other syntaxes, override.
   */
  decorate(content, annotations) {
    // /**
    //  *
    const commentMatch = /^\/\*\*\s*?\r?\n(?=\s*\*|$^)/.exec(content);

    const [eol] = /\r?\n/.exec(content) || [EOL];
    let remainingContent = content;
    let commentStart = `/**${eol}`;
    let commentEnd = ` */${eol}`;

    if (commentMatch) {
      [commentStart] = commentMatch;
      commentEnd = '';
      remainingContent = content.slice(commentStart.length);
    }

    const annotationLines = Object.entries(annotations).map(([key, value]) => {
      const _value = value == null ? '' : ` ${value}`;
      return ` * @${key}${_value}${eol}`;
    });

    return `${commentStart}${annotationLines}${commentEnd}${remainingContent}`;
  }

  getAnnotations(sourcePath, destPath) {
    const relPath = relative(dirname(destPath), sourcePath);
    return {
      'generated-from': relPath.startsWith('.') ? relPath : `./${relPath}`,
    };
  }

  resolve(path) {
    return this.macrome.resolve(path);
  }

  write(path, content) {
    this.macrome.write(path, content);
  }

  unlink(path) {
    this.macrome.unlink(path);
  }

  writeMonolithic(path, content) {
    if (this.generatedPaths.isStale(path, content)) {
      fs.writeFileSync(this.resolve(path), content);
      this.generatedPaths.cache(path, { monolithic: true });
    }
  }
}

module.exports = { Generator };
