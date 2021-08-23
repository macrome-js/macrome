"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Macrome = void 0;
const path_1 = require("path");
const fs_1 = require("fs");
const import_fresh_1 = __importDefault(require("import-fresh"));
const find_up_1 = __importDefault(require("find-up"));
const iter_tools_es_1 = require("iter-tools-es");
const traverse_1 = require("./traverse");
const watchman_1 = require("./watchman");
const apis_1 = require("./apis");
const matchable_1 = require("./matchable");
const logger_1 = require("./utils/logger");
const config_1 = require("./config");
const accessors_1 = __importDefault(require("./accessors"));
const operations_1 = require("./operations");
const vcs_configs_1 = require("./vcs-configs");
const map_1 = require("./utils/map");
const { unlink } = fs_1.promises;
class Macrome {
    constructor(apiOptions) {
        const options = config_1.buildOptions(apiOptions);
        this.options = options;
        const { root, quiet } = options;
        if (quiet)
            logger_1.logger.notice.disable();
        const vcsDir = find_up_1.default.sync(vcs_configs_1.vcsConfigs.map((c) => c.dir), {
            type: 'directory',
            cwd: root,
        });
        this.initialized = false;
        this.root = root;
        this.watchRoot = path_1.dirname(vcsDir || root);
        this.api = new apis_1.Api(this);
        this.vcsConfig = null;
        this.watchClient = null;
        this.generators = new Map();
        if (vcsDir) {
            const vcsDirName = path_1.basename(vcsDir);
            const vcsConfig = vcs_configs_1.vcsConfigs.find(({ dir }) => dir === vcsDirName) || null;
            this.vcsConfig = vcsConfig;
        }
        this.accessorsByFileType = new Map(
        // we do not yet have types for which more than one accessor may be valid
        iter_tools_es_1.flatMap((axr) => iter_tools_es_1.map((type) => [type, axr], axr.supportedFileTypes), accessors_1.default));
    }
    async initialize() {
        for (const generatorPath of this.options.generators.keys()) {
            await this.instantiateGenerators(generatorPath);
        }
        this.initialized = true;
    }
    get generatorInstances() {
        return iter_tools_es_1.flat(1, this.generators.values());
    }
    get logger() {
        return logger_1.logger;
    }
    async instantiateGenerators(generatorPath) {
        var _a, _b;
        const Generator = import_fresh_1.default(generatorPath);
        for (const { api, generator } of map_1.get(this.generators, generatorPath, [])) {
            await ((_a = generator.destroy) === null || _a === void 0 ? void 0 : _a.call(generator, api));
            api.destroy();
        }
        this.generators.set(generatorPath, []);
        const stubs = this.options.generators.get(generatorPath);
        for (const stub of stubs) {
            const paths = new Map();
            const generator = new Generator(stub.options);
            const api = apis_1.GeneratorApi.fromApi(this.api, this.relative(generatorPath));
            await ((_b = generator.initialize) === null || _b === void 0 ? void 0 : _b.call(generator, api));
            this.generators.get(generatorPath).push(generator);
        }
    }
    accessorFor(path) {
        const ext = path_1.extname(path).slice(1);
        return this.accessorsByFileType.get(ext) || null;
    }
    // where the magic happens
    // rename this to changeset once the changeset name is no longer in use?
    async processChanges(changeQueue) {
        // Assumption: two input changes will not both write the same output file
        //   we could detect this and error (or warn and let the later gen overwrite?)
        //     allows us to parallelize
        var _a;
        // TODO parallelize
        // may want to factor out runners, parallel and non-parallel a la jest
        for (const change of changeQueue) {
            const { path } = change;
            const { generatedPaths = [] } = map_1.get(cache, path, {});
            if (change.operation === operations_1.REMOVE) {
                // Remove the root file and files it caused to be generated
                for (const path of generatedPaths) {
                    if (path !== change.path && (await this.hasHeader(path))) {
                        await unlink(this.resolve(path));
                    }
                }
                // Remove any map results the file made
                this.forMatchingGenerators(({ generator }) => {
                    genPaths.delete(change.path);
                });
                for (const { generator, paths: genPaths } of this.generatorInstances) {
                    if (matchable_1.matches(change.path, generator)) {
                        genPaths.delete(change.path);
                    }
                }
                await unlink(path);
            }
            else {
                // Generator loop is inside change queue loop
                for (const { generator, api: genApi, paths: genPaths } of this.generatorInstances) {
                    if (matchable_1.matches(change.path, generator)) {
                        // Changes made through this api feed back into the queue
                        const api = apis_1.MapChangeApi.fromGeneratorApi(genApi, change);
                        // generator.map()
                        const mapResult = generator.map ? await generator.map(api, change) : change;
                        api.destroy();
                        genPaths.set(change.path, { change, mapResult });
                    }
                }
            }
        }
        for (const { generator, api, paths: genPaths } of this.generatorInstances) {
            if (genPaths.size) {
                await ((_a = generator.reduce) === null || _a === void 0 ? void 0 : _a.call(generator, api, genPaths));
            }
        }
    }
    async build() {
        const { alwaysIgnored: ignored } = this.options;
        if (!this.initialized)
            await this.initialize();
        const initialPaths = [
            ...iter_tools_es_1.filter((path) => !!this.accessorFor(path), await traverse_1.traverse(this.root, { excludeFiles: ignored })),
        ];
        const roots = iter_tools_es_1.asyncFilter(async (path) => !(await this.hasHeader(path)), initialPaths);
        const rootChanges = await iter_tools_es_1.arrayFromAsync(iter_tools_es_1.asyncMap((path) => ({ path, operation: operations_1.ADD }), roots));
        await this.processChanges(rootChanges);
    }
    async watch() {
        const { root, options, vcsConfig, watchRoot } = this;
        const { alwaysIgnored: ignored } = options;
        const client = new watchman_1.WatchmanClient(root);
        this.watchClient = client;
        await client.version({
            required: [
                'cmd-watch-project',
                'cmd-subscribe',
                'cmd-state-enter',
                'cmd-state-leave',
                'cmd-clock',
                'cmd-flush-subscriptions',
                'term-allof',
                'term-anyof',
                'term-not',
                'term-match',
                'wildmatch',
                'field-name',
                'field-exists',
                'field-new',
                'field-type',
                'field-mtime_ms',
                'relative_root',
            ],
        });
        await client.watchProject(watchRoot);
        await this.build();
        await client.flushSubscriptions();
        const { clock: startClock } = await client.clock();
        logger_1.logger.notice('Initial generation completed; watching for changes...');
        if (vcsConfig) {
            await client.subscribe(watchRoot, 'macrome-vcs-lock', {
                expression: watchman_1.expressionFromMatchable({ files: [path_1.join(vcsConfig.dir, vcsConfig.lock)] }),
                fields: ['name', 'exists'],
                defer_vcs: false,
            }, async (files) => {
                const [lock] = files;
                return await client.command(lock.exists ? 'state-enter' : 'state-leave', watchRoot, 'vcs_lock_held');
            });
        }
        // await client.subscribe(
        //   '',
        //   'macrome-generators',
        //   {
        //     defer: ['vcs_lock_held'],
        //     defer_vcs: false, // for consistency use our version
        //     matchable: {
        //       files: [
        //         ...filter(
        //           (resolvedPath) => !resolvedPath.startsWith('..'),
        //           map((resolvedPath) => relative(watchRoot, resolvedPath), this.generatorStubs.keys()),
        //         ),
        //       ],
        //     },
        //   },
        //   (files) => {
        //     for (const file of files) {
        //       this.instantiateGenerators(join(watchRoot, file.name));
        //     }
        //   },
        // );
        // Establish one watch for all changes. Separate watches per generator would cause each
        // generator to run on all its inputs before anoteher generator could begin.
        // This would prevent parallelization.
        await client.subscribe('/', 'macrome-main', {
            expression: watchman_1.expressionFromMatchable({ excludeFiles: ignored }),
            drop: ['vcs_lock_held'],
            defer_vcs: false,
            fields: ['name', 'mtime_ms', 'exists', 'type', 'new'],
            since: startClock,
        }, async (files) => {
            await this.processChanges(files.map((file) => ({
                operation: !file.exists ? operations_1.REMOVE : file.new ? operations_1.ADD : operations_1.UPDATE,
                path: file.name,
            })));
        });
    }
    stopWatching() {
        if (this.watchClient) {
            this.watchClient.end();
            this.watchClient = null;
        }
    }
    async hasHeader(path) {
        const accessor = this.accessorsByFileType.get(path_1.extname(path).slice(1));
        if (!accessor)
            return false;
        const annotations = await accessor.readAnnotations(this.resolve(path));
        return annotations === null ? false : !!annotations.get('macrome');
    }
    async clean() {
        const { alwaysIgnored: ignored } = this.options;
        const paths = await traverse_1.traverse(this.root, { excludeFiles: ignored });
        for (const path of paths) {
            if (await this.hasHeader(path)) {
                await unlink(this.resolve(path));
            }
        }
    }
    async check() {
        if (!this.vcsConfig) {
            throw new Error('macrome.check() will soon work without version control, but it does not yet.');
        }
        if (this.vcsConfig.isDirty(this.root)) {
            logger_1.logger.warn('Check was run with vcs changes in the working dir and cannot succeed');
            return false;
        }
        await this.clean();
        await this.build();
        return !this.vcsConfig.isDirty(this.root);
    }
    relative(path) {
        return path_1.relative(this.root, path);
    }
    resolve(path) {
        return path.startsWith('/') ? path : path_1.join(this.root, path);
    }
}
exports.Macrome = Macrome;
