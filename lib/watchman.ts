import type {
  AsymmetricMMatchExpressionWithSuffixes,
  MMatchExpression,
  ReportedChange,
  WatchmanExpression,
} from './types';

import { relative, join, extname } from 'path';
import { Errawr, invariant } from 'errawr';
import { Client as BaseWatchmanClient } from 'fb-watchman';
import * as mm from 'micromatch';
import { when, map, asyncFlatMap, asyncToArray, execPipe } from 'iter-tools-es';

import { stat } from 'fs/promises';
import { recursiveReadFiles } from './utils/fs';

import { logger as baseLogger } from './utils/logger';
import { asArray, mergeMatchers } from './matchable';

const logger = baseLogger.get('macrome:watchman');

const makeMatcher = (expr: MMatchExpression) => {
  return expr ? mm.matcher(asArray(expr).join('|')) : undefined;
};

const compoundExpr = (name: string, ...terms: Array<unknown>) => {
  return terms.length === 0 ? null : [name, terms.length === 1 ? terms[0] : ['anyof', ...terms]];
};

export type QueryOptions = {
  since?: string;
  fields?: Array<string>;
};

export type SubscriptionOptions = QueryOptions & {
  drop?: string | Array<string>;
  defer?: string | Array<string>;
  defer_vcs?: boolean;
};

export type SubscriptionEvent = {
  subscription: string;
  files: Array<any>;
};

type OnEvent = (changes: Array<ReportedChange>) => Promise<unknown>;

const watchmanChangeToMacromeChange = ({
  name: path,
  exists,
  new: new_,
  mtime_ms: mtimeMs,
}: any): ReportedChange => ({
  op: !exists ? 'D' : new_ ? 'A' : 'M',
  path,
  mtimeMs,
});

export class WatchmanSubscription {
  expression: AsymmetricMMatchExpressionWithSuffixes | null;
  name: string;
  onEvent: OnEvent;

  constructor(
    expression: AsymmetricMMatchExpressionWithSuffixes | null,
    subscription: any,
    onEvent: OnEvent,
  ) {
    this.expression = expression;
    this.name = subscription.subscribe;
    this.onEvent = onEvent;

    this.__onEvent = this.__onEvent.bind(this);
  }

  async __onEvent(message: SubscriptionEvent): Promise<void> {
    try {
      const { files, subscription } = message;

      if (files) {
        const files_ = files.map(watchmanChangeToMacromeChange);

        if (subscription && files && files.length) await this.onEvent(files_);
      }
    } catch (e: any) {
      // TODO use new EventEmitter({ captureRejections: true }) once stable
      logger.error('\n' + Errawr.print(e));
    }
  }
}

export class WatchmanClient extends BaseWatchmanClient {
  root: string;
  watchRoot: string;
  subscriptions: Map<string, WatchmanSubscription>;
  private _capabilities: Record<string, boolean> | null = null;

  constructor(root: string) {
    super();
    this.root = root;
    this.watchRoot = null!;
    this.subscriptions = new Map();

    this.on('subscription', (event) => {
      logger.debug('<-', event);
      const subscription = this.subscriptions.get(event.subscription);
      if (subscription) subscription.__onEvent(event);
    });
  }

  get rootRelative(): string | null {
    return this.watchRoot && relative(this.watchRoot, this.root);
  }

  get capabilities(): Record<string, boolean> {
    const capabilities = this._capabilities;
    if (capabilities == null) {
      throw new Error('You must call watchmanClient.version() with the capabilities you may need');
    }
    return capabilities;
  }

  __expressionFrom(
    asymmetric: AsymmetricMMatchExpressionWithSuffixes | null | undefined,
  ): WatchmanExpression {
    const { suffixSet } = this.capabilities;
    const { include, exclude, suffixes = [] } = asymmetric || {};
    const fileExpr = (glob: string) => ['pcre', mm.makeRe(glob).source, 'wholename'];
    // In macrome an excluded directory does not have its files traversed
    // Watchman doesn't work like that, but we can simulate it by matching prefixes
    // That is: if /foo/bar can match /foo/bar/baz, then the /foo/bar directory is fully excluded
    const dirExpr = (glob: string) => {
      const re = mm.makeRe(glob + '/**');
      return ['pcre', re.source, 'wholename'];
    };
    const excludeExpr = compoundExpr('not', ...map(dirExpr, asArray(exclude)));
    const includeExpr = [...map(fileExpr, asArray(include))];
    const suffixExpr = suffixSet
      ? ['suffix', suffixes]
      : suffixes.length
      ? ['anyof', ...suffixes.map((suffix) => ['suffix', suffix])]
      : null;

    return [
      'allof',
      ['type', 'f'],
      ...when(excludeExpr, [excludeExpr]),
      ...when(includeExpr, includeExpr),
      // See https://facebook.github.io/watchman/docs/expr/suffix.html#suffix-set
      ...when(suffixExpr, [suffixExpr]),
    ];
  }

  async command(command: string, ...args: Array<any>): Promise<any> {
    const fullCommand = [command, ...args];

    return await new Promise((resolve, reject) => {
      try {
        logger.debug('->', fullCommand);
        super.command(fullCommand, (err, resp) => {
          if (err) {
            reject(
              new Error(
                `watchman returned an error response. Response:\n${JSON.stringify(
                  (err as any).watchmanResponse,
                  null,
                  2,
                )}\nCommand: ${JSON.stringify(fullCommand, null, 2)}`,
              ),
            );
          } else {
            logger.debug('<-', resp);

            resolve(resp);
          }
        });
      } catch (e: any) {
        e.message += `\nCommand: ${JSON.stringify(fullCommand, null, 2)}`;
        throw e;
      }
    });
  }

  async watchProject(path: string): Promise<any> {
    const resp = await this.command('watch-project', path);
    this.watchRoot = resp.watch;
    return resp;
  }

  async version(
    options: { required?: Array<string>; optional?: Array<string> } = {},
  ): Promise<{ version: string; capabilities: Record<string, boolean> }> {
    const resp = await this.command('version', options);
    this._capabilities = resp.capabilities;
    return resp;
  }

  async clock(): Promise<any> {
    return await this.command('clock', this.watchRoot);
  }

  async query(
    path: string,
    expression?: AsymmetricMMatchExpressionWithSuffixes | null,
    options?: QueryOptions,
  ): Promise<any> {
    invariant(this.watchRoot, 'You must call watchman.watchProject() before watchman.query()');

    const resp = await this.command('query', this.watchRoot, {
      ...options,
      relative_root: relative(this.watchRoot, join(this.root, path)),
      ...when(expression, { expression: this.__expressionFrom(expression) }),
    });

    return {
      ...resp,
      files: resp.files.map(watchmanChangeToMacromeChange),
    };
  }

  async subscribe(
    path: string,
    subscriptionName: string,
    expression: AsymmetricMMatchExpressionWithSuffixes | null,
    options: SubscriptionOptions,
    onEvent: OnEvent,
  ): Promise<WatchmanSubscription> {
    invariant(this.watchRoot, 'You must call watchman.watchProject() before watchman.subscribe()');

    const response = await this.command('subscribe', this.watchRoot, subscriptionName, {
      ...options,
      relative_root: relative(this.watchRoot, join(this.root, path)),
      ...when(expression, () => ({ expression: this.__expressionFrom(expression) })),
    });

    const subscription = new WatchmanSubscription(expression, response, onEvent);

    this.subscriptions.set(subscriptionName, subscription);

    return subscription;
  }
}

// Mimic behavior of watchman's initial build so that `macrome build` does not rely on the watchman service
export async function standaloneQuery(
  root: string,
  expression?: AsymmetricMMatchExpressionWithSuffixes | null,
): Promise<Array<ReportedChange>> {
  const { include, exclude, suffixes } = expression || {};
  const suffixSet = new Set(suffixes);
  const shouldInclude = mergeMatchers(
    (path) => suffixSet.has(extname(path).slice(1)),
    makeMatcher(include),
  );
  const shouldExclude = makeMatcher(exclude);

  return await execPipe(
    recursiveReadFiles(root, { shouldInclude, shouldExclude }),
    asyncFlatMap(async (path) => {
      try {
        const stats = await stat(join(root, path));
        return [
          {
            op: 'A' as const,
            path,
            mtimeMs: Math.floor(stats.mtimeMs),
          },
        ];
      } catch (e) {
        return [];
      }
    }),
    asyncToArray,
  );
}
