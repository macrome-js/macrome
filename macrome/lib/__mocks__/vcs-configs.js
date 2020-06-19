const { hasOutput } = require('../utils/shell');

const vcsConfigs = [
  {
    name: 'test-vcs',
    dir: '.vcs',
    lock: 'vcs-lockfile',
    isDirty: (dir) => hasOutput('git', ['status', '-s', '.'], dir),
  },
];

module.exports = { vcsConfigs };
