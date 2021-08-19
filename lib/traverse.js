"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.traverse = void 0;
const path_1 = require("path");
const recursive_readdir_1 = __importDefault(require("recursive-readdir"));
const matchable_1 = require("./matchable");
async function traverse(root, matchable) {
    const fileMatcher = matchable_1.matcher(matchable);
    // recursiveRead can skip recursing through whole directrories that don't match this way
    const initialPaths = await recursive_readdir_1.default(root, [(path) => !fileMatcher(path_1.relative(root, path))]);
    return initialPaths.map((path) => path_1.relative(root, path));
}
exports.traverse = traverse;
