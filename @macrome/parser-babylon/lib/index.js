const recast = require('@conartist6/recast');
const babylon = require('@babel/parser');

const errorTemplate = (error) => `
throw new Error(\`${error.stack}\`);
`;

function isMacromeComment(node) {
  return node.type === 'CommentBlock' && node.leading && /\s*@macrome/.test(node.value);
}

const parser = {
  parse(content, options) {
    return recast.parse(content, {
      parser: {
        parse(source) {
          return babylon.parse(source, {
            ...options,
            tokens: true,
          });
        },
      },
    });
  },

  print(ast, options) {
    return recast.print(ast, options);
  },

  generateError(error, options) {
    return this.parse(errorTemplate(error), options);
  },

  stripHeader(ast) {
    const { program } = ast;
    if (
      program.body[0] &&
      program.body[0].comments &&
      isMacromeComment(program.body[0].comments[0])
    ) {
      program.body[0].comments.splice(0, 1);
    } else if (program.comments && isMacromeComment(program.comments[0])) {
      // program has no body -- comments only
      program.comments.splice(0, 1);
    }
  },

  prependHeader(ast, annotations, commentLines) {
    const annotationLines = Object.entries(annotations).map(
      ([key, value], i) => `${i > 0 ? ' *' : ''} @${key}${value === true ? '' : ` ${value}`}`,
    );

    const { program } = ast;
    // prettier-ignore
    const value = `${annotationLines.join('\n')}\n${commentLines.map(l => ` * ${l}`).join('\n')}\n `;

    if (!program.comments) program.comments = [];
    program.comments.unshift({ type: 'CommentBlock', value, leading: true, trailing: false });
  },
};

module.exports = parser;
