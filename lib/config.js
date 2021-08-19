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
const alwaysIgnored = ['.git', 'node_modules'];
function asArray(glob) {
    return Array.isArray(glob) ? glob : glob ? [glob] : [];
}
function buildOptions(apiOptions = {}) {
    const configPath = apiOptions.configPath === null
        ? null
        : find_up_1.default.sync('macrome.config.js', { cwd: process.cwd() }) || null;
    const configOptions = configPath === null ? {} : import_fresh_1.default(configPath);
    if (configOptions.configPath) {
        logger_1.logger.warn('configPath is not a valid option in a config file.');
        delete configOptions.configPath;
    }
    const root = apiOptions.root || configOptions.root || (configPath && path_1.dirname(configPath));
    if (!root) {
        throw new Error('No root specified and none could be inferred');
    }
    return Object.assign(Object.assign(Object.assign({ quiet: false }, configOptions), apiOptions), { generators: [
            ...iter_tools_es_1.map((path) => (Array.isArray(path) ? path : [path, {}]), iter_tools_es_1.concat(configOptions.generators, apiOptions.generators)),
        ], alwaysIgnored: [
            ...alwaysIgnored,
            ...asArray(configOptions.alwaysIgnored),
            ...asArray(apiOptions.alwaysIgnored),
        ], root,
        configPath });
}
exports.buildOptions = buildOptions;
