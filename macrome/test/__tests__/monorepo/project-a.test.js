const { resolve } = require('path');
const { testProject } = require('../../test-project');

describe('monorepo project a', () => {
  testProject(resolve(__dirname, '../../sandbox/projects/monorepo/project-a'));
});
