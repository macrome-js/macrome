const { dirname } = require('path');
const findUp = require('find-up');
const requireFresh = require('import-fresh');
const { map, concat } = require('iter-tools-es');

const { loggerFactory, DEBUG, WARN } = require('./utils/logger');

function buildOptions(apiOptions = {}) {
  const configPath =
    apiOptions.configPath || findUp.sync('macrome.config.js', { cwd: process.cwd() });

  const configOptions = requireFresh(configPath);

  if (configOptions.configPath) {
    console.warn('configPath is not a valid option in a config file.');
    delete configOptions.configPath;
  }

  const options = {
    quiet: false,
    ...configOptions,
    ...apiOptions,
    generators: [
      ...map(
        (path) => (Array.isArray(path) ? path : [path, {}]),
        concat(configOptions.generators, apiOptions.generators),
      ),
    ],
    rootPath: apiOptions.rootPath || configOptions.rootPath || dirname(configPath),
    configPath,
  };

  options.logger =
    apiOptions.logger || configOptions.logger || loggerFactory(options.quiet ? 'warn' : 'debug');

  if (!options.rootPath) {
    throw new Error('No rootPath specified and none could be inferred');
  }

  return options;
}

module.exports = { buildOptions };
