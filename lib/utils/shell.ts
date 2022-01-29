import { spawnSync } from 'child_process';

export function run(cmd: string, args: Array<string>, dir = process.cwd()): Buffer {
  const result = spawnSync(cmd, args, { cwd: dir, shell: false });
  if (result.error) {
    throw result.error;
  } else if (result.status !== 0) {
    throw new Error(
      `Failed to execute \`${cmd} ${args.join(' ')}\`. Command exited with status ${
        result.status
      }\n${result.stderr.toString()}`,
    );
  } else {
    return result.stdout;
  }
}

export function outputLines(cmd: string, args: Array<string>, dir = process.cwd()): Array<string> {
  return run(cmd, args, dir).toString().split(/\r?\n/g);
}

/**
 * Return true if the execution returned with status 0 and generated output to stdio
 * @param {string} cmd The binary to run
 * @param {Array<string>} args An array of command line args to cmd
 * @param {string} dir The working directory to run the command in
 */
export function hasOutput(cmd: string, args: Array<string>, dir = process.cwd()): boolean {
  return run(cmd, args, dir).length > 0;
}
