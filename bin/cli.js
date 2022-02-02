#!/usr/bin/env node
'use strict';

const parseArgs = require('minimist');
const camelize = require('camelize');
const { Errawr } = require('errawr');

const { Macrome } = require('../lib/macrome');
const { logger: baseLogger } = require('../lib/utils/logger');

const logger = baseLogger.get('macrome');

const argv = camelize(
  parseArgs(process.argv.slice(2), {
    alias: {
      q: 'quiet',
      h: 'help',
    },
  }),
);

process.on('unhandledRejection', (error) => {
  logger.error(`Unhandled rejection: ${Errawr.print(error)}`);
  process.exit(1);
});

function runCommand(macrome, command, argv) {
  try {
    switch (command) {
      case 'watch':
        return macrome.watch();
      case 'clean':
        return macrome.clean();
      case 'build':
        return macrome.build();
      case 'check': {
        const clean = macrome.check();

        if (!clean && !argv.quiet) {
          logger.warn(
            'Building the project resulted in file changes.\n' +
              'This probably means that the `npx macrome build` command was not run.',
          );
        }
        process.exit(clean ? 0 : 3);
      }
      default:
        console.error(`Macrome: unknown command ${command}`);
        process.exit(2);
    }
  } catch (e) {
    logger.error(Errawr.print(e));
  }
}

if (!argv.help) {
  const macrome = new Macrome({ ...argv });
  const command = argv[''][0] || 'build';

  runCommand(macrome, command, argv);
} else {
  const usage = `Generates in-tree files tagged with @macrome.
Usage: npx macrome [command] [options]

Commands:
  build                     Run macrome generators (the default)
  watch                     Build then then perform incremental rebuilds on changes
  clean                     Delete files create by macrome generators
  check                     Builds then exits with 0 if no files were changed

Options:
  -q, --quiet               Only log errors
  -h, --help                Print this message

Exit codes:
  0 Success
  1 Unknown error
  2 Unknown command
  3 \`check\` command found changed files

Watching options
  --watchman-path           Path to a watchman binary
`;

  console.log(usage);
}
