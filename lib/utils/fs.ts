import type { ReadOptions, WriteOptions } from '../types';

import { join } from 'path';
import { promises as fsPromises } from 'fs';
import Queue from '@iter-tools/queue';

const { opendir } = fsPromises;

export function buildOptions(
  options?: ReadOptions,
): Exclude<ReadOptions, string> & { encoding: 'utf8' };
export function buildOptions(
  options?: WriteOptions,
): Exclude<WriteOptions, string> & { encoding: 'utf8' };
export function buildOptions(options?: ReadOptions): {
  encoding: BufferEncoding;
  flags?: string;
} {
  const options_ = typeof options === 'string' ? { encoding: options } : options || {};

  // TODO maybe don't force this.
  return { ...options_, encoding: 'utf8' };
}

export async function* recursiveReadFiles(
  root: string,
  options: {
    shouldInclude?: (path: string) => boolean | undefined;
    shouldExclude?: (path: string) => boolean | undefined;
  } = {},
): AsyncGenerator<string> {
  const { shouldInclude = () => true, shouldExclude = () => false } = options;
  const dirQueue = new Queue(['']);

  for (const dir of dirQueue) {
    const files = await opendir(join(root, dir));

    for await (const ent of files) {
      const path = join(dir, ent.name);
      const isDir = ent.isDirectory();
      const isFile = ent.isFile();

      if ((!isDir && !isFile) || shouldExclude(path)) {
        continue;
      }

      if (isDir) {
        dirQueue.push(path);
      } else {
        if (shouldInclude(path) && !shouldExclude(path)) {
          yield path;
        }
      }
    }
  }
}
