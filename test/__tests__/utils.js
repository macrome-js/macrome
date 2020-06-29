const { run, hasOutput, outputLines } = require('../../lib/utils/shell');

const stripAnsi = require('strip-ansi');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isClean(dir) {
  return !hasOutput('git', ['status', '-s', dir]);
}

function gitStatus() {
  return outputLines('git', ['status', '-s', '.'])
    .map((line) => stripAnsi(line))
    .slice(0, -1);
}

module.exports = { run, hasOutput, outputLines, sleep, isClean, gitStatus };
