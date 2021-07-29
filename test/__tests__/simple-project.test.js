const { resolve } = require('path');
const { writeFile, readFile, unlink } = require('fs').promises;

const { testProject } = require('../test-project');
const { sandboxPath, gitStatus, eventually } = require('../utils');

describe('simple project', () => {
  const projectPath = sandboxPath('projects/simple-project');
  const test = testProject(projectPath);

  describe('watch', () => {
    test.watchSetup();

    it('simple-project.js', async () => {
      const filePath = resolve(projectPath, 'lib/simple-project.js');
      const originalContent = await readFile(filePath, 'utf8');

      await unlink(filePath);

      await eventually(() => {
        expect(gitStatus(projectPath)).toMatchInlineSnapshot(`
          Array [
            " D lib/generated-simple-project.js",
            " D lib/simple-project.js",
          ]
        `);
      });

      await writeFile(filePath, originalContent + '\n');

      await eventually(() => {
        expect(gitStatus(projectPath)).toMatchInlineSnapshot(`
          Array [
            " M lib/generated-simple-project.js",
            " M lib/simple-project.js",
          ]
        `);
      });

      await writeFile(filePath, originalContent);

      await eventually(() => {
        expect(gitStatus(projectPath)).toMatchInlineSnapshot(`Array []`);
      });
    });
  });
});
