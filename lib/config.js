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
const alwaysExclude = ['.git', 'node_modules'];
function buildOptions(apiOptions = {}) {
    let root = apiOptions.root ? path_1.resolve(apiOptions.root) : null;
    const configPath = apiOptions.configPath === null
        ? null
        : find_up_1.default.sync('macrome.config.js', { cwd: root || process.cwd() }) || null;
    const configOptions = configPath === null ? {} : import_fresh_1.default(configPath);
    if (configOptions.configPath) {
        logger_1.logger.warn('configPath is not a valid option in a config file.');
        delete configOptions.configPath;
    }
    root = root || (configPath && path_1.dirname(configPath));
    if (!root) {
        throw new Error('No root specified and none could be inferred');
    }
    const root_ = root;
    const stubs = iter_tools_es_1.execPipe(iter_tools_es_1.concat(configOptions.generators, apiOptions.generators), iter_tools_es_1.map((path) => (Array.isArray(path) ? path : [path, {}])), iter_tools_es_1.map(([path, options]) => {
        const _options = Object.assign(Object.assign({}, options), { logger: logger_1.logger });
        const resolvedPath = require.resolve(path, { paths: [root_] });
        return { options: _options, path, resolvedPath };
    }));
    const generators = map_1.groupBy((stub) => stub.resolvedPath, stubs);
    return Object.assign(Object.assign(Object.assign({ quiet: false, settleTTL: 20 }, configOptions), apiOptions), { generators, alwaysExclude: matchable_1.asArray([alwaysExclude, configOptions.alwaysExclude, apiOptions.alwaysExclude].reduce((a, b) => matchable_1.expressionMerger(a, b))), root,
        configPath });
}
exports.buildOptions = buildOptions;
