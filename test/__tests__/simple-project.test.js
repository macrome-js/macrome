const { resolve } = require('path');
const { testProject } = require('./test-project');
const { gitStatus, isClean } = require('./utils');

const { writeFile, readFile, unlink } = require('fs/promises');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('simple project', () => {
  const test = testProject(resolve(__dirname, '../sandbox/projects/simple-project'));

  describe('watch', () => {
    test.watchSetup();

    it('simple-project.js', async () => {
      const filePath = 'lib/simple-project.js';
      const originalContent = await readFile(filePath, 'utf8');

      await unlink(filePath);
      await sleep(100);

      expect(gitStatus()).toMatchSnapshot();

      await writeFile(filePath, originalContent + '\n');
      await sleep(100);

      expect(gitStatus()).toMatchSnapshot();

      await writeFile(filePath, originalContent);
      await sleep(100);

      expect(isClean('.')).toBe(true);
    });
  });
});
