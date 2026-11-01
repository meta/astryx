// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file theme build API — compile standalone themes or one selected family.
 * @input JS/TS theme modules, build/check options, and the installed Core.
 * @output Generated artifacts preserving imported and inherited icon registries.
 * @position CLI theme compiler; standalone icon provenance is icon-imports.mjs.
 *
 * `themeBuild` and `themeBuildFamily` share the same loader, compiler,
 * serializers, check, and writer. They read defineTheme() sources and, via
 * @astryxdesign/core's shared generator (the SINGLE source of truth so the
 * build emits the exact CSS the `<Theme>` runtime does), writes:
 * - A CSS file with token overrides and component styles
 * - A CSS declaration module for strict side-effect imports
 * - A JS module that re-exports the built theme (+ icon registry); function
 *   icon entries stay functions for `Icon`, beside a node view of the registry
 * - A .d.ts (plus an optional .variants.d.ts for custom prop values and the
 *   theme's icon variant names)
 *
 * It performs the writes and returns a `theme.build` receipt — its `warnings`
 * carry override problems and every declaration core's generator dropped
 * because its value could not stay one CSS declaration; `notices` carry fonts
 * the theme names but does not load (font-warning.mjs) — or `null` when the
 * theme produced no CSS (nothing to build). Standalone icon imports come from
 * the selected theme's parsed bindings and inheritance, never from comment or
 * string contents. A registry that cannot be preserved fails before output
 * generation, including in check mode. Errors throw AstryxError (with a stable
 * code). Private-variable diagnostics keep their released warnings and generated
 * files; an internal callback lets the CLI make only the process status fail.
 * Human progress is emitted through the shared `logger` (silent by default), so
 * the CLI keeps its exact output while a programmatic caller stays quiet.
 * Every output a build writes, explicit or beside the theme file, stays inside
 * `cwd` (`ERR_PATH_TRAVERSAL` otherwise). Check mode writes nothing, so it
 * compares outputs outside `cwd` read-only; only a relative `out` path that
 * escapes `cwd` is refused there too.
 *
 * The installed `@astryxdesign/core` is an independently versioned optional
 * peer, so it can be older than the CLI. A theme that uses only baseline
 * features builds against such a core unchanged; a theme that needs ordered
 * adaptations (which need core's `generateAdaptationCSS`) fails early with
 * ERR_CORE_INCOMPATIBLE rather than emitting CSS with those rules quietly
 * missing. That check is scoped to the adaptation capability — it is not a
 * general compatibility scheme for every export an arbitrary older core might
 * lack.
 *
 * Core is imported on first use, never when this module loads: the CLI loads
 * this module for every command, and Core's root entry pulls in all of Core
 * and React.
 *
 * With `{check: true}`, it compiles the same outputs in memory but writes
 * nothing: it compares each generated file against what is on disk (ignoring
 * only the volatile `@generated` `Command:` line) and returns a
 * `theme.build.check` receipt listing any stale or missing outputs. This is
 * the CI guard for committed, generated theme CSS: the source of truth is
 * `<theme>.ts`, and `theme build --check` fails when the committed
 * `<theme>.css`/`.js`/`.d.ts` no longer match it. Builds also write a
 * `<theme>.css.d.ts` import stub; check mode tolerates that one file being absent
 * so output sets from the released CLI stay valid after an upgrade.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire, isBuiltin} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parse} from '@babel/parser';
import {createJiti} from 'jiti';
import {
  formatCliCommand,
  getCliInvocation,
} from '../../../foundation/env/package-manager.mjs';
import {
  CLI_ROOT,
  findCoreDir,
  findInstalledPackage,
  findProjectCoreDir,
} from '../../../foundation/fs/paths.mjs';
import {isGlobalCopy} from '../../../foundation/release/choose.mjs';
import {isInReleaseCache} from '../../../foundation/release/cache.mjs';
import {fetchCarriedThemeCoreDir} from '../_adapter.mjs';
import {
  assertWithin,
  sanitizeName,
  PathSafetyError,
} from '../../../foundation/fs/path-safety.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {validatePrivateVars} from '../../../foundation/config/theme-private-vars.mjs';
import {AstryxError} from '../../error.mjs';
import {applyWrites} from '../../integration/add-helpers.mjs';
import {logger} from '../../logger.mjs';
import {loadComponentDoc} from '../../../foundation/discovery/component-loader.mjs';
import {
  collectThemingTargets,
  targetsByKey,
} from '../../../foundation/discovery/theming-targets.mjs';
import {
  collectUnloadedFonts,
  formatBatchFontLoadingHelp,
  formatFontLoadingHelp,
} from './font-warning.mjs';
import {interceptCore} from './core-interception.mjs';
import {generateFamilyCSS, resolveThemeFamily} from './family.mjs';
import {resolveIconImports} from './icon-imports.mjs';

// Import shared theme processing from core. `astryx theme build` MUST produce the
// exact same CSS as the `<Theme>` runtime, so it has exactly one generation
// path: core's generator. There is no in-CLI fallback implementation — if this
// import fails, the build fails (see the ERR_CORE_NOT_FOUND guard in the theme
// action). A built, resolvable `@astryxdesign/core` is a hard requirement.
// A built, resolvable `@astryxdesign/core` is a hard requirement. These are
// populated from a dynamic import (a runtime boundary), so `any` is intentional.
// That import runs the first time a build needs Core (see `loadCliCore`), not
// when this module loads.
//
// The CLI and core are independently versioned optional peers, so this import
// can succeed against a core OLDER than the CLI. Only the exports every theme
// build needs are REQUIRED (`defineTheme`, `generateThemeRulesSplit`).
// `generateAdaptationCSS` (ordered environmental adaptations) is treated as a
// capability instead, required only by a theme that actually uses it:
// requiring it unconditionally made every theme build — adaptations or not —
// fail against an older published core. This is a targeted allowance for that
// one capability, not a general scheme; `generateOnMediaCSS` exists in every
// core that ships adaptations' predecessor surface.
/** @type {any} */ let _defineTheme = null;
/** @type {any} */ let _generateThemeRulesSplit = null;
/** @type {any} */ let _generateOnMediaCSS = null;
/** @type {any} */ let _generateAdaptationCSS = null;
/**
 * The whole `@astryxdesign/core/theme` namespace. A theme file handed a
 * wrapped core must still get every export the installed one has, including
 * ones this file never names — so interception spreads this rather than
 * rebuilding a core from the handful of functions below.
 */
/** @type {any} */ let _coreThemeModule = null;
/**
 * The `@astryxdesign/core` ROOT namespace, imported separately because it
 * exports far more than the theme subpath. Interception must hand a theme file
 * that imports a component from the root the root's own exports, not the theme
 * namespace wearing its name.
 */
/** @type {any} */ let _coreRootModule = null;
/** @type {any} */ let _coreImportError = null;

/**
 * The bindings one Core provides: the namespaces interception spreads, the
 * functions the build calls, and why the import failed, if it did.
 * @typedef {{
 *   themeModule: any,
 *   rootModule: any,
 *   importError: any,
 *   defineTheme: any,
 *   generateThemeRulesSplit: any,
 *   generateOnMediaCSS: any,
 *   generateAdaptationCSS: any,
 * }} CoreBindings
 */

/**
 * Import the CLI's own Core: the `@astryxdesign/core` this module resolves.
 * Never throws. A failed import is kept as `importError`, so the build can
 * surface a precise, actionable error when it runs.
 * @returns {Promise<CoreBindings>}
 */
async function importCliCore() {
  /** @type {CoreBindings} */
  const core = {
    themeModule: null,
    rootModule: null,
    importError: null,
    defineTheme: null,
    generateThemeRulesSplit: null,
    generateOnMediaCSS: null,
    generateAdaptationCSS: null,
  };
  try {
    const coreTheme = await import('@astryxdesign/core/theme');
    core.themeModule = coreTheme;
    core.defineTheme = coreTheme.defineTheme;
    core.generateThemeRulesSplit = coreTheme.generateThemeRulesSplit;
    core.generateOnMediaCSS = coreTheme.generateOnMediaCSS;
    core.generateAdaptationCSS = coreTheme.generateAdaptationCSS;
    try {
      core.rootModule = await import('@astryxdesign/core');
    } catch {
      // A core without a usable root entry still builds themes; interception
      // falls back to the theme namespace for the root specifier.
    }
  } catch (e) {
    // Capture the reason so the theme action can surface a precise, actionable
    // error. The hard failure happens when `theme build` runs.
    core.importError = e;
  }
  return core;
}

/**
 * The CLI's own Core, imported once, the first time a build needs it. The CLI
 * loads this module for every command, and Core's root entry loads all of Core
 * and React, so an import at module load would make every command
 * (`--version` included) pay for that whenever a Core resolves.
 * @type {Promise<CoreBindings> | null}
 */
let _cliCorePromise = null;

/**
 * The CLI's own Core, kept so each build can choose between it and the
 * project's installed Core. The first call also points the build at it, so a
 * step that runs before any build has chosen a Core reads the CLI's own.
 * @returns {Promise<CoreBindings>}
 */
function loadCliCore() {
  _cliCorePromise ??= importCliCore().then(core => {
    setCore(core);
    return core;
  });
  return _cliCorePromise;
}

/**
 * Point the build at one Core: the module-level bindings every step reads.
 * @param {CoreBindings} core
 */
function setCore(core) {
  _coreThemeModule = core.themeModule;
  _coreRootModule = core.rootModule;
  _coreImportError = core.importError;
  _defineTheme = core.defineTheme;
  _generateThemeRulesSplit = core.generateThemeRulesSplit;
  _generateOnMediaCSS = core.generateOnMediaCSS;
  _generateAdaptationCSS = core.generateAdaptationCSS;
}

/**
 * The file an `import` of `subpath` reaches through a package's `exports` map,
 * or null when the map has no entry for it. Conditions are taken in the map's
 * own order, as Node does, accepting the ones an import matches here: `node`,
 * `import`, and `default` (so `source` and `types` are skipped).
 *
 * @param {string} dir - The package directory.
 * @param {string} subpath - `'.'` or a subpath such as `'./theme'`.
 * @returns {string|null}
 */
function importTarget(dir, subpath) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
  } catch {
    return null;
  }
  const map = pkg?.exports;
  const bySubpath =
    map &&
    typeof map === 'object' &&
    !Array.isArray(map) &&
    Object.keys(map).some(key => key.startsWith('.'));
  const entry = bySubpath ? map[subpath] : subpath === '.' ? map : undefined;
  /** @param {any} value @returns {string|null} */
  const pick = value => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    for (const [condition, target] of Object.entries(value)) {
      if (
        condition !== 'node' &&
        condition !== 'import' &&
        condition !== 'default'
      )
        continue;
      const picked = pick(target);
      if (picked) return picked;
    }
    return null;
  };
  const target = pick(entry);
  return target ? path.resolve(dir, target) : null;
}

/** @param {string} file @returns {string} its real path, or itself */
function realOrSelf(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
}

/**
 * `target` spelled through real directories: the deepest ancestor that exists
 * is resolved through its symlinks, and the missing rest is appended as given.
 * @param {string} target absolute path
 * @returns {string}
 */
function realLocation(target) {
  /** @type {string[]} */
  const missing = [];
  let existing = target;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(realOrSelf(existing), ...missing);
}

/**
 * The Core the project at `cwd` installed, when it differs from the one the
 * CLI's own import found and loads. The app's `<Theme>` runs on the app's
 * Core, so building with it keeps the CSS identical; and a CLI run one-off
 * (`npx @astryxdesign/cli`) has no Core beside it at all. Null when there is
 * nothing better than the CLI's own import: no installed Core (the Astryx
 * repository, a bare directory) or the same Core. A Core that is there but
 * does not load, or lacks the functions the build calls, throws, naming it:
 * building with another Core would not match the app's `<Theme>`.
 *
 * @param {string} cwd
 * @param {CoreBindings} cliCore - The CLI's own Core, from {@link loadCliCore}.
 * @param {{projectOnly?: boolean}} [options] `projectOnly`: never the
 *   carried Core, as for doctor (spec AST-081 FR3)
 * @returns {Promise<CoreBindings | null>}
 */
async function loadProjectCore(cwd, cliCore, {projectOnly = false} = {}) {
  // Outside a project, the Core the answering copy carries (spec AST-081 FR3).
  const installed = findInstalledPackage(cwd, '@astryxdesign/core');
  const dir = installed ?? (projectOnly ? null : fetchCarriedThemeCoreDir(cwd));
  const themeFile = dir ? importTarget(dir, './theme') : null;
  if (!dir || !themeFile) return null;
  if (cliCore.themeModule) {
    const own = cliCoreThemeFile();
    if (own != null && realOrSelf(own) === realOrSelf(themeFile)) return null;
  }
  let themeModule;
  try {
    themeModule = await import(pathToFileURL(themeFile).href);
  } catch (error) {
    throw new AstryxError(
      installed == null
        ? carriedCoreMessage(dir, /** @type {Error} */ (error))
        : coreUnavailableMessage(cwd, /** @type {Error} */ (error)),
      undefined,
      ERROR_CODES.ERR_CORE_NOT_FOUND,
    );
  }
  const missing = ['defineTheme', 'generateThemeRulesSplit'].filter(
    name => typeof themeModule[name] !== 'function',
  );
  if (missing.length > 0) {
    throw new AstryxError(
      `The @astryxdesign/core at ${path.relative(cwd, dir) || '.'} does not export ${missing.join(' or ')} from its \`./theme\` entry, which \`${formatCliCommand('theme build')}\` calls. Update it.`,
      undefined,
      ERROR_CODES.ERR_CORE_INCOMPATIBLE,
    );
  }
  let rootModule = null;
  const rootFile = importTarget(dir, '.');
  if (rootFile) {
    try {
      rootModule = await import(pathToFileURL(rootFile).href);
    } catch {
      // As with the CLI's own import, the theme namespace stands in for it.
    }
  }
  return {
    themeModule,
    rootModule,
    importError: null,
    defineTheme: themeModule.defineTheme,
    generateThemeRulesSplit: themeModule.generateThemeRulesSplit,
    generateOnMediaCSS: themeModule.generateOnMediaCSS,
    generateAdaptationCSS: themeModule.generateAdaptationCSS,
  };
}

/**
 * The file the CLI's own `@astryxdesign/core/theme` resolves to, or null when
 * the CLI has no Core of its own (a one-off `npx` run).
 * @returns {string | null}
 */
function cliCoreThemeFile() {
  try {
    return fileURLToPath(import.meta.resolve('@astryxdesign/core/theme'));
  } catch (error) {
    const {code} = /** @type {NodeJS.ErrnoException} */ (error);
    if (
      code === 'ERR_MODULE_NOT_FOUND' ||
      code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * The error for a Core the answering copy carries (outside a project) that
 * does not load.
 * @param {string} dir
 * @param {Error} importError
 * @returns {string}
 */
function carriedCoreMessage(dir, importError) {
  return (
    `Could not load the @astryxdesign/core this CLI release carries, at ${dir}.` +
    `\n  Import error: ${importError.message}`
  );
}

/** @type {Map<string, Awaited<ReturnType<typeof loadProjectCore>>>} */
const _projectCores = new Map();

/**
 * Choose the Core this build generates with: the project's installed one when
 * {@link loadProjectCore} finds it, else the CLI's own. With `projectOnly`,
 * only the project's installed Core: a build that cannot use it fails rather
 * than read the Core the answering copy carries (spec AST-081 FR3).
 * @param {string} cwd
 * @param {{projectOnly?: boolean}} [options]
 */
async function selectCore(cwd, {projectOnly = false} = {}) {
  const cliCore = await loadCliCore();
  const key = `${projectOnly ? 'project' : 'any'}\0${cwd}`;
  if (!_projectCores.has(key))
    _projectCores.set(key, await loadProjectCore(cwd, cliCore, {projectOnly}));
  const projectCore = _projectCores.get(key);
  // A global or cached copy's own Core is the carried one.
  if (projectOnly && !projectCore && carriesCore() && !cliCoreIsProjects(cwd)) {
    throw new AstryxError(
      "The project's Core isn't installed.",
      undefined,
      ERROR_CODES.ERR_CORE_NOT_FOUND,
    );
  }
  setCore(projectCore ?? cliCore);
}

/**
 * Whether this CLI copy is one installed for the computer or kept in the
 * per-user release cache, whose own Core import is the carried Core.
 * @returns {boolean}
 */
function carriesCore() {
  return isGlobalCopy(CLI_ROOT) || isInReleaseCache(CLI_ROOT);
}

/**
 * Whether the Core the CLI's own import loads is the one the project at
 * `cwd` installed.
 * @param {string} cwd
 * @returns {boolean}
 */
function cliCoreIsProjects(cwd) {
  const dir = findProjectCoreDir(cwd);
  if (!dir) return false;
  const own = cliCoreThemeFile();
  const theirs = importTarget(dir, './theme');
  return (
    own != null && theirs != null && realOrSelf(own) === realOrSelf(theirs)
  );
}

/**
 * Whether `cwd` sits in the Astryx repository, where Core is built from
 * source rather than installed.
 * @param {string} cwd
 */
function inAstryxRepository(cwd) {
  let dir = cwd;
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(
          path.join(dir, 'packages', 'core', 'package.json'),
          'utf-8',
        ),
      );
      if (pkg?.name === '@astryxdesign/core') return true;
    } catch {
      // Not here; keep walking up.
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

/**
 * Why `theme build` has no Core to generate with, and the fix for where it
 * ran: the Astryx repository builds Core, an app installs it, and an installed
 * Core that will not load is named.
 *
 * @param {string} cwd
 * @param {any} importError - Why the import failed, when it threw.
 * @returns {string}
 */
export function coreUnavailableMessage(cwd, importError) {
  const why = `\`${formatCliCommand('theme build')}\` generates CSS with @astryxdesign/core, the same code the runtime <Theme> uses`;
  const detail = importError ? `\n  Import error: ${importError.message}` : '';
  if (inAstryxRepository(cwd)) {
    return (
      `Could not load @astryxdesign/core/theme: ${why}. Build @astryxdesign/core ` +
      `first (e.g. \`pnpm -F @astryxdesign/core build\`).${detail}`
    );
  }
  const installed = findInstalledPackage(cwd, '@astryxdesign/core');
  if (installed) {
    return (
      `Could not load the @astryxdesign/core installed at ` +
      `${path.relative(cwd, installed) || '.'}: ${why}. Reinstall it.${detail}`
    );
  }
  return (
    `This project does not have @astryxdesign/core installed: ${why}. Install ` +
    `it: \`npm install @astryxdesign/core\` (or yarn/pnpm/bun).${detail}`
  );
}

/**
 * Read a package's `version` from a resolved directory. Returns `'unknown'`
 * when it can't be read so the header always has a value.
 * @param {string|null} dir
 * @returns {string}
 */
function readPkgVersion(dir) {
  if (!dir) return 'unknown';
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'),
    );
    return pkg?.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Resolve the CLI and core package versions recorded in generated headers.
 * These are stable (unlike a timestamp): identical inputs produce byte-identical
 * output, so rebuilds don't churn git and `theme build --check` stays a pure
 * content-drift signal.
 * @param {string} cwd - Consumer cwd, used to locate the installed core.
 * @returns {{cli: string, core: string}}
 */
function resolveToolVersions(cwd) {
  return {
    cli: readPkgVersion(CLI_ROOT),
    core: readPkgVersion(findCoreDir(cwd)),
  };
}

/**
 * Build a @generated attribution header for generated files.
 * @param {string} sourceFile - Relative path to the source theme file
 * @param {'css'|'js'|'ts'} lang - File language (determines comment syntax)
 * @param {string} [command] - The full CLI command used to generate this file
 * @param {{cli: string, core: string}} [versions] - CLI/core versions used to build
 */
function generatedHeader(sourceFile, lang = 'js', command, versions) {
  const body = [
    `@generated by \`astryx theme build\` — do not edit manually.`,
    `Source: ${sourceFile}`,
  ];
  if (command) {
    body.push(`Command: ${command}`);
  }
  if (versions) {
    body.push(`CLI: @astryxdesign/cli@${versions.cli}`);
    body.push(`Core: @astryxdesign/core@${versions.core}`);
  }
  if (lang === 'css') {
    return `/*\n * ${body.join('\n * ')}\n */\n\n`;
  }
  return `/**\n * ${body.join('\n * ')}\n */\n\n`;
}

/**
 * Normalize generated file content for staleness comparison by dropping the
 * volatile `Command:` line of the `@generated` header (it embeds the
 * invocation, e.g. an explicit --out). Everything else — including the rest of
 * the header and all real content — is compared verbatim. Used only by
 * `--check`: a differing command must NOT report a file as stale, but any real
 * content drift must. The `CLI:`/`Core:` provenance lines are deterministic
 * for a given toolchain, so they compare verbatim like real content.
 * @param {string} content
 * @returns {string}
 */
export function normalizeThemeBuildForCompare(content) {
  return content
    .split('\n')
    .filter(line => {
      const t = line.replace(/^\s*\*?\s?/, '');
      return !t.startsWith('Command:');
    })
    .join('\n');
}

/** @param {Array<{dest: string, content: string, allowMissingInCheck?: boolean}>} writes @param {string} cwd @returns {Array<{path: string, reason: 'missing' | 'outdated'}>} */
function staleBuildOutputs(writes, cwd) {
  /** @type {Array<{path: string, reason: 'missing' | 'outdated'}>} */
  const stale = [];
  for (const write of writes) {
    const rel = path.relative(cwd, write.dest);
    if (!fs.existsSync(write.dest)) {
      if (!write.allowMissingInCheck) {
        stale.push({path: rel, reason: 'missing'});
      }
      continue;
    }
    const onDisk = fs.readFileSync(write.dest, 'utf8');
    if (
      normalizeThemeBuildForCompare(onDisk) !==
      normalizeThemeBuildForCompare(write.content)
    ) {
      stale.push({path: rel, reason: 'outdated'});
    }
  }
  return stale;
}

/** @param {Array<{dest: string, allowMissingInCheck?: boolean}>} writes @param {string} cwd */
function checkedBuildOutputs(writes, cwd) {
  return writes
    .filter(write => !write.allowMissingInCheck || fs.existsSync(write.dest))
    .map(write => path.relative(cwd, write.dest));
}

/** Remedies that end a confinement error, by where the output path came from. */
const OUT_REMEDY = 'Pass an --out path inside it.';
const SOURCE_REMEDY =
  'Without --out the outputs go beside the theme file, so run the build from a directory that contains the theme file, or pass an --out path inside the working directory.';
const FAMILY_REMEDY =
  "Family outputs go beside the family's root theme file, so run the build from a directory that contains it.";

/**
 * Refuse an output outside `root`: every write is confined, whether `out` names
 * the path or it defaults to the theme file's directory (architecture:cli-surface
 * INV10). Both sides are compared by real location, so an absolute path that
 * reaches the working directory through a symlink is inside it, and a symlink
 * inside it that leads elsewhere is not.
 * @param {string} dest absolute output path
 * @param {string} root the directory writes stay inside: the working directory
 * @param {string} remedy what to do instead; ends the error message
 * @param {string} [shown] the path as the caller wrote it, for the message
 */
function confineOutput(dest, root, remedy, shown = dest) {
  try {
    assertWithin(realLocation(dest), realOrSelf(path.resolve(root)), {
      allowAbsolute: true,
      label: 'output path',
    });
  } catch (err) {
    if (!(err instanceof PathSafetyError)) throw err;
    throw new AstryxError(
      err.code === ERROR_CODES.ERR_PATH_TRAVERSAL
        ? `Output path "${shown}" is outside the working directory (${root}). ${remedy}`
        : err.message,
      undefined,
      ERROR_CODES.ERR_PATH_TRAVERSAL,
    );
  }
}

/** @param {Array<{dest: string}>} writes @param {string} root @param {string} remedy */
function confineOutputs(writes, root, remedy) {
  for (const write of writes) confineOutput(write.dest, root, remedy);
}

/** @param {string} dest absolute output path @param {string} root @returns {boolean} whether a build at `root` refuses to write `dest` */
function refusedOutput(dest, root) {
  try {
    confineOutput(dest, root, '');
    return false;
  } catch (err) {
    if (
      err instanceof AstryxError &&
      err.code === ERROR_CODES.ERR_PATH_TRAVERSAL
    )
      return true;
    throw err;
  }
}

/** @param {string[]} dirs absolute directories @returns {string | null} the deepest directory containing all of them, or null across roots */
function commonDirectory(dirs) {
  let common = dirs[0];
  for (const dir of dirs.slice(1)) {
    while (
      path.relative(common, dir).startsWith('..') ||
      path.isAbsolute(path.relative(common, dir))
    ) {
      const parent = path.dirname(common);
      if (parent === common) return null;
      common = parent;
    }
  }
  return common;
}

/** @param {string} value @returns {string} `value` as one shell word */
function shellWord(value) {
  if (/^[A-Za-z0-9@%+=:,./_-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * How a stale check report ends when outputs sit outside the write root. A
 * build there refuses them, and each output's `Source:` header records the
 * directory its build ran from, so the build and the check both run from the
 * nearest directory that contains every theme file and output.
 * @param {Array<{dest: string}>} writes
 * @param {string[]} sources absolute theme files the build reads
 * @param {string} root the directory a build here keeps its writes inside
 * @param {(relative: (file: string) => string) => string[]} args the arguments after `theme build`, given each path relative to the directory to run from
 * @returns {string[] | null} report lines, or null when every output is inside `root`
 */
function outsideCheckRemedy(writes, sources, root, args) {
  if (!writes.some(write => refusedOutput(write.dest, root))) return null;
  const real = (/** @type {string} */ file) => realLocation(path.resolve(file));
  const dir = commonDirectory([
    ...sources.map(file => path.dirname(real(file))),
    ...writes.map(write => path.dirname(real(write.dest))),
  ]);
  if (!dir) {
    return [
      'These outputs are outside the working directory, so a build here refuses them. Build and check them from one directory that contains the theme files and the outputs.',
    ];
  }
  const command = (/** @type {string[]} */ extra) =>
    formatCliCommand(
      [
        'theme',
        'build',
        ...args(file => path.relative(dir, real(file))),
        ...extra,
      ]
        .map(shellWord)
        .join(' '),
      dir,
    );
  return [
    'These outputs are outside the working directory, so a build here refuses them, and each output records the directory it was built from. Build and check them from a directory that contains them:',
    `  cd ${shellWord(dir)}`,
    `  ${command([])}`,
    `  ${command(['--check'])}`,
  ];
}

/** @param {Array<{dest: string, content: string}>} writes */
function writeBuildOutputs(writes) {
  if (writes.length === 0) return;
  try {
    applyWrites(
      writes.map(write => ({
        path: write.dest,
        contents: write.content,
        createOnly: false,
      })),
    );
  } catch (error) {
    const message = `Failed to write theme outputs: ${/** @type {Error} */ (error).message}`;
    throw new AstryxError(message, undefined, ERROR_CODES.ERR_WRITE_FAILED);
  }
}

/**
 * Convert a theme name to a valid JS identifier.
 *
 * Deterministic sanitization rule — only transforms characters that are invalid
 * in JS identifiers (`-` and `.`); underscores are already valid and preserved:
 * 1. Replace every run of invalid separators (`-`, `.`) followed by an
 *    alphanumeric or underscore character with that character uppercased.
 * 2. Strip any remaining invalid separators (leading or trailing).
 * 3. If the result starts with a digit, prefix with `_`.
 * 4. If the result is empty, return `_`.
 *
 * Examples:
 *   'ocean'            → 'ocean'
 *   'default-minimal'  → 'defaultMinimal'
 *   'chaos-07'         → 'chaos07'
 *   'a-1-b'            → 'a1B'
 *   'my--theme'        → 'myTheme'
 *   'brand.v2'         → 'brandV2'
 *   'my_theme'         → 'my_theme'    (underscore preserved)
 *   'neo_wave-2.x'     → 'neo_wave2X'
 *
 * @param {string} name
 * @returns {string}
 */
function toIdentifier(name) {
  const id = name
    .replace(
      /[-.]+([a-zA-Z0-9_])/g,
      (/** @type {string} */ _, /** @type {string} */ c) => c.toUpperCase(),
    )
    .replace(/[-.]+/g, '');
  return /^\d/.test(id) ? `_${id}` : id || '_';
}

/**
 * Import specifier for install/scaffold instructions. Drops a leading `src/`
 * from the cwd-relative dir (most consumers import from a file under src/) but
 * keeps the rest of the path (e.g. `themes/gothic`). Callers note the path is
 * relative to the consumer's file.
 * @param {string} relDir
 * @param {string} base
 * @returns {string}
 */
export function importSpecifier(relDir, base) {
  const normalized = relDir === '.' ? '' : relDir;
  const withinSrc = normalized.replace(/^src\/?/, '').replace(/\/+$/, '');
  return withinSrc ? `./${withinSrc}/${base}` : `./${base}`;
}

/**
 * Convert a kebab-case component name to PascalCase.
 * e.g. 'button' → 'Button', 'progress-bar' → 'ProgressBar', 'avatar-status-dot' → 'AvatarStatusDot'
 * @param {string} name
 * @returns {string}
 */
function toPascalCase(name) {
  return name
    .split('-')
    .map(
      (/** @type {string} */ part) =>
        part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

/** @type {Promise<Record<string, Record<string, string[]>>> | null} */
let _knownValuesIndexPromise = null;

/**
 * Build one target-keyed index of built-in visual-prop values from every core
 * component doc. A rendered target often lives in a sibling doc (for example,
 * `astryx-heading` is documented by Text/Heading.doc.mjs), so directory-name
 * guessing is not a valid lookup strategy.
 */
async function loadKnownValuesIndex() {
  const coreRoot = resolveCoreRoot();
  const coreSrc = coreRoot ? path.join(coreRoot, 'src') : null;
  if (!coreSrc || !fs.existsSync(coreSrc)) return {};

  /** @type {any[]} */
  const docs = [];
  /** @param {string} dir */
  async function scan(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '__tests__') {
          await scan(full);
        }
        continue;
      }
      if (!entry.name.endsWith('.doc.mjs')) continue;
      try {
        docs.push(await loadComponentDoc(full));
      } catch {
        // One malformed or optional doc must not erase validation for the rest.
      }
    }
  }
  await scan(coreSrc);

  /** @param {string} value */
  const targetName = value =>
    value
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/\s+/g, '-')
      .toLowerCase();
  /**
   * @param {any[]} props
   * @returns {Record<string, Set<string>>}
   */
  const valuesFromProps = props => {
    /** @type {Record<string, Set<string>>} */
    const result = {};
    for (const prop of props ?? []) {
      if (typeof prop?.name !== 'string' || typeof prop?.type !== 'string') {
        continue;
      }
      /** @type {Set<string>} */
      const values = new Set();
      for (const match of prop.type.match(/'([^']+)'/g) ?? []) {
        values.add(match.slice(1, -1));
      }
      for (const part of prop.type
        .split('|')
        .map((/** @type {string} */ value) => value.trim())) {
        if (/^-?\d+(?:\.\d+)?$/.test(part)) values.add(part);
      }
      if (values.size > 0) result[prop.name] = values;
    }
    return result;
  };

  /** @type {Record<string, Record<string, Set<string>>>} */
  const valuesByOwner = {};
  for (const doc of docs) {
    if (typeof doc?.name === 'string') {
      valuesByOwner[targetName(doc.name)] = valuesFromProps(doc.props);
    }
    for (const component of /** @type {any[]} */ (doc?.components ?? [])) {
      if (typeof component?.name === 'string') {
        valuesByOwner[targetName(component.name)] = valuesFromProps(
          component.props,
        );
      }
    }
  }

  /** @type {Record<string, Record<string, Set<string>>>} */
  const collected = {};
  for (const doc of docs) {
    const localValues = valuesFromProps([
      ...(doc?.props ?? []),
      ...(doc?.components ?? []).flatMap(
        (/** @type {any} */ component) => component?.props ?? [],
      ),
    ]);
    for (const target of doc?.theming?.targets ?? []) {
      if (typeof target?.className !== 'string') continue;
      const componentName = target.className.replace(/^astryx-/, '');
      const ownerValues = valuesByOwner[componentName] ?? {};
      if (!collected[componentName]) collected[componentName] = {};
      for (const prop of target.visualProps ?? []) {
        if (!collected[componentName][prop]) {
          collected[componentName][prop] = new Set();
        }
        for (const value of [
          ...(localValues[prop] ?? []),
          ...(ownerValues[prop] ?? []),
        ]) {
          collected[componentName][prop].add(value);
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(collected).map(([component, props]) => [
      component,
      Object.fromEntries(
        Object.entries(props).map(([prop, values]) => [prop, [...values]]),
      ),
    ]),
  );
}

/**
 * @param {string} componentName
 * @returns {Promise<Record<string, string[]>>}
 */
async function getKnownValues(componentName) {
  _knownValuesIndexPromise ??= loadKnownValuesIndex();
  const index = await _knownValuesIndexPromise;
  return index[componentName] ?? {};
}

/**
 * Resolve `@astryxdesign/core`'s package root relative to the CLI package. Core
 * and the CLI ship as siblings (`@astryxdesign/core`, `@astryxdesign/cli`), so
 * `../../../../core` from `api/theme/build/` reaches core whether installed from
 * npm or run inside the monorepo. Returns null if it can't be found.
 */
function resolveCoreRoot() {
  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const coreRoot = path.resolve(cliDir, '../../../../core');
  return fs.existsSync(coreRoot) ? coreRoot : null;
}

/**
 * Read the type declarations `@astryxdesign/core/<Component>` exposes so we can
 * check whether a given augmentation-target interface actually exists before
 * generating a module augmentation against it.
 *
 * Reads the shipped `dist/<Component>/index.d.ts` (what a consumer's TypeScript
 * actually sees), falling back to the `src/<Component>/index.ts` in the
 * monorepo. Returns the file contents, or '' if nothing is found.
 */
/** @type {Map<string, string>} */
const _componentDeclCache = new Map();
/**
 * @param {string} pascalName
 * @returns {string}
 */
function readComponentDeclarations(pascalName) {
  if (_componentDeclCache.has(pascalName)) {
    return _componentDeclCache.get(pascalName) ?? '';
  }
  let contents = '';
  const coreRoot = resolveCoreRoot();
  if (coreRoot) {
    const candidates = [
      path.join(coreRoot, 'dist', pascalName, 'index.d.ts'),
      path.join(coreRoot, 'src', pascalName, 'index.ts'),
    ];
    for (const file of candidates) {
      try {
        if (fs.existsSync(file)) {
          contents = fs.readFileSync(file, 'utf-8');
          break;
        }
      } catch {
        // ignore and try the next candidate
      }
    }
  }
  _componentDeclCache.set(pascalName, contents);
  return contents;
}

/** @type {Map<string, Array<{moduleName: string, interfacePrefix: string}>>} */
const _augmentationTargetCache = new Map();

/**
 * Resolve a rendered theme class token (the key without `astryx-`) to candidate
 * public core subpaths and interface prefixes that may own its augmentable prop
 * maps. Some tokens are subtargets documented by a parent component
 * (`avatar-status-dot` augments `@astryxdesign/core/Avatar`). Component docs are
 * the source of truth for the target token → owning component relationship.
 *
 * @param {string} componentName
 * @returns {Promise<Array<{moduleName: string, interfacePrefix: string}>>}
 */
async function resolveAugmentationTargetCandidates(componentName) {
  if (_augmentationTargetCache.has(componentName)) {
    return /** @type {Array<{moduleName: string, interfacePrefix: string}>} */ (
      _augmentationTargetCache.get(componentName)
    );
  }

  const fallback = [
    {
      moduleName: toPascalCase(componentName),
      interfacePrefix: toPascalCase(componentName),
    },
  ];

  const coreRoot = resolveCoreRoot();
  const coreSrc = coreRoot ? path.join(coreRoot, 'src') : null;
  if (!coreSrc || !fs.existsSync(coreSrc)) {
    _augmentationTargetCache.set(componentName, fallback);
    return fallback;
  }

  /** @type {Array<{moduleName: string, interfacePrefix: string}>} */
  const matches = [];
  /** @type {Set<string>} */
  const seen = new Set();

  /**
   * @param {string} moduleName
   * @param {string} interfacePrefix
   */
  function addCandidate(moduleName, interfacePrefix) {
    const key = `${moduleName}:${interfacePrefix}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push({moduleName, interfacePrefix});
  }

  /** @param {string} dir */
  async function scan(dir) {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__')
          continue;
        await scan(full);
        continue;
      }
      if (!entry.name.endsWith('.doc.mjs')) continue;

      /** @type {any} */
      let doc;
      try {
        doc = await loadComponentDoc(full);
      } catch {
        continue;
      }

      const matchesTarget = (doc?.theming?.targets || []).some(
        (/** @type {any} */ target) =>
          typeof target?.className === 'string' &&
          target.className.replace(/^astryx-/, '') === componentName,
      );
      if (!matchesTarget) continue;

      const moduleName =
        typeof doc?.name === 'string' && doc.name
          ? doc.name
          : path.basename(path.dirname(full));

      // Try the exact rendered token first for documented subtargets such as
      // avatar-status-dot → AvatarStatusDotVariantMap, then the owning public
      // component name (for example, ProgressBar for progress-bar-fill).
      addCandidate(moduleName, toPascalCase(componentName));
      addCandidate(moduleName, moduleName);
      if (Array.isArray(doc?.components)) {
        for (const comp of doc.components) {
          if (typeof comp?.name === 'string') {
            addCandidate(moduleName, comp.name);
          }
        }
      }
    }
  }

  await scan(coreSrc);
  // A target documented by a parent component may also have its own public
  // subpath and augmentation interface (Heading is documented under Text but
  // owns @astryxdesign/core/Heading). Keep the direct-name candidate after
  // discovered owners so both shapes are reachable without guessing which one
  // the source tree uses.
  for (const candidate of fallback) {
    addCandidate(candidate.moduleName, candidate.interfacePrefix);
  }
  const resolved = matches;
  _augmentationTargetCache.set(componentName, resolved);
  return resolved;
}

/**
 * Determine whether `@astryxdesign/core/<Component>` exports an interface named
 * `interfaceName` that can be augmented via module augmentation.
 *
 * Only interfaces are extension points — closed literal-union types (e.g.
 * `HeadingType`, `ButtonSize`) are NOT augmentable, so a generated augmentation
 * against them is dead code. We check that the name is exported (directly or
 * re-exported) as a type/interface.
 * @param {string} pascalName
 * @param {string} interfaceName
 * @returns {boolean}
 */
function componentHasAugmentableInterface(pascalName, interfaceName) {
  const decl = readComponentDeclarations(pascalName);
  if (!decl) return false;
  // Require an actual interface declaration in this public subpath, not just a
  // type re-export. Module augmentation only widens consumers that import the
  // module where the interface is declared; augmenting a barrel that re-exports
  // the type (e.g. Field re-exporting FieldStatusVariantMap) creates a dead
  // sibling interface for consumers of the real FieldStatus subpath.
  const re = new RegExp(String.raw`\binterface\s+${interfaceName}\b`);
  return re.test(decl);
}

/**
 * Public augmentable maps whose axis requests artwork instead of styling.
 * `Icon.variant` selects a theme's icon artwork, so it has no component styling
 * map (architecture:component-theming-surface INV14): a `components` key on it
 * never enrolls a value or generates an augmentation of its map.
 */
const ARTWORK_REQUEST_MAPS = new Set(['IconVariantMap']);

/**
 * Whether a theme's component styling keys may enroll values in `interfaceName`
 * on `@astryxdesign/core/<Component>`.
 * @param {string} pascalName
 * @param {string} interfaceName
 * @returns {boolean}
 */
function isComponentValueAugmentationPoint(pascalName, interfaceName) {
  return (
    !ARTWORK_REQUEST_MAPS.has(interfaceName) &&
    componentHasAugmentableInterface(pascalName, interfaceName)
  );
}

/**
 * Adaptation values from resolved runtime rules, raw input, or normalized built
 * metadata. Built modules intentionally omit `__adaptationRules`, so every CLI
 * diagnostic that reads rule intent must also understand `__adaptations`.
 *
 * @param {Record<string, any>} themeDef
 * @returns {Record<string, any>[]}
 */
function adaptationRuleValues(themeDef) {
  if (Array.isArray(themeDef.__adaptationRules)) {
    return themeDef.__adaptationRules;
  }
  const rules = themeDef.adaptations?.rules ?? themeDef.__adaptations?.rules;
  if (!Array.isArray(rules)) return [];
  return rules.map((/** @type {any} */ rule) => rule?.value).filter(Boolean);
}

const ADAPTATION_METADATA_KEYS = new Set(['widthBreakpoints', 'rules']);
const WIDTH_BREAKPOINT_NAMES = ['sm', 'md', 'lg', 'xl', '2xl'];

/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A malformed adaptations block is intent too: an old core erases it before it
 * can be validated, so treating only valid non-empty arrays/maps as intent
 * would turn author errors into successful, incomplete builds.
 *
 * @param {unknown} adaptations
 * @returns {boolean}
 */
function adaptationMetadataHasIntent(adaptations) {
  if (adaptations === undefined) return false;
  if (!isRecord(adaptations)) return true;
  if (
    Object.keys(adaptations).some(key => !ADAPTATION_METADATA_KEYS.has(key))
  ) {
    return true;
  }

  if (adaptations.rules !== undefined) {
    if (!Array.isArray(adaptations.rules)) return true;
    if (adaptations.rules.length > 0) return true;
  }

  if (adaptations.widthBreakpoints !== undefined) {
    if (hasMalformedWidthBreakpoints(adaptations.widthBreakpoints)) return true;
    if (hasCustomWidthBreakpoints(adaptations.widthBreakpoints)) return true;
  }
  return false;
}

/**
 * Does this theme carry ordered-adaptation intent the installed core must be
 * able to compile or validate?
 *
 * A theme reaches the build in three shapes and this has to see all of them:
 * raw `adaptations`, resolved `__adaptationRules`, and a built module's
 * `__adaptations`. Any rule, custom width map, or malformed present metadata is
 * intent. Malformed data matters because an old core erases it before its
 * current-core validation can run; accepting it would turn an author error into
 * a successful incomplete build.
 *
 * The complete default width map with an empty rule list is the one no-op: core
 * writes that shape onto every resolved theme and every shipped built theme.
 *
 * @param {any} themeDef
 * @returns {boolean}
 */
function hasAdaptationIntent(themeDef) {
  if (!themeDef || typeof themeDef !== 'object') return false;

  if (themeDef.__adaptationRules !== undefined) {
    if (!Array.isArray(themeDef.__adaptationRules)) return true;
    if (themeDef.__adaptationRules.length > 0) return true;
  }

  return (
    adaptationMetadataHasIntent(themeDef.adaptations) ||
    adaptationMetadataHasIntent(themeDef.__adaptations)
  );
}

/**
 * The default viewport-width tier start points, in CSS px. A theme whose
 * effective map is exactly this asked for nothing.
 * SYNC: packages/core/src/theme/themeAdaptations.ts (DEFAULT_WIDTH_BREAKPOINTS)
 */
const DEFAULT_WIDTH_BREAKPOINTS = Object.freeze({
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
});

/**
 * @param {unknown} widthBreakpoints
 * @returns {boolean}
 */
function hasMalformedWidthBreakpoints(widthBreakpoints) {
  if (!isRecord(widthBreakpoints)) return true;
  const names = Object.keys(widthBreakpoints);
  if (names.some(name => !WIDTH_BREAKPOINT_NAMES.includes(name))) return true;
  for (const name of names) {
    const point = widthBreakpoints[name];
    if (typeof point !== 'number' || !Number.isFinite(point) || point <= 0) {
      return true;
    }
  }

  const effective = /** @type {Record<string, number>} */ ({
    ...DEFAULT_WIDTH_BREAKPOINTS,
    ...widthBreakpoints,
  });
  for (let index = 1; index < WIDTH_BREAKPOINT_NAMES.length; index++) {
    if (
      effective[WIDTH_BREAKPOINT_NAMES[index]] <=
      effective[WIDTH_BREAKPOINT_NAMES[index - 1]]
    ) {
      return true;
    }
  }
  return false;
}

/**
 * @param {unknown} widthBreakpoints
 * @returns {boolean}
 */
function hasCustomWidthBreakpoints(widthBreakpoints) {
  if (!widthBreakpoints || typeof widthBreakpoints !== 'object') return false;
  const points = /** @type {Record<string, number>} */ (widthBreakpoints);
  const defaults = /** @type {Record<string, number>} */ (
    DEFAULT_WIDTH_BREAKPOINTS
  );
  const names = Object.keys(points);
  if (names.length === 0) return false;
  // Any point that differs from the default is custom. So is a PARTIAL map:
  // core merges it over the defaults, which is a real, inheritable override
  // even when every value it names happens to match. A COMPLETE map equal to
  // the defaults asks for nothing — which is exactly what core writes onto
  // every theme it resolves, and what every shipped built theme carries.
  if (names.some(name => points[name] !== defaults[name])) return true;
  return names.length !== Object.keys(defaults).length;
}

/**
 * Fail when a theme needs ordered adaptations and the installed core cannot
 * compile them.
 *
 * The CLI and core are optional peers on independent release trains, so a
 * newer CLI routinely runs against an older published core. Adaptations are a
 * capability of core's generator: without `generateAdaptationCSS` the build
 * could still emit token and component CSS, and every adaptation rule would
 * vanish from the output with no signal. That is the one outcome this must
 * never produce — so it stops before anything is generated or written, names
 * the missing capability, and says what to do about it.
 *
 * `lineage` is the selected theme's own ancestry — the raw inputs it and its
 * bases were resolved from, captured as the file loaded (core-interception).
 * An older core's `defineTheme()` drops `adaptations` while resolving, so the
 * resolved object alone cannot answer; the raw input can. Scoping to lineage
 * is what keeps an unrelated adaptive theme in the same module from failing a
 * plain theme's build.
 *
 * `unobserved`, when non-empty, lists lineage members the recorder never saw
 * because one or more loader paths could not be intercepted. `degradation`
 * names those gaps: top-level await forced the async loader, or a CommonJS
 * source dependency could reach a frozen/non-configurable core namespace.
 * Those members cannot be proven clean, and unproven must not build.
 *
 * Silent for a theme with no adaptation intent and fully observed lineage:
 * those build against an older core exactly as they always did.
 *
 * @param {any} themeDef - Raw or resolved theme; both shapes are understood.
 * @param {{coreVersion?: string, lineage?: any[], unobserved?: any[], degradation?: {topLevelAwait?: boolean, commonJs?: boolean}}} [context]
 * @returns {void}
 */
function assertAdaptationCapability(
  themeDef,
  {coreVersion, lineage, unobserved, degradation} = {},
) {
  if (_generateAdaptationCSS) return;
  // A core that could not be imported at all is ERR_CORE_NOT_FOUND's story —
  // "upgrade core" would be the wrong advice for "core is missing".
  if (!_defineTheme || !_generateThemeRulesSplit) return;

  const candidates = lineage?.length ? lineage : [themeDef];
  const installed =
    coreVersion && coreVersion !== 'unknown'
      ? `@astryxdesign/core@${coreVersion}`
      : 'the installed @astryxdesign/core';

  if (candidates.some(hasAdaptationIntent)) {
    throw new AstryxError(
      `This theme declares ordered adaptations, but ${installed} does not ` +
        'export `generateAdaptationCSS` from @astryxdesign/core/theme, so ' +
        'its adaptation rules cannot be compiled. Building without them ' +
        'would silently drop every adaptation rule from the generated CSS. ' +
        'Upgrade @astryxdesign/core to a version that supports theme ' +
        'adaptations, or remove `adaptations` from this theme.',
      undefined,
      ERROR_CODES.ERR_CORE_INCOMPATIBLE,
    );
  }

  if (!unobserved?.length) return;

  // These lineage members carry neither a capture marker nor their own
  // `__adaptations`: they were never observed, this core would have erased any
  // adaptations they had, and nothing here can tell whether they had any.
  // Unproven is not clean.
  const named = unobserved
    .map(value => (typeof value?.name === 'string' ? `"${value.name}"` : null))
    .filter(Boolean);
  const gaps = [
    degradation?.topLevelAwait
      ? 'top-level await forced the fallback loader for installed packages'
      : null,
    degradation?.commonJs
      ? 'a CommonJS source dependency reached a frozen or non-configurable core namespace'
      : null,
  ].filter(Boolean);
  throw new AstryxError(
    `${installed} cannot compile ordered adaptations, and whether ${
      named.length > 0 ? named.join(', ') : 'part of this theme'
    } uses adaptations could not be observed${
      gaps.length > 0 ? ` because ${gaps.join(' and ')}` : ''
    }. This core erases adaptations while resolving, so building could emit ` +
      'CSS with adaptation rules silently missing. Upgrade ' +
      '@astryxdesign/core to a version that supports theme adaptations, or ' +
      'use a built theme artifact that retains adaptation metadata.',
    undefined,
    ERROR_CODES.ERR_CORE_INCOMPATIBLE,
  );
}

/**
 * Root component entries are the only surface allowed to introduce variants.
 * @param {Record<string, any>} themeDef
 * @returns {[string, Record<string, any>][]}
 */
function rootComponentEntries(themeDef) {
  return themeDef.components ? Object.entries(themeDef.components) : [];
}

/**
 * Component entries written only by adaptation rules.
 * @param {Record<string, any>} themeDef
 * @returns {[string, Record<string, any>][]}
 */
function adaptationComponentEntries(themeDef) {
  const maps = adaptationRuleValues(themeDef).map(
    (/** @type {any} */ value) => value.components,
  );
  return maps.flatMap((/** @type {any} */ map) =>
    map ? Object.entries(map) : [],
  );
}

/**
 * How one `prop:value` pair on a component target is classified — the single
 * vocabulary both the root and adaptation paths reason in.
 *
 * - `builtin` — the value is in the component doc's enumerated domain. Valid
 *   on its own; no theme has to declare anything for it.
 * - `enrollment` — the value is not built in AND core exposes an augmentable
 *   `*Map` interface for the prop, so the value becomes valid only because a
 *   theme enrolls it (the build generates module augmentation for it).
 * - `unresolved` — anything else: a closed literal-union axis with no
 *   augmentation point (Button `size`), or a domain the docs cannot enumerate.
 *   Root emits no augmentation and accepts it as pass-through.
 *
 * SYNC: packages/cli/api/theme/build/build.mjs (generateVariantDeclarationsAsync,
 * validateAdaptationEnrollment)
 *
 * @typedef {'builtin' | 'enrollment' | 'unresolved'} ComponentValueClass
 */

/**
 * Classify a component visual-prop value.
 *
 * This is the ONE place that decides what a value is, so the root and
 * adaptation paths cannot drift: per AST-012/DEC-5 an adaptation uses the same
 * target, axis, value-domain and extension validation as root `components`,
 * and adds only the rule that enrollment-dependent values may not be enrolled
 * conditionally. An unresolved result carries into adaptations unchanged, and
 * tightening root validation tightens adaptations automatically.
 *
 * @param {string} component - Rendered target token (without `astryx-`).
 * @param {string} prop
 * @param {string} value
 * @returns {Promise<ComponentValueClass>}
 */
async function classifyComponentValue(component, prop, value) {
  const known = await getKnownValues(component);
  const knownForProp = known[prop];
  if (knownForProp && knownForProp.includes(value)) {
    return 'builtin';
  }

  const propPascal = prop.charAt(0).toUpperCase() + prop.slice(1);
  const target = (await resolveAugmentationTargetCandidates(component)).find(
    candidate =>
      isComponentValueAugmentationPoint(
        candidate.moduleName,
        `${candidate.interfacePrefix}${propPascal}Map`,
      ),
  );
  return target ? 'enrollment' : 'unresolved';
}

/**
 * Every `prop:value` pair a component override key names. A key is `base`, a
 * bare state name, or `+`-joined `prop:value` pairs.
 *
 * @param {string} key
 * @returns {{prop: string, value: string, pair: string}[]}
 */
function componentValuePairs(key) {
  if (key === 'base') return [];
  /** @type {{prop: string, value: string, pair: string}[]} */
  const pairs = [];
  for (const pair of key.split('+')) {
    const colon = pair.indexOf(':');
    if (colon === -1) continue;
    pairs.push({
      prop: pair.slice(0, colon),
      value: pair.slice(colon + 1),
      pair,
    });
  }
  return pairs;
}

/**
 * Reject values whose validity depends on THEME ENROLLMENT when only an
 * adaptation rule enrolls them.
 *
 * Per AST-012/DEC-5 this is the single thing adaptations add to root
 * validation. Everything else — which targets and axes exist, which values a
 * domain admits — is the root path's judgement, reached through the shared
 * classifier, so there is no adaptation-specific resolver, allowlist or
 * unresolved-domain exception here:
 *
 * - `builtin` values are independently valid and need no root declaration;
 * - `unresolved` values carry root's shared result unchanged (accepting one
 *   does not make the axis extensible — the conditional-API invariant still
 *   governs it, and tightening root tightens this automatically);
 * - `enrollment` values are the exception: generated module augmentation is
 *   unconditional, so a value that exists only under a media condition would
 *   widen a component's public type from a conditional surface. Those must
 *   appear on the effective root `components` surface first.
 *
 * @param {Record<string, any>} themeDef
 * @returns {Promise<string[]>}
 */
async function validateAdaptationEnrollment(themeDef) {
  const adaptationEntries = adaptationComponentEntries(themeDef);
  if (adaptationEntries.length === 0) {
    return [];
  }

  /** @type {Set<string>} */
  const rootValues = new Set();
  for (const [component, rules] of rootComponentEntries(themeDef)) {
    for (const key of Object.keys(rules)) {
      for (const {pair} of componentValuePairs(key)) {
        rootValues.add(`${component}:${pair}`);
      }
    }
  }

  /** @type {string[]} */
  const errors = [];
  for (const [component, rules] of adaptationEntries) {
    for (const key of Object.keys(rules)) {
      for (const {prop, value, pair} of componentValuePairs(key)) {
        if (rootValues.has(`${component}:${pair}`)) continue;
        const valueClass = await classifyComponentValue(component, prop, value);
        if (valueClass !== 'enrollment') continue;
        errors.push(
          `Adaptation rule enrolls the custom value "${component}.${prop}:${value}". ` +
            'A value that is valid only because a theme enrolls it generates ' +
            'unconditional type augmentation, so it must be declared on the root ' +
            'theme first; a rule may then restyle it under a condition.',
        );
      }
    }
  }
  return [...new Set(errors)];
}

/**
 * Generate TypeScript declaration content with module augmentation for custom
 * component prop values found in the theme's `components` keys. Reads known
 * values from doc files to filter out base prop values.
 *
 * Interface naming convention: PascalCase(component) + PascalCase(prop) + Map
 *   banner + status → BannerStatusMap
 *   button + variant → ButtonVariantMap
 *
 * An augmentation is only emitted when `@astryxdesign/core/<Component>` actually
 * exports a matching interface. Props backed by closed literal-union types
 * (e.g. Button `size`, Heading `type`/`level`) have no augmentation point, so
 * generating a `declare module` block for them would be dead code — those are
 * skipped.
 *
 * A theme that lists `iconVariants` also augments `IconVariantMap` in
 * `@astryxdesign/core/Icon` with those names, when the installed core declares
 * it, so `<Icon variant>` accepts them (spec:AST-087 FR3).
 *
 * @param {{components?: Record<string, Record<string, Record<string, unknown>>>, iconVariants?: readonly string[]}} themeDef - Theme definition (resolved by defineTheme)
 * @returns {Promise<string|null>} TypeScript declaration content, or null if no augmentations needed
 */
async function generateVariantDeclarationsAsync(themeDef) {
  const componentLayers = getThemeComponentLayers(themeDef);
  const iconVariantNames =
    Array.isArray(themeDef.iconVariants) &&
    componentHasAugmentableInterface('Icon', 'IconVariantMap')
      ? [...new Set(themeDef.iconVariants)]
      : [];
  if (componentLayers.length === 0 && iconVariantNames.length === 0) {
    return null;
  }

  // Collect enrollment-dependent values: { component: { prop: [value, ...] } }
  // Classification is shared with the adaptation check, so "what is a custom
  // value" has exactly one definition (AST-012/DEC-5).
  /** @type {Record<string, Record<string, Set<string>>>} */
  const customValues = {};

  for (const {components} of componentLayers) {
    for (const [component, rules] of Object.entries(components)) {
      for (const key of Object.keys(rules)) {
        for (const {prop, value} of componentValuePairs(key)) {
          // Built-ins need no augmentation; unresolved axes have no
          // augmentation point to widen, and are passed through untouched.
          const valueClass = await classifyComponentValue(
            component,
            prop,
            value,
          );
          if (valueClass !== 'enrollment') continue;

          if (!customValues[component]) customValues[component] = {};
          if (!customValues[component][prop])
            customValues[component][prop] = new Set();
          customValues[component][prop].add(value);
        }
      }
    }
  }

  // Check if we found any custom values
  const hasCustom = Object.values(customValues).some(props =>
    Object.values(props).some(values => values.size > 0),
  );
  if (!hasCustom && iconVariantNames.length === 0) return null;

  const sections = ['// Generated by astryx theme build', 'export {};', ''];

  for (const [component, props] of Object.entries(customValues)) {
    for (const [prop, values] of Object.entries(props)) {
      if (values.size === 0) continue;

      const propPascal = prop.charAt(0).toUpperCase() + prop.slice(1);
      const target = (
        await resolveAugmentationTargetCandidates(component)
      ).find(candidate =>
        isComponentValueAugmentationPoint(
          candidate.moduleName,
          `${candidate.interfacePrefix}${propPascal}Map`,
        ),
      );

      // Resolve the augmentation point again to name it. Classification has
      // already established that one exists (that is what `enrollment` means),
      // so this is a lookup, not a filter — but a target that somehow fails to
      // resolve here must not emit a `declare module` block against a
      // non-existent interface, which would create a dead sibling interface
      // rather than widening the component's prop union.
      if (!target) continue;

      const modulePath = `@astryxdesign/core/${target.moduleName}`;
      const interfaceName = `${target.interfacePrefix}${propPascal}Map`;

      sections.push(`declare module '${modulePath}' {`);
      sections.push(`  interface ${interfaceName} {`);
      for (const v of values) {
        sections.push(`    '${v}': true;`);
      }
      sections.push('  }');
      sections.push('}');
      sections.push('');
    }
  }

  if (iconVariantNames.length > 0) {
    sections.push(`declare module '@astryxdesign/core/Icon' {`);
    sections.push('  interface IconVariantMap {');
    for (const name of iconVariantNames) {
      sections.push(`    ${tsStringLiteral(name)}: true;`);
    }
    sections.push('  }');
    sections.push('}');
    sections.push('');
  }

  // If every custom value targeted a non-augmentable prop, there's nothing to
  // emit beyond the header — return null so no `.variants.d.ts` is written.
  const hasEmittedAugmentation = sections.some(line =>
    line.startsWith('declare module'),
  );
  if (!hasEmittedAugmentation) return null;

  return sections.join('\n');
}

/**
 * Resolve a token value — [light, dark] tuple becomes light-dark()
 * @param {unknown} value
 * @returns {unknown}
 */
function resolveTokenValue(value) {
  if (Array.isArray(value)) {
    return `light-dark(${value[0]}, ${value[1]})`;
  }
  return value;
}

// Theme @scope selector helpers. Keep the `astryx` literal in sync with
// packages/core/src/naming.ts (NAMESPACE) and generateThemeRules.ts.
// Theme scopes to data-astryx-theme; the static build path must match.
const themeScopeStart = (/** @type {string} */ name) =>
  `[data-astryx-theme="${name}"]`;
const THEME_SCOPE_TO = `[data-astryx-theme]`;

/**
 * Module extensions the theme loader resolves, source before artifact.
 *
 * `theme build` writes `<name>.js` next to `<name>.ts`, and jiti's default
 * order tries `.js` first — so once a base theme had been built, every sibling
 * theme that `extends` it resolved to that generated artifact instead of the
 * source. The artifact carries no `components` and exports a different name,
 * so the inheritance silently evaporated. Resolving source first is also what
 * the author's TypeScript sees, which is the point: the CSS the build emits
 * matches the theme they type-checked.
 */
const THEME_MODULE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.mtsx',
  '.ctsx',
  '.mjs',
  '.cjs',
  '.js',
  '.json',
];
// prettier-ignore
const registryGraphError = (/** @type {string} */ message) => new AstryxError(message, undefined, ERROR_CODES.ERR_THEME_INVALID);
// prettier-ignore
function parseRegistryModule(/** @type {string} */ source, /** @type {string} */ filePath) {
  try { return parse(source, {sourceType: 'unambiguous', plugins: ['typescript', 'jsx', 'decorators-legacy', 'importAttributes']}); }
  catch (error) { throw registryGraphError(`Cannot inspect registry module ${filePath}: ${error instanceof Error ? error.message : String(error)}`); }
}
// prettier-ignore
function moduleDependencies(/** @type {string} */ source, /** @type {string} */ filePath) {
  const ast = parseRegistryModule(source, filePath);
  /** @type {Array<{specifier: string, commonJs: boolean, imports: string[]}>} */ const found = [];
  /** @param {any} node */ const literal = node => typeof node?.value === 'string' ? node.value : node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0]?.value?.cooked : null;
  /** @param {any} node */ const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.importKind !== 'type' && typeof node.source?.value === 'string') {
      const specifiers = /** @type {any[]} */ (node.specifiers);
      const imports = node.type === 'ImportDeclaration' ? specifiers.filter(item => item.importKind !== 'type' && item.type !== 'ImportNamespaceSpecifier').map(item => item.type === 'ImportDefaultSpecifier' ? 'default' : item.imported?.name ?? item.imported?.value) : node.type === 'ExportNamedDeclaration' ? specifiers.filter(item => item.exportKind !== 'type' && item.type === 'ExportSpecifier').map(item => item.local?.name ?? item.local?.value) : [];
      found.push({specifier: node.source.value, commonJs: false, imports});
    }
    const dependency = node.type === 'ImportExpression' ? node.source : node.type === 'CallExpression' && (node.callee?.type === 'Import' || node.callee?.name === 'require') ? node.arguments?.[0] : null;
    if (dependency) { const specifier = literal(dependency); if (specifier == null) throw registryGraphError(`Registry module ${filePath} has a non-static dependency; family output cannot prove that graph is resolvable and CSS-free.`); found.push({specifier, commonJs: node.callee?.name === 'require', imports: []}); }
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(child => child?.type && visit(child)); else if (value?.type) visit(value);
  };
  visit(ast); return found;
}
// prettier-ignore
function resolveRegistryModule(/** @type {string} */ specifier, /** @type {string} */ parentPath, commonJs = false) {
  if (isBuiltin(specifier) || specifier.startsWith('node:')) return null;
  let resolved;
  try {
    const resolver = createJiti(parentPath, {extensions: THEME_MODULE_EXTENSIONS});
    if (commonJs) resolved = resolver.resolve(specifier);
    else if (specifier.startsWith('.')) resolved = fileURLToPath(new URL(specifier, pathToFileURL(parentPath)));
    else if (path.isAbsolute(specifier)) resolved = specifier;
    else { const url = resolver.esmResolve(specifier); resolved = url.startsWith('file:') ? fileURLToPath(url) : url; }
  } catch (error) { throw registryGraphError(`Cannot resolve registry import "${specifier}" from ${parentPath}: ${error instanceof Error ? error.message : String(error)}`); }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw registryGraphError(`Cannot resolve registry import "${specifier}" from ${parentPath}.`);
  return fs.realpathSync(resolved);
}
/** @returns {boolean | null} */
// prettier-ignore
function hasNamedExport(/** @type {string} */ file, /** @type {string} */ name, seen = new Set()) {
  const key = `${file}\0${name}`; if (seen.has(key)) return false; seen.add(key);
  const ast = parseRegistryModule(fs.readFileSync(file, 'utf8'), file); let esm = false; let unknown = false;
  for (const node of /** @type {any[]} */ (ast.program.body)) {
    if (node.type === 'ExportDefaultDeclaration') { esm = true; if (name === 'default') return true; }
    if (node.type === 'ExportNamedDeclaration') {
      esm = true; const declaration = /** @type {any} */ (node.declaration);
      if ((declaration?.id?.name === name) || (declaration?.type === 'VariableDeclaration' && declaration.declarations.some((/** @type {any} */ item) => item.id?.name === name))) return true;
      for (const specifier of /** @type {any[]} */ (node.specifiers)) if ((specifier.exported?.name ?? specifier.exported?.value) === name) {
        if (!node.source || specifier.type === 'ExportNamespaceSpecifier') return true;
        const target = resolveRegistryModule(node.source.value, file); return target ? hasNamedExport(target, specifier.local?.name ?? specifier.local?.value, seen) : false;
      }
    }
    if (node.type === 'ExportAllDeclaration') { esm = true; const target = resolveRegistryModule(node.source.value, file); const status = target ? hasNamedExport(target, name, seen) : false; if (status === true) return true; if (status === null) unknown = true; }
  }
  return esm ? unknown ? null : false : null;
}
// prettier-ignore
async function validateRegistryGraphs(/** @type {Array<{specifier: string, exportName: string}>} */ registries, /** @type {string} */ aggregatePath) {
  /** @type {Array<{specifier: string, parent: string, commonJs: boolean, imports: string[], root?: {exportName: string}}>} */ const pending = registries.map(root => ({specifier: root.specifier, parent: aggregatePath, commonJs: false, imports: [root.exportName], root}));
  /** @type {Array<{file: string, exportName: string}>} */ const runtimeChecks = []; const seen = new Set();
  while (pending.length > 0) {
    const current = pending.pop(); if (!current) break; const {specifier, parent, commonJs, imports, root} = current;
    if (/\.css(?:$|[?#])/i.test(specifier)) throw registryGraphError(`Theme family registry graph imports CSS: ${specifier}`);
    const file = resolveRegistryModule(specifier, parent, commonJs); if (!file) continue;
    if (/\.css$/i.test(file)) throw registryGraphError(`Theme family registry graph imports CSS: ${file}`);
    const external = file.split(path.sep).includes('node_modules');
    for (const name of imports) if (external) runtimeChecks.push({file, exportName: name}); else { const named = hasNamedExport(file, name); if (named === false) throw registryGraphError(`Family registry ${file} does not export "${name}".`); if (named === null) runtimeChecks.push({file, exportName: name}); }
    if (root) runtimeChecks.push({file, exportName: root.exportName});
    if (seen.has(file)) continue; seen.add(file);
    if (/\.[cm]?[jt]sx?$/i.test(file)) for (const edge of moduleDependencies(fs.readFileSync(file, 'utf8'), file)) pending.push({...edge, parent: file});
  }
  for (const [index, root] of runtimeChecks.entries()) {
    let exports; try { exports = await import(`${pathToFileURL(root.file).href}?astryx-family-check=${Date.now()}-${index}`); }
    catch (error) { throw registryGraphError(`Cannot import family registry ${root.file}: ${error instanceof Error ? error.message : String(error)}`); }
    if (!(root.exportName in exports)) throw registryGraphError(`Family registry ${root.file} does not export "${root.exportName}".`);
  }
}
/**
 * Resolve inherited source with exactly the loader's extension precedence.
 * This reads module locations only; icon discovery never executes a second load.
 * @param {string} specifier
 * @param {string} fromFile
 * @returns {string}
 */
function resolveThemeModule(specifier, fromFile) {
  return createJiti(fromFile, {extensions: THEME_MODULE_EXTENSIONS}).resolve(
    specifier,
  );
}

/**
 * Errors that mean "the synchronous loader cannot evaluate this module", as
 * opposed to "this module is broken". Only the former may fall back to the
 * async path: a genuine author error (a throw, a missing import, a real syntax
 * error) must surface as itself, and must never be quietly downgraded into a
 * load whose interception no longer reaches installed packages.
 *
 * Top-level await is the case that exists in practice — the sync path compiles
 * the module as a CommonJS function body, where `await` is a SyntaxError with
 * this exact V8 wording.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isSyncLoaderLimitation(error) {
  if (!(error instanceof SyntaxError)) return false;
  return /await is only valid in async function/i.test(error.message);
}

/**
 * Import a theme module using jiti and find the defineTheme() result.
 * Returns the resolved DefinedTheme object, plus whether interception was
 * degraded on the way.
 *
 * When `interception` is given, the theme file — and everything it imports, at
 * any depth — is handed that wrapped core instead of resolving its own, so
 * each theme defined anywhere in the graph is associated with the raw input it
 * came from. That is the only way to see an `adaptations` block an older core
 * erases while resolving. It costs no extra execution: the theme is loaded
 * exactly once, on whichever path succeeds.
 *
 * Interception forces jiti's SYNCHRONOUS path. jiti only hands a module's
 * imports back to itself when it transpiles that module, and it skips
 * transpiling an ESM file under `import()` — so an installed package whose
 * SOURCE calls `defineTheme` would resolve its own real core and erase the
 * author's adaptations unobserved. The sync path transpiles it, so the wrapped
 * core reaches inside installed packages too.
 *
 * A module the sync path cannot evaluate (top-level await) is force-transpiled
 * through jiti's asynchronous evaluator. That keeps interception active for
 * the entry and captures its exact `extends` value; relative dependencies may
 * use native ESM, so family mode binds those objects back to the exact selected
 * source export and old-Core adaptation checks keep treating that path as
 * degraded/fail-closed.
 *
 * @param {string} filePath
 * @param {import('./core-interception.mjs').CoreInterception} [interception]
 * @returns {Promise<{theme: any, exportName: string, degraded: {topLevelAwait: boolean, commonJs: boolean}}>}
 */
// prettier-ignore
async function importThemeModule(filePath, interception, /** @type {any} */ loader = undefined) {
  const jiti =
    loader ??
    createJiti(import.meta.url, {
      moduleCache: false,
      jsx: true,
      extensions: THEME_MODULE_EXTENSIONS,
      ...(interception ? {virtualModules: interception.modules} : {}),
    });

  /** @type {any} */
  let mod;
  const degraded = {topLevelAwait: false, commonJs: false};
  if (interception) {
    // The CommonJS patch covers `.cjs` package source, which jiti always
    // loads natively; the sync path covers everything else inside packages.
    // A frozen require(esm) namespace cannot be patched, so retain that gap and
    // let the selected lineage decide whether it matters.
    const commonJsPatch = interception.patchCommonJs(filePath);
    degraded.commonJs = !commonJsPatch.covered;
    try {
      try {
        mod = jiti(filePath);
      } catch (error) {
        // Only a sync-loader limitation may fall back. Anything else is the
        // theme's own failure and belongs to the caller unchanged.
        if (!isSyncLoaderLimitation(error)) throw error;
        degraded.topLevelAwait = true;
        // Force asynchronous transformation instead of native import: this
        // keeps virtual Core interception active even when the module uses
        // top-level await.
        mod = await jiti.evalModule(fs.readFileSync(filePath, 'utf8'), {
          id: filePath,
          filename: filePath,
          ext: path.extname(filePath),
          cache: jiti.cache,
          async: true,
          forceTranspile: true,
        });
      }
    } finally {
      commonJsPatch.undo();
    }
  } else {
    mod = await jiti.import(filePath);
  }

  // Both loads hand back the module. The theme is read from the module's own
  // exports, never from the module object itself: jiti's interop answers a
  // property the module lacks from its default export (and a missing
  // `default` with the module), so the module can pass for the theme while
  // its own keys hide the theme's fields.
  const isModule = mod != null && typeof mod === 'object';
  const hasDefault = isModule && Object.hasOwn(mod, 'default');
  const defaultExport = hasDefault ? mod.default : undefined;
  if (isThemeObject(defaultExport)) {
    return {theme: defaultExport, exportName: 'default', degraded};
  }
  if (isModule) {
    for (const [exportName, value] of Object.entries(mod)) {
      if (exportName === 'default' || exportName === 'module.exports') continue;
      if (isThemeObject(value)) return {theme: value, exportName, degraded};
    }
  }
  // A plain-object default export is the module's theme even when it has
  // no tokens of its own (local tokens, typography or component styles may
  // be all it defines), or no name: the build's validation says what it
  // lacks.
  if (isPlainObject(defaultExport)) {
    return {theme: defaultExport, exportName: 'default', degraded};
  }
  // A CommonJS module whose exports are the theme (`module.exports =
  // theme`) has no default of its own: interop answers `default` with
  // those exports, and without interop (a family build's loader) the module
  // is them.
  if (isModule && !hasDefault) {
    const exportsObject = mod.default ?? mod;
    if (isThemeObject(exportsObject)) {
      return {theme: exportsObject, exportName: 'default', degraded};
    }
  }

  throw new Error(
    `Could not find a defineTheme() result in ${filePath}.\n` +
      `Expected an export like: export const myTheme = defineTheme({ name: '...', tokens: {...} })`,
  );
}

/**
 * Whether the theme file's own folder resolves Core's theme entry, as the
 * theme's own `import ... from '@astryxdesign/core/theme'` would. A theme
 * outside any project (an empty folder, a fresh clone) does not, and is
 * handed the Core the CLI answers with instead, as a new project with that
 * Core would build it (`theme build` runs the same outside a project, spec
 * AST-081 FR3). Only a Core not installed there (MODULE_NOT_FOUND) reads as
 * no: an installed Core whose entry does not resolve is the theme's own, and
 * its load reports that.
 * @param {string} filePath
 * @returns {boolean}
 */
function themeFolderResolvesCore(filePath) {
  try {
    createRequire(filePath).resolve('@astryxdesign/core/theme');
    return true;
  } catch (error) {
    const {code} = /** @type {NodeJS.ErrnoException} */ (error);
    if (code === 'MODULE_NOT_FOUND') return false;
    if (code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') return true;
    throw error;
  }
}

/**
 * A plain object, not an array or a module namespace: a theme module's
 * default export, read as its theme.
 * @param {any} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value[Symbol.toStringTag] !== 'Module'
  );
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function isThemeObject(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    value.tokens &&
    typeof value.tokens === 'object'
  );
}

/**
 * Extract the theme definition from a JS/TS file, through jiti (full TS
 * support). A module that does not load fails with its own error: the theme
 * is never read from the file's text instead.
 *
 * @param {string} filePath
 * @param {import('./core-interception.mjs').CoreInterception} [interception]
 * @returns {Promise<{theme: any, exportName?: string, degraded: {topLevelAwait: boolean, commonJs: boolean}}>}
 */
// prettier-ignore
async function extractThemeDefinition(filePath, interception, /** @type {any} */ loader = undefined) {
  try {
    return await importThemeModule(filePath, interception, loader);
  } catch (jitiError) {
    const je = /** @type {Error} */ (jitiError);
    throw new Error(
      `Failed to load theme from ${filePath}: ${je.message}\n` +
        `Make sure all imports in the theme file are resolvable.`,
      {cause: jitiError},
    );
  }
}

/**
 * Load one theme through the build's real module loader and validate the raw
 * input captured from its defineTheme lineage. Used by doctor so it applies the
 * same direct-input rule as theme build without mistaking compiler output for
 * authored input.
 *
 * @param {string} file
 * @param {{cwd?: string}} [ctx]
 * @returns {Promise<string[]>}
 */
export async function validateThemePrivateInputs(
  file,
  {cwd = process.cwd()} = {},
) {
  const filePath = path.resolve(cwd, file);
  if (!fs.existsSync(filePath)) {
    throw new AstryxError(
      `File not found: ${filePath}`,
      undefined,
      ERROR_CODES.ERR_FILE_NOT_FOUND,
    );
  }

  // The CLI's own Core, unless a build in this process already chose one.
  await loadCliCore();
  const interception = interceptCore(_coreThemeModule, _coreRootModule);
  let theme;
  try {
    theme = (await extractThemeDefinition(filePath, interception)).theme;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AstryxError(message, undefined, ERROR_CODES.ERR_THEME_LOAD);
  }

  const inputs = interception.lineageOf(theme);
  try {
    return [...new Set(inputs.flatMap(input => validatePrivateVars(input)))];
  } finally {
    interception.strip(theme);
  }
}

/**
 * Extract a family member's named registry import from its source file.
 * Returns { importPath, exportName } or null when the theme names none.
 * Standalone builds resolve icons through `resolveIconImports` instead.
 *
 * Looks for patterns like:
 *   import { defaultIconRegistry } from './icons';
 *   icons: defaultIconRegistry,
 * @param {string} filePath
 * @param {'icons' | 'indicators'} field
 * @returns {{exportName: string, importPath: string} | null}
 */
function extractRegistryInfo(filePath, field) {
  const content = fs.readFileSync(filePath, 'utf8');
  const defineIndex = content.indexOf('defineTheme(');
  if (defineIndex < 0) return null;
  const themeSource = content.slice(defineIndex);
  const explicit = themeSource.match(
    new RegExp(`${field}:\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*(?=[,}])`),
  );
  const shorthand = themeSource.match(
    new RegExp(`[,{]\\s*(${field})\\s*(?=[,}])`),
  );
  const varName = explicit?.[1] ?? shorthand?.[1];
  if (!varName) return null;
  for (const match of content.matchAll(
    /import\s*{([^}]*)}\s*from\s*['"]([^'"]+)['"]/g,
  )) {
    for (const specifier of match[1].split(',')) {
      const [exportName, localName = exportName] = specifier
        .trim()
        .split(/\s+as\s+/);
      if (localName === varName) {
        return {exportName, importPath: match[2]};
      }
    }
  }
  return null;
}

/**
 * Whether a theme's icon entries include a function of `{size, variant}`.
 * @param {Record<string, unknown> | null | undefined} entries
 * @returns {boolean}
 */
function hasFunctionIconEntry(entries) {
  return Object.values(entries ?? {}).some(
    entry => typeof entry === 'function',
  );
}

/**
 * A built theme's icon entries: a theme from defineTheme keeps them in
 * `__icons` when any is a function (its `icons` is the node view); otherwise
 * `icons` holds them.
 * @param {any} theme
 * @returns {Record<string, unknown> | undefined}
 */
function themeIconEntries(theme) {
  return theme?.__icons ?? theme?.icons;
}

/**
 * The generated code that reads a registry's entries as React nodes, each
 * function entry read at `{size: 'md'}` like core's public reads. It never
 * passes the registry to a call, so a theme extending the built module can
 * still trace the registry through its `__icons` field, and it reads no
 * global, which a registry import could shadow. The registry expression runs
 * where only `entriesName` and `nodesName` are declared, both names the
 * registry imports cannot use.
 * @param {string} entries - Expression for the registry's entries.
 * @param {string} entriesName - A reserved local name.
 * @param {string} nodesName - A reserved local name.
 * @returns {string}
 */
function iconNodesExpression(entries, entriesName, nodesName) {
  return `(() => {
  const ${entriesName} = ${entries};
  const ${nodesName} = {};
  for (const name in ${entriesName}) {
    const entry = ${entriesName}[name];
    ${nodesName}[name] = typeof entry === 'function' ? entry({size: 'md'}) : entry;
  }
  return ${nodesName};
})()`;
}

/**
 * Generate a minimal JS module for a built theme.
 * Includes the theme name, marker, and re-exports the icon registry.
 * All styling is in the CSS file.
 *
 * The module carries the theme's resolved `components` and on-media surfaces
 * alongside its tokens. They are not needed to apply the theme — the CSS holds
 * all of that — but a built theme is a legitimate base for `extends` (the
 * shipped themes expose one as their `./built` subpath), and a base that
 * carries only tokens makes its children silently lose every component
 * override it had.
 *
 * The icon registry is imported rather than inlined because it holds React
 * elements, which cannot be serialized. `resolveIconImports` reads actual
 * imports from the selected theme's source, where extensionless `./icons` uses
 * the TypeScript resolver — but the artifact here is ESM JavaScript, which
 * requires a fully specified path. Only the caller knows what its own build
 * will emit and under what name, so `iconsSpecifier` lets it say. When it is
 * not given, direct registry specifiers are preserved, and inherited relative
 * imports are rebased from the base module to the theme entry's directory.
 *
 * When an icon entry is a function of `{size, variant}`, the module keeps the
 * registry as `__icons`, which `Icon` resolves at the size and variant it
 * renders, and the theme's `icons` and the re-exported registry are the node
 * view, each function read at `{size: 'md'}` as `DefinedTheme['icons']` is.
 *
 * @param {any} themeDef
 * @param {import('./icon-imports.mjs').IconImports | null} iconInfo
 * @param {string} [iconsSpecifier] - Overrides the selected registry specifier.
 * @param {{themeBinding?: string, iconsExpression?: string, indicatorsExpression?: string, artifactBaseName?: string, exportIcons?: boolean}} [moduleOptions]
 * @returns {string}
 */
function generateBuiltModule(
  themeDef,
  iconInfo,
  iconsSpecifier,
  moduleOptions = {},
) {
  const themeBinding =
    moduleOptions.themeBinding ?? `${toIdentifier(themeDef.name)}Theme`;
  const artifactBaseName = moduleOptions.artifactBaseName ?? themeDef.name;
  const exportIcons = moduleOptions.exportIcons ?? true;
  // Keep ordinary direct named imports byte-compatible, while encoding paths
  // with quotes/escapes and retaining default, namespace, and aliased bindings.
  const iconImport = (iconInfo?.imports ?? [])
    .map(({importPath, importedName, localName}) => {
      const overridden =
        iconsSpecifier !== undefined &&
        importPath === iconInfo?.iconsSpecifierImportPath &&
        localName === iconInfo?.iconsSpecifierLocalName;
      const specifier = overridden
        ? JSON.stringify(iconsSpecifier)
        : /['\\\r\n]/u.test(importPath)
          ? JSON.stringify(importPath)
          : `'${importPath}'`;
      const imported = /^[$\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u.test(
        importedName,
      )
        ? importedName
        : JSON.stringify(importedName);
      const binding =
        importedName === 'default'
          ? localName
          : importedName === '*'
            ? `* as ${localName}`
            : `{ ${imported}${importedName === localName ? '' : ` as ${localName}`} }`;
      return `import ${binding} from ${specifier};\n`;
    })
    .join('');
  const iconDeclaration =
    iconInfo && iconInfo.expression !== iconInfo.exportName
      ? `const ${iconInfo.exportName} = ${iconInfo.expression};\n`
      : '';
  const iconsExpression = moduleOptions.iconsExpression ?? iconInfo?.exportName;
  const iconNodes =
    iconsExpression && hasFunctionIconEntry(themeIconEntries(themeDef))
      ? `${themeBinding}IconNodes`
      : null;
  const iconNodesDeclaration =
    iconNodes && iconsExpression
      ? `const ${iconNodes} = ${iconNodesExpression(iconsExpression, `${themeBinding}IconEntries`, iconNodes)};\n`
      : '';
  const iconsField = iconNodes
    ? `  icons: ${iconNodes},\n  __icons: ${iconsExpression},`
    : iconsExpression
      ? `  icons: ${iconsExpression},`
      : '';
  const indicatorsField = moduleOptions.indicatorsExpression
    ? `\n  indicators: ${moduleOptions.indicatorsExpression},`
    : '';
  const iconReExport =
    iconInfo && exportIcons
      ? iconNodes
        ? `\nexport { ${iconNodes} as ${iconInfo.exportName} };\n`
        : `\nexport { ${iconInfo.exportName} };\n`
      : '';

  // Resolve token values — tuples become light-dark() strings
  /** @type {Record<string, unknown>} */
  const resolvedTokens = {};
  if (themeDef.tokens) {
    for (const [key, value] of Object.entries(themeDef.tokens)) {
      resolvedTokens[key] = resolveTokenValue(value);
    }
  }

  const tokensStr = JSON.stringify(resolvedTokens, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : '  ' + line))
    .join('\n');

  /**
   * Serialize a resolved theme field as an indented object literal, or '' when
   * there is nothing to emit.
   * @param {string} field
   * @param {unknown} value
   * @param {boolean} [includeEmpty]
   * @returns {string}
   */
  const serializeField = (field, value, includeEmpty = false) => {
    if (value == null || (!includeEmpty && Object.keys(value).length === 0))
      return '';
    const body = JSON.stringify(value, null, 2)
      .split('\n')
      .map((line, i) => (i === 0 ? line : '  ' + line))
      .join('\n');
    return `  ${field}: ${body},\n`;
  };

  // Everything a theme that `extends` this built one has to be able to read
  // back. A field missing here is silently lost by the extending theme.
  // SYNC: packages/core/src/theme/defineTheme.ts (DefinedTheme)
  const inheritableFields =
    (themeDef.__localTokenLineage !== undefined
      ? `  localTokens: ${JSON.stringify(themeDef.localTokens ?? {}, null, 2)
          .split('\n')
          .map((line, i) => (i === 0 ? line : '  ' + line))
          .join('\n')},\n` +
        `  __localTokenOwners: ${JSON.stringify(
          themeDef.__localTokenOwners ?? {},
          null,
          2,
        )
          .split('\n')
          .map((line, i) => (i === 0 ? line : '  ' + line))
          .join('\n')},\n` +
        `  __localTokenLineage: ${JSON.stringify(themeDef.__localTokenLineage)},\n`
      : '') +
    serializeField('components', themeDef.components) +
    serializeField('__onDark', themeDef.__onDark) +
    serializeField('__onLight', themeDef.__onLight) +
    serializeField('__adaptations', themeDef.__adaptations) +
    serializeField('__axes', themeDef.__axes ?? {}, true) +
    // An explicit empty list replaces an inherited one, so keep `[]`.
    serializeField('iconVariants', themeDef.iconVariants, true) +
    // Each inherited function entry keeps its defining theme's list. JSON
    // drops `undefined`, so a defining theme with no list is written as `[]`,
    // which no variant matches either.
    serializeField(
      '__iconEntryVariants',
      themeDef.__iconEntryVariants &&
        Object.fromEntries(
          Object.entries(themeDef.__iconEntryVariants).map(([name, list]) => [
            name,
            list ?? [],
          ]),
        ),
    );

  return `${iconImport}${iconDeclaration}${iconNodesDeclaration}/**
 * ${themeDef.name} theme — built by \`${getCliInvocation()} theme build\`
 * Import the CSS file alongside this module:
 *
 *   import { ${themeBinding} } from './${artifactBaseName}';
 *   import './${artifactBaseName}.css';
 */
export const ${themeBinding} = {
  name: '${themeDef.name}',
  __built: true,
  tokens: ${tokensStr},
${inheritableFields}${iconsField}${indicatorsField}
};
${iconReExport}`;
}

/**
 * Generate TypeScript declarations for a built theme module.
 * @param {any} themeDef
 * @param {{exportName: string} | null} iconInfo - The re-exported registry, if any.
 * @param {string | null} variantsFileName
 * @param {{themeBinding?: string, includeIconExport?: boolean, includeThemeImport?: boolean}} [typeOptions]
 * @returns {string}
 */
function generateBuiltTypes(
  themeDef,
  iconInfo,
  variantsFileName,
  typeOptions = {},
) {
  const themeBinding =
    typeOptions.themeBinding ?? `${toIdentifier(themeDef.name)}Theme`;
  const iconType =
    iconInfo && (typeOptions.includeIconExport ?? true)
      ? `import type { IconRegistry } from '@astryxdesign/core/Icon';
export declare const ${iconInfo.exportName}: IconRegistry;
`
      : '';
  // Pull in the generated custom-variant augmentations so that importing the
  // theme's types also loads the module augmentations (otherwise the
  // `.variants.d.ts` is emitted but never referenced, and the custom variants
  // never widen the component prop unions for consumers).
  const variantsRef = variantsFileName
    ? `/// <reference path="./${variantsFileName}" />
`
    : '';
  const themeImport =
    (typeOptions.includeThemeImport ?? true)
      ? `import type { DefinedTheme } from '@astryxdesign/core/theme';\n`
      : '';
  return `${variantsRef}${themeImport}${iconType}export declare const ${themeBinding}: ${builtThemeType(themeDef)};\n`;
}

/**
 * A TypeScript string literal type for `value`.
 * @param {string} value
 * @returns {string}
 */
function tsStringLiteral(value) {
  const inner = JSON.stringify(value)
    .slice(1, -1)
    .replace(/\\"/g, '"')
    .replace(/'/g, "\\'");
  return `'${inner}'`;
}

/**
 * The declared type of a built theme. A theme that lists icon variants
 * carries core's type-only `__iconVariant` marker with those names, so a theme
 * that extends the built one types its icon entries' `variant` by the list,
 * exactly as it would extending the source theme.
 * SYNC: packages/core/src/theme/defineTheme.ts (ResolvedDefinedTheme)
 * @param {any} themeDef
 * @returns {string}
 */
function builtThemeType(themeDef) {
  const names = themeDef.iconVariants;
  if (!Array.isArray(names)) return 'DefinedTheme';
  const variant =
    names.length > 0
      ? [...new Set(names)].map(tsStringLiteral).join(' | ')
      : 'never';
  return `DefinedTheme & { __iconVariant?(variant: ${variant}): void }`;
}

// =============================================================================
// Component validation
// =============================================================================

/**
 * Load known theme target keys from core component docs: the visual props AND
 * runtime states each target reflects. Returns null when docs are unavailable so
 * validation skips warnings rather than guessing from a second registry.
 *
 * @returns {Promise<{propsByKey: Record<string, string[]>} | null>}
 */
async function loadKnownComponents() {
  const coreRoot = resolveCoreRoot();
  const coreSrc = coreRoot ? path.join(coreRoot, 'src') : null;
  if (!coreSrc || !fs.existsSync(coreSrc)) return null;

  const propsByKey = targetsByKey(await collectThemingTargets(coreSrc));
  return Object.keys(propsByKey).length > 0 ? {propsByKey} : null;
}

/** @type {{propsByKey: Record<string, string[]>} | null | undefined} */
let knownComponentsCache;

/**
 * @returns {Promise<{propsByKey: Record<string, string[]>} | null>}
 */
async function getKnownComponents() {
  if (knownComponentsCache === undefined) {
    knownComponentsCache = await loadKnownComponents();
  }
  return knownComponentsCache;
}

/**
 * Validate component overrides against one discovered target registry.
 *
 * @param {{components?: Record<string, Record<string, unknown>>, onDark?: {components?: Record<string, Record<string, unknown>>}, onLight?: {components?: Record<string, Record<string, unknown>>}, __onDark?: {components?: Record<string, Record<string, unknown>>}, __onLight?: {components?: Record<string, Record<string, unknown>>}}} themeDef
 * @param {{propsByKey: Record<string, string[]>}} knownComponents
 * @returns {string[]}
 */
export function validateComponentOverridesAgainstRegistry(
  themeDef,
  knownComponents,
) {
  /** @type {string[]} */
  const warnings = [];
  /** @type {{name: string, components: Record<string, Record<string, unknown>>}[]} */
  const layers = [...getThemeComponentLayers(themeDef)];
  let adaptationIndex = 0;
  for (const value of adaptationRuleValues(themeDef)) {
    adaptationIndex++;
    if (
      value.components &&
      typeof value.components === 'object' &&
      Object.keys(value.components).length > 0
    ) {
      layers.push({
        name: `adaptation rule ${adaptationIndex}`,
        components: value.components,
      });
    }
  }

  for (const {components} of layers) {
    for (const [component, rules] of Object.entries(components)) {
      if (!(component in knownComponents.propsByKey)) {
        const similar = Object.keys(knownComponents.propsByKey)
          .filter(k => {
            if (k.includes(component) || component.includes(k)) return true;
            if (Math.abs(k.length - component.length) <= 2) {
              let diff = 0;
              const longer = k.length >= component.length ? k : component;
              const shorter = k.length < component.length ? k : component;
              let j = 0;
              for (let i = 0; i < longer.length && diff <= 2; i++) {
                if (longer[i] !== shorter[j]) diff++;
                else j++;
              }
              diff += shorter.length - j;
              return diff <= 2;
            }
            return false;
          })
          .slice(0, 3);
        const hint =
          similar.length > 0 ? ` Did you mean: ${similar.join(', ')}?` : '';
        warnings.push(`Unknown component "${component}".${hint}`);
        continue;
      }

      const knownProps = knownComponents.propsByKey[component];
      for (const key of Object.keys(rules)) {
        if (key === 'base') continue;

        const pairs = key.split('+');
        for (const pair of pairs) {
          const [prop] = pair.split(':');
          if (prop && !knownProps.includes(prop)) {
            const hint =
              knownProps.length > 0
                ? ` Known props/states: ${knownProps.join(', ')}`
                : ' This component has no variant props or states.';
            warnings.push(
              `Unknown prop "${prop}" on component "${component}".${hint}`,
            );
          }
        }
      }
    }
  }

  return [...new Set(warnings)];
}

/**
 * Validate component overrides in a theme definition.
 * Warns on unknown component and prop names.
 *
 * @param {{components?: Record<string, Record<string, unknown>>, onDark?: {components?: Record<string, Record<string, unknown>>}, onLight?: {components?: Record<string, Record<string, unknown>>}, __onDark?: {components?: Record<string, Record<string, unknown>>}, __onLight?: {components?: Record<string, Record<string, unknown>>}}} themeDef
 * @returns {Promise<string[]>}
 */
async function validateComponentOverrides(themeDef) {
  const knownComponents = await getKnownComponents();
  return knownComponents == null
    ? []
    : validateComponentOverridesAgainstRegistry(themeDef, knownComponents);
}

const BUILTIN_HEADING_TYPES = new Set(['display-1', 'display-2', 'display-3']);

/**
 * Return every component-rule layer that can emit CSS for a theme. Raw theme
 * input stores media-surface overrides in `onDark`/`onLight`; a theme already
 * resolved by defineTheme stores them in `__onDark`/`__onLight` instead.
 *
 * @param {{components?: Record<string, Record<string, unknown>>, onDark?: {components?: Record<string, Record<string, unknown>>}, onLight?: {components?: Record<string, Record<string, unknown>>}, __onDark?: {components?: Record<string, Record<string, unknown>>}, __onLight?: {components?: Record<string, Record<string, unknown>>}}} themeDef
 * @returns {{name: 'base'|'onDark'|'onLight', components: Record<string, Record<string, unknown>>}[]}
 */
function getThemeComponentLayers(themeDef) {
  /** @type {{name: 'base'|'onDark'|'onLight', components: Record<string, Record<string, unknown>>}[]} */
  const layers = [];
  /**
   * @param {'base'|'onDark'|'onLight'} name
   * @param {{components?: Record<string, Record<string, unknown>>}|undefined} surface
   */
  const addLayer = (name, surface) => {
    if (
      surface?.components &&
      typeof surface.components === 'object' &&
      Object.keys(surface.components).length > 0
    ) {
      layers.push({name, components: surface.components});
    }
  };

  addLayer('base', themeDef);
  addLayer('onDark', themeDef.__onDark ?? themeDef.onDark);
  addLayer('onLight', themeDef.__onLight ?? themeDef.onLight);
  return layers;
}

/**
 * A generated type augmentation makes a custom Heading type callable with the
 * type prop, so that name needs a standalone visual rule of its own. A value
 * that appears only in a combined selector (or has an empty rule) would
 * type-check but fall back for ordinary `type="name"` use.
 *
 * @param {{components?: Record<string, Record<string, unknown>>}} themeDef
 * @returns {string[]}
 */
function validateCustomHeadingTypes(themeDef) {
  const layers = getThemeComponentLayers(themeDef);
  const customTypes = customHeadingTypes(themeDef);

  const errors = [];
  for (const type of customTypes) {
    const hasStandalone = layers.some(({components}) => {
      const headingRules = components.heading;
      if (!headingRules || typeof headingRules !== 'object') return false;
      const standalone = headingRules[`type:${type}`];
      return (
        standalone != null &&
        typeof standalone === 'object' &&
        !Array.isArray(standalone) &&
        hasUsableStyleDeclaration(standalone)
      );
    });
    if (!hasStandalone) {
      errors.push(
        `Custom Heading type "${type}" needs a non-empty standalone ` +
          `components.heading["type:${type}"], ` +
          `onDark.components.heading["type:${type}"], or ` +
          `onLight.components.heading["type:${type}"] rule.`,
      );
    }
  }
  return errors;
}

/**
 * Custom Heading type names declared on the root or media-surface component
 * maps: the names the generated `HeadingTypeMap` augmentation enrolls.
 *
 * @param {{components?: Record<string, Record<string, unknown>>}} themeDef
 * @returns {Set<string>}
 */
function customHeadingTypes(themeDef) {
  /** @type {Set<string>} */
  const customTypes = new Set();
  for (const {components} of getThemeComponentLayers(themeDef)) {
    const headingRules = components.heading;
    if (!headingRules || typeof headingRules !== 'object') continue;

    for (const key of Object.keys(headingRules)) {
      for (const pair of key.split('+')) {
        const colon = pair.indexOf(':');
        if (colon === -1 || pair.slice(0, colon) !== 'type') continue;
        const value = pair.slice(colon + 1);
        if (value && !BUILTIN_HEADING_TYPES.has(value)) customTypes.add(value);
      }
    }
  }
  return customTypes;
}

/**
 * Custom Heading types with no standalone rule in the generated CSS. A type
 * whose every declaration the compiler dropped still passes the source check,
 * and its augmentation would then name a type that has no styles.
 *
 * @param {Set<string>} types
 * @param {string} css - Generated root component and media-surface rules.
 * @returns {string[]}
 */
function headingTypesWithoutEmittedRule(types, css) {
  /** @type {string[]} */
  const missing = [];
  for (const type of types) {
    const selector = `.astryx-heading[data-type="${type}"]`;
    let emitted = false;
    for (
      let at = css.indexOf(selector);
      at !== -1 && !emitted;
      at = css.indexOf(selector, at + 1)
    ) {
      // A following attribute is a combined selector, not the standalone rule.
      emitted = css[at + selector.length] !== '[';
    }
    if (!emitted) missing.push(type);
  }
  return missing;
}

/**
 * Return true when a style object contains a declaration that the theme
 * generator can emit. Empty pseudo blocks and blank values do not count: they
 * produce no usable CSS and would leave the generated type augmentation
 * without a usable rule.
 *
 * @param {unknown} styles
 * @returns {boolean}
 */
function hasUsableStyleDeclaration(styles) {
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) {
    return false;
  }
  for (const [property, value] of Object.entries(styles)) {
    if (property.startsWith(':')) {
      if (hasUsableStyleDeclaration(value)) return true;
      continue;
    }
    if (
      value !== undefined &&
      value !== null &&
      typeof value !== 'object' &&
      String(value).trim() !== ''
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Custom Heading types are only useful when the installed Core package exposes
 * the public map that the generated declaration augments. The CLI and Core
 * are optional peers and can be upgraded independently, so fail explicitly
 * instead of emitting CSS that application TypeScript cannot consume.
 *
 * @param {{components?: Record<string, Record<string, unknown>>}} themeDef
 * @returns {string[]}
 */
function validateHeadingTypeAugmentationSupport(themeDef) {
  const hasCustomType = getThemeComponentLayers(themeDef).some(
    ({components}) => {
      const headingRules = components.heading;
      return (
        headingRules &&
        typeof headingRules === 'object' &&
        Object.keys(headingRules).some(key =>
          key.split('+').some(pair => {
            const colon = pair.indexOf(':');
            return (
              colon !== -1 &&
              pair.slice(0, colon) === 'type' &&
              pair.slice(colon + 1) &&
              !BUILTIN_HEADING_TYPES.has(pair.slice(colon + 1))
            );
          }),
        )
      );
    },
  );
  if (!hasCustomType) return [];

  if (!componentHasAugmentableInterface('Heading', 'HeadingTypeMap')) {
    return [
      'Custom Heading types require an installed @astryxdesign/core that ' +
        'exports HeadingTypeMap from the public Heading subpath. Upgrade Core ' +
        'before building this theme.',
    ];
  }
  return [];
}

/**
 * Compile a defineTheme file to CSS + CSS .d.ts + JS + JS .d.ts (and an
 * optional `.variants.d.ts`). Performs the writes and returns a `theme.build` receipt,
 * or `null` when the theme produced no CSS (nothing to build). Throws
 * AstryxError (stable code) on failure. Progress is emitted through the shared
 * `logger` (silent by default).
 *
 * @param {string} file - Theme file path, resolved against `cwd`.
 * @param {{out?: string, check?: boolean, iconsSpecifier?: string, __prepareFamily?: boolean, __familyLoader?: any, __familyInterception?: any, __onPrivateVarError?: () => void, __writeRoot?: string}} [options] -
 *   `out` overrides the output CSS path; `check` compares against on-disk outputs
 *   instead of writing. `__writeRoot` replaces `cwd` as the directory every
 *   output must stay inside, for a CLI-internal scratch build. `iconsSpecifier` overrides the icon registry import
 *   specifier in the generated module (e.g. `./icons.mjs`); when omitted, the
 *   direct registry specifiers from the theme source are emitted unchanged.
 * @param {{cwd?: string, projectCore?: boolean}} [ctx] `projectCore`: only the
 *   project's installed Core (spec AST-081 FR3)
 * @returns {Promise<any>}
 */
async function themeBuildInternal(
  file,
  options = {},
  {cwd = process.cwd(), projectCore = false} = {},
  /** @type {{compact?: boolean, trailers?: ThemeBuildTrailer[]}} */ report = {},
) {
  const filePath = path.resolve(cwd, file);

  if (!fs.existsSync(filePath)) {
    throw new AstryxError(
      `File not found: ${filePath}`,
      undefined,
      ERROR_CODES.ERR_FILE_NOT_FOUND,
    );
  }

  if (!report.compact) {
    logger.log(`\nBuilding theme from ${path.relative(cwd, filePath)}...`);
  }
  // A compact report has no per-theme heading, so each warning names its file.
  const source = report.compact ? `${path.relative(cwd, filePath)}: ` : '';

  if (projectCore && !findProjectCoreDir(cwd)) {
    throw new AstryxError(
      "The project's Core isn't installed.",
      undefined,
      ERROR_CODES.ERR_CORE_NOT_FOUND,
    );
  }
  await selectCore(cwd, {projectOnly: projectCore});

  // Standalone builds need interception when an older Core could erase
  // adaptations, and when the theme's folder has no Core of its own: its
  // imports of Core are then handed the Core this build selected, as family
  // builds' are. Family preparation always supplies the same recorder as its
  // shared loader so exact authored parent identity stays CLI-private instead
  // of becoming a public DefinedTheme field.
  const interception =
    options.__familyInterception ??
    (_generateAdaptationCSS && themeFolderResolvesCore(filePath)
      ? undefined
      : interceptCore(_coreThemeModule, _coreRootModule));

  // Extract theme definition
  let themeDef;
  /** The export actually selected by the loader, not the first AST match. */
  let themeExportName;
  /** Paths through the load that interception could not fully observe. */
  let loadDegradation;
  try {
    const loaded = await extractThemeDefinition(
      filePath,
      interception,
      options.__familyLoader,
    );
    themeDef = loaded.theme;
    themeExportName = loaded.exportName;
    loadDegradation = loaded.degraded;
  } catch (e) {
    const err = /** @type {Error} */ (e);
    throw new AstryxError(err.message, undefined, ERROR_CODES.ERR_THEME_LOAD);
  }

  // The marker is scoped to that isolated load: drop it before the theme
  // reaches anything that reads or writes it. (Symbol keys are invisible to
  // JSON.stringify and Object.keys, so it could not reach output regardless.)
  // Both reads happen BEFORE the strip, which is what removes the evidence.
  const ancestryObserved =
    !options.__prepareFamily ||
    !interception ||
    interception.observed(themeDef) ||
    Object.hasOwn(themeDef, 'extends');
  if (options.__prepareFamily && interception) interception.retain(themeDef);
  const sourceParent =
    options.__prepareFamily && interception
      ? interception.parentOf(themeDef)
      : undefined;
  const adaptationLineage = interception
    ? interception.lineageOf(themeDef)
    : undefined;
  const capturedGenerativeAxes = interception
    ? interception.capturedAxesOf(themeDef)
    : undefined;
  const hasCoverageGap = Boolean(
    loadDegradation?.topLevelAwait || loadDegradation?.commonJs,
  );
  const unobservedLineage =
    interception && hasCoverageGap ? interception.unobservedIn(themeDef) : [];
  if (interception) interception.strip(themeDef);
  if (!ancestryObserved) {
    throw new AstryxError(
      `Theme "${themeDef.name ?? path.basename(filePath)}" exact family ancestry could not be observed during CLI loading.`,
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }

  if (!themeDef.name) {
    throw new AstryxError(
      'Theme must have a name property.',
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }

  // Path-safety: the theme name is used to derive output filenames
  // (e.g. `${name}.css`, `${name}.js`). Reject names containing path
  // separators or traversal markers — `../../escaped` would otherwise
  // write JS modules outside the input directory.
  try {
    sanitizeName(themeDef.name, {label: 'theme name'});
  } catch (err) {
    if (err instanceof PathSafetyError) {
      throw new AstryxError(
        err.message,
        undefined,
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
    throw err;
  }

  // A generated module must preserve the registry through an import: it may
  // contain React elements, which cannot be serialized. Validate before CSS
  // generation so neither the no-CSS return nor --check can bypass the error.
  // Family preparation keeps its own named-import registry contract, which
  // themeBuildFamily checks against the selected members' graph.
  const standaloneIcons = !options.__prepareFamily;
  // Function icon entries stay functions in the built module, beside a node
  // view bound to `<theme>IconNodes` and computed from `<theme>IconEntries`.
  const functionEntries =
    hasFunctionIconEntry(themeIconEntries(themeDef)) ||
    hasFunctionIconEntry(themeIconEntries(themeDef.extends));
  /** @param {boolean} reserveIconNodes */
  const reservedNames = reserveIconNodes => [
    `${toIdentifier(themeDef.name)}Theme`,
    ...(reserveIconNodes
      ? [
          `${toIdentifier(themeDef.name)}ThemeIconNodes`,
          `${toIdentifier(themeDef.name)}ThemeIconEntries`,
        ]
      : []),
  ];
  const iconResolution = {
    readSource: (/** @type {string} */ file) => fs.readFileSync(file, 'utf8'),
    resolveModule: resolveThemeModule,
    reservedNames: reservedNames(functionEntries),
    functionEntries,
    rawInput: 'extends' in themeDef,
    hasIcons:
      Object.keys(themeDef.icons ?? {}).length > 0 ||
      Object.keys(themeDef.extends?.icons ?? {}).length > 0,
  };
  let iconInfo = standaloneIcons
    ? await resolveIconImports(filePath, themeExportName, iconResolution)
    : null;

  // Validate component overrides
  const warnings = await validateComponentOverrides(themeDef);
  const warningMessages = [];
  /** Advisories about a correct theme — see the `notices` note on the receipt. */
  const noticeMessages = [];
  for (const w of warnings) {
    warningMessages.push(w);
    logger.warn(`  [warn] ${source}${w}`);
  }

  // Validate no private vars are set directly
  const privateVarErrors = validatePrivateVars(themeDef);
  for (const e of privateVarErrors) {
    warningMessages.push(e);
    logger.error(`  [error] ${source}${e}`);
  }
  if (privateVarErrors.length > 0) {
    options.__onPrivateVarError?.();
    logger.error(
      `\n  ${source}${privateVarErrors.length} private var error(s). Use standard CSS properties instead.`,
    );
  }

  const customHeadingErrors = validateCustomHeadingTypes(themeDef);
  customHeadingErrors.push(...validateHeadingTypeAugmentationSupport(themeDef));
  if (customHeadingErrors.length > 0) {
    throw new AstryxError(
      customHeadingErrors.join('\n'),
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }

  // Generate CSS via core's shared generator — the SINGLE source of truth.
  // `astryx theme build` and the `<Theme>` runtime MUST emit identical CSS, so
  // there is exactly one generation path: @astryxdesign/core/theme. If core could not
  // be imported, fail hard rather than silently producing divergent output.
  // Only the baseline exports every theme build needs are required here;
  // capability exports are checked against what the theme actually asks for.
  if (!_defineTheme || !_generateThemeRulesSplit) {
    throw new AstryxError(
      coreUnavailableMessage(cwd, _coreImportError),
      undefined,
      ERROR_CODES.ERR_CORE_NOT_FOUND,
    );
  }

  // An adaptation theme against a core that cannot compile adaptations stops
  // here — before any CSS is generated and long before anything is written.
  // Checked against the SELECTED theme's own lineage: the raw inputs it and
  // its bases were resolved from, so an unrelated adaptive theme elsewhere in
  // the import graph cannot fail this build.
  const coreVersionForCapability = readPkgVersion(findCoreDir(cwd));
  assertAdaptationCapability(themeDef, {
    coreVersion: coreVersionForCapability,
    lineage: adaptationLineage,
    unobserved: unobservedLineage,
    degradation: loadDegradation,
  });

  let css;
  let resolvedTheme;
  let cssPlan;
  {
    // jiti returns an already-resolved theme; a plain object literal (or the
    // legacy eval path) returns raw defineTheme input, which still has to go
    // through the resolver. Detect that by the input-only fields — a resolved
    // theme has none of them — and hand the WHOLE object over: picking fields
    // by name is how `extends` (and `color`, and `syntax`) used to be dropped
    // on the way in.
    // Fields that only ever appear on RAW defineTheme() input, never on an
    // already-resolved theme. Their presence is how the build tells the two
    // apart and decides to run defineTheme() itself. A field missing from this
    // list is dropped without a word, so every new input field belongs here.
    // SYNC: packages/core/src/theme/defineTheme.ts (DefineThemeInput)
    const INPUT_ONLY_FIELDS = [
      'extends',
      'typography',
      'motion',
      'radius',
      'color',
      'syntax',
      'onDark',
      'onLight',
      'adaptations',
    ];
    const needsResolution =
      INPUT_ONLY_FIELDS.some(field => themeDef[field] !== undefined) ||
      ('localTokens' in themeDef && themeDef.__localTokenLineage === undefined);
    if (needsResolution) {
      try {
        resolvedTheme = _defineTheme({...themeDef});
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Theme normalization failed.';
        throw new AstryxError(
          message,
          undefined,
          ERROR_CODES.ERR_THEME_INVALID,
        );
      }
    } else {
      resolvedTheme = themeDef;
    }

    // Raw object exports can acquire icons only when Core resolves `extends`.
    // Recheck an unresolved provenance result before any generator runs.
    if (
      standaloneIcons &&
      !iconInfo &&
      Object.keys(resolvedTheme.icons ?? {}).length > 0
    ) {
      const resolvedFunctionEntries = hasFunctionIconEntry(
        themeIconEntries(resolvedTheme),
      );
      iconInfo = await resolveIconImports(filePath, themeExportName, {
        ...iconResolution,
        hasIcons: true,
        functionEntries: resolvedFunctionEntries,
        reservedNames: reservedNames(resolvedFunctionEntries),
      });
    }
    // An opaque package base can legitimately have no icons. Its .icons
    // reference is unnecessary; direct empty registry imports remain intact.
    if (
      iconInfo &&
      iconInfo.iconsSpecifierLocalName === undefined &&
      Object.keys(resolvedTheme.icons ?? {}).length === 0
    ) {
      iconInfo = null;
    }
    if (
      iconInfo &&
      options.iconsSpecifier !== undefined &&
      iconInfo.iconsSpecifierImportPath === undefined
    ) {
      throw new AstryxError(
        'The icon registry is inherited through a theme import. ' +
          'To use --icons-specifier, import the registry directly and set icons to that binding.',
        undefined,
        ERROR_CODES.ERR_THEME_INVALID,
      );
    }

    // Cores that predate adaptations can still resolve typography, color,
    // radius, and motion into root tokens, but they do not retain the raw axis
    // inputs. Keep the effective metadata captured from the same defineTheme
    // lineage so a later current-core child can complete a partial adaptation
    // axis exactly as it would when extending the source theme.
    if (
      resolvedTheme.__axes === undefined &&
      capturedGenerativeAxes &&
      Object.keys(capturedGenerativeAxes).length > 0
    ) {
      resolvedTheme = {...resolvedTheme, __axes: capturedGenerativeAxes};
    }

    // Re-check after resolution: `extends` can pull adaptation rules in from a
    // base the entry file never mentions, and a resolver that understands them
    // surfaces them here.
    assertAdaptationCapability(resolvedTheme, {
      coreVersion: coreVersionForCapability,
      lineage: adaptationLineage,
      unobserved: unobservedLineage,
      degradation: loadDegradation,
    });

    const adaptationEnrollmentErrors =
      await validateAdaptationEnrollment(resolvedTheme);
    if (adaptationEnrollmentErrors.length > 0) {
      throw new AstryxError(
        adaptationEnrollmentErrors.join('\n'),
        undefined,
        ERROR_CODES.ERR_THEME_INVALID,
      );
    }

    const scopeSelector = themeScopeStart(themeDef.name);
    const scopeTo = THEME_SCOPE_TO;

    // Older cores ignore this optional collector. Current core writes the same
    // warning text here that runtime callers receive on the console.
    /** @type {string[]} */
    const droppedDeclarations = [];

    let themeRules;
    try {
      themeRules = _generateThemeRulesSplit(resolvedTheme, droppedDeclarations);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Theme normalization failed.';
      throw new AstryxError(message, undefined, ERROR_CODES.ERR_THEME_INVALID);
    }
    const {component, prose} = themeRules;
    const cssParts = [];
    // Prose element defaults always ship — the `<Theme>` runtime
    // (generateThemeCSS) always emits them, so the build must too, or the
    // CLI output would diverge from runtime. They go in @layer reset
    // (zero-specificity :where()) so component/Markdown StyleX always wins.
    if (prose.length > 0) {
      const proseInner = prose.join('\n\n');
      cssParts.push(
        `@layer reset {\n@scope (${scopeSelector}) to (${scopeTo}) {\n${proseInner}\n}\n}`,
      );
    }
    // Ordered adaptation rules use the same generator as the runtime path.
    // An older core has no such generator; a theme that needs one never
    // reaches this line (assertAdaptationCapability above), so the empty
    // result here belongs to a theme with no adaptation rules to emit.
    let adaptationCss;
    try {
      adaptationCss = _generateAdaptationCSS
        ? _generateAdaptationCSS(resolvedTheme, droppedDeclarations)
        : {component: '', prose: ''};
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Theme normalization failed.';
      throw new AstryxError(message, undefined, ERROR_CODES.ERR_THEME_INVALID);
    }
    const componentInner = component.join('\n\n');
    const componentScope =
      component.length > 0
        ? `@scope (${scopeSelector}) to (${scopeTo}) {\n${componentInner}\n}`
        : '';

    // #3658: also emit attribute-specific rules so <Theme mode> can override
    // color-scheme. Inspect root and rule-owned values, not generated CSS, which
    // also carries theme-independent data-token defaults with light-dark().
    const themeOwnValues = JSON.stringify([
      resolvedTheme.tokens ?? {},
      resolvedTheme.localTokens ?? {},
      resolvedTheme.components ?? {},
      ...(resolvedTheme.__adaptationRules ?? []).flatMap(
        (
          /** @type {{tokens?: Record<string, string>, localTokens?: Record<string, string>, components?: object}} */ rule,
        ) => [rule.tokens ?? {}, rule.localTokens ?? {}, rule.components ?? {}],
      ),
    ]);
    const colorSchemeDecl =
      themeOwnValues.includes('light-dark(') ||
      adaptationCss.component.includes('light-dark(')
        ? '  :root { color-scheme: light dark; }\n  html[data-theme="light"] { color-scheme: light; }\n  html[data-theme="dark"] { color-scheme: dark; }\n\n'
        : '';
    if (colorSchemeDecl || componentScope) {
      cssParts.push(
        `@layer astryx-theme {\n${colorSchemeDecl}${componentScope}\n}`,
      );
    }
    if (adaptationCss.prose) {
      cssParts.push(`@layer reset {\n${adaptationCss.prose}\n}`);
    }
    if (adaptationCss.component) {
      cssParts.push(`@layer astryx-theme {\n${adaptationCss.component}\n}`);
    }
    // Media-surface rules come last so onDark/onLight win over matching
    // adaptations on the same resolved leaf.
    let onMediaCss = '';
    if (_generateOnMediaCSS) {
      onMediaCss = _generateOnMediaCSS(resolvedTheme, droppedDeclarations);
      if (onMediaCss) {
        cssParts.push(`@layer astryx-theme {\n${onMediaCss}\n}`);
      }
    }
    for (const message of droppedDeclarations) {
      const w = `Declaration ${message}. The generated CSS omits it; fix the value in the theme source.`;
      warningMessages.push(w);
      logger.warn(`  [warn] ${source}${w}`);
    }
    const unemittedHeadingTypes = headingTypesWithoutEmittedRule(
      customHeadingTypes(themeDef),
      `${component.join('\n')}\n${onMediaCss}`,
    );
    if (unemittedHeadingTypes.length > 0) {
      throw new AstryxError(
        unemittedHeadingTypes
          .map(
            type =>
              `Custom Heading type "${type}" has no declaration the theme ` +
              `compiler could emit: every declaration in its standalone ` +
              `"type:${type}" rule was dropped. Give that rule at least one ` +
              'valid declaration.',
          )
          .join('\n'),
        undefined,
        ERROR_CODES.ERR_THEME_INVALID,
      );
    }
    if (cssParts.length === 0) {
      logger.log(`${source}No overrides found; nothing to build.`);
      return null;
    }
    cssParts.unshift('@layer reset, astryx-base, astryx-theme;');
    const baseCss = '';
    cssPlan = {
      base: baseCss,
      prose,
      component,
      adaptation: adaptationCss.component,
      adaptationProse: adaptationCss.prose,
      onMedia: onMediaCss,
      colorScheme: colorSchemeDecl.trimEnd(),
    };
    css = cssParts.join('\n\n') + '\n';
  }

  // Source path relative to cwd — used in @generated headers
  const sourceRelative = path.relative(cwd, filePath);
  const buildCommand = `astryx theme build ${sourceRelative}${options.out ? ' --out ' + path.relative(cwd, path.resolve(cwd, options.out)) : ''}`;
  // Stable provenance recorded in @generated headers — versions, not a
  // timestamp, so identical inputs produce byte-identical output.
  const versions = resolveToolVersions(cwd);

  // Derive the default CSS name from the theme name so .css/.js/.d.ts
  // share one scheme; an explicit --out still wins.
  const baseName = themeDef.name;
  // Every write stays inside cwd. A CLI-internal caller that renders into a
  // scratch directory it creates and removes names that directory instead.
  const writeRoot = options.__writeRoot ?? cwd;
  let outPath;
  if (options.out) {
    outPath = path.resolve(cwd, options.out);
    // A build keeps the explicit output inside the write root, relative or
    // absolute. Check mode writes nothing, so it refuses only a relative path
    // that escapes cwd.
    if (!options.check || !path.isAbsolute(options.out)) {
      confineOutput(outPath, writeRoot, OUT_REMEDY, options.out);
    }
  } else {
    outPath = path.join(path.dirname(filePath), `${baseName}.css`);
  }

  const displayTheme = resolvedTheme || themeDef;
  const tokenCount =
    Object.keys(displayTheme.tokens ?? {}).length +
    Object.keys(displayTheme.localTokens ?? {}).length;
  const componentCount = displayTheme.components
    ? Object.keys(displayTheme.components).length
    : 0;
  const size = (Buffer.byteLength(css) / 1024).toFixed(1);

  // Compute all output paths up front so we can validate them as a
  // group BEFORE writing anything. Previously the CSS would be written
  // first; if the JS write failed (e.g. ENOENT, permission), the CSS
  // was left as orphaned half-built output. Stage-then-commit avoids
  // that.
  const outDir = path.dirname(outPath);
  const cssDtsPath = `${outPath}.d.ts`;
  const jsPath = path.join(outDir, `${baseName}.js`);
  const dtsPath = path.join(outDir, `${baseName}.d.ts`);

  // Type augmentation .d.ts if theme has custom prop values. Computed
  // before the main .d.ts so the latter can reference it (see below).
  const augmentationSource = resolvedTheme || themeDef;
  const variantDecl =
    await generateVariantDeclarationsAsync(augmentationSource);
  const variantsFileName = variantDecl ? `${baseName}.variants.d.ts` : null;
  const variantDtsPath =
    variantDecl && variantsFileName
      ? path.join(outDir, variantsFileName)
      : null;
  const variantContent = variantDecl
    ? generatedHeader(sourceRelative, 'ts', buildCommand, versions) +
      variantDecl
    : null;

  // Generate all file contents in memory first. The main .d.ts references
  // the variants file (when present) via a triple-slash directive so
  // importing the theme also loads the custom-variant augmentations.
  const cssContent =
    generatedHeader(sourceRelative, 'css', buildCommand, versions) + css;
  const cssDtsContent =
    generatedHeader(sourceRelative, 'ts', buildCommand, versions) +
    'export {};\n';
  const jsContent =
    generatedHeader(sourceRelative, 'js', buildCommand, versions) +
    generateBuiltModule(
      resolvedTheme || themeDef,
      iconInfo,
      options.iconsSpecifier,
    );
  const dtsContent =
    generatedHeader(sourceRelative, 'ts', buildCommand, versions) +
    generateBuiltTypes(resolvedTheme || themeDef, iconInfo, variantsFileName);

  const unloadedFonts = [
    ...new Set([
      ...collectUnloadedFonts(resolvedTheme),
      ...adaptationRuleValues(resolvedTheme).flatMap(
        (/** @type {any} */ value) => collectUnloadedFonts(value),
      ),
    ]),
  ];

  if (options.__prepareFamily) {
    return {
      filePath,
      sourceRelative: sourceRelative.split(path.sep).join('/'),
      theme: displayTheme,
      sourceTheme: themeDef,
      sourceParent,
      iconInfo: extractRegistryInfo(filePath, 'icons'),
      indicatorInfo: extractRegistryInfo(filePath, 'indicators'),
      variantDecl,
      css: cssPlan,
      versions,
      tokenCount,
      componentCount,
      warnings: warningMessages,
      unloadedFonts,
    };
  }

  const writes = [
    {dest: outPath, content: cssContent},
    {dest: cssDtsPath, content: cssDtsContent, allowMissingInCheck: true},
    {dest: jsPath, content: jsContent},
    {dest: dtsPath, content: dtsContent},
  ];
  if (variantDtsPath && variantContent) {
    writes.push({dest: variantDtsPath, content: variantContent});
  }

  // Every output a build writes stays inside cwd, including the defaults
  // beside the theme file. Check mode writes nothing, so it compares outputs
  // outside cwd read-only.
  if (!options.check) {
    confineOutputs(writes, writeRoot, options.out ? OUT_REMEDY : SOURCE_REMEDY);
  }

  // Check mode: compare generated content against what's on disk instead of
  // writing. A file is "stale" if it's missing or its content differs once the
  // volatile @generated `Command:` line is ignored. Returns a
  // receipt listing stale/missing outputs so callers (CI) can fail on drift.
  if (options.check) {
    const stale = staleBuildOutputs(writes, cwd);
    const upToDate = stale.length === 0;
    if (upToDate) {
      logger.log(`\n[ok] Theme outputs are up to date with ${sourceRelative}.`);
    } else {
      logger.error(
        `\n[fail] ${stale.length} theme output(s) are out of date with ${sourceRelative}:`,
      );
      for (const s of stale) {
        logger.error(
          `  ${s.reason === 'missing' ? 'missing' : 'stale'}: ${s.path}`,
        );
      }
      // prettier-ignore
      const remedy = outsideCheckRemedy(writes, [filePath], writeRoot, relative => [relative(filePath), ...(options.out ? ['--out', relative(outPath)] : []), ...(options.iconsSpecifier ? ['--icons-specifier', options.iconsSpecifier] : [])]);
      if (remedy) logger.error(`\n  ${remedy.join('\n  ')}`);
      else logger.error(`\n  Rebuild with: ${buildCommand}`);
    }
    return {
      type: 'theme.build.check',
      data: {
        name: themeDef.name,
        upToDate,
        stale,
        checked: checkedBuildOutputs(writes, cwd),
      },
    };
  }

  writeBuildOutputs(writes);

  if (!report.compact) {
    logger.log(`\n[ok] ${path.relative(cwd, outPath)}`);
    logger.log(`[ok] ${path.relative(cwd, cssDtsPath)}`);
    logger.log(
      `  ${tokenCount} token overrides, ${componentCount} component overrides`,
    );
    logger.log(`  ${size} KB`);
    logger.log(`[ok] ${path.relative(cwd, jsPath)}`);
    logger.log(`[ok] ${path.relative(cwd, dtsPath)}`);
    if (variantDtsPath && variantDecl) {
      const augCount = (variantDecl.match(/': true;/g) || []).length;
      logger.log(
        `[ok] ${path.relative(cwd, variantDtsPath)} (${augCount} type augmentations)`,
      );
    }
  }

  const relOutDir = path.relative(cwd, outDir) || '.';
  const cssBase = path.basename(outPath, '.css');
  const jsImport = importSpecifier(relOutDir, baseName);
  const cssImport = importSpecifier(relOutDir, cssBase) + '.css';
  const exportName = `${toIdentifier(baseName)}Theme`;

  // Fonts the theme names but nothing loads (#5015). Resolved tokens and
  // component overrides carry the final font-family values on both load
  // paths, so this sees jiti-resolved and legacy themes alike.
  //
  // A NOTICE, not a warning: naming a font a theme file cannot load is how
  // the API is meant to be used — Astryx sets `--font-family-*` and loading
  // is the app's job, which no theme can do for it. So this fires on any
  // theme with a webfont, including a perfect one, and as a warning it made
  // every such build read as defective (it also put the shipped template
  // permanently in violation of its own "compiles with no warnings" guard).
  // Adaptation rules are resolved theme writes in their own right, so a family
  // named only inside one needs the same notice as one named at the root.
  /** @type {string[]} */
  const fontNotices = [];
  for (const family of unloadedFonts) {
    const msg = `Font "${family}" is named by this theme but not loaded; add a <link> or @font-face in your app (recipe: astryx docs typography)`;
    noticeMessages.push(msg);
    fontNotices.push(msg);
  }

  /** @type {ThemeBuildTrailer} */
  const trailer = {
    themeName: themeDef.name,
    exportName,
    jsImport,
    cssImport,
    unloadedFonts,
    fontNotices,
  };
  // A batch or compact report prints this once for the whole run instead.
  if (report.trailers) report.trailers.push(trailer);
  else printBuildTrailer(trailer);

  return {
    type: 'theme.build',
    data: {
      name: themeDef.name,
      tokenCount,
      componentCount,
      sizeKB: parseFloat(size),
      outputs: {
        css: path.relative(cwd, outPath),
        cssDts: path.relative(cwd, cssDtsPath),
        js: path.relative(cwd, jsPath),
        dts: path.relative(cwd, dtsPath),
        ...(variantDecl && variantDtsPath
          ? {variantsDts: path.relative(cwd, variantDtsPath)}
          : {}),
      },
      warnings: warningMessages,
      notices: noticeMessages,
    },
  };
}

/**
 * What a standalone build prints after its [ok] lines, kept as data so a
 * batch can print it once for every theme.
 * @typedef {object} ThemeBuildTrailer
 * @property {string} themeName The theme's name.
 * @property {string} exportName The built module's theme export.
 * @property {string} jsImport Import specifier of the built JS module.
 * @property {string} cssImport Import specifier of the built CSS.
 * @property {string[]} unloadedFonts Font families the theme names but does not load.
 * @property {string[]} fontNotices One notice per unloaded font family.
 */

/**
 * Print a standalone build's install snippet and font guidance.
 * @param {ThemeBuildTrailer} trailer
 */
function printBuildTrailer(trailer) {
  logger.log(`
Install in your app (paths are relative to a file in src/; adjust if yours lives elsewhere):

  import { Theme } from '@astryxdesign/core/theme';
  import { ${trailer.exportName} } from '${trailer.jsImport}';
  import '${trailer.cssImport}';

  <Theme theme={${trailer.exportName}}>
    <App />
  </Theme>

Or with a <link> tag:

  import { Theme } from '@astryxdesign/core/theme';
  import { ${trailer.exportName} } from '${trailer.jsImport}';

  <link rel="stylesheet" href="${trailer.cssImport}" />
  <Theme theme={${trailer.exportName}}>
    <App />
  </Theme>
`);
  for (const msg of trailer.fontNotices) logger.log(`  note: ${msg}`);
  if (trailer.unloadedFonts.length > 0) {
    logger.log(formatFontLoadingHelp(trailer.themeName, trailer.unloadedFonts));
  }
}

/**
 * Print the install snippet and font guidance once for a batch: the first
 * theme as the full example, one import line per built theme, and one font
 * recipe naming every family the themes do not load.
 * @param {ThemeBuildTrailer[]} trailers
 */
export function printBatchTrailer(trailers) {
  if (trailers.length === 0) return;
  const [first] = trailers;
  logger.log(`
Install in your app (paths are relative to a file in src/; adjust if yours lives elsewhere):

  import { Theme } from '@astryxdesign/core/theme';
  import { ${first.exportName} } from '${first.jsImport}';
  import '${first.cssImport}';

  <Theme theme={${first.exportName}}>
    <App />
  </Theme>

Or with a <link> tag:

  import { Theme } from '@astryxdesign/core/theme';
  import { ${first.exportName} } from '${first.jsImport}';

  <link rel="stylesheet" href="${first.cssImport}" />
  <Theme theme={${first.exportName}}>
    <App />
  </Theme>
`);
  if (trailers.length > 1) {
    logger.log('Each built theme imports the same way:');
    for (const trailer of trailers) {
      logger.log(
        `  import { ${trailer.exportName} } from '${trailer.jsImport}'; import '${trailer.cssImport}';`,
      );
    }
  }
  const fonts = groupUnloadedFonts(trailers);
  if (fonts.length > 0) logger.log(formatBatchFontLoadingHelp(fonts));
}

/**
 * Print what a short report keeps after its one line per theme: one line
 * naming the fonts the themes do not load, and, when the caller chose no
 * detail level, where the install example and font recipe are.
 * @param {ThemeBuildTrailer[]} trailers
 * @param {{hint?: boolean}} [options]
 */
export function printCompactTrailer(trailers, {hint = false} = {}) {
  if (trailers.length === 0) return;
  const fonts = groupUnloadedFonts(trailers);
  if (fonts.length > 0) {
    const named = fonts
      .map(({family, themes}) =>
        trailers.length > 1
          ? `"${family}" (${themes.join(', ')})`
          : `"${family}"`,
      )
      .join(', ');
    logger.log(
      `[note] Fonts named but not loaded: ${named}. Load them in your app (recipe: ${formatCliCommand('docs typography')}).`,
    );
  }
  if (hint) {
    logger.log(
      'Run with --detail full for the install example and font recipe.',
    );
  }
}

/**
 * Each font family the themes name but do not load, with the themes that
 * name it, in first-seen order.
 * @param {ThemeBuildTrailer[]} trailers
 * @returns {Array<{family: string, themes: string[]}>}
 */
function groupUnloadedFonts(trailers) {
  /** @type {Map<string, {family: string, themes: string[]}>} */
  const byFamily = new Map();
  for (const trailer of trailers) {
    for (const family of trailer.unloadedFonts) {
      const key = family.toLowerCase();
      const entry = byFamily.get(key) ?? {family, themes: []};
      entry.themes.push(trailer.themeName);
      byFamily.set(key, entry);
    }
  }
  return [...byFamily.values()];
}

/**
 * Build one theme for a batch or compact CLI report. Same build, outputs, and
 * receipt as {@link themeBuild}; the install snippet and font guidance come
 * back as `trailer` instead of being printed, and `compact` leaves out the
 * per-file progress lines. CLI-internal: not exported from the API entry.
 * @param {string} file
 * @param {{out?: string, check?: boolean, iconsSpecifier?: string}} [options]
 * @param {{cwd?: string}} [ctx]
 * @param {{compact?: boolean}} [report]
 * @returns {Promise<{receipt: import('../theme.type.mjs').ThemeBuildResponse | import('../theme.type.mjs').ThemeBuildCheckResponse | null, trailer: ThemeBuildTrailer | null}>}
 */
export async function themeBuildForReport(
  file,
  options = {},
  ctx = {},
  {compact = false} = {},
) {
  /** @type {ThemeBuildTrailer[]} */
  const trailers = [];
  const receipt = /** @type {any} */ (
    await themeBuildInternal(file, options, ctx, {compact, trailers})
  );
  return {receipt, trailer: trailers[0] ?? null};
}

/** @param {string} file @param {{out?: string, check?: boolean, iconsSpecifier?: string}} [options] @param {{cwd?: string, projectCore?: boolean}} [ctx] `projectCore`: read only the project's installed Core, never the carried one (doctor; spec AST-081 FR3) @returns {Promise<import('../theme.type.mjs').ThemeBuildResponse | import('../theme.type.mjs').ThemeBuildCheckResponse | null>} */
export async function themeBuild(file, options = {}, ctx = {}) {
  return /** @type {any} */ (themeBuildInternal(file, options, ctx));
}
/** @param {string} name */
// prettier-ignore
function familyThemeBinding(name) {
  const words = name.split(/[^A-Za-z0-9_$]+/).filter(Boolean);
  let identifier = words.map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)).join('');
  if (!/^[A-Za-z_$]/.test(identifier)) identifier = `_${identifier}`;
  return `${identifier || '_'}Theme`;
}
/** @param {any[]} members */
// prettier-ignore
function allocateFamilyBindings(members) {
  const used = new Map();
  return new Map(members.map(member => { const base = familyThemeBinding(member.theme.name), count = used.get(base) ?? 0; used.set(base, count + 1); return [member.theme.name, count === 0 ? base : `${base}${count + 1}`]; }));
}
/** Rebase a scraped relative registry import to the aggregate module. @param {any} info @param {string} filePath @param {string} outDir @param {string | undefined} override */
// prettier-ignore
function familyRegistryInput(info, filePath, outDir, override) {
  if (!info || override !== undefined) return {info, specifier: override};
  const source = info.importPath;
  if (!source.startsWith('./') && !source.startsWith('../')) return {info, specifier: undefined};
  const absolute = path.resolve(path.dirname(filePath), source);
  let specifier = path.relative(outDir, absolute).split(path.sep).join('/');
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) specifier = `./${specifier}`;
  return {info, specifier};
}
/** Dependency-first load plan including local barrels between selected files. @param {string[]} files @param {string} cwd */
// prettier-ignore
function planFamilySources(files, cwd) {
  /** @type {Array<{file: string, filePath: string}>} */ const entries = files.map(file => ({file, filePath: path.resolve(cwd, file)}));
  /** @param {string} value */ const canonical = value => fs.existsSync(value) ? fs.realpathSync(value) : path.resolve(value);
  /** @type {Map<string, {file: string, filePath: string}>} */ const selected = new Map(entries.map(entry => [canonical(entry.filePath), entry]));
  if (selected.size !== entries.length) return entries.map(entry => ({...entry, selected: true}));
  /** @type {Map<string, Set<string>>} */ const reachableMemo = new Map(), dependencies = new Map();
  /** @param {string} filePath @param {Set<string>} [visiting] @returns {Set<string>} */
  const reachableSelected = (filePath, visiting = new Set()) => {
    const key = canonical(filePath), cached = reachableMemo.get(key); if (cached) return cached;
    if (visiting.has(key) || !fs.existsSync(key)) return new Set();
    visiting.add(key); /** @type {Set<string>} */ const found = new Set(), direct = new Set(); let ast;
    try { ast = parse(fs.readFileSync(key, 'utf8'), {sourceType: 'unambiguous', plugins: ['typescript', 'jsx', 'decorators-legacy', 'importAttributes']}); }
    catch { visiting.delete(key); reachableMemo.set(key, found); return found; }
    for (const node of /** @type {any[]} */ (ast.program.body)) {
      const specifier = node.importKind !== 'type' ? node.source?.value : null; if (typeof specifier !== 'string' || (!specifier.startsWith('.') && !path.isAbsolute(specifier))) continue;
      let dependency; try { dependency = canonical(createJiti(key, {extensions: THEME_MODULE_EXTENSIONS}).resolve(specifier)); } catch { continue; }
      if (!dependency.split(path.sep).includes('node_modules') && /\.[cm]?[jt]sx?$/.test(dependency)) direct.add(dependency);
      if (selected.has(dependency)) found.add(dependency); else for (const nested of reachableSelected(dependency, visiting)) found.add(nested);
    }
    visiting.delete(key); dependencies.set(key, direct); reachableMemo.set(key, found); return found;
  };
  for (const entry of entries) reachableSelected(entry.filePath);
  /** @type {Array<{file: string, filePath: string, selected: boolean}>} */ const plan = []; /** @type {Set<string>} */ const marks = new Set();
  /** @param {string} key */ const visit = key => { if (marks.has(key)) return; marks.add(key); for (const dependency of dependencies.get(key) ?? []) if (selected.has(dependency) || reachableSelected(dependency).size > 0) visit(dependency); const entry = selected.get(key); plan.push(entry ? {...entry, selected: true} : {file: key, filePath: key, selected: false}); };
  for (const entry of entries) visit(canonical(entry.filePath)); return plan;
}

/** Preload an intermediary module into the shared family cache. @param {string} filePath @param {any} loader @param {import('./core-interception.mjs').CoreInterception} interception */
// prettier-ignore
async function preloadFamilySource(filePath, loader, interception) {
  const patch = interception.patchCommonJs(filePath);
  try { try { loader(filePath); } catch (error) { if (!isSyncLoaderLimitation(error)) throw error; await loader.evalModule(fs.readFileSync(filePath, 'utf8'), {id: filePath, filename: filePath, ext: path.extname(filePath), cache: loader.cache, async: true, forceTranspile: true}); } }
  finally { patch.undo(); }
}

/** @param {string[]} files @param {{familyKey: string, check?: boolean, iconsSpecifier?: string, __onPrivateVarError?: () => void}} options @param {{cwd?: string}} [ctx] */
export async function themeBuildFamily(
  files,
  options,
  {cwd = process.cwd()} = {},
) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options?.familyKey ?? '')) {
    throw new AstryxError(
      'Family key must be an exact lower-kebab filename stem (for example, ocean-family).',
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  try {
    sanitizeName(options.familyKey, {label: 'family key'});
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid family key.';
    throw new AstryxError(message, undefined, ERROR_CODES.ERR_THEME_INVALID);
  }
  await selectCore(cwd);
  const familyInterception = interceptCore(_coreThemeModule, _coreRootModule);
  // prettier-ignore
  const familyLoader = createJiti(import.meta.url, {moduleCache: true, interopDefault: false, jsx: true, extensions: THEME_MODULE_EXTENSIONS, virtualModules: familyInterception.modules});
  /** @type {any[]} */
  const prepared = [];
  for (const source of planFamilySources(files, cwd)) {
    if (!source.selected) {
      await preloadFamilySource(
        source.filePath,
        familyLoader,
        familyInterception,
      );
      continue;
    }
    const file = source.file;
    // prettier-ignore
    const member = await themeBuildInternal(file, {iconsSpecifier: options.iconsSpecifier, __prepareFamily: true, __familyLoader: familyLoader, __familyInterception: familyInterception, __onPrivateVarError: options.__onPrivateVarError}, {cwd});
    if (!member || member.type) {
      throw new AstryxError(
        `Theme family member "${file}" did not produce a complete build plan.`,
        undefined,
        ERROR_CODES.ERR_THEME_INVALID,
      );
    }
    prepared.push(member);
  }
  let members;
  try {
    members = resolveThemeFamily(prepared);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid selected theme family.';
    throw new AstryxError(message, undefined, ERROR_CODES.ERR_THEME_INVALID);
  }
  for (const member of members) {
    for (const [field, info] of [
      ['icons', member.iconInfo],
      ['indicators', member.indicatorInfo],
    ]) {
      // A theme with a function entry gets its own node view of `icons`, so
      // an inherit-only member is recognized by its entries.
      const value =
        field === 'icons'
          ? themeIconEntries(member.theme)
          : member.theme[field];
      const inherited =
        field === 'icons'
          ? themeIconEntries(member.sourceParent)
          : member.sourceParent?.[field];
      if (
        value &&
        Object.keys(value).length > 0 &&
        value !== inherited &&
        !info
      ) {
        throw new AstryxError(
          `Theme "${member.theme.name}" must supply ${field} through a named import for family output.`,
          undefined,
          ERROR_CODES.ERR_THEME_INVALID,
        );
      }
    }
  }
  const baseName = options.familyKey;
  if (members.some(member => member.theme.name === baseName)) {
    throw new AstryxError(
      `Family key "${baseName}" collides with a selected theme's standalone outputs. Choose a distinct filename stem.`,
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  const root = members[0];
  const outDir = path.dirname(root.filePath);
  const outPath = path.join(outDir, `${baseName}.css`);
  const cssDtsPath = `${outPath}.d.ts`;
  const jsPath = path.join(outDir, `${baseName}.js`);
  const dtsPath = path.join(outDir, `${baseName}.d.ts`);
  const sources = new Set(
    members.flatMap(member =>
      [path.resolve(member.filePath), fs.realpathSync(member.filePath)].map(
        value => value.toLowerCase(),
      ),
    ),
  );
  const collision = [outPath, cssDtsPath, jsPath, dtsPath].find(output => {
    const candidates = [path.resolve(output)];
    if (fs.existsSync(output)) candidates.push(fs.realpathSync(output));
    return candidates.some(value => sources.has(value.toLowerCase()));
  });
  if (collision) {
    throw new AstryxError(
      `Family output ${path.relative(cwd, collision)} collides with a selected source file.`,
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  const sourceRelative = members
    .map(member => member.sourceRelative)
    .join(', ');
  const buildCommand = `${getCliInvocation()} theme build --family ${members
    .map(member => member.sourceRelative)
    .join(' ')} --family-key ${baseName}`;
  const bindings = allocateFamilyBindings(members);
  const css = generateFamilyCSS(members);
  /** @type {Array<{specifier: string, exportName: string}>} */
  const registryImports = [];
  const js = members
    .map(member => {
      const themeBinding = bindings.get(member.theme.name);
      const parentBinding = member.parentName
        ? bindings.get(member.parentName)
        : null;
      // prettier-ignore
      const icon = familyRegistryInput(member.iconInfo, member.filePath, outDir, options.iconsSpecifier);
      // prettier-ignore
      const indicator = familyRegistryInput(member.indicatorInfo, member.filePath, outDir, undefined);
      // prettier-ignore
      for (const registry of [icon, indicator]) if (registry.info) registryImports.push({specifier: registry.specifier ?? registry.info.importPath, exportName: registry.info.exportName});
      const ownIcons = icon.info ? `${themeBinding}Icons` : null;
      // A parent with function entries keeps them in `__icons`; its `icons`
      // is the node view.
      const parent = members.find(
        other => other.theme.name === member.parentName,
      );
      const inheritedIcons = parentBinding
        ? `${parentBinding}.${hasFunctionIconEntry(themeIconEntries(parent?.theme)) ? '__icons' : 'icons'}`
        : null;
      const ownIndicators = indicator.info ? `${themeBinding}Indicators` : null;
      const inheritedIndicators = parentBinding
        ? `${parentBinding}.indicators`
        : null;
      /** @param {string | null} own @param {string | null} inherited */
      const expression = (own, inherited) =>
        own && inherited
          ? `{...${inherited}, ...${own}}`
          : (own ?? inherited ?? undefined);
      const indicatorImport = indicator.info
        ? `import { ${indicator.info.exportName} as ${ownIndicators} } from ${JSON.stringify(indicator.specifier ?? indicator.info.importPath)};\n`
        : '';
      // The member's own registry import, bound to its family-unique name; a
      // rebased or overridden specifier replaces the scraped one.
      // prettier-ignore
      const iconImports = icon.info && ownIcons ? {imports: [{importPath: icon.info.importPath, importedName: icon.info.exportName, localName: ownIcons}], expression: ownIcons, exportName: ownIcons, iconsSpecifierImportPath: icon.info.importPath, iconsSpecifierLocalName: ownIcons} : null;
      return (
        indicatorImport +
        generateBuiltModule(member.theme, iconImports, icon.specifier, {
          themeBinding,
          iconsExpression: expression(ownIcons, inheritedIcons),
          indicatorsExpression: expression(ownIndicators, inheritedIndicators),
          artifactBaseName: baseName,
          exportIcons: false,
        })
      );
    })
    .join('\n');
  await validateRegistryGraphs(registryImports, jsPath);
  const declarations = members
    .map((member, index) =>
      generateBuiltTypes(member.theme, member.iconInfo, null, {
        themeBinding: bindings.get(member.theme.name),
        includeIconExport: false,
        includeThemeImport: index === 0,
      }),
    )
    .join('');
  const augmentations = [
    ...new Set(members.map(member => member.variantDecl).filter(Boolean)),
  ].join('\n');
  const writes = [
    {
      dest: outPath,
      content:
        generatedHeader(sourceRelative, 'css', buildCommand, root.versions) +
        css,
    },
    {
      dest: cssDtsPath,
      allowMissingInCheck: true,
      content:
        generatedHeader(sourceRelative, 'ts', buildCommand, root.versions) +
        'export {};\n',
    },
    {
      dest: jsPath,
      content:
        generatedHeader(sourceRelative, 'js', buildCommand, root.versions) + js,
    },
    {
      dest: dtsPath,
      content:
        generatedHeader(sourceRelative, 'ts', buildCommand, root.versions) +
        declarations +
        (augmentations ? `\n${augmentations}` : ''),
    },
  ];
  const outputs = {
    css: path.relative(cwd, outPath),
    cssDts: path.relative(cwd, cssDtsPath),
    js: path.relative(cwd, jsPath),
    dts: path.relative(cwd, dtsPath),
  };
  // A family build's outputs stay inside cwd too; check mode only reads them.
  if (!options.check) confineOutputs(writes, cwd, FAMILY_REMEDY);
  if (options.check) {
    const stale = staleBuildOutputs(writes, cwd);
    const upToDate = stale.length === 0;
    if (upToDate) {
      logger.log(
        `\n[ok] Theme family outputs are up to date with ${sourceRelative}.`,
      );
    } else {
      logger.error(
        `\n[fail] ${stale.length} theme family output(s) are out of date:`,
      );
      for (const entry of stale) {
        logger.error(
          `  ${entry.reason === 'missing' ? 'missing' : 'stale'}: ${entry.path}`,
        );
      }
      // prettier-ignore
      const remedy = outsideCheckRemedy(writes, members.map(member => member.filePath), cwd, relative => ['--family', ...members.map(member => relative(member.filePath)), '--family-key', baseName, ...(options.iconsSpecifier ? ['--icons-specifier', options.iconsSpecifier] : [])]);
      if (remedy) logger.error(`\n  ${remedy.join('\n  ')}`);
      else logger.error(`\n  Rebuild with: ${buildCommand}`);
    }
    return {
      type: 'theme.build.check',
      data: {
        name: root.theme.name,
        upToDate,
        stale,
        checked: checkedBuildOutputs(writes, cwd),
      },
    };
  }
  writeBuildOutputs(writes);
  for (const output of Object.values(outputs)) logger.log(`[ok] ${output}`);
  const themeBindings = members.map(member => bindings.get(member.theme.name));
  const relOutDir = path.relative(cwd, outDir) || '.';
  const jsImport = importSpecifier(relOutDir, baseName);
  const cssImport = `${jsImport}.css`;
  logger.log(`
Load the family CSS once, then select any member by theme identity:
  import { ${themeBindings.join(', ')} } from '${jsImport}';
  import '${cssImport}';
Or load the same stylesheet natively:
  <link rel="stylesheet" href="${cssImport}" />
`);
  const warnings = [...new Set(members.flatMap(member => member.warnings))];
  const unloadedFonts = [
    ...new Set(members.flatMap(member => member.unloadedFonts)),
  ];
  const notices = unloadedFonts.map(
    family =>
      `Font "${family}" is named by this theme family but not loaded; add a <link> or @font-face in your app (recipe: astryx docs typography)`,
  );
  for (const notice of notices) logger.log(`  note: ${notice}`);
  return {
    type: 'theme.build',
    data: {
      name: root.theme.name,
      tokenCount: members.reduce((sum, member) => sum + member.tokenCount, 0),
      componentCount: members.reduce(
        (sum, member) => sum + member.componentCount,
        0,
      ),
      sizeKB: parseFloat((Buffer.byteLength(css) / 1024).toFixed(1)),
      outputs,
      warnings,
      notices,
    },
  };
}
