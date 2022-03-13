# Macromé

Macrome (pronounced mac-row-may) is the in-tree build system. It is most closely related to `make`, and its principal innovation is its ability to manage generated scripts intermixed with source (human-written) scripts without ever losing track of which are which. It provides you the power of scripting against the filesystem while helping you avoid pitfalls like lost (overwritten) work or difficult to clean up messes. Generated 1000 files by accident? `macrome clean`!

Here is what it looks like when macrome is used to generate transpiled scripts inside the [@iter-tools/regex](https://github.com/iter-tools/regex) package:

<img width="534" alt="Screen Shot 2022-03-12 at 5 43 43 PM" src="https://user-images.githubusercontent.com/540777/158040005-c5fb349e-4f38-4465-9997-2c5453cc186f.png">

Note that [the file in the screenshot](https://github.com/iter-tools/regex/blob/v0.1.4/lib/internal/engine.js) was checked into git after being generated, which enables the github repository itself to function as a node package! Such a package can be trivially forked, and any user's fork can be used like so:
```jsonc
// package.json
{
  "dependencies": {
    "@iter-tools/regex": "github:user/regex#commitish"
  }
}
```

Macrome's power comes from the header comments it places in the generated code files it writes, allowing it to identify them later. Its principal innovation is reading these comments efficiently, as well as the ability to place comments in multiple kinds of files. To clean a project for a repeatable build, macrome needs only to find and remove files with its headers.

Macrome can help in any transpiled scripting language, but it is expected to be used primarily on javascript projects.

Macrome is designed to run either in a CI environment (so you can verify that no assets are stale), or locally. When running locally Macrome can watch your files for changes if you have [watchman](http://facebook.github.io/watchman/docs/install) installed. Macrome offers `macrome check` which can be used in CI to guard against stale files and verify the repeatability of build assets generated locally.

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
await macrome.build();
```

## Generators

Macrome's build steps are known as generators. A generator defines lifecycle hooks, the implementations of which can use `api` objects to interact with macrome and the filesystem

In a config, a generator is specified as either `generatorPath` or `[generatorPath, options]`, where `options` are passed to the class constructor.

The following is the `Generator` interface:

```js
interface Generator<T> {
  include?: Glob | Array<Glob> | null;
  exclude?: Glob | Array<Glob> | null;

  // eslint-disable-next-line @typescript-eslint/no-misused-new
  new (options: Record<string, any>): Generator<T>;

  initialize?(api: GeneratorApi): Promise<unknown>;

  map?(api: MapChangeApi, change: Change): Promise<T>;

  reduce?(api: GeneratorApi, changeMap: Map<string, T>): Promise<unknown>;

  destroy?(api: GeneratorApi): Promise<unknown>;
}
```

Full API docs for generators are coming soon. In the mean time you can always read the code :)
