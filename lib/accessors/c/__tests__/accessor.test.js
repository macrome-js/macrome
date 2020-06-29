const { join, resolve } = require('path');
const { CAccessor } = require('../index');

describe('C Accessor', () => {
  const accessor = new CAccessor();
  it('parses a simple header', async () => {
    expect(await accessor.read(resolve(join(__dirname, 'fixtures/has-header.js')))).toEqual({
      header: {
        annotations: new Map([
          ['macrome', true],
          ['generatedfrom', './$concat.js'],
          ['generatedby', 'generate/generators/$methods/index.js'],
        ]),
        commentLines: ['One or more lines of free text'],
      },
      content: '\n',
    });
  });
});
