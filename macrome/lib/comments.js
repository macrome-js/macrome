'use strict';

const readChunk = require('read-chunk');

const magicComment = '@macrome';

function isGeneratedFromTemplate(path) {
  let preamble;

  try {
    preamble = readChunk.sync(path, 3, magicComment.length).toString();
  } catch (e) {}

  return preamble === magicComment;
}

module.exports = { isGeneratedFromTemplate };
