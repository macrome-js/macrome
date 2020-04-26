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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function debounce(fn, ms) {
  let timeout;
  let delayed;

  const debounced = (...args) => {
    delayed = () => {
      if (timeout === thisTimeout) {
        timeout = null;
        fn(...args);
      }
    };

    if (timeout) clearTimeout(timeout);
    const thisTimeout = (timeout = setTimeout(delayed, ms));
  };

  Object.assign(debounced, {
    flush() {
      clearTimeout(timeout);
      delayed && delayed();
    },

    cancel() {
      clearTimeout(timeout);
    },
  });

  return debounced;
}

function handleError(e) {
  console.error(e);
  process.exit(1);
}

module.exports = { concat, map, delay, debounce, handleError };
