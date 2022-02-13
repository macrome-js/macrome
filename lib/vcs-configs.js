"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vcsConfigs = void 0;
const shell_1 = require("./utils/shell");
exports.vcsConfigs = [
    {
        name: 'git',
        dir: '.git',
        lock: 'index.lock',
        isDirty: (dir) => (0, shell_1.hasOutput)('git', ['status', '-s', '--porcelain'], dir),
    },
    {
        name: 'hg',
        dir: '.hg',
        lock: 'wlock',
        isDirty: (dir) => (0, shell_1.hasOutput)('hg', ['status', '--color=never', '--pager=never'], dir),
    },
];
