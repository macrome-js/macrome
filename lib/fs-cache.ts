import Queue from '@iter-tools/queue';
import { Annotations } from './types';

export type FileState = {
  mtimeMs: number;
  annotations: Annotations | null;
  generatedPaths: Set<string>;
};

export type CacheEntry = {
  path: string;
  last: FileState;
  current: FileState;
};

class FsCache {
  cache: Map<string, Queue<CacheEntry>> = new Map();

  constructor() {
    this.cache = new Map();
  }
}

export const fsCache = new FsCache();
