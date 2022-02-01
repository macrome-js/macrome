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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapChangeApi = exports.GeneratorApi = exports.Api = exports.ApiError = void 0;
const errawr_1 = require("errawr");
const path_1 = require("path");
const promises_1 = require("fs/promises");
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
    get macrome() {
        return this[_].macrome;
    }
    get destroyed() {
        return this[_].destroyed;
    }
    destroy() {
        this[_].destroyed = true;
    }
    decorateError(error, verb) {
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
        return `throw new Error(${JSON.stringify(error.stack || error)});`;
    }
    resolve(path) {
        return this[_].macrome.resolve(path);
    }
    accessorFor(path) {
        return this[_].macrome.accessorFor(path);
    }
    async getAnnotations(path, options) {
        return await this[_].macrome.getAnnotations(path, options);
    }
    async read(path, options) {
        this.__assertNotDestroyed('read');
        const _a = fs_1.buildOptions(options), { encoding = 'utf8' } = _a, _options = __rest(_a, ["encoding"]);
        const accessor = this.accessorFor(path);
        try {
            const result = await accessor.read(this.resolve(path), Object.assign({ encoding }, _options));
            return result.content;
        }
        catch (e) {
            throw this.decorateError(e, 'read');
        }
    }
    async write(path, content, options = {}) {
        this.__assertNotDestroyed('write');
        const annotations = content instanceof Error ? this.buildErrorAnnotations(path) : this.buildAnnotations(path);
        const { macrome } = this[_];
        const accessor = this.accessorFor(path);
        if (!accessor) {
            throw new errawr_1.Errawr(errawr_1.rawr('macrome has no accessor for writing to {ext} files'), {
                info: { ext: path_1.extname(path), path },
            });
        }
        const file = {
            header: {
                annotations,
            },
            content: content instanceof Error ? this.buildErrorContent(content) : content,
        };
        const before = Date.now();
        let fd;
        try {
            fd = await promises_1.open(this.resolve(path), 'a+');
            const mtimeMs = Math.floor((await fd.stat()).mtimeMs);
            // -100 because Travis showed a 3ms discrepancy for reasons unknown
            // Is there a better way to implement this?
            const new_ = mtimeMs >= before - 100;
            let annotations = null;
            if (!new_) {
                annotations = await accessor.readAnnotations(this.resolve(path), { fd });
                if (annotations === null) {
                    throw new errawr_1.Errawr(errawr_1.rawr('macrome cannot overwrite non-generated {path}'), {
                        info: { path, mtimeMs, before },
                    });
                }
            }
            await fd.truncate();
            await accessor.write(path, file, Object.assign(Object.assign({}, fs_1.buildOptions(options)), { fd }));
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
                    path,
                    mtimeMs,
                },
                annotations,
            });
        }
        catch (e) {
            await (fd === null || fd === void 0 ? void 0 : fd.close());
            throw this.decorateError(e, 'write');
        }
    }
    async generate(path, cb) {
        let content;
        try {
            content = await cb(path);
        }
        catch (e) {
            logger.warn(`Failed generating {path: ${path}}`);
            content = asError(e);
        }
        await this.write(path, content);
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
        return new Map([
            ...super.buildAnnotations(),
            ['generatedby', `/${generatorPath}`],
        ]);
    }
    buildErrorAnnotations(_destPath) {
        const { generatorPath } = this[_];
        return new Map([
            ...super.buildErrorAnnotations(),
            ['generatedby', `/${generatorPath}`],
        ]);
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
    decorateError(error, verb) {
        const { generatorPath, change } = this[_];
        return new ApiError(errawr_1.rawr('macrome {{verb}} failed', { rest: true }), {
            cause: error,
            info: { verb, generator: generatorPath, change: change.reported },
        });
    }
    buildAnnotations(destPath) {
        const { path } = this.change;
        const relPath = path_2.printRelative(path_1.relative(path_1.dirname(destPath), path));
        return new Map([
            ...super.buildAnnotations(destPath),
            ['generatedfrom', `${relPath}#${this.version}`],
        ]);
    }
    buildErrorAnnotations(destPath) {
        const { path } = this.change;
        const relPath = path_2.printRelative(path_1.relative(path_1.dirname(destPath), path));
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
}
exports.MapChangeApi = MapChangeApi;
