const { Queue } = require('./utils/queue');

const _ = Symbol('private members');

/**
 * This data structure ensures that changes happen in cause => effect order.
 * A cause is a change in a non-generated file, and effects are usually
 * individual generators calling `api.write()`.
 */
class Changeset {
  constructor(rootChange) {
    this[_] = {
      rootChange,
      paths: [],
      queue: new Queue(),
    };

    this.add(rootChange);
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
