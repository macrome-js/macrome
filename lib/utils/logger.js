"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
// @ts-ignore
const log_1 = __importDefault(require("log"));
exports.logger = log_1.default;
// @ts-ignore
const log_node_1 = __importDefault(require("log-node"));
log_node_1.default();
