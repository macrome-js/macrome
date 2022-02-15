"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = exports.Macrome = exports.accessors = void 0;
var accessors_1 = require("./accessors");
Object.defineProperty(exports, "accessors", { enumerable: true, get: function () { return __importDefault(accessors_1).default; } });
var macrome_1 = require("./macrome");
Object.defineProperty(exports, "Macrome", { enumerable: true, get: function () { return macrome_1.Macrome; } });
var apis_1 = require("./apis");
Object.defineProperty(exports, "ApiError", { enumerable: true, get: function () { return apis_1.ApiError; } });
