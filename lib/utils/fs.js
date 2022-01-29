"use strict";
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openKnownFileForReading = exports.recursiveReadFiles = exports.buildOptions = void 0;
const path_1 = require("path");
const queue_1 = __importDefault(require("@iter-tools/queue"));
const promises_1 = require("fs/promises");
function buildOptions(options) {
    const options_ = typeof options === 'string' ? { encoding: options } : options || {};
    // TODO maybe don't force this.
    return Object.assign(Object.assign({}, options_), { encoding: 'utf8' });
}
exports.buildOptions = buildOptions;
function recursiveReadFiles(root, options = {}) {
    return __asyncGenerator(this, arguments, function* recursiveReadFiles_1() {
        var e_1, _a;
        const { shouldInclude = () => true, shouldExclude = () => false } = options;
        const dirQueue = new queue_1.default(['']);
        for (const dir of dirQueue) {
            const files = yield __await(promises_1.opendir(path_1.join(root, dir)));
            try {
                for (var files_1 = (e_1 = void 0, __asyncValues(files)), files_1_1; files_1_1 = yield __await(files_1.next()), !files_1_1.done;) {
                    const ent = files_1_1.value;
                    const path = path_1.join(dir, ent.name);
                    const isDir = ent.isDirectory();
                    const isFile = ent.isFile();
                    if ((!isDir && !isFile) || shouldExclude(path)) {
                        continue;
                    }
                    if (isDir) {
                        dirQueue.push(path);
                    }
                    else {
                        if (shouldInclude(path) && !shouldExclude(path)) {
                            yield yield __await(path);
                        }
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (files_1_1 && !files_1_1.done && (_a = files_1.return)) yield __await(_a.call(files_1));
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
    });
}
exports.recursiveReadFiles = recursiveReadFiles;
// Make sure we're reading the right version of the right file
async function openKnownFileForReading(path, expectedMtimeMs) {
    const handle = await promises_1.open(path, 'r');
    const stats = await handle.stat();
    const mtimeMs = Math.floor(stats.mtimeMs);
    if (mtimeMs !== expectedMtimeMs) {
        throw new Error(`Unable to read additional info about file \`${path}\`.\nExpected mtimeMs: ${expectedMtimeMs}\nmtimeMs: ${stats.mtimeMs}`);
    }
    return handle;
}
exports.openKnownFileForReading = openKnownFileForReading;
