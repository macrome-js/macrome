import { Annotations } from './types';

type CacheEntry = {
  mtimeMs: number;
  annotations: Annotations | null;
  generatedPaths: Set<string>;
};

export const fsCache: Map<string, CacheEntry> = new Map();
