// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared module-loading + conventional-file-discovery primitives.
 *
 * Both config loading and integration loading need to (a) import a
 * user-authored module (`.ts` via jiti, `.mjs`/`.js` via native dynamic
 * import) and (b) find conventional files by basename in a fixed
 * load-precedence order. Generated theme artifacts also use a dedicated jiti
 * path that resolves extensionless JSX/TSX registry imports. On Node 22.15 and
 * later, a theme module load, of a built artifact or of theme source, loads
 * the stylesheets its modules import (CSS, Sass, Less, Stylus, PostCSS) as
 * empty modules, and the assets they
 * import (an icon's .svg, a picture, a font) as modules whose default export
 * is the file's URL, as a bundler gives it; while it loads, a timer it
 * starts never holds the process open and an exit it calls refuses the load. These helpers
 * centralize that behavior so callers stay in lockstep. A module's stdout
 * writes go to stderr while it loads, so project code that prints cannot
 * corrupt a `--json` envelope.
 *
 * `loadModuleWithParser` builds on these primitives to provide the single
 * load/validation boundary shared by config, integration, codemod, and
 * template discovery: import the module, take its default export, and hand it
 * to the authoring parser (which seals its own zod schema).
 */

import {STYLESHEET_FILE} from './stylesheet-file.mjs';
import * as path from 'node:path';
import {AsyncLocalStorage, createHook} from 'node:async_hooks';
import nodeModule, {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as fs from 'node:fs';
import {findPresentFiles} from './present-files.mjs';
import {importUrl} from './import-url.mjs';
import {jitiCacheOptions} from './jiti-cache.mjs';
import {recordThemeModulePromise} from './theme-module-rejections.mjs';

export {findPresentFiles};

/** @type {ReturnType<typeof createJiti> | undefined} */
let jitiInstance;
let freshImportNonce = 0;
const requireFromHere = createRequire(import.meta.url);

/**
 * jiti, loaded on first use: only TypeScript files and built theme modules
 * need it, so a run that reads neither never loads it.
 * @type {typeof import('jiti').createJiti}
 */
export const createJiti = (...args) =>
  requireFromHere('jiti').createJiti(...args);
function getJiti() {
  if (!jitiInstance) {
    jitiInstance = createJiti(import.meta.url, jitiCacheOptions());
  }
  return jitiInstance;
}

/** Set in the async context of a module load, and only there. */
const moduleLoad = new AsyncLocalStorage();
let stdoutGates = 0;
/** @type {typeof process.stdout.write | undefined} */
let realStdoutWrite;

/**
 * Send the stdout writes made in a module load's async context to stderr
 * until the matching {@link openStdout}. Writes from any other context pass
 * through, so the CLI's own output stays on stdout even while an abandoned
 * load is still in flight. The gate is installed for the first overlapping
 * use and removed after the last.
 */
function gateStdout() {
  if (stdoutGates++ > 0) return;
  const write = process.stdout.write;
  realStdoutWrite = write;
  process.stdout.write = /** @type {any} */ (
    function (/** @type {any} */ chunk, /** @type {any[]} */ ...rest) {
      return moduleLoad.getStore()
        ? process.stderr.write(chunk, ...rest)
        : write.call(process.stdout, chunk, ...rest);
    }
  );
}

function openStdout() {
  if (--stdoutGates > 0 || !realStdoutWrite) return;
  process.stdout.write = realStdoutWrite;
  realStdoutWrite = undefined;
}

/**
 * Run a module load with the stdout writes made in its async context sent to
 * stderr ({@link gateStdout}). A callback the module leaves to run later (a
 * deferred log) is gated again while it runs, by the theme module guards.
 * @template T
 * @param {() => Promise<T>} load
 * @returns {Promise<T>}
 */
async function withStdoutOnStderr(load) {
  gateStdout();
  try {
    return await moduleLoad.run(true, load);
  } finally {
    openStdout();
  }
}

/**
 * Import a user-authored module. `.ts` is loaded via jiti; `.mjs`/`.js` use
 * native dynamic import for ordinary cached reads. A fresh `.ts` read uses a
 * no-cache jiti instance. Any other fresh read drops the module from the
 * require cache and imports a cache-busted file URL. Node then chooses its
 * format as for the first read, so a fresh read gives what a first read gives.
 * Normal loads retain module caching. `fresh` rereads a file that changed
 * during this process: one a codemod rewrote, or an edited doc file (the doc
 * importers in ../doc-compiler/import.mjs read each change once).
 * Anything the module writes to stdout while it loads goes to stderr.
 *
 * @param {string} file absolute path
 * @param {{fresh?: boolean}} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function importUserModule(file, {fresh = false} = {}) {
  return await withStdoutOnStderr(() => importModule(file, fresh));
}

const THEME_ARTIFACT_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
];

/**
 * @param {string | symbol} specifier
 * @returns {specifier is string}
 */
function isStylesheetSpecifier(specifier) {
  return typeof specifier === 'string' && STYLESHEET_FILE.test(specifier);
}

/**
 * Whether `specifier`, resolved from the module at `from`, names an existing
 * `.css` file.
 * @param {string} specifier
 * @param {string} from
 */
function resolvesToStylesheet(specifier, from) {
  try {
    return STYLESHEET_FILE.test(createRequire(from).resolve(specifier));
  } catch {
    return false;
  }
}

/**
 * Module hooks that run in the loading thread: Node 22.15 and later have them.
 * @type {((hooks: object) => {deregister: () => void}) | undefined}
 */
const registerHooks = /** @type {any} */ (nodeModule).registerHooks;
/** Set in the async context of a theme module load, and only there. */
/**
 * Set in the async context of a theme module load: the stylesheets it
 * imports that are not there yet, each loaded as an empty module.
 * Only a caller that asks (`unbuilt`) has them loaded; for any other, a
 * missing stylesheet fails like any missing import.
 * @type {AsyncLocalStorage<{unbuilt: Set<string> | null}>}
 */
const themeModuleLoad = new AsyncLocalStorage();
let themeModuleLoadsInFlight = 0;
/** @type {{deregister: () => void} | null} */
let stylesheetHooks = null;

/** @param {string} url */
function isStylesheetUrl(url) {
  return url.startsWith('file:') && STYLESHEET_FILE.test(new URL(url).pathname);
}

/**
 * Files an app's bundler emits and gives a module its URL for (an icon's
 * .svg, a picture, a font): a theme module may import one, and Node cannot
 * load it.
 */
const ASSET_FILE =
  /\.(?:svg|png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot)$/i;

/** @param {string} url */
function isAssetUrl(url) {
  return url.startsWith('file:') && ASSET_FILE.test(new URL(url).pathname);
}

/**
 * In a theme module load, a module that Node resolves to a `.css` file loads
 * as an empty module, and one that resolves to an asset loads as a module
 * whose default export is the file's URL (what a bundler gives the import).
 * Any other module loads unchanged.
 * @param {string} url
 * @param {any} context
 * @param {(url: string, context: any) => any} next
 */
function loadStylesheetAsEmptyModule(url, context, next) {
  if (themeModuleLoad.getStore() && url.endsWith(UNBUILT_QUERY))
    return {format: 'module', source: '', shortCircuit: true};
  if (themeModuleLoad.getStore() && isStylesheetUrl(url)) {
    return {format: 'module', source: '', shortCircuit: true};
  }
  if (themeModuleLoad.getStore() && isAssetUrl(url)) {
    return {
      format: 'module',
      source: `export default ${JSON.stringify(url)};`,
      shortCircuit: true,
    };
  }
  return next(url, context);
}

/** Marks the URL of a stylesheet a theme module imports that is not there. */
const UNBUILT_QUERY = '?astryx-unbuilt-stylesheet';

/**
 * In a theme module load, a stylesheet import that names no file yet (the
 * stylesheet the theme's own build writes, imported by its source) loads as
 * an empty module and is recorded, so the build can tell it is its own
 * output; any other import resolves as before.
 * @param {string} specifier
 * @param {any} context
 * @param {(specifier: string, context: any) => any} next
 */
function resolveUnbuiltStylesheet(specifier, context, next) {
  try {
    return next(specifier, context);
  } catch (error) {
    const load = themeModuleLoad.getStore();
    const code = /** @type {any} */ (error)?.code;
    if (
      !load?.unbuilt ||
      !STYLESHEET_FILE.test(specifier) ||
      (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND')
    )
      throw error;
    const url = path.isAbsolute(specifier)
      ? pathToFileURL(specifier)
      : context?.parentURL
        ? new URL(specifier, context.parentURL)
        : null;
    if (!url) throw error;
    load.unbuilt.add(fileURLToPath(url));
    return {
      url: `${url.href}${UNBUILT_QUERY}`,
      format: 'module',
      shortCircuit: true,
    };
  }
}

function removeStylesheetHooks() {
  try {
    stylesheetHooks?.deregister();
    stylesheetHooks = null;
  } catch {
    // A hook that Node cannot remove stays inert: it acts only in a theme
    // module load, and the next load uses it again.
  }
}

/**
 * Run a theme module load with every stylesheet that the theme's modules
 * import, at any depth, loaded as an empty module, and every asset they
 * import (an .svg, a picture, a font) as its URL. A theme module can import
 * a stylesheet so that the app's bundler emits it, and Node cannot load a
 * stylesheet. Node resolves each import from the module that writes it, and
 * an import that ends in `.css` but names a JavaScript file loads that file.
 * With `options.unbuilt`, a stylesheet import that names no file yet loads
 * as an empty module too, and its path is added there: the caller tells
 * whether it is a file the build itself writes, and refuses any other.
 * Without it, a missing stylesheet fails like any missing import. Module loads
 * outside this call's async context do not change. The module hook is
 * installed for the first overlapping load and removed after the last. A
 * Node without module hooks (before 22.15) runs the load unchanged.
 * @template T
 * @param {() => Promise<T>} load
 * @param {{unbuilt?: Set<string>}} [options]
 * @returns {Promise<T>}
 */
export async function withEmptyStylesheets(load, options = {}) {
  // A theme module is read for its export, in the CLI's own process: what it
  // prints goes to stderr (never into a --json envelope), a timer it leaves
  // running never keeps the command from exiting, and an exit it calls
  // while loading is a refused load, never the command's own exit.
  const guarded = () => withStdoutOnStderr(() => withThemeModuleGuards(load));
  if (typeof registerHooks !== 'function') return await guarded();
  stylesheetHooks ??= registerHooks({
    resolve: resolveUnbuiltStylesheet,
    load: loadStylesheetAsEmptyModule,
  });
  themeModuleLoadsInFlight++;
  try {
    return await themeModuleLoad.run(
      {unbuilt: options.unbuilt ?? null},
      guarded,
    );
  } finally {
    if (--themeModuleLoadsInFlight === 0) removeStylesheetHooks();
  }
}

/**
 * Set in the async context of a guarded theme module load: whether the load
 * is done, and the handles (timers, watchers, servers, message ports) the
 * module opened while it loaded.
 * @typedef {{done: boolean, handles: Array<{unref: () => void}>}} GuardedLoad
 * @type {AsyncLocalStorage<GuardedLoad>}
 */
const guardedLoad = new AsyncLocalStorage();
let guardedLoadsInFlight = 0;
/** @type {typeof process.exit | null} */
let realExit = null;
let guardsInstalled = false;
/** Callbacks of a module load running now, each holding the stdout gate. */
const deferredGates = new Set();

/**
 * A theme module that called `process.exit` while it loaded: the load is
 * refused with it, and the command goes on to say so.
 */
export class ThemeModuleExitError extends Error {
  /** @param {unknown} code */
  constructor(code) {
    super(
      `the module called process.exit(${code ?? ''}) while it loaded; a theme file only exports its theme, so remove the exit (or move it into a script of its own)`,
    );
    this.name = 'ThemeModuleExitError';
  }
}

/**
 * A theme module whose top-level await never settled: nothing was left to
 * run, so it could never finish loading.
 */
export class ThemeModuleUnsettledError extends Error {
  constructor() {
    super(
      'its top-level await never settled (it waits for something that never comes), so the module never finished loading; a theme file only exports its theme, so remove the wait',
    );
    this.name = 'ThemeModuleUnsettledError';
  }
}

/**
 * Install, once, what a theme module's code meets in the CLI's process, in
 * its async context only (anything else in the process runs as before):
 * - each handle it opens (a timer from any module, a file watcher, a
 *   server, a message port) is let go when its load is done, so it never
 *   keeps the command from exiting; one the load waits on holds the process
 *   while it loads;
 * - each promise it creates is recorded, so a rejection it never handles is
 *   told as a warning (theme-module-rejections.mjs), never the command's
 *   crash;
 * - a callback it left that runs after its load (a deferred log) prints to
 *   stderr, as the load did.
 */
function installThemeModuleGuards() {
  if (guardsInstalled) return;
  guardsInstalled = true;
  createHook({
    init(_asyncId, type, _triggerAsyncId, resource) {
      const load = guardedLoad.getStore();
      if (!load) return;
      if (type === 'PROMISE') {
        recordThemeModulePromise(/** @type {Promise<unknown>} */ (resource));
        return;
      }
      const handle = /** @type {{unref?: () => void}} */ (resource);
      if (typeof handle?.unref !== 'function') return;
      const unref = handle.unref.bind(handle);
      // A handle opened after the load is let go once it is set up.
      if (load.done) queueMicrotask(unref);
      else load.handles.push({unref});
    },
    before(asyncId) {
      if (!moduleLoad.getStore()) return;
      gateStdout();
      deferredGates.add(asyncId);
    },
    after(asyncId) {
      if (deferredGates.delete(asyncId)) openStdout();
    },
  }).enable();
}

/**
 * Run a theme module load with `process.exit` refusing the load (while it
 * loads, in its async context only), a `process.exitCode` it sets put back
 * (the command's exit code is its own), the module's handles let go once it
 * is done ({@link installThemeModuleGuards}), and a load whose top-level
 * await can never settle refused (nothing is left to run while it waits).
 * @template T
 * @param {() => Promise<T>} load
 * @returns {Promise<T>}
 */
async function withThemeModuleGuards(load) {
  installThemeModuleGuards();
  if (guardedLoadsInFlight++ === 0) {
    const exit = process.exit;
    realExit = exit;
    process.exit = /** @type {any} */ (
      function (/** @type {any} */ code) {
        const store = guardedLoad.getStore();
        if (store && !store.done) throw new ThemeModuleExitError(code);
        return exit.call(process, code);
      }
    );
  }
  /** @type {GuardedLoad} */
  const store = {done: false, handles: []};
  const exitCode = process.exitCode;
  /** @type {() => void} */
  let drained = () => {};
  const unsettled = new Promise((_resolve, reject) => {
    // Refused from a macrotask, so Node's loop stays alive and tells the
    // next waiting load (a command that loads the theme again) the same way.
    drained = () => setImmediate(() => reject(new ThemeModuleUnsettledError()));
  });
  // Node empties its loop with the load still waiting: refused, not exit 13.
  process.once('beforeExit', drained);
  try {
    return await Promise.race([guardedLoad.run(store, load), unsettled]);
  } finally {
    process.removeListener('beforeExit', drained);
    process.exitCode = exitCode;
    store.done = true;
    for (const handle of store.handles.splice(0)) handle.unref();
    if (--guardedLoadsInFlight === 0 && realExit) {
      process.exit = realExit;
      realExit = null;
    }
  }
}

/**
 * The stylesheet rule for a Node without module hooks. An import that ends in
 * `.css` and resolves from the theme module to an existing `.css` file loads
 * as an empty module. Any other import loads as before: a missing stylesheet
 * fails like any missing import, and `./tokens.css` loads `tokens.css.js` when
 * that is the file it names. jiti shows only the import text, so the check
 * resolves it from the theme module's folder, not from the importing module's.
 * A module in another folder fails on a stylesheet it reaches by a different
 * relative path, and passes on a missing stylesheet whose path exists from the
 * theme module's folder.
 * @param {() => string} themeModule returns the theme module's path
 * @returns {Record<string, unknown>}
 */
function themeArtifactStylesheets(themeModule) {
  return new Proxy(
    {},
    {
      has: (_target, specifier) =>
        specifier !== themeModule() &&
        isStylesheetSpecifier(specifier) &&
        resolvesToStylesheet(specifier, themeModule()),
      get: (_target, specifier) =>
        isStylesheetSpecifier(specifier) ? {} : undefined,
    },
  );
}

class ThemeArtifactNotFoundError extends Error {
  code = 'ERR_THEME_ARTIFACT_NOT_FOUND';

  /** @param {string} specifier @param {unknown} [cause] */
  constructor(specifier, cause) {
    super(`Theme artifact "${specifier}" does not resolve.`, {cause});
    this.name = 'ThemeArtifactNotFoundError';
  }
}

/** @param {unknown} error */
function isMissingPackageExport(error) {
  if (error == null || typeof error !== 'object' || !('code' in error)) {
    return false;
  }
  return (
    typeof error.code === 'string' &&
    [
      'ERR_MODULE_NOT_FOUND',
      'ERR_PACKAGE_PATH_NOT_EXPORTED',
      'MODULE_NOT_FOUND',
    ].includes(error.code)
  );
}

/**
 * Load a generated theme artifact and its extensionless JS/JSX/TS/TSX graph.
 * Package specifiers resolve from the consumer project, while relative paths
 * resolve from that same project root. A stylesheet that a module in the graph
 * imports loads as an empty module (`withEmptyStylesheets`). A target that is
 * itself a stylesheet is not a theme module, and fails as one.
 * @param {string} specifier
 * @param {string} cwd
 * @returns {Promise<Record<string, unknown>>}
 */
export async function importThemeArtifact(specifier, cwd) {
  let themeModule = path.join(cwd, 'package.json');
  const loader = createJiti(path.join(cwd, 'package.json'), {
    ...jitiCacheOptions(),
    moduleCache: false,
    jsx: true,
    interopDefault: true,
    extensions: THEME_ARTIFACT_EXTENSIONS,
    ...(typeof registerHooks === 'function'
      ? {}
      : {virtualModules: themeArtifactStylesheets(() => themeModule)}),
  });
  let target;
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    target = path.resolve(cwd, specifier);
  } else {
    try {
      target = loader.resolve(specifier);
    } catch (error) {
      if (!isMissingPackageExport(error)) throw error;
      throw new ThemeArtifactNotFoundError(specifier, error);
    }
  }
  if (!fs.existsSync(target)) {
    throw new ThemeArtifactNotFoundError(specifier);
  }
  themeModule = target;
  /** @type {() => Promise<Record<string, unknown>>} */
  const load = () => loader.import(target);
  return await withStdoutOnStderr(
    isStylesheetSpecifier(target) ? load : () => withEmptyStylesheets(load),
  );
}

/**
 * @param {string} file absolute path
 * @param {boolean} fresh
 * @returns {Promise<Record<string, unknown>>}
 */
async function importModule(file, fresh) {
  if (fresh && file.endsWith('.ts')) {
    return await createJiti(import.meta.url, {
      ...jitiCacheOptions(),
      moduleCache: false,
    }).import(file);
  }
  if (file.endsWith('.ts')) {
    return await getJiti().import(file);
  }
  const url = pathToFileURL(file);
  // The node test project loads import-url.mjs natively. An import from here
  // would be a request to the test runner, and a theme build reads every Core
  // doc through it.
  if (!fresh) return await readInTurn(file, () => importUrl(url.href));
  // Node chooses the format again, as for the first import: a package's
  // "type", the extension, or the source's syntax. The query names a new ES
  // module. A CommonJS module also needs its cache entry gone.
  url.searchParams.set('astryx-fresh', String(++freshImportNonce));
  return await readFreshInTurn(file, () => importUrl(url.href));
}

/**
 * The name Node's CommonJS cache gives `file`: its real path, so a link and
 * its target name one entry. A file that does not resolve keeps its path.
 * @param {string} file absolute path
 * @returns {string}
 */
function cacheKey(file) {
  try {
    return requireFromHere.resolve(file);
  } catch {
    return file;
  }
}

/**
 * Each file's latest read, by its cache name, settled once that read ends.
 * @type {Map<string, Promise<void>>}
 */
const readsInProgress = new Map();

/**
 * Run `read`, an import of `file`, once the imports of `file` started before
 * it have ended. Imports of other files do not wait. A fresh read removes the
 * file from Node's CommonJS cache. A CommonJS import still in progress needs
 * that entry until it ends.
 * @template T
 * @param {string} file absolute path
 * @param {() => Promise<T>} read
 * @returns {Promise<T>}
 */
export function readInTurn(file, read) {
  const key = cacheKey(file);
  const before = readsInProgress.get(key) ?? Promise.resolve();
  const result = before.then(read);
  const ended = result.then(
    () => {},
    () => {},
  );
  readsInProgress.set(key, ended);
  void ended.then(() => {
    if (readsInProgress.get(key) === ended) readsInProgress.delete(key);
  });
  return result;
}

/**
 * Run `read`, a fresh import of `file`, in the file's turn (`readInTurn`),
 * once the file is gone from Node's CommonJS cache. A new URL names a new ES
 * module only, so a CommonJS module also needs its cache entry gone.
 * @template T
 * @param {string} file absolute path
 * @param {() => Promise<T>} read
 * @returns {Promise<T>}
 */
export function readFreshInTurn(file, read) {
  return readInTurn(file, () => {
    delete requireFromHere.cache[cacheKey(file)];
    return read();
  });
}

/**
 * Import a user-authored module, take its default export, and validate it
 * through an authoring parser. This is the single load/validation boundary for
 * all user-authored modules (config, integration, codemod, template): execute
 * the module, take the default export, and hand it to the parser, which returns
 * the typed value or throws a clear, readable error. Zod stays sealed inside
 * the parser — this boundary never touches it.
 *
 * @template T
 * @param {string} file absolute path
 * @param {(input: unknown, label?: string) => T} parse an authoring parser
 *   (parseConfig, parseIntegration, parseCodemod, parseTemplate)
 * @param {{label?: string, fresh?: boolean}} [opts] label used in error messages;
 *   `fresh` bypasses the module cache after an in-process codemod write
 * @returns {Promise<T>} parsed + typed value
 */
export async function loadModuleWithParser(
  file,
  parse,
  {label, fresh = false} = {},
) {
  const mod = await importUserModule(file, {fresh});
  return parse(mod?.default, label ?? file);
}
