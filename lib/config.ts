import { join, dirname, resolve } from 'path';
import findUp from 'find-up';
import requireFresh from 'import-fresh';
import { map, concat, execPipe } from 'iter-tools-es';

import { logger as baseLogger } from './utils/logger';
import { groupBy } from './utils/map';
import { expressionMerger, asArray } from './matchable';
import { statSync } from 'fs';

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

const logger = baseLogger.get('macrome:config');

const alwaysExclude = ['.git/', 'node_modules/'];

const stat = (path: string) => statSync(path, { throwIfNoEntry: false });

const getRequirePath = (base: string): string => {
  const root = stat(base);

  if (root && root.isDirectory()) {
    const pkg = join(base, 'package.json');
    if (stat(pkg)) return pkg;

    const indexCjs = join(base, 'index.cjs');
    if (stat(indexCjs)) return indexCjs;
  }

  return base;
};

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

      const resolvedPath = require.resolve(
        getRequirePath(path.startsWith('.') ? resolve(root_, path) : path),
        {
          paths: [root_],
        },
      );

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
