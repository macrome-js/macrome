const baseLogger = require('log');
const initNodeLogWriter = require('log-node');

initNodeLogWriter();

const logger = baseLogger.get('macrome');

module.exports = { logger };
