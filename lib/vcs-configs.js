const { hasOutput } = require('./utils/shell');

const vcsConfigs = [
  {
    name: 'git',
    dir: '.git',
    isDirty: (dir) => hasOutput('git', ['status', '-s', '--porcelain'], dir),
  },
  {
    name: 'hg',
    dir: '.hg',
    isDirty: (dir) => hasOutput('hg', ['status', '--color=never', '--pager=never'], dir),
  },
];

module.exports = { vcsConfigs };
