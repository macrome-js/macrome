const { readFile, writeFile } = require('fs').promises;
const { createReadStream } = require('fs');
const { first, firstOr } = require('iter-tools-es');
const { parse, exec } = require('@iter-tools/regex/dist/async/chunked');
const { CCommentParser } = require('./parser');

// Below is an example of a leading comment this code would parse:
/* @macrome
 * @generatedfrom ./$concat.js
 * @generatedby generate/generators/$methods/index.js
 * One or more lines of free text
 */

const prefixExp = /^#![^\r\n]]*\r?\n/s;
const firstCommentExp = /\s*\/\*\s*@macrome\b.*?\*\//s;
const headerExp = parse(`^(${prefixExp.source})?(${firstCommentExp.source})`, 's');

const supportedFileTypes = ['js', 'jsx', 'ts', 'tsx', 'cjs', 'mjs'];

class CAccessor {
  constructor() {
    this._commentParser = new CCommentParser();
    this.supportedFileTypes = supportedFileTypes;
  }

  async readAnnotations(path) {
    const match = await exec(headerExp, createReadStream(path, 'utf8'));
    return match && this._commentParser.parse(match[2]).annotations;
  }

  async read(path) {
    const content = await readFile(path, 'utf8');
    const match = await exec(headerExp, content);

    if (!match) return { header: null, content };

    const [, prefix = '', comment] = match;

    return (
      match && {
        header: this._commentParser.parse(comment),
        content: prefix + content.slice(match[0].length),
      }
    );
  }

  async write(path, { header, content }, options) {
    if (!header.annotations || first(header.annotations.keys()) !== 'macrome') {
      throw new Error('macrome annotation must be first');
    }

    const prefix = firstOr('', prefixExp.exec(content));
    const headerText = this._commentParser.print(header);

    await writeFile(path, `${prefix}${headerText}\n${content.slice(prefix.length)}`, options);
  }
}

module.exports = { CAccessor };
