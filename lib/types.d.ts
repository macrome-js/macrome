import { FileHandle } from 'fs/promises';
import type { MapChangeApi, GeneratorApi } from './apis';

export type Annotations = Map<string, any>;

export type FileState = {
  mtimeMs: number;
  annotations: Annotations | null;
  generatedPaths: Set<string>;
};

export type ReportedAddChange = {
  op: 'A';
  path: string;
  mtimeMs: number;
};

export type ReportedModifyChange = {
  op: 'M';
  path: string;
  mtimeMs: number;
};

export type ReportedDeleteChange = {
  op: 'D';
  path: string;
  mtimeMs: null;
};

export type AnnotatedAddChange = {
  op: 'A';
  reported: ReportedAddChange;
  annotations: Annotations | null;
};

export type AnnotatedModifyChange = {
  op: 'M';
  reported: ReportedModifyChange;
  annotations: Annotations | null;
};

export type AnnotatedDeleteChange = {
  op: 'D';
  reported: ReportedDeleteChange;
  annotations: null;
};

export type EnqueuedAddChange = {
  op: 'A';
  path: string;
  reported: ReportedAddChange;
  annotations: Annotations | null;
  state: FileState;
  prevState: null;
};

export type EnqueuedModifyChange = {
  op: 'M';
  path: string;
  reported: ReportedModifyChange;
  annotations: Annotations | null;
  state: FileState;
  prevState: FileState;
};

export type EnqueuedDeleteChange = {
  op: 'D';
  path: string;
  reported: ReportedDeleteChange;
  annotations: null;
  state: null;
  prevState: FileState;
};

export type ReportedChange = ReportedAddChange | ReportedModifyChange | ReportedDeleteChange;
export type AnnotatedChange = AnnotatedAddChange | AnnotatedModifyChange | AnnotatedDeleteChange;
export type EnqueuedChange = EnqueuedAddChange | EnqueuedModifyChange | EnqueuedDeleteChange;

export type MappableChange = EnqueuedAddChange | EnqueuedModifyChange;

export type FileHeader = {
  annotations: Annotations | null;
  content?: string;
};

export type File = {
  header?: FileHeader | null;
  content: string;
};

export type ReadOptions =
  | BufferEncoding
  | {
      fd?: FileHandle;
      flags?: string;
      encoding?: BufferEncoding | null;
    };

export type WriteOptions =
  | BufferEncoding
  | {
      fd?: FileHandle;
      encoding?: BufferEncoding | null;
      mode?: number;
      flag?: string;
    };

export interface Accessor {
  supportedFileTypes: Array<string>;

  readAnnotations(path: string, options?: { fd?: FileHandle }): Promise<Annotations | null>;

  read(path: string, options?: ReadOptions): Promise<File>;

  write(path: string, file: File, options?: WriteOptions): Promise<void>;
}

export type Matcher = (path: string) => boolean;

export type MMatchExpression = Array<string> | string | null | undefined;

/**
 * If include is nullish, everything is presumed to be included.
 * If exclude is nullish, nothing is presumed to be excluded.
 *
 * A directory which is not included will still be traversed as files within it could be.
 * If you wish to omit traversal of an entire directory, just exclude it.
 */
export type AsymmetricMMatchExpression = {
  include?: MMatchExpression;
  exclude?: MMatchExpression;
};

export type AsymmetricMMatchExpressionWithSuffixes = AsymmetricMMatchExpression & {
  suffixes?: Array<string>;
};

export type WatchmanExpression = Array<unknown>;

export interface Generator<T> extends AsymmetricMMatchExpression {
  // eslint-disable-next-line @typescript-eslint/no-misused-new
  new (options: Record<string, any>): Generator<T>;

  initialize?(api: GeneratorApi): Promise<unknown>;

  map?(api: MapChangeApi, change: EnqueuedChange): Promise<T>;

  reduce?(api: GeneratorApi, changeMap: Map<string, T>): Promise<unknown>;

  destroy?(api: GeneratorApi): Promise<unknown>;
}
