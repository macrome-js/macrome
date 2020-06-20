function renderAnnotation([key, value]) {
  return `@${key}${value === true ? '' : ` ${value}`}`;
}

const parser = {
  // configurability:
  // comment symbol
  // trailing newline?

  parse(content) {
    return content.split(/\r?\n/);
  },

  print(lines, options) {
    return lines.join('\n');
  },

  generateError(error, options) {
    return this.parse(error.stack);
  },

  stripHeader(lines) {
    let macromeLinesCount = 0;
    if (lines[0] === '# @macrome') {
      const lastCommentLine = lines.findIndex((line) => !lines.startsWith('#') || line === '#');
      if (lines[lastCommentLine] === '#') macromeLinesCount = lastCommentLine;
    }
    lines.splice(0, macromeLinesCount);
  },

  prependHeader(lines, annotations, commentLines) {
    lines.splice(
      0,
      0,
      ...Object.entries(annotations).map((ann) => `# ${renderAnnotation(ann)}`),
      ...commentLines.map((line) => `# ${line}`),
      '#',
    );
  },
};

module.exports = parser;
