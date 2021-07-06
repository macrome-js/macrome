const { resolve } = require('path');
const stripAnsi = require('strip-ansi');

const { run, hasOutput, outputLines } = require('../lib/utils/shell');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isClean(dir) {
  return !hasOutput('git', ['status', '-s', dir]);
}

function gitStatus() {
  return outputLines('git', ['status', '-s', '.'])
    .map((line) => stripAnsi(line))
    .slice(0, -1)
    .sort();
}

const sandboxPath = (path) => resolve(__dirname, 'sandbox', path);

async function eventually(cb, ms = 500, max = 8) {
  for (let i = 0; i < max; i++) {
    await sleep(ms);
    try {
      cb();
    } catch (e) {
      if (i === max - 1) {
        throw e;
      } else {
        continue;
      }
    }
    break;
  }
}

module.exports = {
  sandboxPath,
  run,
  hasOutput,
  outputLines,
  sleep,
  eventually,
  isClean,
  gitStatus,
};
