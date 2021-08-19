"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WatchmanClient = exports.expressionFromMatchable = void 0;
const path_1 = require("path");
const invariant_1 = __importDefault(require("invariant"));
const fb_watchman_1 = require("fb-watchman");
const iter_tools_es_1 = require("iter-tools-es");
const logger_1 = require("./utils/logger");
const logger = logger_1.logger.get('watchman');
const matchSettings = {
    includedotfiles: true,
    noescape: true,
};
function noneOf(files) {
    const files_ = [...files];
    return files_ && files_.length ? [['not', ['anyof', ...files_]]] : [];
}
function expressionFromMatchable(matchable) {
    const { files, excludeFiles } = matchable;
    const fileExpr = (glob) => ['match', glob, 'wholename', matchSettings];
    return ['allof', ['type', 'f'], ...noneOf(iter_tools_es_1.map(fileExpr, excludeFiles)), ...iter_tools_es_1.map(fileExpr, files)];
}
exports.expressionFromMatchable = expressionFromMatchable;
class WatchmanSubscription {
    constructor(subscription, onEvent) {
        this.name = subscription.subscribe;
        this.onEvent = onEvent;
        this.__onEvent = this.__onEvent.bind(this);
    }
    async __onEvent(message) {
        try {
            const { files, subscription } = message;
            if (subscription && files && files.length)
                await this.onEvent(files);
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
    async watchProject(path) {
        const resp = await this.command('watch-project', path);
        this.watchRoot = resp.watch;
        return resp;
    }
    async version(options = {}) {
        return await this.command('version', options);
    }
    async clock() {
        return await this.command('clock', this.watchRoot);
    }
    async flushSubscriptions(options = { sync_timeout: 2000 }) {
        return await this.command('flush-subscriptions', this.watchRoot, options);
    }
    async subscribe(path, subscriptionName, options, onEvent) {
        const { expression } = options, options_ = __rest(options, ["expression"]);
        invariant_1.default(this.watchRoot, 'You must call macrome.watchProject() before macrome.subscribe()');
        const response = await this.command('subscribe', this.watchRoot, subscriptionName, Object.assign(Object.assign(Object.assign({}, options_), { relative_root: path_1.relative(this.watchRoot, path_1.join(this.root, path)) }), iter_tools_es_1.when(expression, { expression })));
        const subscription = new WatchmanSubscription(response, onEvent);
        this.subscriptions.set(subscriptionName, subscription);
        return subscription;
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
}
exports.WatchmanClient = WatchmanClient;
