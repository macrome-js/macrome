"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOptions = void 0;
const path_1 = require("path");
const find_up_1 = __importDefault(require("find-up"));
const import_fresh_1 = __importDefault(require("import-fresh"));
const iter_tools_es_1 = require("iter-tools-es");
const logger_1 = require("./utils/logger");
const map_1 = require("./utils/map");
const matchable_1 = require("./matchable");
const fs_1 = require("fs");
const logger = logger_1.logger.get('macrome:config');
const alwaysExclude = ['.git/', 'node_modules/'];
const stat = (path) => (0, fs_1.statSync)(path, { throwIfNoEntry: false });
const getRequirePath = (base) => {
    const root = stat(base);
    if (root && root.isDirectory()) {
        const pkg = (0, path_1.join)(base, 'package.json');
        if (stat(pkg))
            return pkg;
        const indexCjs = (0, path_1.join)(base, 'index.cjs');
        if (stat(indexCjs))
            return indexCjs;
    }
    return base;
};
function buildOptions(apiOptions = {}) {
    let root = apiOptions.root ? (0, path_1.resolve)(apiOptions.root) : null;
    const configPath = apiOptions.configPath === null
        ? null
        : find_up_1.default.sync(['macrome.config.js', 'macrome.config.cjs'], { cwd: root || process.cwd() }) ||
            null;
    const configOptions = configPath === null ? {} : (0, import_fresh_1.default)(configPath);
    if (configOptions.configPath) {
        logger.warn('configPath is not a valid option in a config file.');
        delete configOptions.configPath;
    }
    root = root || (configPath && (0, path_1.dirname)(configPath));
    if (!root) {
        throw new Error('No root specified and none could be inferred');
    }
    const root_ = root;
    const stubs = (0, iter_tools_es_1.execPipe)((0, iter_tools_es_1.concat)(configOptions.generators, apiOptions.generators), (0, iter_tools_es_1.map)((path) => (Array.isArray(path) ? path : [path, {}])), (0, iter_tools_es_1.map)(([path, options]) => {
        const _options = Object.assign(Object.assign({}, options), { logger });
        const resolvedPath = require.resolve(getRequirePath(path.startsWith('.') ? (0, path_1.resolve)(root_, path) : path), {
            paths: [root_],
        });
        return { options: _options, path, resolvedPath };
    }));
    const generators = (0, map_1.groupBy)((stub) => stub.resolvedPath, stubs);
    return Object.assign(Object.assign(Object.assign({ quiet: false, settleTTL: 20 }, configOptions), apiOptions), { generators, alwaysExclude: (0, matchable_1.asArray)([alwaysExclude, configOptions.alwaysExclude, apiOptions.alwaysExclude].reduce((a, b) => (0, matchable_1.expressionMerger)(a, b))), root,
        configPath });
}
exports.buildOptions = buildOptions;
