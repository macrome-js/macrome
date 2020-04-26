const { resolve } = require('path');
const { testProject } = require('../../test-project');

describe('monorepo project b', () => {
  testProject(resolve(__dirname, '../../sandbox/projects/monorepo/project-b'));
});
