"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.standaloneQuery = exports.WatchmanClient = exports.WatchmanSubscription = void 0;
const path_1 = require("path");
const find_up_1 = __importDefault(require("find-up"));
const errawr_1 = require("errawr");
const fb_watchman_1 = require("fb-watchman");
const mm = __importStar(require("micromatch"));
const iter_tools_es_1 = require("iter-tools-es");
const promises_1 = require("fs/promises");
const fs_1 = require("./utils/fs");
const logger_1 = require("./utils/logger");
const matchable_1 = require("./matchable");
const logger = logger_1.logger.get('macrome:watchman');
const makeMatcher = (expr) => {
    return expr ? mm.matcher(`(${(0, matchable_1.asArray)(expr).join('|')})`) : undefined;
};
const makeExcludeMatcher = (expr) => {
    // allow patterns with no trailing slash to exclude directories
    // patterns with trailing / still cannot exclude files though
    return expr
        ? mm.matcher('(' +
            (0, matchable_1.asArray)(expr)
                .map((expr) => (expr.endsWith('/') ? expr : `${expr}?(\\/)`))
                .join('|') +
            ')')
        : undefined;
};
const compoundExpr = (name, ...terms) => {
    return terms.length === 0 ? null : [name, terms.length === 1 ? terms[0] : ['anyof', ...terms]];
};
const watchmanChangeToMacromeChange = ({ name: path, exists, new: new_, mtime_ms: mtimeMs, }) => ({
    op: !exists ? 'D' : new_ ? 'A' : 'M',
    path,
    mtimeMs,
});
class WatchmanSubscription {
    constructor(expression, 
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    subscription, onEvent) {
        this.expression = expression;
        this.name = subscription.subscribe;
        this.onEvent = onEvent;
        this.__onEvent = this.__onEvent.bind(this);
    }
    async __onEvent(message) {
        try {
            const { files, subscription } = message;
            if (files) {
                const files_ = files.map(watchmanChangeToMacromeChange);
                if (subscription && files && files.length)
                    await this.onEvent(files_);
            }
        }
        catch (e) {
            // TODO use new EventEmitter({ captureRejections: true }) once stable
            logger.error('\n' + errawr_1.Errawr.print(e));
        }
    }
}
exports.WatchmanSubscription = WatchmanSubscription;
class WatchmanClient extends fb_watchman_1.Client {
    constructor(root) {
        super();
        this._capabilities = null;
        this.root = root;
        this.watchRoot = null;
        this.subscriptions = new Map();
        this.on('subscription', (event) => {
            logger.debug('<-', event);
            const subscription = this.subscriptions.get(event.subscription);
            if (subscription)
                subscription.__onEvent(event);
        });
    }
    get rootRelative() {
        return this.watchRoot && (0, path_1.relative)(this.watchRoot, this.root);
    }
    get capabilities() {
        const capabilities = this._capabilities;
        if (capabilities == null) {
            throw new Error('You must call watchmanClient.version() with the capabilities you may need');
        }
        return capabilities;
    }
    __expressionFrom(asymmetric) {
        const { suffixSet } = this.capabilities;
        const { include, exclude, suffixes = [] } = asymmetric || {};
        const fileExpr = (glob) => ['pcre', mm.makeRe(glob).source, 'wholename'];
        // In macrome an excluded directory does not have its files traversed
        // Watchman doesn't work like that, but we can simulate it by matching prefixes
        // That is: if /foo/bar can match /foo/bar/baz, then the /foo/bar directory is fully excluded
        const dirExpr = (glob) => {
            const re = mm.makeRe(glob + '/**');
            return ['pcre', re.source, 'wholename'];
        };
        const excludeExpr = compoundExpr('not', ...(0, iter_tools_es_1.map)(dirExpr, (0, matchable_1.asArray)(exclude)));
        const includeExpr = [...(0, iter_tools_es_1.map)(fileExpr, (0, matchable_1.asArray)(include))];
        const suffixExpr = suffixSet
            ? ['suffix', suffixes]
            : suffixes.length
                ? ['anyof', ...suffixes.map((suffix) => ['suffix', suffix])]
                : null;
        return [
            'allof',
            ['type', 'f'],
            ...(0, iter_tools_es_1.when)(excludeExpr, [excludeExpr]),
            ...(0, iter_tools_es_1.when)(includeExpr, includeExpr),
            // See https://facebook.github.io/watchman/docs/expr/suffix.html#suffix-set
            ...(0, iter_tools_es_1.when)(suffixExpr, [suffixExpr]),
        ];
    }
    async command(command, ...args) {
        const fullCommand = [command, ...args];
        return await new Promise((resolve, reject) => {
            try {
                logger.debug('->', fullCommand);
                super.command(fullCommand, (err, resp) => {
                    if (err) {
                        reject(new Error(`watchman returned an error response. Response:\n${JSON.stringify(err.watchmanResponse, null, 2)}\nCommand: ${JSON.stringify(fullCommand, null, 2)}`));
                    }
                    else {
                        logger.debug('<-', resp);
                        resolve(resp);
                    }
                });
            }
            catch (e) {
                e.message += `\nCommand: ${JSON.stringify(fullCommand, null, 2)}`;
                throw e;
            }
        });
    }
    async watchProject(path) {
        const resp = await this.command('watch-project', path);
        this.watchRoot = resp.watch;
        return resp;
    }
    async version(options = {}) {
        const resp = await this.command('version', options);
        this._capabilities = resp.capabilities;
        return resp;
    }
    async clock() {
        return await this.command('clock', this.watchRoot);
    }
    async query(path, expression, options) {
        (0, errawr_1.invariant)(this.watchRoot, 'You must call watchman.watchProject() before watchman.query()');
        const resp = await this.command('query', this.watchRoot, Object.assign(Object.assign(Object.assign({}, options), { relative_root: (0, path_1.relative)(this.watchRoot, (0, path_1.join)(this.root, path)) }), (0, iter_tools_es_1.when)(expression, { expression: this.__expressionFrom(expression) })));
        return Object.assign(Object.assign({}, resp), { files: resp.files.map(watchmanChangeToMacromeChange) });
    }
    async subscribe(path, subscriptionName, expression, options, onEvent) {
        (0, errawr_1.invariant)(this.watchRoot, 'You must call watchman.watchProject() before watchman.subscribe()');
        const response = await this.command('subscribe', this.watchRoot, subscriptionName, Object.assign(Object.assign(Object.assign({}, options), { relative_root: (0, path_1.relative)(this.watchRoot, (0, path_1.join)(this.root, path)) }), (0, iter_tools_es_1.when)(expression, () => ({ expression: this.__expressionFrom(expression) }))));
        const subscription = new WatchmanSubscription(expression, response, onEvent);
        this.subscriptions.set(subscriptionName, subscription);
        return subscription;
    }
}
exports.WatchmanClient = WatchmanClient;
const getWatchmanIgnoreDirs = async (root) => {
    const watchmanConfigPath = await (0, find_up_1.default)('.watchmanconfig', { cwd: root });
    if (!watchmanConfigPath)
        return;
    const watchmanConfig = JSON.parse(await (0, promises_1.readFile)(watchmanConfigPath, 'utf-8'));
    const ignoreDirs = watchmanConfig.ignore_dirs;
    const rootRelative = (0, path_1.relative)((0, path_1.dirname)(watchmanConfigPath), root);
    if (!ignoreDirs || !ignoreDirs.length)
        return;
    return new Set(ignoreDirs.map((path) => (0, path_1.join)(rootRelative, path.endsWith('/') ? path : `${path}/`)));
};
// Mimic behavior of watchman's initial build so that `macrome build` does not rely on the watchman service
async function standaloneQuery(root, expression) {
    const { include, exclude, suffixes } = expression || {};
    const suffixSet = new Set(suffixes);
    const watchmanIgnoreDirs = await getWatchmanIgnoreDirs(root);
    const watchmanIgnoreMatcher = watchmanIgnoreDirs && ((path) => watchmanIgnoreDirs.has(path));
    const shouldInclude = (0, matchable_1.mergeMatchers)((path) => suffixSet.has((0, path_1.extname)(path).slice(1)), makeMatcher(include));
    const shouldExclude = (0, matchable_1.mergeExcludeMatchers)(watchmanIgnoreMatcher, makeExcludeMatcher(exclude));
    return await (0, iter_tools_es_1.execPipe)((0, fs_1.recursiveReadFiles)(root, { shouldInclude, shouldExclude }), (0, iter_tools_es_1.asyncFlatMap)(async (path) => {
        try {
            const stats = await (0, promises_1.stat)((0, path_1.join)(root, path));
            return [
                {
                    op: 'A',
                    path,
                    mtimeMs: Math.floor(stats.mtimeMs),
                },
            ];
        }
        catch (e) {
            return [];
        }
    }), iter_tools_es_1.asyncToArray);
}
exports.standaloneQuery = standaloneQuery;
