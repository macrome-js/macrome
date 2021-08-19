const { join, resolve } = require('path');
const { Macrome } = require('../../lib');

const macrome = new Macrome({
  root: __dirname,
  configPath: null,
});

describe('accessors', () => {
  describe.each([['c/simple']])('%s', (case_) => {
    it('parses the header', async () => {
      const { file, result } = require(`./${case_}/case.js`);
      const accessor = macrome.accessorFor(file);

      expect(await accessor.read(resolve(join(__dirname, case_, file)))).toEqual(result);
    });
  });
});
