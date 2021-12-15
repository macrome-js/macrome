import { Annotations } from './types';

export type CacheEntry = {
  path: string;
  mtimeMs: number;
  annotations: Annotations | null;
  generatedPaths: Set<string>;
};

export const fsCache = new Map<string, CacheEntry>();
