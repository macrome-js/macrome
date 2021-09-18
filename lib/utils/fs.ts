import type { ReadOptions } from '../types';
import type { FileHandle } from 'fs/promises';
import type { Dirent, ReadStream } from 'fs';

import { join } from 'path';
import { promises as fsPromises, createReadStream as fsCreateReadStream } from 'fs';
import Queue from '@iter-tools/queue';

const { opendir } = fsPromises;

export function buildReadOptions(options?: ReadOptions): {
  encoding: BufferEncoding;
  flags?: string;
} {
  const options_ = typeof options === 'string' ? { encoding: options } : options || {};

  return { ...options_, encoding: options_.encoding || 'utf8' };
}

export async function createReadStream(path: string | FileHandle): Promise<ReadStream> {
  return typeof path === 'string'
    ? fsCreateReadStream(path, 'utf-8')
    : fsCreateReadStream('', { encoding: 'utf-8', fd: path });
}

export async function* recursiveReadFiles(
  root: string,
  options: {
    shouldInclude?: (path: string, ent: Dirent) => boolean | undefined;
    shouldExclude?: (path: string, ent: Dirent) => boolean | undefined;
  } = {},
): AsyncGenerator<string> {
  const { shouldInclude = () => true, shouldExclude = () => false } = options;
  const dirQueue = new Queue([root]);

  for (const dir of dirQueue) {
    const files = await opendir(join(root, dir));

    for await (const ent of files) {
      const path = join(root, dir, ent.name);
      const isDir = ent.isDirectory();
      const isFile = ent.isFile();

      if ((!isDir && !isFile) || shouldExclude(path, ent)) {
        continue;
      }

      if (isDir) {
        dirQueue.push(path);
      } else {
        if (shouldInclude(path, ent) && !shouldExclude(path, ent)) {
          yield path;
        }
      }
    }
  }
}
