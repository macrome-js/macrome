## Options

Options can be passed directly to the macrome constructor, and can also be specified in a `macrome.config.js` file. A config file will be searched for in `cwd` and every parent directory of `cwd`. Options passed directly to the constructor supersede options found in a config.

**quiet**: Log less.

**configPath**: The path to a macrome config file to use, or `false` if macrome should not search for a config, instead using only the passed options. `configPath` is not a valid option to specify in a config file.
