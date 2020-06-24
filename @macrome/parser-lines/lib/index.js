function renderAnnotation([key, value]) {
  return `@${key}${value === true ? '' : ` ${value}`}`;
}

class MacromeParserLines {
  constructor(options = {}) {
    this.options = {
      commentToken: '#',
      addTrailingNewline: true,
      EOL: '\n',
      ...options,
    };
  }

  parse(content) {
    // Strip UTF8 BOM if present
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    return content.split(/\r?\n/);
  }

  print(lines) {
    const { addTrailingNewline, EOL } = this.options;
    return `${lines.join(EOL)}${addTrailingNewline ? EOL : ''}`;
  }

  generateError(error) {
    return this.parse(error.stack);
  }

  stripHeader(lines) {
    const { commentToken } = this.options;
    let macromeLinesCount = 0;
    if (lines[0] === `${commentToken} @macrome`) {
      const lastCommentLine = lines.findIndex(
        (line) => !lines.startsWith(commentToken) || line === commentToken,
      );
      if (lines[lastCommentLine] === commentToken) macromeLinesCount = lastCommentLine;
    }
    lines.splice(0, macromeLinesCount);
  }

  prependHeader(lines, annotations, commentLines) {
    lines.splice(
      0,
      0,
      ...Object.entries(annotations).map((ann) => `# ${renderAnnotation(ann)}`),
      ...commentLines.map((line) => `# ${line}`),
      '#',
    );
  }
}

module.exports = MacromeParserLines;
