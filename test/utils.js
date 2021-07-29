const stripAnsi = require('strip-ansi');

const { run, hasOutput, outputLines } = require('../lib/utils/shell');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isClean(path) {
  return !hasOutput('git', ['status', '-s', '.'], path);
}

function gitStatus(path) {
  return outputLines('git', ['status', '-s', '.'], path)
    .map((line) => stripAnsi(line))
    .slice(0, -1)
    .sort();
}

function gitDiff(path) {
  return outputLines('git', ['diff', '-U0', '--relative', 'HEAD', '.'], path)
    .map((line) => stripAnsi(line))
    .slice(3)
    .join('\n');
}

const sandboxPath = (path) => `test/sandbox/${path}`;

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
  gitDiff,
};
