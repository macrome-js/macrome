# Macromé

Macrome helps you automate your boilerplate and harness the power of static, version controlled code. Macrome believes the following things about software development:

**Your code is your product.**  
**Your product should be under version control.**

For more information about this philosophy and its advantages, read the blog post I haven't written yet.

Some of Macrome's key features are:

- Allows you to create data-driven files, such as static directory indexes
- Allows you to safely mix generated and non-generated code in a single hierarchy
  - Can always identify and clean generated code
- Allows you to check generated code into git (or other VCS)
  - CI can run `macrome check` to guard against stale and orphan outputs
  - Allows you to omit generated files from code review (on Github)
  - Watcher can keep running even across checkouts which change macrome configuration
  - CI only needs `node`, not even `git` or `watchman` (this will be true soon)

Macrome's power comes from the header comments it places in the generated code files it writes, allowing it to identify them later. Its principal innovation is reading these comments efficiently, as well as the ability to place comments in multiple kinds of files. To clean a project for a repeatable build, macrome needs only to find and remove files with its headers.

Nothing about Macrome is specific to Javascript, but it is expected to be used mostly on Javascript projects, particularly in combination with the excellent `babel-plugin-macros`.

Macrome is designed to run either in a CI environment (so you can verify that no assets are stale), or locally. When running locally Macrome can watch your files for changes if you have [watchman](http://facebook.github.io/watchman/docs/install) installed.

## Usage

```
npx macrome [command] [options]

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
  3 `check` command found changed files

Watching options
  --watchman-path           Path to a watchman binary
```

Macrome can also be imported and used in scripts (though CLI usage is preferred).

```js
const { Macrome } = require('macrome');

const macrome = new Macrome(configOptions); // same as cli options, but camel case
macrome.clean();
macrome.build();
macrome.watch();
```

## Generators

Macrome's build steps are known as generators. A generator defines lifecylce hooks, the implementations of which can use `api` objects to interact with macrome and the filesystem

In a config, a generator is specified as either `generatorPath` or `[generatorPath, options]`, where `options` are passed to the class constructor.

The following is the `Generator` interface:

```js
export interface Generator<T> extends Matchable {
  // eslint-disable-next-line @typescript-eslint/no-misused-new
  new (options: Record<string, any>): Generator<T>;

  initialize?(api: GeneratorApi): Promise<unknown>;

  map?(api: MapChangeApi, change: Change): Promise<T>;

  reduce?(api: GeneratorApi, changeMap: Map<string, T>): Promise<unknown>;

  destroy?(api: GeneratorApi): Promise<unknown>;
}
```

Full API docs for generators are coming soon. In the mean time you can always read the code :)
