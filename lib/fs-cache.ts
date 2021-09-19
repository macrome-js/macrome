import { Annotations } from './types';

type CacheEntry = {
  path: string;
  mtimeMs: number;
  annotations: Annotations | null;
  generatedPaths: Set<string>;
};

export const fsCache: Map<string, CacheEntry> = new Map();
