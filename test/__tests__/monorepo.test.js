const { resolve } = require('path');
const { testProject } = require('./test-project');
const { gitStatus, isClean, sleep } = require('./utils');

const { writeFile, readFile, unlink } = require('fs/promises');

describe('monorepo', () => {
  let testA, testB;
  const sandboxPath = (path) => resolve(__dirname, '../sandbox', path);

  describe('project a', () => {
    testA = testProject(sandboxPath('projects/monorepo/project-a'));
  });

  describe('project b', () => {
    testB = testProject(sandboxPath('projects/monorepo/project-b'));
  });

  describe('projects a and b', () => {
    testA.watchSetup();
    testB.watchSetup();

    beforeAll(() => {
      process.chdir(sandboxPath('projects/monorepo'));
    });

    it('watch', async () => {
      const aPath = 'project-a/lib/project-a.js';
      const bPath = 'project-b/lib/project-b.js';
      const aContent = await readFile(aPath, 'utf8');
      const bContent = await readFile(bPath, 'utf8');

      await Promise.all([unlink(aPath), unlink(bPath)]);
      await sleep(100);

      expect(gitStatus()).toMatchSnapshot();

      await Promise.all([writeFile(aPath, aContent + '\n'), writeFile(bPath, bContent + '\n')]);
      await sleep(100);

      expect(gitStatus()).toMatchSnapshot();

      await Promise.all([writeFile(aPath, aContent), writeFile(bPath, bContent)]);
      await sleep(100);

      expect(isClean('.')).toBe(true);
    });
  });
});
