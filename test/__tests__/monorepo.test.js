const { testProject } = require('./test-project');
const { sandboxPath, gitStatus, eventually } = require('./utils');

const { writeFile, readFile, unlink } = require('fs').promises;

describe('monorepo', () => {
  let testA, testB;

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

      await eventually(() =>
        expect(gitStatus()).toMatchInlineSnapshot(`
          Array [
            " D project-a/lib/generated-project-a.js",
            " D project-a/lib/project-a.js",
            " D project-b/lib/generated-project-b.js",
            " D project-b/lib/project-b.js",
          ]
        `),
      );

      await Promise.all([writeFile(aPath, aContent + '\n'), writeFile(bPath, bContent + '\n')]);

      await eventually(() => {
        expect(gitStatus()).toMatchInlineSnapshot(`
          Array [
            " M project-a/lib/generated-project-a.js",
            " M project-a/lib/project-a.js",
            " M project-b/lib/generated-project-b.js",
            " M project-b/lib/project-b.js",
          ]
        `);
      });

      await Promise.all([writeFile(aPath, aContent), writeFile(bPath, bContent)]);

      await eventually(() => {
        expect(gitStatus()).toMatchInlineSnapshot(`Array []`);
      });
    });
  });
});
