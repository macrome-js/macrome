'use strict';

// const { EOL } = require('os');

const { Generator } = require('./generator');
const operations = require('./operations');

const { REMOVE } = operations;

class MapAstGenerator extends Generator {
  constructor(macrome, options) {
    super(macrome, options);
    if (!this.options.parser) {
      throw new Error('Generator instantiated without options.parser');
    }
  }

  getDestPath(path) {
    throw new Error('Not implemented');
  }

  map(change) {
    const { path, operation } = change;

    const destPath = this.getDestPath(path);

    if (operation === REMOVE) {
      this.unlink(destPath);
    } else {
      let verb;
      let content;
      let isError = false;
      let errorPath = path;
      let result;
      try {
        verb = 'reading';
        const input = this.read(path);

        verb = 'parsing';
        const inputAst = this.parse(input);

        verb = 'generating';
        errorPath = destPath;
        const ast = this.mapAst(inputAst, { path, destPath });
        result = ast;

        this.decorate(ast, this.getAnnotations(destPath, path));

        verb = 'printing';
        content = this.print(ast).code;
      } catch (e) {
        this.logger.warn(`Failed ${verb} ${errorPath}`);

        isError = true;

        const errorAst = this.generateError(e);

        this.decorate(errorAst, {
          'generate-failed': true,
          ...this.getAnnotations(destPath, path),
        });

        content = this.print(errorAst).code + '\n';

        result = e;
      }

      try {
        this.write(destPath, content);
      } catch (e) {
        this.logger.error(`Failed writing ${isError ? 'error ' : ''}to ${destPath}`);
        throw e;
      }
      return result;
    }
  }

  mapAst(ast, { path, destPath }) {
    return ast;
  }
}

module.exports = { MapAstGenerator };
