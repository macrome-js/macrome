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
exports.MapChangeApi = exports.GeneratorApi = exports.Api = exports.ApiError = void 0;
const path_1 = require("path");
const promises_1 = require("fs/promises");
const errawr_1 = require("errawr");
const iter_tools_es_1 = require("iter-tools-es");
const strip_ansi_1 = __importDefault(require("strip-ansi"));
const fs_1 = require("./utils/fs");
const path_2 = require("./utils/path");
const logger_1 = require("./utils/logger");
const _ = Symbol.for('private members');
const logger = logger_1.logger.get('macrome:api');
class ApiError extends errawr_1.Errawr {
    get name() {
        return 'ApiError';
    }
}
exports.ApiError = ApiError;
const asError = (e) => {
    if (e instanceof Error)
        return e;
    else {
        const error = new Error(e);
        // We don't know where this came from, but it wasn't really here
        error.stack = undefined;
        return error;
    }
};
/**
 * Api is a facade over the Macrome class which exposes the functionality which should be accessible to generators
 */
class Api {
    constructor(macrome) {
        this[_] = { macrome, destroyed: false };
    }
    __assertNotDestroyed(methodName) {
        if (this[_].destroyed) {
            throw new Error(`api.${methodName} cannot be called outside the hook providing the api`);
        }
    }
    get destroyed() {
        return this[_].destroyed;
    }
    __destroy() {
        this[_].destroyed = true;
    }
    __decorateError(error, verb) {
        return new ApiError(`macrome ${verb} failed`, { cause: error });
    }
    buildAnnotations(_destPath) {
        return new Map([['macrome', true]]);
    }
    buildErrorAnnotations(_destPath) {
        return new Map([
            ['macrome', true],
            ['generatefailed', true],
        ]);
    }
    buildErrorContent(error) {
        const stack = error.stack || String(error);
        const escaped = (0, strip_ansi_1.default)(stack.replace(/\\/g, '\\\\').replace(/`/g, '\\`'));
        return `throw new Error(\`${escaped}\`);`;
    }
    resolve(path) {
        return this[_].macrome.resolve(path);
    }
    async readAnnotations(path, options) {
        return await this[_].macrome.readAnnotations(path, options);
    }
    async read(path, options) {
        const { macrome } = this[_];
        this.__assertNotDestroyed('read');
        const _a = (0, fs_1.buildOptions)(options), { encoding = 'utf8' } = _a, _options = __rest(_a, ["encoding"]);
        const accessor = macrome.accessorFor(path);
        try {
            const result = await accessor.read(this.resolve(path), Object.assign({ encoding }, _options));
            return result.content;
        }
        catch (e) {
            throw this.__decorateError(e, 'read');
        }
    }
    async write(path, content, options = {}) {
        const { macrome } = this[_];
        this.__assertNotDestroyed('write');
        const relPath = macrome.relative(path);
        const absPath = macrome.resolve(path);
        const annotations = content instanceof Error
            ? this.buildErrorAnnotations(relPath)
            : this.buildAnnotations(relPath);
        const accessor = macrome.accessorFor(relPath);
        if (!accessor) {
            throw new errawr_1.Errawr((0, errawr_1.rawr)('macrome has no accessor for writing to {ext} files'), {
                info: { ext: (0, path_1.extname)(relPath), relPath },
            });
        }
        await (0, promises_1.mkdir)((0, path_1.dirname)(relPath), { recursive: true });
        const file = {
            header: {
                annotations,
            },
            content: content instanceof Error ? this.buildErrorContent(content) : content,
        };
        const before = Date.now();
        let fd;
        try {
            fd = await (0, promises_1.open)(absPath, 'a+');
            const mtimeMs = Math.floor((await fd.stat()).mtimeMs);
            // -100 because Travis showed a 3ms discrepancy for reasons unknown
            // Is there a better way to implement this?
            const new_ = mtimeMs >= before - 100;
            let annotations = null;
            if (!new_) {
                annotations = await macrome.readAnnotations(relPath, { fd });
                if (annotations === null) {
                    throw new errawr_1.Errawr((0, errawr_1.rawr)('macrome cannot overwrite non-generated {path}'), {
                        code: 'macrome-would-overwrite-source',
                        info: { path: relPath, mtimeMs, before },
                    });
                }
            }
            await fd.truncate();
            await accessor.write(absPath, file, Object.assign(Object.assign({}, (0, fs_1.buildOptions)(options)), { fd }));
            await fd.close();
            // We could wait for the watcher to do this, but there are two reasons we don't:
            // First there may not be a watcher, and we want things to work basically the same way when
            // the watcher is and is not present. Second we want to ensure that our causally linked
            // changes are always batched so that we can detect non-terminating cycles.
            const op = new_ ? 'A' : 'M';
            macrome.enqueue({
                op,
                reported: {
                    op,
                    path: relPath,
                    mtimeMs,
                },
                annotations,
            });
        }
        catch (e) {
            await (fd === null || fd === void 0 ? void 0 : fd.close());
            throw this.__decorateError(e, 'write');
        }
    }
    async generate(path, ...args) {
        let deps = {};
        let cb;
        if (args.length <= 1) {
            cb = args[0];
        }
        else {
            deps = args[0];
            cb = args[1];
        }
        return await this.__generate(path, deps, cb);
    }
    async __generate(destPath, deps, cb) {
        const { macrome } = this[_];
        for (const dep of (0, iter_tools_es_1.objectValues)(deps)) {
            (0, errawr_1.invariant)(dep instanceof Promise, 'deps argument to api.generate must be {[key]: string => Promise}');
        }
        let content = null;
        try {
            const props = { destPath };
            for (const [name, dep] of (0, iter_tools_es_1.objectEntries)(deps)) {
                props[name] = await dep;
            }
            content = await cb(props);
        }
        catch (e) {
            logger.warn(`Failed generating {destPath: ${macrome.relative(destPath)}}`);
            content = asError(e);
        }
        if (content != null) {
            await this.write(destPath, content);
        }
    }
}
exports.Api = Api;
class GeneratorApi extends Api {
    constructor(macrome, generatorPath) {
        super(macrome);
        this[_].generatorPath = generatorPath;
    }
    static fromApi(api, generatorPath) {
        const { macrome } = api[_];
        return new GeneratorApi(macrome, generatorPath);
    }
    get generatorPath() {
        return this[_].generatorPath;
    }
    buildAnnotations(_destPath) {
        const { generatorPath } = this[_];
        return new Map([...super.buildAnnotations(), ['generatedby', generatorPath]]);
    }
    buildErrorAnnotations(_destPath) {
        const { generatorPath } = this[_];
        return new Map([...super.buildErrorAnnotations(), ['generatedby', generatorPath]]);
    }
}
exports.GeneratorApi = GeneratorApi;
class MapChangeApi extends GeneratorApi {
    constructor(macrome, generatorPath, change) {
        super(macrome, generatorPath);
        this[_].change = change;
    }
    static fromGeneratorApi(generatorApi, change) {
        const { macrome, generatorPath } = generatorApi[_];
        return new MapChangeApi(macrome, generatorPath, change);
    }
    get change() {
        return this[_].change;
    }
    get version() {
        return String(this.change.reported.mtimeMs);
    }
    __decorateError(error, verb) {
        const { generatorPath, change } = this[_];
        return new ApiError((0, errawr_1.rawr)('macrome {{verb}} failed', { rest: true }), {
            cause: error,
            info: { verb, generator: generatorPath, change: change.reported },
        });
    }
    buildAnnotations(destPath) {
        const { path } = this.change;
        const relPath = (0, path_2.printRelative)((0, path_1.relative)((0, path_1.dirname)(destPath), path));
        return new Map([
            ...super.buildAnnotations(destPath),
            ['generatedfrom', `${relPath}#${this.version}`],
        ]);
    }
    buildErrorAnnotations(destPath) {
        const { path } = this.change;
        const relPath = (0, path_2.printRelative)((0, path_1.relative)((0, path_1.dirname)(destPath), path));
        return new Map([
            ...super.buildErrorAnnotations(destPath),
            ['generatedfrom', `${relPath}#${this.version}`],
        ]);
    }
    async write(path, content, options) {
        const { state } = this.change;
        await super.write(path, content, options);
        if (state)
            state.generatedPaths.add(path);
    }
    async __generate(destPath, deps, cb) {
        const { macrome, change } = this[_];
        let handle;
        try {
            handle = await (0, promises_1.open)(destPath, 'r');
            const stats = await handle.stat();
            const targetMtime = Math.floor(stats.mtimeMs);
            const targetAnnotations = await this.readAnnotations(destPath, { fd: handle });
            const targetGeneratedFrom = targetAnnotations === null || targetAnnotations === void 0 ? void 0 : targetAnnotations.get('generatedfrom');
            if (targetGeneratedFrom) {
                const [fromPath, version] = targetGeneratedFrom.split('#');
                if (this.resolve(change.path) === (0, path_1.resolve)((0, path_1.dirname)(this.resolve(destPath)), fromPath) &&
                    String(change.reported.mtimeMs) === version) {
                    // The target is already generated from this version of this source
                    if (change.op === 'A') {
                        // Since we are not generating the target, make sure its info is loaded
                        macrome.state.set(destPath, {
                            mtimeMs: targetMtime,
                            annotations: targetAnnotations,
                            generatedPaths: new Set(),
                        });
                    }
                    return;
                }
            }
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
        finally {
            handle === null || handle === void 0 ? void 0 : handle.close();
        }
        const destPath_ = destPath.startsWith('.')
            ? (0, path_1.resolve)((0, path_1.dirname)(this.change.path), destPath)
            : destPath;
        return super.__generate(destPath_, deps, cb);
    }
}
exports.MapChangeApi = MapChangeApi;
