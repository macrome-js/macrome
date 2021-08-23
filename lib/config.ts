import { dirname } from 'path';
import findUp from 'find-up';
import requireFresh from 'import-fresh';
import { map, concat, execPipe } from 'iter-tools-es';

import { logger } from './utils/logger';
import { groupBy } from './utils/map';

export type Options = {
  quiet?: boolean;
  root?: string;
  configPath?: string;
  alwaysIgnored?: string | Array<string>;
  settleTTL?: number;
  generators?: Array<string | [string, Record<string, any>]>;
};

export type GeneratorStub = {
  options: Record<string, any>;
  path: string;
  resolvedPath: string;
};

export type BuiltOptions = {
  quiet: boolean;
  root: string;
  configPath: string | null;
  alwaysIgnored: Array<string>;
  settleTTL: number;
  generators: Map<string, Array<GeneratorStub>>;
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

  const stubs = execPipe(
    concat(configOptions.generators, apiOptions.generators),
    map((path): [string, Record<string, any>] => (Array.isArray(path) ? path : [path, {}])),
    map(([path, options]) => {
      const _options = { ...options, logger };
      const resolvedPath = require.resolve(path, { paths: [root] });

      return { options: _options, path, resolvedPath };
    }),
  );

  const generators = groupBy((stub) => stub.resolvedPath, stubs);

  return {
    quiet: false,
    settleTTL: 20,
    ...configOptions,
    ...apiOptions,
    generators,
    alwaysIgnored: [
      ...alwaysIgnored,
      ...asArray(configOptions.alwaysIgnored),
      ...asArray(apiOptions.alwaysIgnored),
    ],
    root,
    configPath,
  };
}
