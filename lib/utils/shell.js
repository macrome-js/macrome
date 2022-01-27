"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasOutput = exports.outputLines = exports.run = void 0;
const child_process_1 = require("child_process");
function run(cmd, args, dir = process.cwd()) {
    const result = child_process_1.spawnSync(cmd, args, { cwd: dir, shell: false });
    if (result.error) {
        throw result.error;
    }
    else if (result.status !== 0) {
        throw new Error(`Failed to execute \`${cmd} ${args.join(' ')}\`. Command exited with status ${result.status}\n${result.stderr.toString()}`);
    }
    else {
        return result.stdout;
    }
}
exports.run = run;
function outputLines(cmd, args, dir = process.cwd()) {
    return run(cmd, args, dir).toString().split(/\r?\n/g);
}
exports.outputLines = outputLines;
/**
 * Return true if the execution returned with status 0 and generated output to stdio
 * @param {string} cmd The binary to run
 * @param {Array<string>} args An array of command line args to cmd
 * @param {string} dir The working directory to run the command in
 */
function hasOutput(cmd, args, dir = process.cwd()) {
    return run(cmd, args, dir).length > 0;
}
exports.hasOutput = hasOutput;
