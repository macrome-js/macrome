import { FileHandle } from 'fs/promises';
import type { MapChangeApi, GeneratorApi } from './apis';

export type Change = {
  path: string;
  exists: boolean;
  new: boolean;
  mtimeMs: number;
};

export type Annotations = Map<string, any>;

export type FileHeader = {
  annotations: Annotations;
  content?: string;
};

export type File = {
  header?: FileHeader | null;
  content: string;
};

export type ReadOptions =
  | BufferEncoding
  | {
      flags?: string;
      encoding?: BufferEncoding | null;
    };

export type WriteOptions =
  | BufferEncoding
  | {
      encoding?: BufferEncoding | null;
      mode?: number;
      flag?: string;
    };

export interface Accessor {
  supportedFileTypes: Array<string>;

  readAnnotations(path: string | FileHandle): Promise<Annotations | null>;

  read(path: string | FileHandle, options?: ReadOptions): Promise<File>;

  write(path: string | FileHandle, file: File, options?: WriteOptions): Promise<void>;
}

export type Matcher = (path: string) => boolean;

export type MatchExpression = Matcher | Array<Matcher | string> | string | null | undefined;

/**
 * If include is nullish, everything is presumed to be included.
 * If exclude is nullish, nothing is presumed to be excluded.
 *
 * A directory which is not included will still be traversed as files within it could be.
 * If you wish to omit traversal of an entire directory, just exclude it.
 */
export type Matchable = {
  include?: MatchExpression;
  exclude?: MatchExpression;
};

export interface Generator<T> extends Matchable {
  // eslint-disable-next-line @typescript-eslint/no-misused-new
  new (options: Record<string, any>): Generator<T>;

  initialize?(api: GeneratorApi): Promise<unknown>;

  map?(api: MapChangeApi, change: Change): Promise<T>;

  reduce?(api: GeneratorApi, changeMap: Map<string, T>): Promise<unknown>;

  destroy?(api: GeneratorApi): Promise<unknown>;
}
