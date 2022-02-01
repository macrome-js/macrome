import { dirname, resolve } from 'path';
import findUp from 'find-up';
import requireFresh from 'import-fresh';
import { map, concat, execPipe } from 'iter-tools-es';

import { logger } from './utils/logger';
import { groupBy } from './utils/map';
import { expressionMerger, asArray } from './matchable';

export type Options = {
  quiet?: boolean;
  root?: string;
  configPath?: string | null;
  alwaysExclude?: string | string[] | null;
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
  alwaysExclude: string | string[];
  settleTTL: number;
  generators: Map<string, Array<GeneratorStub>>;
};

const alwaysExclude = ['.git', 'node_modules'];

export function buildOptions(apiOptions: Options = {}): BuiltOptions {
  let root: string | null = apiOptions.root ? resolve(apiOptions.root) : null;

  const configPath =
    apiOptions.configPath === null
      ? null
      : findUp.sync(['macrome.config.js', 'macrome.config.cjs'], { cwd: root || process.cwd() }) ||
        null;

  const configOptions: Options = configPath === null ? {} : requireFresh(configPath);

  if (configOptions.configPath) {
    logger.warn('configPath is not a valid option in a config file.');
    delete configOptions.configPath;
  }

  root = root || (configPath && dirname(configPath));

  if (!root) {
    throw new Error('No root specified and none could be inferred');
  }

  const root_ = root;

  const stubs = execPipe(
    concat(configOptions.generators, apiOptions.generators),
    map((path): [string, Record<string, any>] => (Array.isArray(path) ? path : [path, {}])),
    map(([path, options]) => {
      const _options = { ...options, logger };
      const resolvedPath = require.resolve(path, { paths: [root_] });

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
    alwaysExclude: asArray(
      [alwaysExclude, configOptions.alwaysExclude, apiOptions.alwaysExclude].reduce(
        (a, b) => expressionMerger(a, b) as any,
      )!,
    ),
    root,
    configPath,
  };
}
