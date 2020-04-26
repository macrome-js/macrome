const { resolve } = require('path');
const { testProject } = require('../test-project');

describe('simple project', () => {
  testProject(resolve(__dirname, '../sandbox/projects/simple-project'));
});
