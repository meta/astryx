// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared module-loading + conventional-file-discovery primitives.
 *
 * Both config loading and integration loading need to (a) import a
 * user-authored module (`.ts` via jiti, `.mjs`/`.js` via native dynamic
 * import) and (b) find conventional files by basename in a fixed
 * load-precedence order. Generated theme artifacts also use a dedicated jiti
 * path that resolves extensionless JSX/TSX registry imports and loads the
 * stylesheets they import as empty modules. These helpers centralize that
 * behavior so callers stay in lockstep. A module's stdout writes go to stderr
 * while it loads, so project code that prints cannot corrupt a `--json`
 * envelope.
 *
 * `loadModuleWithParser` builds on these primitives to provide the single
 * load/validation boundary shared by config, integration, codemod, and
 * template discovery: import the module, take its default export, and hand it
 * to the authoring parser (which seals its own zod schema).
 */

import * as path from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import * as fs from 'node:fs';
import {createJiti} from 'jiti';

/** @type {ReturnType<typeof createJiti> | undefined} */
let jitiInstance;
let freshImportNonce = 0;
const requireFromHere = createRequire(import.meta.url);
function getJiti() {
  if (!jitiInstance) {
    jitiInstance = createJiti(import.meta.url);
  }
  return jitiInstance;
}

/**
 * Node treats `.js` as ESM only inside the nearest package scope whose
 * package.json declares `"type": "module"`; no package.json defaults to
 * CommonJS.
 * @param {string} file
 * @returns {boolean}
 */
function isCommonJsFile(file) {
  let dir = path.dirname(file);
  for (;;) {
    const packageJson = path.join(dir, 'package.json');
    if (fs.existsSync(packageJson)) {
      try {
        return JSON.parse(fs.readFileSync(packageJson, 'utf-8')).type !== 'module';
      } catch {
        return true;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return true;
    dir = parent;
  }
}

let loadsInFlight = 0;
/** @type {typeof process.stdout.write | undefined} */
let realStdoutWrite;
/** Set in the async context of a module load, and only there. */
const moduleLoad = new AsyncLocalStorage();

/**
 * Run a module load with the stdout writes made in its async context sent to
 * stderr. Writes from any other context pass through, so the CLI's own output
 * stays on stdout even while an abandoned load is still in flight. The gate
 * is installed for the first overlapping load and removed after the last.
 * @template T
 * @param {() => Promise<T>} load
 * @returns {Promise<T>}
 */
async function withStdoutOnStderr(load) {
  if (loadsInFlight++ === 0) {
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
  try {
    return await moduleLoad.run(true, load);
  } finally {
    if (--loadsInFlight === 0 && realStdoutWrite) {
      process.stdout.write = realStdoutWrite;
      realStdoutWrite = undefined;
    }
  }
}

/**
 * Import a user-authored module. `.ts` is loaded via jiti; `.mjs`/`.js` use
 * native dynamic import for ordinary cached reads. A fresh `.ts` read uses a
 * no-cache jiti instance. A fresh CommonJS `.js` read evicts and reloads through
 * `require`; an ESM `.js` or `.mjs` read uses a cache-busted file URL. The
 * nearest package.json `type` decides `.js`, matching Node's package scopes.
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
  return typeof specifier === 'string' && specifier.endsWith('.css');
}

/**
 * Whether `specifier`, resolved from the module at `from`, names an existing
 * `.css` file.
 * @param {string} specifier
 * @param {string} from
 */
function resolvesToStylesheet(specifier, from) {
  try {
    return createRequire(from).resolve(specifier).endsWith('.css');
  } catch {
    return false;
  }
}

/**
 * A built theme module may import a stylesheet so that the app's bundler emits
 * it. Node cannot load a stylesheet, so an import that ends in `.css` and
 * resolves from the theme module to an existing `.css` file loads as an empty
 * module. Any other import loads as before: a missing stylesheet fails like
 * any missing import, and `./tokens.css` loads `tokens.css.js` when that is
 * the file it names. jiti shows only the import text, so the check resolves it
 * from the theme module's folder, not from the importing module's. A module in
 * another folder fails on a stylesheet it reaches by a different relative
 * path, and passes on a missing stylesheet whose path exists from the theme
 * module's folder.
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
 * resolve from that same project root. An import of an existing `.css` file
 * loads as an empty module.
 * @param {string} specifier
 * @param {string} cwd
 * @returns {Promise<Record<string, unknown>>}
 */
export async function importThemeArtifact(specifier, cwd) {
  let themeModule = path.join(cwd, 'package.json');
  const loader = createJiti(path.join(cwd, 'package.json'), {
    moduleCache: false,
    jsx: true,
    interopDefault: true,
    extensions: THEME_ARTIFACT_EXTENSIONS,
    virtualModules: themeArtifactStylesheets(() => themeModule),
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
  return await withStdoutOnStderr(() => loader.import(target));
}

/**
 * @param {string} file absolute path
 * @param {boolean} fresh
 * @returns {Promise<Record<string, unknown>>}
 */
async function importModule(file, fresh) {
  if (fresh && file.endsWith('.ts')) {
    return await createJiti(import.meta.url, {moduleCache: false}).import(file);
  }
  if (fresh && file.endsWith('.js') && isCommonJsFile(file)) {
    const resolved = requireFromHere.resolve(file);
    delete requireFromHere.cache[resolved];
    const value = requireFromHere(file);
    if (
      value != null &&
      typeof value === 'object' &&
      value.__esModule === true &&
      Object.prototype.hasOwnProperty.call(value, 'default')
    ) {
      return value;
    }
    return {
      ...(value != null && typeof value === 'object' ? value : {}),
      default: value,
    };
  }
  if (file.endsWith('.ts')) {
    return await getJiti().import(file);
  }
  const url = pathToFileURL(file);
  if (fresh) {
    url.searchParams.set('astryx-fresh', String(++freshImportNonce));
  }
  return await import(url.href);
}

/**
 * Return the conventional files (by basename, in the given precedence order)
 * that exist directly in `dir`, as absolute paths. Never throws.
 * @param {string} dir
 * @param {string[]} basenames precedence-ordered
 * @returns {string[]} absolute paths of present files, in basenames order
 */
export function findPresentFiles(dir, basenames) {
  return basenames
    .filter(name => fs.existsSync(path.join(dir, name)))
    .map(name => path.join(dir, name));
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
