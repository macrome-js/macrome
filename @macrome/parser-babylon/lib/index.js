const recast = require('@conartist6/recast');
const babylon = require('@babel/parser');

const errorTemplate = (error) => `
throw new Error(\`${error.stack}\`);
`;

function isMacromeComment(node) {
  return node.type === 'CommentBlock' && node.leading && /\s*@macrome/.test(node.value);
}

function renderAnnotation([key, value]) {
  return `@${key}${value === true ? '' : ` ${value}`}`;
}

function getProgram(ast) {
  const program = ast.type === 'File' ? ast.program : ast;
  if (program.type !== 'Program') {
    throw new Error(`decorate expects a File or Program ast node but received ${ast.type}`);
  }
  return program;
}

class MacromeParserBabylon {
  constructor(options = {}) {
    this.options = {
      parseOptions: {
        ...options.parseOptions,
        tokens: true,
      },
      printOptions: {
        ...options.printOptions,
      },
    };
  }

  parse(content) {
    return recast.parse(content, {
      parser: {
        parse: (source) => {
          return babylon.parse(source, this.options.parseOptions);
        },
      },
    });
  }

  print(ast) {
    return recast.print(ast, this.options.printOptions);
  }

  generateError(error) {
    return this.parse(errorTemplate(error));
  }

  stripHeader(ast) {
    const program = getProgram(ast);
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
  }

  prependHeader(ast, annotations, commentLines) {
    const program = getProgram(ast);
    const annotationLines = Object.entries(annotations).map(
      (ann, i) => `${i > 0 ? ' *' : ''} ${renderAnnotation(ann)}`,
    );

    // prettier-ignore
    const value = `${annotationLines.join('\n')}\n${commentLines.map(l => ` * ${l}`).join('\n')}\n `;

    if (!program.comments) program.comments = [];
    program.comments.unshift({ type: 'CommentBlock', value, leading: true, trailing: false });
  }
}

module.exports = MacromeParserBabylon;
