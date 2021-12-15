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
const fs_1 = require("fs");
const fs_2 = require("./utils/fs");
const { open } = fs_1.promises;
const _ = Symbol.for('private members');
class ApiError extends errawr_1.Errawr {
    get name() {
        return 'ApiError';
    }
}
exports.ApiError = ApiError;
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
        const _a = fs_2.buildOptions(options), { encoding = 'utf8' } = _a, _options = __rest(_a, ["encoding"]);
        const accessor = this.accessorFor(path);
        try {
            const result = await accessor.read(this.resolve(path), Object.assign({ encoding }, _options));
            return result.content;
        }
        catch (e) {
            throw this.decorateError(e, 'read');
        }
    }
    async write(path, content, options) {
        this.__assertNotDestroyed('write');
        const { macrome } = this[_];
        const accessor = this.accessorFor(path);
        const file = {
            header: {
                annotations: this.buildAnnotations(path),
            },
            content,
        };
        const now = Date.now();
        let fd;
        try {
            fd = await open(this.resolve(path), 'a+');
            const { mtimeMs } = await fd.stat();
            const new_ = mtimeMs > now; // is there a better way to implement this?
            let annotations = null;
            if (!new_) {
                // if I make this read from the annotations cache
                annotations = await accessor.readAnnotations(this.resolve(path), { fd });
                if (annotations === null) {
                    throw new Error('macrome will not overwrite non-generated files');
                }
            }
            await fd.truncate();
            await accessor.write(path, file, Object.assign(Object.assign({}, fs_2.buildOptions(options)), { fd }));
            await fd.close();
            // We could wait for the watcher to do this, but there are two reasons we don't:
            // First there may not be a watcher, and we want things to work basically the same way when
            // the watcher is and is not present. Second we want to ensure that our causally linked
            // changes are always batched so that we can detect non-terminating cycles.
            await macrome.enqueue({
                path,
                exists: true,
                new: new_,
                mtimeMs,
            });
        }
        catch (e) {
            await (fd === null || fd === void 0 ? void 0 : fd.close());
            throw this.decorateError(e, 'write');
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
        return new Map([
            ...super.buildAnnotations(),
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
    decorateError(error, verb) {
        const { generatorPath, change } = this[_];
        return new ApiError(errawr_1.rawr('macrome {{verb}} failed', { rest: true }), {
            cause: error,
            info: { verb, generator: generatorPath, change },
        });
    }
    buildAnnotations(destPath) {
        const { macrome } = this[_];
        const relPath = path_1.relative(path_1.dirname(destPath), this.change.path);
        return new Map([
            ...super.buildAnnotations(destPath),
            ['generatedfrom', relPath.startsWith('.') ? relPath : `./${relPath}`],
        ]);
    }
}
exports.MapChangeApi = MapChangeApi;
