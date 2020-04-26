const { Queue } = require('./queue');

class Changeset {
  constructor(changes) {
    this.changeQueue = new Queue();
    this.changed = [];

    this.add(changes);
  }

  add(changes) {
    for (const change of changes) {
      this.changeQueue.push(change);
      this.changed.push(change);
    }
  }

  [Symbol.iterator]() {
    return this.changeQueue[Symbol.iterator]();
  }
}

module.exports = { Changeset };
