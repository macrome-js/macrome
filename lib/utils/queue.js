'use strict';

class QueueItem {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

class Queue {
  constructor() {
    this.empty();
  }

  empty() {
    this.head = this.tail = new QueueItem(null);
  }

  shift() {
    if (this.isEmpty()) throw new Error('Cannot shift empty queue');
    const { value, next } = this.head.next;
    this.head.next = next;

    return value;
  }

  push(value) {
    const newItem = new QueueItem(value);
    this.tail.next = this.tail = newItem;
  }

  isEmpty() {
    return !this.head.next;
  }

  *[Symbol.iterator]() {
    let item = this.head;
    while ((item = item.next)) {
      yield item.value;
    }
  }
}

module.exports = { Queue };
