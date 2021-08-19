import type { MapChangeApi, StaticApi } from './apis';

import type { Operation } from './operations';

export interface Change {
  path: string;
  operation: Operation;
}

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

  readAnnotations(path: string): Promise<Annotations>;

  read(path: string, options: ReadOptions): Promise<File>;

  write(path: string, file: File, options: WriteOptions): Promise<void>;
}

export type Matchable = {
  files?: string | Array<string>;
  excludeFiles?: string | Array<string>;
};

export interface Generator<T> extends Matchable {
  // eslint-disable-next-line @typescript-eslint/no-misused-new
  new (options: Record<string, any>): Generator<T>;

  initialize(api: StaticApi): Promise<unknown>;

  map(api: MapChangeApi, change: Change): Promise<T>;

  reduce(api: StaticApi, changeMap: Map<string, T>): Promise<unknown>;

  destroy(api: StaticApi): Promise<unknown>;
}
