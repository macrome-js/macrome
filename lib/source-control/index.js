const { SourceControlGit } = require('./git');
const { SourceControlNone } = require('./none');

module.exports = {
  git: SourceControlGit,
  none: SourceControlNone,
};
