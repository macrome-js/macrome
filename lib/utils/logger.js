const { getLogger } = require('loglevel');

/* eslint-disable no-console */

const loggerFactory = (logLevel) => {
  const logger = getLogger('macrome');

  logger.setLevel(logLevel);

  return logger;
};

module.exports = { loggerFactory };
