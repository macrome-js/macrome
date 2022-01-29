const { relative } = require('path');
const { writeFile, unlink } = require('fs').promises;
const { Macrome } = require('../lib');
const { isClean, gitStatus, hardReset } = require('./utils');

function testProject(root) {
  const macrome = new Macrome({ root, quiet: true });

  const rootRel = root.startsWith('/') ? relative(process.cwd(), root) : root;

  beforeAll(() => {
    hardReset(rootRel);
  });

  afterAll(() => {
    hardReset(rootRel);
  });

  it('cleans', async () => {
    await macrome.clean();

    expect(gitStatus(rootRel)).toMatchSnapshot();
  });

  it('builds', async () => {
    await macrome.clean();
    await macrome.build();

    // build should reverse the effects of clean
    expect(gitStatus(rootRel)).toEqual([]);
  });

  it('checks', async () => {
    hardReset(rootRel);

    const isClean = await macrome.check();

    expect(isClean).toBe(true);
  });

  describe('when stale files are present', () => {
    beforeEach(async () => {
      await writeFile(macrome.resolve('lib/spurious.js'), '/* @macrome */');
    });

    afterEach(async () => {
      await unlink(macrome.resolve('lib/spurious.js')).catch(() => {});
    });

    it('removes them', async () => {
      expect(isClean(rootRel)).toBe(false);

      await macrome.build();

      expect(isClean(rootRel)).toBe(true);
    });
  });

  return macrome;
}

module.exports = { testProject };
