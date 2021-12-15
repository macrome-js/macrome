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
Object.defineProperty(exports, "__esModule", { value: true });
exports.standaloneQuery = exports.WatchmanClient = void 0;
const path_1 = require("path");
const errawr_1 = require("errawr");
const fb_watchman_1 = require("fb-watchman");
const mm = __importStar(require("micromatch"));
const iter_tools_es_1 = require("iter-tools-es");
const fs_1 = require("fs");
const fs_2 = require("./utils/fs");
const logger_1 = require("./utils/logger");
const matchable_1 = require("./matchable");
const { stat } = fs_1.promises;
const logger = logger_1.logger.get('watchman');
const makeMatcher = (expr) => {
    return expr ? mm.matcher(matchable_1.asArray(expr).join('|')) : undefined;
};
const compoundExpr = (name, ...terms) => {
    return [name, terms.length === 0 ? [] : terms.length === 1 ? terms[0] : ['anyof', ...terms]];
};
class WatchmanSubscription {
    constructor(subscription, onEvent) {
        this.name = subscription.subscribe;
        this.onEvent = onEvent;
        this.__onEvent = this.__onEvent.bind(this);
    }
    async __onEvent(message) {
        try {
            const { files, subscription } = message;
            const files_ = files.map(({ name: path, exists, new: new_, mtime_ms: mtimeMs }) => ({
                path,
                exists,
                new: new_,
                mtimeMs,
            }));
            if (subscription && files && files.length)
                await this.onEvent(files_);
        }
        catch (e) {
            // TODO use new EventEmitter({ captureRejections: true }) once stable
            logger.error(errawr_1.Errawr.print(e));
        }
    }
}
class WatchmanClient extends fb_watchman_1.Client {
    constructor(root) {
        super();
        this._capabilities = null;
        this.root = root;
        this.watchRoot = null;
        this.subscriptions = new Map();
        this.on('subscription', (event) => {
            logger.debug(event);
            const subscription = this.subscriptions.get(event.subscription);
            if (subscription)
                subscription.__onEvent(event);
        });
    }
    get rootRelative() {
        return this.watchRoot && path_1.relative(this.watchRoot, this.root);
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
        return compoundExpr('allof', compoundExpr('not', ...iter_tools_es_1.map(dirExpr, matchable_1.asArray(exclude))), ...iter_tools_es_1.map(fileExpr, matchable_1.asArray(include)), 
        // See https://facebook.github.io/watchman/docs/expr/suffix.html#suffix-set
        suffixSet
            ? compoundExpr('suffix', ...suffixes)
            : compoundExpr('anyof', ...suffixes.map((suffix) => ['suffix', suffix])));
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
        errawr_1.invariant(!!this.watchRoot, 'You must call watchman.watchProject() before watchman.query()');
        return await this.command('query', this.watchRoot, Object.assign(Object.assign(Object.assign({}, options), { relative_root: path_1.relative(this.watchRoot, path_1.join(this.root, path)) }), iter_tools_es_1.when(expression, { expression: this.__expressionFrom(expression) })));
    }
    async subscribe(path, subscriptionName, expression, options, onEvent) {
        errawr_1.invariant(this.watchRoot, 'You must call watchman.watchProject() before watchman.subscribe()');
        const response = await this.command('subscribe', this.watchRoot, subscriptionName, Object.assign(Object.assign(Object.assign({}, options), { relative_root: path_1.relative(this.watchRoot, path_1.join(this.root, path)) }), iter_tools_es_1.when(expression, { expression: () => this.__expressionFrom(expression) })));
        const subscription = new WatchmanSubscription(response, onEvent);
        this.subscriptions.set(subscriptionName, subscription);
        return subscription;
    }
}
exports.WatchmanClient = WatchmanClient;
// Mimic behavior of watchman's initial build so that `macdrome build` does not rely on the watchman service
async function standaloneQuery(root, expression) {
    const { include, exclude, suffixes } = expression || {};
    const suffixSet = new Set(suffixes);
    const shouldInclude = matchable_1.mergeMatchers((path) => suffixSet.has(path_1.extname(path).slice(1)), makeMatcher(include));
    const shouldExclude = makeMatcher(exclude);
    return await iter_tools_es_1.execPipe(fs_2.recursiveReadFiles(root, { shouldInclude, shouldExclude }), 
    // TODO asyncFlatMapParallel once it's back
    iter_tools_es_1.asyncFlatMap(async (path) => {
        try {
            const stats = await stat(path_1.join(root, path));
            return [
                {
                    path,
                    mtimeMs: stats.mtimeMs,
                    new: false,
                    exists: true,
                },
            ];
        }
        catch (e) {
            return [];
        }
    }), iter_tools_es_1.asyncToArray);
}
exports.standaloneQuery = standaloneQuery;
