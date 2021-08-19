import type { Change } from './types';

import Queue from '@iter-tools/queue';

const _ = Symbol('private members');

/**
 * This data structure ensures that changes happen in cause => effect order.
 * A cause is a change in a non-generated file, and effects are usually
 * individual generators calling `api.write()`.
 */
export class Changeset {
  [_]: {
    rootChange: Change;
    paths: Array<string>;
    queue: Queue<Change>;
  };

  constructor(rootChange: Change) {
    this[_] = {
      rootChange,
      paths: [],
      queue: new Queue(),
    };

    this.add(rootChange);
  }

  add(change: Change): void {
    const { paths, queue } = this[_];

    queue.push(change);

    paths.push(change.path);
  }

  get root(): string {
    return this[_].rootChange.path;
  }

  get paths(): Iterable<string> {
    return this[_].paths[Symbol.iterator]();
  }

  get queue(): Iterable<Change> {
    return this[_].queue[Symbol.iterator]();
  }
}
