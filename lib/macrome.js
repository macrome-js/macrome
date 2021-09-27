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
const queue_1 = __importDefault(require("@iter-tools/queue"));
const watchman_1 = require("./watchman");
const apis_1 = require("./apis");
const matchable_1 = require("./matchable");
const logger_1 = require("./utils/logger");
const config_1 = require("./config");
const accessors_1 = __importDefault(require("./accessors"));
const vcs_configs_1 = require("./vcs-configs");
const map_1 = require("./utils/map");
const fs_cache_1 = require("./fs-cache");
const { unlink } = fs_1.promises;
class Macrome {
    constructor(apiOptions) {
        this.initialized = false; // Has initialize() been run
        this.progressive = false; // Are we watching for incremental updates
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
    async getAnnotations(path, { handle } = {}) {
        const accessor = this.accessorsByFileType.get(path_1.extname(path).slice(1));
        const cacheEntry = fs_cache_1.fsCache.get(path);
        if (!accessor)
            return null;
        if (cacheEntry)
            return cacheEntry.annotations;
        const resolved = handle != null ? handle : this.resolve(path);
        return await accessor.readAnnotations(resolved);
    }
    async forMatchingGenerators(path, cb) {
        const { generatorsMeta } = this;
        for (const generator of this.generatorInstances) {
            if (matchable_1.matches(path, generator)) {
                await cb(generator, generatorsMeta.get(generator));
            }
        }
    }
    getBaseExpression() {
        const { alwaysExclude: exclude } = this.options;
        return {
            suffixes: [...this.accessorsByFileType.keys()],
            exclude,
        };
    }
    async enqueue(change) {
        const { path } = change;
        const cacheEntry = fs_cache_1.fsCache.get(path) || null;
        if (change.exists ? (cacheEntry === null || cacheEntry === void 0 ? void 0 : cacheEntry.mtimeMs) === change.mtimeMs : !cacheEntry) {
            // This is an "echo" change: the watcher is re-reporting it but it was already enqueued.
            return;
        }
        if (change.exists) {
            const { progressive } = this;
            const { mtimeMs } = change;
            const generatedPaths = cacheEntry ? cacheEntry.generatedPaths : new Set();
            const annotations = await this.getAnnotations(path);
            const generatedFrom = annotations && annotations.get('generatedfrom');
            if (generatedFrom && !fs_cache_1.fsCache.has(path_1.resolve(path, generatedFrom))) {
                if (!progressive) {
                    // In the initial build we ignore changes which should be caused by other changes
                    return;
                }
                else {
                    // I don't think this should happen and I don't know what it would mean if it did
                    logger_1.logger.warn(`Processing \`${path}\` which is generated from \`${generatedFrom}\` which does not exist`);
                }
            }
            fs_cache_1.fsCache.set(path, { path, mtimeMs, annotations, generatedPaths });
        }
        else {
            fs_cache_1.fsCache.delete(path);
        }
        this.queue.push({ change, cacheEntry });
    }
    // Where the magic happens.
    async processChanges() {
        var _a;
        const { queue, options, generatorsMeta } = this;
        const processedPaths = []; // just for debugging
        if (!queue) {
            throw new Error('processChanges() called with no queue');
        }
        const { settleTTL } = options;
        let ttl = settleTTL;
        // TODO parallelize
        // may want to factor out runners, parallel and non-parallel a la jest
        while (queue.size) {
            // Handle bouncing between states: map -> reduce -> map -> reduce
            if (ttl === 0) {
                this.queue = null;
                throw new Error(`Macrome state has not settled after ${settleTTL} cycles, likely indicating an infinite loop`);
            }
            const generatorsToReduce = new Set();
            while (queue.size) {
                const { change, cacheEntry } = queue.shift();
                const { path } = change;
                const prevGeneratedPaths = cacheEntry && cacheEntry.generatedPaths;
                const generatedPaths = new Set();
                if (change.exists) {
                    await this.forMatchingGenerators(path, async (generator, { mappings, api: genApi }) => {
                        // Changes made through this api feed back into the queue
                        const api = apis_1.MapChangeApi.fromGeneratorApi(genApi, change);
                        // generator.map()
                        const mapResult = generator.map ? await generator.map(api, change) : change;
                        api.destroy();
                        mappings.set(change.path, mapResult);
                        generatorsToReduce.add(generator);
                    });
                }
                else {
                    await this.forMatchingGenerators(path, async (generator, { mappings }) => {
                        // Free any map results the file made
                        mappings.delete(path);
                        generatorsToReduce.add(generator);
                    });
                }
                for (const path of iter_tools_es_1.wrap(prevGeneratedPaths)) {
                    // Ensure the user hasn't deleted our annotations and started manually editing this file
                    if (!generatedPaths.has(path) && (await this.getAnnotations(path)) !== null) {
                        await unlink(this.resolve(path));
                        await this.enqueue({ path, exists: false });
                    }
                }
                processedPaths.push(path);
            }
            for (const generator of this.generatorInstances) {
                if (generatorsToReduce.has(generator)) {
                    const { mappings, api } = generatorsMeta.get(generator);
                    await ((_a = generator.reduce) === null || _a === void 0 ? void 0 : _a.call(generator, api, mappings));
                }
            }
            ttl--;
        }
    }
    async build() {
        const changes = await watchman_1.standaloneQuery(this.root, this.getBaseExpression());
        if (!this.initialized)
            await this.initialize();
        this.queue = new queue_1.default();
        for (const change of changes) {
            await this.enqueue(change);
        }
        await this.processChanges();
        for (const { path } of changes) {
            if (!fs_cache_1.fsCache.has(path)) {
                await unlink(this.resolve(path));
                await this.enqueue({ path, exists: false });
            }
        }
        this.queue = null;
    }
    async watch() {
        const { root, vcsConfig, watchRoot } = this;
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
                'term-pcre',
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
            await this.initialize();
        this.queue = new queue_1.default();
        for (const change of changes) {
            if (!(await this.getAnnotations(change.path))) {
                await this.enqueue(change);
            }
        }
        await this.processChanges();
        this.queue = null;
        this.progressive = true;
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
        await client.subscribe('/', 'macrome-main', expression, {
            drop: ['vcs_lock_held'],
            defer_vcs: false,
            fields,
            since: start,
        }, async (changes) => {
            const noQueue = this.queue === null;
            if (noQueue) {
                this.queue = new queue_1.default();
            }
            for (const change of changes) {
                await this.enqueue(change);
            }
            if (noQueue) {
                await this.processChanges();
                this.queue = null;
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
            if ((await this.getAnnotations(path)) != null) {
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
