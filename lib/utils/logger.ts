// @ts-ignore
import baseLogger from 'log';
// @ts-ignore
import initNodeLogWriter from 'log-node';

initNodeLogWriter();

export const logger = baseLogger.get('macrome');
