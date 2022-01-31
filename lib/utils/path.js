"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printRelative = void 0;
const printRelative = (path) => (path.startsWith('.') ? path : `./${path}`);
exports.printRelative = printRelative;
