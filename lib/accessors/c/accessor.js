"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAccessor = void 0;
const promises_1 = require("stream/promises");
const fs_1 = require("fs");
const promises_2 = require("fs/promises");
const iter_tools_es_1 = require("iter-tools-es");
// @ts-ignore
const chunked_1 = require("@iter-tools/regex/dist/async/chunked");
const parser_1 = require("./parser");
const fs_2 = require("../../utils/fs");
const logger_1 = require("../../utils/logger");
const logger = logger_1.logger.get('macrome:accessors:c');
const prefixExp = /^#![^\r\n]*\r?\n/s;
const firstCommentExp = /\s*\/\*\s*@macrome\b.*?\*\//s;
const headerExp = (0, chunked_1.parse)(`^(${prefixExp.source})?(${firstCommentExp.source})`, 's');
const supportedFileTypes = ['js', 'jsx', 'ts', 'tsx', 'cjs', 'mjs'];
class CAccessor {
    constructor() {
        this.supportedFileTypes = supportedFileTypes;
        this.commentParser = new parser_1.CCommentParser();
    }
    async readAnnotations(path, options) {
        logger.debug(`Reading annotations for {path: ${path}}`);
        const match = await (0, chunked_1.exec)(headerExp, await (0, fs_1.createReadStream)(path, (0, fs_2.buildOptions)(options)));
        return match && this.commentParser.parse(match[2]).annotations;
    }
    async read(path, options) {
        const content = await (0, promises_2.readFile)(path, (0, fs_2.buildOptions)(options));
        const match = await (0, chunked_1.exec)(headerExp, content);
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
        if (header && (!header.annotations || (0, iter_tools_es_1.first)(header.annotations.keys()) !== 'macrome')) {
            throw new Error('macrome annotation must be first');
        }
        const prefix = (0, iter_tools_es_1.firstOr)('', prefixExp.exec(content));
        const headerText = header ? this.commentParser.print(header) : '';
        const stream = (0, fs_1.createWriteStream)(path, (0, fs_2.buildOptions)(options));
        await (0, promises_1.pipeline)(`${prefix}${headerText}\n${content.slice(prefix.length)}`, stream);
    }
}
exports.CAccessor = CAccessor;
