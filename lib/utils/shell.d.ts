/// <reference types="node" />
export declare function run(cmd: string, args: Array<string>, dir?: string): Buffer;
export declare function outputLines(cmd: string, args: Array<string>, dir?: string): Array<string>;
/**
 * Return true if the execution returned with status 0 and generated output to stdio
 * @param {string} cmd The binary to run
 * @param {Array<string>} args An array of command line args to cmd
 * @param {string} dir The working directory to run the command in
 */
export declare function hasOutput(cmd: string, args: Array<string>, dir?: string): boolean;
