import { dirname } from 'path';
import findUp from 'find-up';
import requireFresh from 'import-fresh';
import { map, concat } from 'iter-tools-es';

import { logger } from './utils/logger';

export type Options = {
  quiet?: boolean;
  root?: string;
  configPath?: string;
  alwaysIgnored?: string | Array<string>;
  generators?: Array<string | [string, Record<string, any>]>;
};

export type BuiltOptions = {
  quiet: boolean;
  root: string;
  configPath: string | null;
  alwaysIgnored?: Array<string>;
  generators: Array<[string, Record<string, any>]>;
};

const alwaysIgnored = ['.git', 'node_modules'];

function asArray(glob?: string | Array<string>): Array<string> {
  return Array.isArray(glob) ? glob : glob ? [glob] : [];
}

export function buildOptions(apiOptions: Options = {}): BuiltOptions {
  const configPath =
    apiOptions.configPath === null
      ? null
      : findUp.sync('macrome.config.js', { cwd: process.cwd() }) || null;

  const configOptions: Options = configPath === null ? {} : requireFresh(configPath);

  if (configOptions.configPath) {
    logger.warn('configPath is not a valid option in a config file.');
    delete configOptions.configPath;
  }

  const root = apiOptions.root || configOptions.root || (configPath && dirname(configPath));

  if (!root) {
    throw new Error('No root specified and none could be inferred');
  }

  return {
    quiet: false,
    ...configOptions,
    ...apiOptions,
    generators: [
      ...map(
        (path): [string, Record<string, any>] => (Array.isArray(path) ? path : [path, {}]),
        concat(configOptions.generators, apiOptions.generators),
      ),
    ],
    alwaysIgnored: [
      ...alwaysIgnored,
      ...asArray(configOptions.alwaysIgnored),
      ...asArray(apiOptions.alwaysIgnored),
    ],
    root,
    configPath,
  };
}
