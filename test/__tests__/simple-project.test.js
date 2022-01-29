const { testProject } = require('../test-project');
const { sandboxPath, gitStatus, eventually } = require('../utils');

const { writeFile, readFile, unlink } = require('fs').promises;

jest.setTimeout(300000);

describe('simple project', () => {
  const rootDir = sandboxPath('projects/simple-project');
  const macrome = testProject(rootDir);

  describe('watch', () => {
    beforeAll(async () => {
      await macrome.watch();
    });

    afterAll(async () => {
      await macrome.stopWatching();
    });

    it('simple-project.js', async () => {
      const filePath = macrome.resolve('lib/simple-project.js');
      const originalContent = await readFile(filePath, 'utf8');

      await unlink(filePath);

      await eventually(() => {
        expect(gitStatus(rootDir)).toMatchStateInlineSnapshot(`
          Array [
            " D lib/generated-simple-project.js",
            " D lib/simple-project.js",
          ]
        `);
      });

      await writeFile(filePath, originalContent + '\n');

      await eventually(() => {
        expect(gitStatus(rootDir)).toMatchStateInlineSnapshot(`
          Array [
            " M lib/generated-simple-project.js",
            " M lib/simple-project.js",
          ]
        `);
      });

      await writeFile(filePath, originalContent);

      await eventually(() => {
        expect(gitStatus(rootDir)).toMatchStateInlineSnapshot(`Array []`);
      });
    });
  });
});
