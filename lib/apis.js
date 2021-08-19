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
exports.MapChangeApi = exports.StaticApi = void 0;
const path_1 = require("path");
const operations_1 = require("./operations");
const fs_1 = require("./utils/fs");
const _ = Symbol.for('private members');
class Api {
    constructor() {
        this[_] = { destroyed: false };
    }
    __assertNotDestroyed(methodName) {
        if (this[_].destroyed) {
            throw new Error(`api.${methodName} cannot be called outside the hook providing the api`);
        }
    }
    __destroy() {
        this[_].destroyed = true;
    }
}
class StaticApi extends Api {
    constructor(macrome, generatorPath) {
        super();
        this[_].macrome = macrome;
        this[_].generatorPath = generatorPath;
    }
    resolve(path) {
        return this[_].macrome.resolve(path);
    }
    accessorFor(path) {
        return this[_].macrome.accessorFor(path);
    }
    getAnnotations(_destPath) {
        const { generatorPath } = this[_];
        return new Map([
            ['macrome', true],
            ['generated-by', generatorPath],
        ]);
    }
    async read(path, options) {
        const _a = fs_1.buildReadOptions(options), { encoding = 'utf8' } = _a, _options = __rest(_a, ["encoding"]);
        const accessor = this.accessorFor(path);
        const result = await accessor.read(this.resolve(path), Object.assign({ encoding }, _options));
        return result.content;
    }
    async write(path, content, options) {
        const accessor = this.accessorFor(path);
        await accessor.write(this.resolve(path), {
            header: {
                annotations: this.getAnnotations(path),
            },
            content,
        }, options);
    }
}
exports.StaticApi = StaticApi;
class MapError extends Error {
    constructor(message, generatorPath, verb, destPath) {
        super(message);
        this.generatorPath = generatorPath;
        this.verb = verb;
        if (destPath)
            this.destPath = destPath;
    }
}
class MapChangeApi extends StaticApi {
    constructor(macrome, generatorPath, changeset) {
        super(macrome, generatorPath);
        this[_].changeset = changeset;
    }
    getAnnotations(destPath) {
        const { changeset } = this[_];
        const relPath = path_1.relative(path_1.dirname(destPath), changeset.root);
        return new Map([
            ...super.getAnnotations(destPath),
            ['generated-from', relPath.startsWith('.') ? relPath : `./${relPath}`],
        ]);
    }
    async read(path, options) {
        const { generatorPath } = this[_];
        try {
            return await super.read(path, options);
        }
        catch (e) {
            throw new MapError(e.message, generatorPath, 'read');
        }
    }
    async write(path, content, options) {
        const { changeset, generatorPath } = this[_];
        this.__assertNotDestroyed('write');
        changeset.add({
            path,
            // operation: this.changed.has(path) ? UPDATE : ADD,
            operation: operations_1.UPDATE,
        });
        try {
            await super.write(path, content, options);
        }
        catch (e) {
            throw new MapError(e.message, generatorPath, 'write');
        }
    }
}
exports.MapChangeApi = MapChangeApi;
