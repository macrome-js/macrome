const { join } = require('path');
const stripAnsi = require('strip-ansi');
const { when } = require('iter-tools-es');

const { run, hasOutput, outputLines } = require('../lib/utils/shell');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isClean(dir) {
  return !hasOutput('git', ['status', '-s', '--', dir]);
}

function gitStatus(dir) {
  // Turn D test/sandbox/projects/...
  // into D ...
  const trimPath = dir
    ? (line) => line.replace(new RegExp(`^( [A-Z] )${dir}/?(.*)`), '$1$2')
    : null;
  return outputLines('git', ['status', '-s', ...when(dir, ['--', dir])])
    .slice(0, -1)
    .map((line) => {
      const noAnsi = stripAnsi(line);
      return trimPath ? trimPath(noAnsi) : noAnsi;
    })
    .sort();
}

// Hard reset a directory. Restore deleted files. Delete new files.
// There's got to be a better way, right????
function hardReset(dir) {
  run('git', ['add', dir]);
  run('git', ['checkout', 'HEAD', '--', dir]);
  run('git', ['reset', '--', dir]);
  run('git', ['clean', '-f', '--', dir]);
}

const sandboxPath = (path) => join('test', 'sandbox', path);

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
  hardReset,
};
