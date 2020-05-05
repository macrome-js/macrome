module.exports = error =>
  `
throw new Error(${JSON.stringify(error.stack)})
`;
