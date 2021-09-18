"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.standaloneQuery = exports.WatchmanClient = exports.symmetricExpressionFromAsymmetric = exports.matchExpr = void 0;
const path_1 = require("path");
const invariant_1 = __importDefault(require("invariant"));
const fb_watchman_1 = require("fb-watchman");
const iter_tools_es_1 = require("iter-tools-es");
const fs_1 = require("fs");
const fs_2 = require("./utils/fs");
const logger_1 = require("./utils/logger");
const expression_engine_1 = require("./expression-engine");
const { stat } = fs_1.promises;
const logger = logger_1.logger.get('watchman');
const matchSettings = {
    includedotfiles: true,
};
const matchExpr = (expr) => [
    ...expr,
    'wholename',
    matchSettings,
];
exports.matchExpr = matchExpr;
function noneOf(files) {
    const files_ = files && [...files];
    return files_ && files_.length ? [['not', ['anyof', ...files_]]] : [];
}
function symmetricExpressionFromAsymmetric(asymmetric) {
    const { include, exclude } = asymmetric;
    return ['allof', ...noneOf(exclude), ...iter_tools_es_1.map(fileExpr, include)];
}
exports.symmetricExpressionFromAsymmetric = symmetricExpressionFromAsymmetric;
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
            logger.error(e.stack);
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
        invariant_1.default(this.watchRoot, 'You must call watchman.watchProject() before watchman.query()');
        return await this.command('query', this.watchRoot, Object.assign(Object.assign(Object.assign({}, options), { relative_root: path_1.relative(this.watchRoot, path_1.join(this.root, path)) }), iter_tools_es_1.when(expression, { expression })));
    }
    async subscribe(path, subscriptionName, expression, options, onEvent) {
        invariant_1.default(this.watchRoot, 'You must call watchman.watchProject() before watchman.subscribe()');
        const response = await this.command('subscribe', this.watchRoot, subscriptionName, Object.assign(Object.assign(Object.assign({}, options), { relative_root: path_1.relative(this.watchRoot, path_1.join(this.root, path)) }), iter_tools_es_1.when(expression, { expression: _something })));
        const subscription = new WatchmanSubscription(response, onEvent);
        this.subscriptions.set(subscriptionName, subscription);
        return subscription;
    }
}
exports.WatchmanClient = WatchmanClient;
// Mimic behavior of watchman's initial build so that `macdrome build` does not rely on the watchman service
async function standaloneQuery(root, expression) {
    const { include, exclude } = expression || {};
    return await iter_tools_es_1.execPipe(fs_2.recursiveReadFiles(root, {
        shouldInclude: expression_engine_1.getMatcher(include),
        shouldExclude: expression_engine_1.getMatcher(exclude),
    }), 
    // TODO asyncFlatMapParallel once it's back
    iter_tools_es_1.asyncFlatMap(async (path) => {
        try {
            const stats = await stat(path);
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
