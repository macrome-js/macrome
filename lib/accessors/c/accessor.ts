import type { FileHandle } from 'fs/promises';
import type { Accessor, Annotations, File, ReadOptions, WriteOptions } from '../../types';

import { promises as fsPromises, createReadStream } from 'fs';
import { first, firstOr } from 'iter-tools-es';
// @ts-ignore
import { parse, exec } from '@iter-tools/regex/dist/async/chunked';
import { CCommentParser } from './parser';
import { buildOptions } from '../../utils/fs';

const { readFile, writeFile } = fsPromises;

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

export class CAccessor implements Accessor {
  supportedFileTypes = supportedFileTypes;
  commentParser = new CCommentParser();

  async readAnnotations(path: string, options?: { fd: FileHandle }): Promise<Annotations | null> {
    const match = await exec(headerExp, await createReadStream(path, buildOptions(options)));
    return match && this.commentParser.parse(match[2]).annotations;
  }

  async read(path: string | FileHandle, options?: ReadOptions): Promise<File> {
    const content = await readFile(path, buildOptions(options));

    const match = await exec(headerExp, content);

    if (!match) return { header: null, content };

    const [, prefix = '', comment] = match;

    return (
      match && {
        header: this.commentParser.parse(comment),
        content: prefix + content.slice(match[0].length),
      }
    );
  }

  async write(path: string | FileHandle, file: File, options: WriteOptions): Promise<void> {
    const { header, content } = file;
    if (header && (!header.annotations || first(header.annotations.keys()) !== 'macrome')) {
      throw new Error('macrome annotation must be first');
    }

    const prefix = firstOr('', prefixExp.exec(content));
    const headerText = header ? this.commentParser.print(header) : '';

    await writeFile(path, `${prefix}${headerText}\n${content.slice(prefix.length)}`, options);
  }
}
