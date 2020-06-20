'use strict';

function* concat(...iterables) {
  for (const array of iterables) {
    yield* array;
  }
}

function* map(callback, iterable) {
  for (const value of iterable) {
    yield callback(value);
  }
}

function* filter(callback, iterable) {
  for (const value of iterable) {
    if (callback(value)) yield value;
  }
}

function groupBy(getKey = (_) => _, values) {
  const groups = new Map();
  for (const value of values) {
    const key = getKey(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { concat, map, filter, groupBy, delay };
