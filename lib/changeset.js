const { unlink } = require('fs').promises;
const Queue = require('@iter-tools/queue');

const _ = Symbol('private members');

/**
 * This data structure ensures that changes happen in cause => effect order.
 * A cause is a change in a non-generated file, and effects are usually
 * individual generators calling `api.write()`.
 */

// Maybe I'm tripping myself up with the difference between changeset and queue?
// It is more like RootFile and ChangeQueue.
// A RootFile lives as long as the refernced file is on disk
// A ChangeQueue exists only as long as we are preceesing a change to a root file
// RootFile.change() make a queue
class Changeset {
  constructor(rootChange) {
    this[_] = {
      rootChange,
      paths: [],
      queue: null,
    };
  }

  async transact(cb) {
    let { queue, rootChange } = this[_];
    const beforePaths = [...this[_].paths];

    if (queue) throw new Error('Changesets must not nest transactions');

    queue = this[_].queue = new Queue([rootChange]);

    // queue loop. don't expose the queue.
    await cb(queue);

    const afterPaths = new Set(this[_].paths);

    for (const path of beforePaths) {
      if (!afterPaths.has(path)) unlink(path);
    }

    this[_].queue = null;
  }

  add(change) {
    const { paths, queue } = this[_];

    queue.push(change);

    paths.push(change.path);
  }

  get root() {
    return this[_].rootChange.path;
  }

  get paths() {
    return this[_].paths[Symbol.iterator]();
  }

  get queue() {
    return this[_].queue[Symbol.iterator]();
  }
}

module.exports = { Changeset };
