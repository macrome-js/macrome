const { Macrome } = require('../lib');
const { run, gitStatus, gitDiff } = require('./utils');

function cleanProject(projectRoot) {
  run('git', ['add', projectRoot]);
  run('git', ['checkout', 'HEAD', '--', projectRoot]);
}

function inDir(dir, cb) {
  const dir_ = process.cwd();
  process.chdir(dir);
  cb();
  process.chdir(dir_);
}

function testProject(projectRoot) {
  let macrome;

  beforeAll(async () => {
    cleanProject(projectRoot);

    inDir(projectRoot, () => {
      macrome = new Macrome({ quiet: true });
    });
  });

  afterAll(async () => {
    cleanProject(projectRoot);
  });

  it('cleans', async () => {
    await macrome.clean();

    expect(gitStatus(projectRoot)).toMatchSnapshot();
  });

  it('builds', async () => {
    await macrome.build();

    expect(gitDiff(projectRoot)).toMatchSnapshot();
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
