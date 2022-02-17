"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeout = exports.wait = void 0;
const errawr_1 = __importDefault(require("errawr"));
const wait = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};
exports.wait = wait;
const timeout = (ms) => {
    return (0, exports.wait)(ms).then(() => {
        throw new errawr_1.default('Timeout expired', {
            code: 'timeout',
        });
    });
};
exports.timeout = timeout;
