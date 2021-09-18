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
const watchman_1 = require("./watchman");
const apis_1 = require("./apis");
const matchable_1 = require("./matchable");
const logger_1 = require("./utils/logger");
const config_1 = require("./config");
const accessors_1 = __importDefault(require("./accessors"));
const vcs_configs_1 = require("./vcs-configs");
const map_1 = require("./utils/map");
const queue_1 = __importDefault(require("@iter-tools/queue"));
const fs_cache_1 = require("./fs-cache");
const { unlink } = fs_1.promises;
class Macrome {
    constructor(apiOptions) {
        this.initialized = false;
        this.vcsConfig = null;
        this.watchClient = null;
        this.queue = null;
        const options = config_1.buildOptions(apiOptions);
        this.options = options;
        const { root, quiet } = options;
        if (quiet)
            logger_1.logger.notice.disable();
        const vcsDir = find_up_1.default.sync(vcs_configs_1.vcsConfigs.map((c) => c.dir), {
            type: 'directory',
            cwd: root,
        });
        this.root = root;
        this.watchRoot = path_1.dirname(vcsDir || root);
        this.api = new apis_1.Api(this);
        this.generators = new Map();
        this.generatorsMeta = new WeakMap();
        if (vcsDir) {
            const vcsDirName = path_1.basename(vcsDir);
            const vcsConfig = vcs_configs_1.vcsConfigs.find(({ dir }) => dir === vcsDirName) || null;
            this.vcsConfig = vcsConfig;
        }
        this.accessorsByFileType = new Map(
        // we do not yet have types for which more than one accessor may be valid
        iter_tools_es_1.flatMap((axr) => iter_tools_es_1.map((type) => [type, axr], axr.supportedFileTypes), accessors_1.default));
    }
    async _initialize(initialFiles) {
        for (const generatorPath of this.options.generators.keys()) {
            await this.instantiateGenerators(generatorPath);
        }
        for (const { path, mtimeMs } of initialFiles) {
            const annotations = await this.readAnnotations(path);
            fs_cache_1.fsCache.set(path, {
                mtimeMs,
                annotations,
                generatedPaths: new Set(),
            });
        }
        this.initialized = true;
    }
    get generatorInstances() {
        return iter_tools_es_1.flat(1, this.generators.values());
    }
    get logger() {
        return logger_1.logger;
    }
    enqueue(change) {
        this.queue.push(change);
        fs_cache_1.fsCache.set(change.path, {});
    }
    async instantiateGenerators(generatorPath) {
        var _a, _b;
        const Generator = import_fresh_1.default(generatorPath);
        for (const generator of map_1.get(this.generators, generatorPath, [])) {
            const { api } = this.generatorsMeta.get(generator);
            await ((_a = generator.destroy) === null || _a === void 0 ? void 0 : _a.call(generator, api));
            api.destroy();
        }
        this.generators.set(generatorPath, []);
        const stubs = this.options.generators.get(generatorPath);
        for (const stub of stubs) {
            const mappings = new Map();
            const generator = new Generator(stub.options);
            const api = apis_1.GeneratorApi.fromApi(this.api, this.relative(generatorPath));
            await ((_b = generator.initialize) === null || _b === void 0 ? void 0 : _b.call(generator, api));
            this.generators.get(generatorPath).push(generator);
            this.generatorsMeta.set(generator, { mappings, api });
        }
    }
    accessorFor(path) {
        const ext = path_1.extname(path).slice(1);
        return this.accessorsByFileType.get(ext) || null;
    }
    async readAnnotations(path, { handle } = {}) {
        const accessor = this.accessorsByFileType.get(path_1.extname(path).slice(1));
        if (!accessor)
            return null;
        const resolved = handle != null ? handle : this.resolve(path);
        return await accessor.readAnnotations(resolved);
    }
    async forMatchingGenerators(path, cb) {
        for (const generator of this.generatorInstances) {
            if (matchable_1.matches(path, generator)) {
                cb(generator);
            }
        }
    }
    // Where the magic happens.
    async processChanges() {
        // Assumption: two input changes will not both write the same output file
        //   we could detect this and error (or warn and let the later gen overwrite?)
        //     allows us to parallelize
        var _a;
        const { queue, options, generatorInstances, generatorsMeta } = this;
        const { settleTTL } = options;
        let ttl = settleTTL;
        // TODO parallelize
        // may want to factor out runners, parallel and non-parallel a la jest
        while (true) {
            // Handle bouncing between states: map -> reduce -> map -> reduce
            // We always enqueue changes before the watcher reports them, primarily to
            // ensure that this error is never subject to a race condition.
            if (ttl === 0) {
                throw new Error(`Macrome state has not settled after ${settleTTL} cycles, likely indicating an infinite loop`);
            }
            for (const change of queue) {
                const { path } = change;
                const { generatedPaths } = fs_cache_1.fsCache.get(path);
                if (!change.exists) {
                    // Remove the root file and files it caused to be generated
                    for (const path of generatedPaths) {
                        if (path !== change.path && (await this.readAnnotations(path)) !== null) {
                            await unlink(this.resolve(path));
                        }
                    }
                    // Remove any map results the file made
                    this.forMatchingGenerators(path, (generator) => {
                        generatorsMeta.get(generator).mappings.delete(path);
                    });
                    await unlink(path);
                }
                else {
                    // Generator loop is inside change queue loop
                    for (const generator of generatorInstances) {
                        const { mappings, api: genApi } = generatorsMeta.get(generator);
                        if (matchable_1.matches(change.path, generator)) {
                            // Changes made through this api feed back into the queue
                            const api = apis_1.MapChangeApi.fromGeneratorApi(genApi, change);
                            // generator.map()
                            const mapResult = generator.map ? await generator.map(api, change) : change;
                            mappings.set(change.path, mapResult);
                            api.destroy();
                        }
                    }
                }
            }
            for (const generator of this.generatorInstances) {
                const { mappings, api } = generatorsMeta.get(generator);
                if (mappings.size) {
                    // what happens if the changes reduce makes are mappable?
                    await ((_a = generator.reduce) === null || _a === void 0 ? void 0 : _a.call(generator, api, mappings));
                }
            }
            ttl--;
        }
    }
    getBaseExpression() {
        const { alwaysExclude: exclude } = this.options;
        const suffixes = [...this.accessorsByFileType.keys()];
        return {
            exclude: watchman_1.matchExpr(['match', exclude]),
            include: ['suffix', suffixes],
        };
    }
    async build() {
        const changes = await watchman_1.standaloneQuery(this.root, this.getBaseExpression());
        if (!this.initialized)
            await this._initialize(changes);
        this.queue = new queue_1.default();
        for (const change of changes) {
            if ((await this.readAnnotations(change.path)) === null) {
                this.enqueue(change);
            }
        }
        await this.processChanges();
        this.queue = null;
    }
    /*
  
  Initial traverse (build: mine, watch: watchman)
  Fill cache with initial paths (mtime, annotations)
  Process non-generated files (fill cache with generatedFiles)
  For each initial generated path, remove it if cache mtime is unchanged (build, watch initial)
  
    */
    async watch() {
        const { root, options, vcsConfig, watchRoot } = this;
        const { alwaysExclude: exclude } = options;
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
            optional: ['suffix-set'],
        });
        await client.watchProject(watchRoot);
        const fields = ['name', 'mtime_ms', 'exists', 'type', 'new'];
        const expression = this.getBaseExpression();
        const { files: changes, clock: start } = await client.query(this.root, expression, { fields });
        if (!this.initialized)
            await this._initialize(changes);
        this.queue = new queue_1.default();
        for (const change of changes) {
            if (!(await this.readAnnotations(change.path))) {
                this.enqueue(change);
            }
        }
        await this.processChanges();
        this.queue = null;
        logger_1.logger.notice('Initial generation completed; watching for changes...');
        if (vcsConfig) {
            await client.subscribe('/', 'macrome-vcs-lock', { include: ['name', path_1.join(vcsConfig.dir, vcsConfig.lock)] }, {
                fields: ['name', 'exists'],
                defer_vcs: false,
            }, async (files) => {
                const [lock] = files;
                return await client.command(lock.exists ? 'state-enter' : 'state-leave', watchRoot, 'vcs_lock_held');
            });
        }
        // Establish one watch for all changes. Separate watches per generator would cause each
        // generator to run on all its inputs before another generator could begin.
        // This would prevent parallelization.
        await client.subscribe(this.root, 'macrome-main', expression, {
            drop: ['vcs_lock_held'],
            defer_vcs: false,
            fields,
            since: start,
        }, async (changes) => {
            var _a;
            if (this.queue === null) {
                this.queue = new queue_1.default(changes);
                await this.processChanges();
                this.queue = null;
            }
            else {
                for (const change of changes) {
                    const { path, exists, mtimeMs } = change;
                    // filter out "echo" changes: those we already enqueued without waiting for the watcher
                    if (((_a = fs_cache_1.fsCache.get(path)) === null || _a === void 0 ? void 0 : _a.mtimeMs) !== mtimeMs || (!exists && fs_cache_1.fsCache.has(path))) {
                        this.enqueue(change);
                    }
                }
            }
        });
    }
    stopWatching() {
        if (this.watchClient) {
            this.watchClient.end();
            this.watchClient = null;
        }
    }
    async clean() {
        const files = await watchman_1.standaloneQuery(this.root, this.getBaseExpression());
        for (const { path } of files) {
            if ((await this.readAnnotations(path)) != null) {
                await unlink(this.resolve(path));
            }
        }
    }
    async check() {
        if (!this.vcsConfig) {
            throw new Error('macrome.check requires a version controlled project to work');
        }
        if (this.vcsConfig.isDirty(this.root)) {
            logger_1.logger.warn('Check was run with vcs changes in the working dir and cannot succeed');
            return false;
        }
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
