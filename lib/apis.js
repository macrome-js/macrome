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
exports.MapChangeApi = exports.GeneratorApi = exports.Api = void 0;
const path_1 = require("path");
const operations_1 = require("./operations");
const fs_1 = require("./utils/fs");
const _ = Symbol.for('private members');
class ApiError extends Error {
    constructor(message, verb) {
        super(message);
        this.verb = verb;
    }
}
class Api {
    constructor(macrome) {
        this[_] = { macrome, destroyed: false };
    }
    __assertNotDestroyed(methodName) {
        if (this[_].destroyed) {
            throw new Error(`api.${methodName} cannot be called outside the hook providing the api`);
        }
    }
    destroy() {
        this[_].destroyed = true;
    }
    decorateError(error, verb) {
        return new ApiError(error.message, verb);
    }
    getAnnotations(_destPath) {
        return new Map([['macrome', true]]);
    }
    resolve(path) {
        return this[_].macrome.resolve(path);
    }
    accessorFor(path) {
        return this[_].macrome.accessorFor(path);
    }
    async read(path, options) {
        this.__assertNotDestroyed('read');
        const _a = fs_1.buildReadOptions(options), { encoding = 'utf8' } = _a, _options = __rest(_a, ["encoding"]);
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
        const accessor = this.accessorFor(path);
        const file = {
            header: {
                annotations: this.getAnnotations(path),
            },
            content,
        };
        try {
            await accessor.write(this.resolve(path), file, options);
        }
        catch (e) {
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
    getAnnotations(_destPath) {
        const { generatorPath } = this[_];
        return new Map([...super.getAnnotations(), ['generated-by', `/${generatorPath}`]]);
    }
}
exports.GeneratorApi = GeneratorApi;
class MapApiError extends ApiError {
    constructor(message, verb, generatorPath, destPath) {
        super(message, verb);
        this.generatorPath = generatorPath;
        if (destPath)
            this.destPath = destPath;
    }
}
class MapChangeApi extends GeneratorApi {
    constructor(macrome, generatorPath, changeset) {
        super(macrome, generatorPath);
        this[_].changeset = changeset;
    }
    static fromGeneratorApi(generatorApi, changeset) {
        const { macrome, generatorPath } = generatorApi[_];
        return new MapChangeApi(macrome, generatorPath, changeset);
    }
    decorateError(error, verb) {
        const { generatorPath } = this[_];
        return new MapApiError(error.message, verb, generatorPath);
    }
    getAnnotations(destPath) {
        const { changeset } = this[_];
        const relPath = path_1.relative(path_1.dirname(destPath), changeset.root);
        return new Map([
            ...super.getAnnotations(destPath),
            ['generated-from', relPath.startsWith('.') ? relPath : `./${relPath}`],
        ]);
    }
    async write(path, content, options) {
        const { changeset } = this[_];
        changeset.add({
            path,
            operation: operations_1.UPDATE,
        });
        await super.write(path, content, options);
    }
}
exports.MapChangeApi = MapChangeApi;
