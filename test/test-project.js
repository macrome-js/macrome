const { writeFile, unlink } = require('fs').promises;
const { Macrome } = require('../lib');
const { run, isClean, gitStatus } = require('./utils');

function testProject(projectRoot) {
  let macrome;

  beforeAll(async () => {
    process.chdir(projectRoot);

    if (!isClean('.')) {
      throw new Error('Test directory was not clean');
    }

    macrome = new Macrome({ quiet: true });
  });

  afterAll(async () => {
    run('git', ['add', '.']);
    run('git', ['checkout', 'HEAD', '--', projectRoot]);
  });

  it('cleans', async () => {
    await macrome.clean();

    expect(gitStatus()).toMatchSnapshot();
  });

  it('builds', async () => {
    await macrome.build();

    expect(isClean('.')).toBe(true);
  });

  it('checks', async () => {
    const clean = await macrome.check();

    expect(clean).toBe(true);
  });

  describe('when stale files are present', () => {
    beforeEach(async () => {
      await writeFile(macrome.resolve('lib/spurious.js'), '/* @macrome */');
    });

    afterEach(async () => {
      await unlink(macrome.resolve('lib/spurious.js')).catch(() => {});
    });

    it('removes them', async () => {
      expect(isClean('.')).toBe(false);

      await macrome.build();

      expect(isClean('.')).toBe(true);
    });
  });

  return {
    watchSetup() {
      beforeAll(async () => {
        const build = jest.spyOn(macrome, 'build').mockImplementation(async () => {});

        await macrome.watch();

        expect(build).toHaveBeenCalledTimes(1);
      });

      afterAll(async () => {
        await macrome.stopWatching();
      });
    },
  };
}

module.exports = { testProject };
