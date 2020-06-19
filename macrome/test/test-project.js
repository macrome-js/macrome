const stripAnsi = require('strip-ansi');

const { Macrome } = require('../lib');
const { run, hasOutput, outputLines } = require('../lib/utils/shell');

function isDirectoryClean(dir) {
  return !hasOutput('git', ['status', '-s', dir]);
}

function testProject(projectRoot) {
  let macrome;

  beforeAll(async () => {
    process.chdir(projectRoot);

    if (!isDirectoryClean('.')) {
      throw new Error('Test directory was not clean');
    }

    macrome = new Macrome({ quiet: true });
  });

  afterAll(async () => {
    run('git', ['add', '.']);
    run('git', ['checkout', 'HEAD', '--', '.']);
  });

  it('cleans', async () => {
    await macrome.clean();

    const status = outputLines('git', ['status', '-s', '.'])
      .map((line) => stripAnsi(line))
      .slice(0, -1);

    expect(status).toMatchSnapshot();
  });

  it('builds', async () => {
    await macrome.build();

    expect(isDirectoryClean('.')).toBe(true);

    // check what the built output is
  });

  it('checks', async () => {
    const clean = await macrome.check();

    expect(clean).toBe(true);
  });

  it('watches', async () => {
    const build = jest.spyOn(macrome, 'build').mockImplementation(async () => {});

    await macrome.watch();

    expect(build).toHaveBeenCalledTimes(1);

    // change file
    // expect change in generated files

    await macrome.stopWatching();
  });
}

module.exports = { testProject };
