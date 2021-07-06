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
