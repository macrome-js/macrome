"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAccessor = void 0;
const fs_1 = require("fs");
const iter_tools_es_1 = require("iter-tools-es");
// @ts-ignore
const chunked_1 = require("@iter-tools/regex/dist/async/chunked");
const parser_1 = require("./parser");
const fs_2 = require("../../utils/fs");
const { readFile, writeFile } = fs_1.promises;
// Below is an example of a leading comment this code would parse:
/* @macrome
 * @generatedfrom ./$concat.js
 * @generatedby generate/generators/$methods/index.js
 * One or more lines of free text
 */
const prefixExp = /^#![^\r\n]]*\r?\n/s;
const firstCommentExp = /\s*\/\*\s*@macrome\b.*?\*\//s;
const headerExp = chunked_1.parse(`^(${prefixExp.source})?(${firstCommentExp.source})`, 's');
const supportedFileTypes = ['js', 'jsx', 'ts', 'tsx', 'cjs', 'mjs'];
class CAccessor {
    constructor() {
        this.supportedFileTypes = supportedFileTypes;
        this.commentParser = new parser_1.CCommentParser();
    }
    async readAnnotations(path) {
        const match = await chunked_1.exec(headerExp, fs_2.createReadStream(path));
        return match && this.commentParser.parse(match[2]).annotations;
    }
    async read(path, options) {
        const content = await readFile(path, fs_2.buildReadOptions(options));
        const match = await chunked_1.exec(headerExp, content);
        if (!match)
            return { header: null, content };
        const [, prefix = '', comment] = match;
        return (match && {
            header: this.commentParser.parse(comment),
            content: prefix + content.slice(match[0].length),
        });
    }
    async write(path, file, options) {
        const { header, content } = file;
        if (header && (!header.annotations || iter_tools_es_1.first(header.annotations.keys()) !== 'macrome')) {
            throw new Error('macrome annotation must be first');
        }
        const prefix = iter_tools_es_1.firstOr('', prefixExp.exec(content));
        const headerText = header ? this.commentParser.print(header) : '';
        await writeFile(path, `${prefix}${headerText}\n${content.slice(prefix.length)}`, options);
    }
}
exports.CAccessor = CAccessor;
