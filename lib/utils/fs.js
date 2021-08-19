"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReadOptions = void 0;
function buildReadOptions(options) {
    const options_ = typeof options === 'string' ? { encoding: options } : options || {};
    return Object.assign(Object.assign({}, options_), { encoding: options_.encoding || 'utf8' });
}
exports.buildReadOptions = buildReadOptions;
