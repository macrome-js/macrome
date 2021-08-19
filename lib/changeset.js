"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Changeset = void 0;
const queue_1 = __importDefault(require("@iter-tools/queue"));
const _ = Symbol('private members');
/**
 * This data structure ensures that changes happen in cause => effect order.
 * A cause is a change in a non-generated file, and effects are usually
 * individual generators calling `api.write()`.
 */
class Changeset {
    constructor(rootChange) {
        this[_] = {
            rootChange,
            paths: [],
            queue: new queue_1.default(),
        };
        this.add(rootChange);
    }
    add(change) {
        const { paths, queue } = this[_];
        queue.push(change);
        paths.push(change.path);
    }
    get root() {
        return this[_].rootChange.path;
    }
    get paths() {
        return this[_].paths[Symbol.iterator]();
    }
    get queue() {
        return this[_].queue[Symbol.iterator]();
    }
}
exports.Changeset = Changeset;
