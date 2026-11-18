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
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire, isBuiltin} from 'node:module';
import {moduleImports} from '../../../foundation/render/embedded-imports.mjs';
import {projectMapsImport} from '../../../foundation/render/ts-paths.mjs';
import {STYLESHEET_FILE} from '../../../foundation/fs/stylesheet-file.mjs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {babelParse as parse} from '../../../foundation/runtime/lazy-dependencies.mjs';
import {jitiCacheOptions} from '../../../foundation/fs/jiti-cache.mjs';
import {
  formatCliCommand,
  getCliInvocation,
  quoteCommandArgument,
} from '../../../foundation/env/package-manager.mjs';
import {
  CLI_ROOT,
  findCoreDir,
  findInstalledPackage,
  findProjectCoreDir,
  findPackageRoot,
} from '../../../foundation/fs/paths.mjs';
import {isGlobalCopy} from '../../../foundation/release/choose.mjs';
import {isInReleaseCache} from '../../../foundation/release/cache.mjs';
import {fetchCarriedThemeCoreDir, localModuleFiles} from '../_adapter.mjs';
import {
  assertWithin,
  sanitizeName,
  PathSafetyError,
} from '../../../foundation/fs/path-safety.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {editorThemeRecord} from '../../../foundation/config/theme-state.mjs';
import {validatePrivateVars} from '../../../foundation/config/theme-private-vars.mjs';
import {AstryxError} from '../../error.mjs';
import {applyWrites} from '../../integration/add-helpers.mjs';
import {logger} from '../../logger.mjs';
import {
  coreThemeTargets,
  coreThemeValues,
  keepCoreThemeFacts,
} from '../../../foundation/discovery/core-theme-facts.mjs';
import {THEME_SOURCE_EXTENSIONS} from '../../../foundation/discovery/theme-module-extensions.mjs';
import {
  createJiti,
  withEmptyStylesheets,
} from '../../../foundation/fs/module-loader.mjs';
import {targetsByKey} from '../../../foundation/discovery/theming-targets.mjs';
import {
  collectUnloadedFonts,
  formatBatchFontLoadingHelp,
  formatFontLoadingHelp,
} from './font-warning.mjs';
import {interceptCore} from './core-interception.mjs';
import {irregularFileKind} from '../../../foundation/fs/regular-file.mjs';
import {
  keyPathIndex,
  keyPathLine,
  keyValueLine,
  nullThemeValues,
} from './null-values.mjs';
import {typographyInputProblems} from './typography-values.mjs';
import {radiusInputProblems} from './radius-values.mjs';
import {sourcePlugins} from './source-syntax.mjs';
import {
  INPUT_DECLARATION_FILES,
  inputFieldsFrom,
  sourceFieldProblems,
  inputFieldProblems,
  sourceInputField,
  sourceTypography,
} from './input-fields.mjs';
import {styleKeyProblems} from './style-keys.mjs';
import {
  bigIntAsText,
  writtenPrimitives,
  writtenValueProblems,
} from './written-values.mjs';
import {
  settingEffectIssues,
  settingIssueEntries,
  blockPaths,
  declarationPaths,
  settingIssueLocation,
} from './setting-effects.mjs';
import {levenshteinDistance} from '../../../foundation/text/levenshtein.mjs';
import {
  installCommandFor,
  installStepFor,
  parsedSpecifiers,
} from '../../../foundation/discovery/template-needs.mjs';
import {generateFamilyCSS, resolveThemeFamily} from './family.mjs';
import {resolveIconImports} from './icon-imports.mjs';
import {selfContainedImports} from './self-contained.mjs';
import {THEME_BUILD_MARKER} from '../../../foundation/config/theme-build-header.mjs';
import {generatedMark} from '../../theme-edit/_marks.mjs';

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
 * The `@astryxdesign/core` ROOT namespace, loaded separately because it
 * exports far more than the theme subpath. Interception must hand a theme file
 * that imports a component from the root the root's own exports, not the theme
 * namespace wearing its name. It loads on first use: see lazyRootModule.
 * @type {(() => any) | null}
 */
let _coreRootModule = null;
/** @type {any} */ let _coreImportError = null;
/** @type {string | null} */ let _coreThemeFile = null;

/**
 * The bindings one Core provides: the namespaces interception spreads, the
 * functions the build calls, and why the import failed, if it did.
 * @typedef {{
 *   themeModule: any,
 *   rootModule: (() => any) | null,
 *   importError: any,
 *   defineTheme: any,
 *   generateThemeRulesSplit: any,
 *   generateOnMediaCSS: any,
 *   generateAdaptationCSS: any,
 *   themeFile?: string | null,
 * }} CoreBindings
 */

/**
 * A Core's root namespace, loaded on first use. The root entry loads all of
 * Core and React, and only a theme that imports the root specifier needs it.
 * Requiring the file an import resolves to returns the namespace `import()`
 * gives. A root that cannot be loaded gives null, and interception then hands
 * the theme namespace in its place. A root that only `import()` can load
 * throws instead: one that awaits at its top level, or any root when Node runs
 * without require(esm).
 * @param {() => string | null} resolveFile
 * @returns {() => any}
 */
export function lazyRootModule(resolveFile) {
  /** @type {{namespace: any} | null} */
  let loaded = null;
  return () => {
    if (loaded) return loaded.namespace;
    let namespace = null;
    let file = null;
    try {
      file = resolveFile();
    } catch {
      // A Core whose root entry does not resolve falls back below.
    }
    try {
      if (file) namespace = createRequire(import.meta.url)(file);
    } catch (error) {
      const code = /** @type {any} */ (error)?.code;
      // The theme namespace would stand in for the root's own exports here.
      if (code === 'ERR_REQUIRE_ASYNC_MODULE' || code === 'ERR_REQUIRE_ESM') {
        throw new Error(
          `The @astryxdesign/core root entry at ${file} cannot be loaded with require() (${code}), so a theme that imports it cannot be built.`,
          {cause: error},
        );
      }
      // A Core without a usable root entry still builds themes.
    }
    loaded = {namespace};
    return namespace;
  };
}

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
    core.themeFile = cliCoreThemeFile();
    core.rootModule = lazyRootModule(() =>
      fileURLToPath(import.meta.resolve('@astryxdesign/core')),
    );
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
  _coreThemeFile = core.themeFile ?? null;
}

/**
 * The tokens the chosen Core sets on each media surface by itself: the
 * surfaces of a theme that sets none.
 * @returns {{onDark?: Record<string, unknown>, onLight?: Record<string, unknown>}}
 */
function coreSurfaceTokens() {
  try {
    const bare = _defineTheme?.({name: 'astryx-defaults'});
    return {onDark: bare?.__onDark?.tokens, onLight: bare?.__onLight?.tokens};
  } catch {
    return {};
  }
}

/** @type {Map<string, import('./input-fields.mjs').InputFields | null>} */
const _inputFields = new Map();
/**
 * The fields the chosen Core's theme input takes, from its type
 * declarations; null when they cannot be read.
 * @returns {import('./input-fields.mjs').InputFields | null}
 */
function coreInputFields() {
  if (!_coreThemeFile) return null;
  if (!_inputFields.has(_coreThemeFile))
    _inputFields.set(
      _coreThemeFile,
      inputFieldsFrom(
        INPUT_DECLARATION_FILES.map(file => {
          try {
            return fs.readFileSync(
              path.join(
                path.dirname(/** @type {string} */ (_coreThemeFile)),
                file,
              ),
              'utf8',
            );
          } catch {
            return null;
          }
        }),
      ),
    );
  return _inputFields.get(_coreThemeFile) ?? null;
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
    // The native form spells a path as the disk does (its own case on a
    // case-insensitive disk), so two spellings of one file compare equal.
    return fs.realpathSync.native(file);
  } catch {
    return file;
  }
}

/**
 * `target` spelled through real directories: the deepest ancestor that exists
 * is resolved through its symlinks, and the missing rest is appended as given.
 * The build groups and locates its outputs by it, and the theme editor's
 * compile guard reads paths through it too, so both read a path the same way.
 * @param {string} target absolute path
 * @returns {string}
 */
export function realLocation(target) {
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
  const rootFile = importTarget(dir, '.');
  return {
    themeModule,
    rootModule: lazyRootModule(() => rootFile),
    importError: null,
    defineTheme: themeModule.defineTheme,
    generateThemeRulesSplit: themeModule.generateThemeRulesSplit,
    generateOnMediaCSS: themeModule.generateOnMediaCSS,
    generateAdaptationCSS: themeModule.generateAdaptationCSS,
    themeFile,
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
 * The step that installs Core in the project at `cwd`, as message text.
 * @param {string} cwd
 */
function coreInstallText(cwd) {
  const {line, note} = installStepFor(['@astryxdesign/core'], cwd);
  return note ? `\`${line}\` (${note})` : `\`${line}\``;
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
    `it: ${coreInstallText(cwd)}.${detail}`
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
 * The command a stale check names, in the words of the group that ran it
 * (`experimental theme compile`); the generated headers keep `theme build`.
 * @param {string} command
 * @param {{group: string, build: string}} [words]
 */
function rebuildLine(command, words) {
  if (!words || words.group === 'theme') return command;
  return command.replace(/\btheme build\b/, `${words.group} ${words.build}`);
}

/**
 * The folder a build header names paths from: the project root (nearest
 * package.json) of the outputs' folder, or `cwd` outside any project.
 * @param {string} outDir
 * @param {string} cwd
 */
function headerRoot(outDir, cwd) {
  return findPackageRoot(outDir) ?? path.resolve(cwd);
}

/**
 * Whether a file is an output of some released `theme build`: its header has
 * the build's mark, or, with `legacy`, a mark or shape of the CLI before it
 * was named Astryx: its header's mark, or for its releases that wrote no
 * header, the shape they wrote: a stylesheet in the `xds.theme`,
 * `xds-theme` or `reset` layer scoped to `[data-xds-theme=…]`, a module
 * that says it was built by `xds theme build` (`xds build-theme` at first),
 * declarations of a built theme with their import, or variant declarations
 * that open with `// Generated by xds theme build`.
 * @param {string} file
 * @param {{legacy?: boolean}} [options]
 */
function isBuildOutput(file, {legacy = false} = {}) {
  const head = fileHead(file);
  if (head.includes(GENERATED_MARKER)) return true;
  if (!legacy) return false;
  if (head.includes(LEGACY_BUILD_MARKER)) return true;
  const text = head.trimStart();
  if (/\.css$/i.test(file))
    return (
      /^@layer (?:xds\.theme|xds-theme|reset) \{/.test(text) &&
      text.includes('[data-xds-theme=')
    );
  if (/\.d\.ts$/i.test(file)) {
    // A theme's variant declarations (`<theme>.variants.d.ts`) opened with
    // this line in those releases.
    if (text.startsWith('// Generated by xds theme build')) return true;
    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    return (
      lines.includes(
        "import type { XDSDefinedTheme } from '@xds/core/theme';",
      ) &&
      lines.every(line =>
        /^(?:import type \{[^}]*\} from '@xds\/core[^']*';|export declare const [A-Za-z_$][\w$]*: [A-Za-z_$][\w$]*;)$/.test(
          line,
        ),
      )
    );
  }
  if (/\.js$/i.test(file))
    return /theme — built by `[^`]*xds (?:theme build|build-theme)`/.test(head);
  return false;
}

/** The mark headers of the CLI carried before it was named Astryx. */
const LEGACY_BUILD_MARKER = '@generated by `xds theme build`';

/**
 * Whether a build refuses to replace, at a path `--out` names, the output of
 * another theme source that still exists. False makes it warn and replace.
 */
const OUT_REFUSES_OTHER_SOURCE = false;

/**
 * Where a source name in a build header may point. A header names its source
 * from the outputs' project root; older CLIs named it from the folder the
 * build ran in, which is the output's folder or one above it, up to a
 * monorepo root above the project. The project root comes first, then the
 * output's folder and each folder above it.
 * @param {string} outputFile absolute file the header is in
 * @param {string} name the name the header gives
 * @param {string} cwd
 * @returns {string[]} absolute candidates, without repeats
 */
function headerSourceCandidates(outputFile, name, cwd) {
  const outDir = path.dirname(path.resolve(outputFile));
  const candidates = [path.resolve(headerRoot(outDir, cwd), name)];
  for (let dir = outDir; ; dir = path.dirname(dir)) {
    candidates.push(path.resolve(dir, name));
    if (path.dirname(dir) === dir) break;
  }
  return [...new Set(candidates)];
}

/**
 * The file a build header's source name points at: the first candidate that
 * exists, or the one from the project root when none does.
 * @param {string} outputFile
 * @param {string} name
 * @param {string} cwd
 */
function headerSourceFile(outputFile, name, cwd) {
  const candidates = headerSourceCandidates(outputFile, name, cwd);
  return (
    candidates.find(file => {
      try {
        return fs.statSync(file).isFile();
      } catch {
        return false;
      }
    }) ?? candidates[0]
  );
}

/**
 * A path as a build header names it: relative to `base`, with `/`.
 * @param {string} base
 * @param {string} file absolute
 */
function headerPath(base, file) {
  return path.relative(base, file).split(path.sep).join('/');
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
 * for a given toolchain, so they compare verbatim like real content. CRLF
 * line endings read as LF.
 * @param {string} content
 * @returns {string}
 */
export function normalizeThemeBuildForCompare(content) {
  // A checkout may turn line endings into CRLF; the text is the same.
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(line => {
      const t = line.replace(/^\s*\*?\s?/, '');
      return !t.startsWith('Command:');
    })
    .join('\n');
}

/**
 * The outputs that are missing or differ from what the build would write. A
 * missing `.css.d.ts` stylesheet type stub (a write marked `warnWhenMissing`)
 * is not stale: projects that ignore it in version control run the check in
 * CI, so the check warns about it instead (missingDeclarations). Every other
 * missing output, the module's `.d.ts` too, is stale.
 * @param {Array<{dest: string, content: string, warnWhenMissing?: boolean}>} writes @param {string} cwd @returns {Array<{path: string, reason: 'missing' | 'outdated'}>}
 */
function staleBuildOutputs(writes, cwd) {
  /** @type {Array<{path: string, reason: 'missing' | 'outdated'}>} */
  const stale = [];
  for (const write of writes) {
    const rel = path.relative(cwd, write.dest);
    if (!fs.existsSync(write.dest)) {
      if (!write.warnWhenMissing) stale.push({path: rel, reason: 'missing'});
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

/**
 * Every output the build writes, from the same write list the build and the
 * stale comparison use. A missing output makes the check stale, except the
 * `.css.d.ts` stub, which it warns about (missingDeclarations).
 * @param {Array<{dest: string}>} writes @param {string} cwd
 */
function checkedBuildOutputs(writes, cwd) {
  return writes.map(write => path.relative(cwd, write.dest));
}

/**
 * The `.css.d.ts` stylesheet type stubs the build writes that are missing,
 * which the check names as checked and warns about in text mode without
 * failing.
 * @param {Array<{dest: string, warnWhenMissing?: boolean}>} writes @param {string} cwd
 * @returns {string[]}
 */
function missingDeclarations(writes, cwd) {
  return writes
    .filter(write => write.warnWhenMissing && !fs.existsSync(write.dest))
    .map(write => path.relative(cwd, write.dest));
}

/**
 * The one text-mode warning line for missing stylesheet type stubs, or
 * nothing when none is missing. The logger is silent under --json.
 * @param {Array<{dest: string, warnWhenMissing?: boolean}>} writes @param {string} cwd
 */
function warnMissingDeclarations(writes, cwd) {
  const missing = missingDeclarations(writes, cwd);
  if (missing.length === 0) return;
  logger.warn(
    `  Warning: stylesheet type declaration file${missing.length === 1 ? '' : 's'} not found: ${missing.join(', ')}. The check does not fail on ${missing.length === 1 ? 'it' : 'them'}; a build writes ${missing.length === 1 ? 'it' : 'them'}.`,
  );
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
 * INV10). assertWithin reads the absolute path, so a path that reaches the
 * working directory through a symlink is inside it, and a symlink inside it
 * that leads elsewhere is not.
 * @param {string} dest absolute output path
 * @param {string} root the directory writes stay inside: the working directory
 * @param {string} remedy what to do instead; ends the error message
 * @param {string} [shown] the path as the caller wrote it, for the message
 */
function confineOutput(dest, root, remedy, shown = dest) {
  try {
    assertWithin(dest, root, {
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
export function refusedOutput(dest, root) {
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

/** The first words of every file a build writes. */
export const GENERATED_MARKER = THEME_BUILD_MARKER;

/** Marks the refusal of a theme that sets a private var. */
const PRIVATE_VAR_REFUSAL = Symbol('astryx.theme.privateVarRefusal');

/**
 * Whether `error` is a build's refusal of a theme that sets a private var
 * (which `doctor` reports in its own check, not as a stale output).
 * CLI-internal.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isPrivateVarRefusal(error) {
  return Boolean(
    error && /** @type {any} */ (error)[PRIVATE_VAR_REFUSAL] === true,
  );
}

/** @param {string} file @returns {boolean} */
function isDirectorySync(file) {
  try {
    return fs.statSync(file).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The marks a file's leading comment carries (see `generatedMark`): a theme
 * build's output, or a file the theme editor writes, with the command it
 * names. The one reader build and doctor share.
 * @param {string} source the start of the file
 * @param {string} [file] its path, for a mark that names no exact command
 */
export function fileMark(source, file) {
  return generatedMark(source, GENERATED_MARKER, file);
}

/**
 * The command a file's leading comment says writes it, when another CLI
 * command generates it (the theme editor's settings module or app copy):
 * the exact command its mark names. Null for a theme build's own output and
 * a file without a mark, such as a theme source of one's own.
 * @param {string} file
 * @returns {string | null}
 */
export function generatedFileCommand(file) {
  const mark = fileMark(fileHead(file), file);
  return mark?.kind === 'editor' ? mark.command : null;
}

/**
 * The command that writes a missing `file`: a file beside it carries
 * another command's mark, and a file there names `file` (a build output's
 * header names its source), so it is one that command writes. Null for any
 * other name, such as a typo.
 * @param {string} file
 * @returns {string | null}
 */
function missingGeneratedCommand(file) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  let names;
  try {
    names = fs.readdirSync(dir).sort();
  } catch {
    return null;
  }
  /** @type {string | null} */
  let by = null;
  let named = false;
  for (const n of names) {
    const f = path.join(dir, n);
    try {
      if (!fs.statSync(f).isFile()) continue;
    } catch {
      continue;
    }
    by ??= generatedFileCommand(f);
    if (!named)
      try {
        named = fs.readFileSync(f, 'utf8').slice(0, 4000).includes(base);
      } catch {
        // A file that does not read names nothing.
      }
    if (by && named) return by;
  }
  return null;
}

/**
 * The command that writes `file`: from its own mark, or, when it is
 * missing, from the files beside it (see `missingGeneratedCommand`); null
 * otherwise.
 * @param {string} file
 * @returns {string | null}
 */
export function generatedSourceCommand(file) {
  return fs.existsSync(file)
    ? generatedFileCommand(file)
    : missingGeneratedCommand(file);
}

/** @param {string} file @returns {string} the start of a file, or '' when it cannot be read (no regular file is opened) */
function fileHead(file) {
  if (irregularFileKind(file)) return '';
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const head = Buffer.alloc(600);
      const n = fs.readSync(fd, head, 0, head.length, 0);
      return head.subarray(0, n).toString('utf-8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

/** @param {string} file @returns {string} one key per real location, whatever the spelling */
function outputKey(file) {
  const resolved = realLocation(path.resolve(file));
  return process.platform === 'win32' || process.platform === 'darwin'
    ? resolved.toLowerCase()
    : resolved;
}

/**
 * Theme sources a folder holds, for a hint when a folder is passed.
 * @param {string} dir
 * @returns {string[]}
 */
function themeFilesIn(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter(
        name =>
          /(?:\.theme|Theme)\.[^.]+$/.test(name) &&
          THEME_SOURCE_EXTENSIONS.includes(path.extname(name)) &&
          !fileHead(path.join(dir, name)).includes(GENERATED_MARKER),
      )
      .sort()
      .slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * The files a theme source is made of: the source and every local file it
 * imports, directly or through other local files, read from their import
 * statements. A watch rebuilds when any of them changes. Package imports and
 * files that cannot be read are left out.
 * @param {string} filePath absolute theme source
 * @returns {string[]} absolute paths, the source first
 */
export function themeSourceFiles(filePath) {
  const seen = new Set([path.resolve(filePath)]);
  const queue = [path.resolve(filePath)];
  while (queue.length > 0 && seen.size < 500) {
    const file = /** @type {string} */ (queue.shift());
    let source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const spec of parsedSpecifiers(source)) {
      // Only relative and absolute imports are the theme's own files. A bare
      // specifier names a package, which a workspace link can resolve to a
      // real path outside node_modules.
      if (!spec.startsWith('.') && !path.isAbsolute(spec)) continue;
      // Resolved as the build resolves it.
      let target;
      try {
        target = path.resolve(resolveThemeModule(spec, file));
      } catch {
        continue;
      }
      if (
        target.split(path.sep).includes('node_modules') ||
        seen.has(target) ||
        !fs.existsSync(target)
      )
        continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return [...seen];
}

/**
 * Theme sources a missing build input probably meant, relative to `cwd`: the
 * same path with `/` for `\`; for a bare theme name, the theme sources in
 * `themes/<name>/` and `src/themes/<name>/` of the project; the input with a
 * theme source extension; and, for a path, a theme source in the same folder
 * whose name is one edit from the one given (`t.them.ts`, `T.theme.ts`). A
 * build output is never offered.
 * @param {string} file the input as given
 * @param {string} cwd
 * @returns {string[]} at most three paths
 */
export function themeSourceGuesses(file, cwd) {
  const shown = (/** @type {string} */ absolute) =>
    path.relative(cwd, absolute).split(path.sep).join('/');
  const isSource = (/** @type {string} */ absolute) =>
    fs.existsSync(absolute) &&
    !fs.statSync(absolute).isDirectory() &&
    !fileHead(absolute).includes(GENERATED_MARKER);
  if (file.includes('\\')) {
    const forward = path.resolve(cwd, file.replace(/\\/g, '/'));
    return isSource(forward) ? [shown(forward)] : [];
  }
  /** @type {string[]} */
  const guesses = [];
  if (!/[/.]/.test(file)) {
    const root = findPackageRoot(cwd) ?? cwd;
    for (const folder of [
      path.join(root, 'themes', file),
      path.join(root, 'src', 'themes', file),
    ])
      for (const name of themeFilesIn(folder))
        guesses.push(shown(path.join(folder, name)));
  }
  for (const extension of THEME_SOURCE_EXTENSIONS) {
    const candidate = path.resolve(cwd, file + extension);
    if (isSource(candidate)) guesses.push(shown(candidate));
  }
  if (/[/.]/.test(file)) {
    const given = path.resolve(cwd, file);
    // A folder typed in other letters (themes/T/ for themes/t/) is the
    // folder of that name there, when there is exactly one.
    let folder = path.dirname(given);
    if (!fs.existsSync(folder)) {
      const parent = path.dirname(folder);
      const want = path.basename(folder).toLowerCase();
      /** @type {string[]} */
      let names;
      try {
        names = fs
          .readdirSync(parent, {withFileTypes: true})
          .filter(d => d.isDirectory() && d.name.toLowerCase() === want)
          .map(d => d.name);
      } catch {
        names = [];
      }
      if (names.length === 1) folder = path.join(parent, names[0]);
    }
    const base = path.basename(given);
    // The name with its ending cut short or left off (`t`, `t.theme.`,
    // `t.theme`): the theme source whose name it starts.
    const stem = base.replace(/\.+$/, '').replace(/\.theme$/, '');
    for (const name of themeFilesIn(folder))
      if (
        levenshteinDistance(name, base, 1, {swaps: true}) <= 1 ||
        name.replace(/(\.theme)?\.[^.]+$/, '') === stem
      )
        guesses.push(shown(path.join(folder, name)));
  }
  return [...new Set(guesses)].slice(0, 3);
}

/**
 * Refuse a file that is not a theme source before loading it: an output of a
 * build (it carries the `@generated` header, whatever its extension, and
 * names the source it was built from), or a file whose extension no theme
 * source has, such as `.css` or `.json` (THEME_SOURCE_EXTENSIONS).
 * @param {string} filePath
 * @param {string} cwd
 * @param {BuildMode} [mode] the caller's --check and --out, kept in every
 *   build a refusal suggests
 */
function assertThemeSourceFile(filePath, cwd, mode = {}) {
  const rel = (/** @type {string} */ file) => path.relative(cwd, file);
  const sourceHead = fileHead(filePath);
  if (sourceHead.includes(GENERATED_MARKER)) {
    const line = /Source: (.+)/.exec(sourceHead)?.[1]?.trim();
    // The header names its sources from the outputs' project root; the
    // command to build them names them from the working folder.
    const sources = line
      ? line.split(', ').map(name =>
          rel(headerSourceFile(filePath, name.trim(), cwd))
            .split(path.sep)
            .join('/'),
        )
      : [];
    const familyKey = /Command: .*--family-key (\S+)/.exec(sourceHead)?.[1];
    const build =
      sources.length > 1 && familyKey
        ? buildSuggestion(sources, mode, cwd, undefined, {familyKey})
        : sources.length > 0
          ? buildSuggestion(sources[0], mode, cwd)
          : null;
    throw new AstryxError(
      `${rel(filePath)} is an output of \`theme build\`, not a theme source.${sources.length > 0 ? ` It was built from ${sources.join(', ')}.` : ''}`,
      build
        ? [
            {
              name: build,
              reason: 'build the theme source',
            },
          ]
        : undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  if (!THEME_SOURCE_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) {
    throw new AstryxError(
      `${rel(filePath)} is not a theme module. A theme source is a ${THEME_SOURCE_EXTENSIONS.join(', ')} file that exports defineTheme(...).`,
      themeFilesIn(path.dirname(filePath)).map(name => ({
        name: buildSuggestion(
          rel(path.join(path.dirname(filePath), name))
            .split(path.sep)
            .join('/'),
          mode,
          cwd,
        ),
        reason: 'a theme source in that folder',
      })),
      ERROR_CODES.ERR_THEME_LOAD,
    );
  }
}

/**
 * What the CLI hands a build beyond themeBuild's options. CLI-internal, never
 * a themeBuild option: `claimedOutputs` records the outputs earlier builds in
 * one run wrote, so a later theme cannot replace them; with `deferredWrites`
 * the build adds its outputs to that list instead of writing them, for
 * writeDeferredBuildOutputs; `writeRoot` replaces `cwd` as the directory every
 * output must stay inside, for a scratch build; `commandWords` names the
 * command in the rebuild hint; `prepareFamily`, `familyLoader`, and
 * `familyInterception` make the build a family member's plan.
 * `colorModes` is the one color mode a calling command knows the theme has
 * (the theme editor, from its settings), written into the built module.
 * `ownsOutputs` says the caller made the folder the outputs go into and owns
 * every file there named like one (the theme editor's theme folder), so a
 * damaged or half-written output is replaced, never refused.
 * @typedef {{ownsOutputs?: boolean, prepareFamily?: boolean, familyLoader?: any, familyInterception?: any, writeRoot?: string, claimedOutputs?: Map<string, string>, deferredWrites?: Array<Array<{dest: string, content: string}>>, commandWords?: {group: string, build: string}, colorModes?: ['light'] | ['dark'] | null, fontHelp?: FontHelp | null, loadedFonts?: ((family: string) => boolean) | null, install?: string | null}} ThemeBuildHandOff
 */

/**
 * How a caller that loads a theme's fonts itself (the editor's app copy)
 * says to load a family: the notice per family and the recipe in place of
 * the generic one.
 * @typedef {{notice: (family: string) => string, recipe: (families: string[]) => string}} FontHelp
 */

/**
 * Who takes the theme editor warnings (an editor folder, an editor-made
 * theme) instead of the logger: the watcher's child build hands each to its
 * parent, which prints it once per session. Set
 * only by the CLI (not part of the public API), and never by an option of
 * themeBuild.
 * @type {((warning: string) => void) | null}
 */
let editorFolderListener = null;

/**
 * Hand the theme editor warnings of the builds in this process to
 * `listener` instead of the logger. CLI-internal: the watch child's
 * hand-off to its parent.
 * @param {((warning: string) => void) | null} listener
 */
export function setEditorFolderListener(listener) {
  editorFolderListener = listener;
}

/**
 * A build's mode flags: what it does (`--check` compares, never writes) and
 * where (`--out`), carried into every build command a refusal suggests.
 * @typedef {{check?: boolean, out?: string, iconsSpecifier?: string}} BuildMode
 */

/**
 * How a suggested build writes its source: `glob` leaves a pattern as typed
 * (unquoted, so the shell expands it); `family` makes it a --family run,
 * and `familyKey` names its key (a family run never takes --out).
 * @typedef {{glob?: boolean, family?: boolean, familyKey?: string}} SuggestionShape
 */

/**
 * The refusal a build gives the file it is given before it reads it, or
 * null: a file that is not there, and a folder. The build throws it, and a
 * suggested build is checked by it before it is offered.
 * @param {string} file as typed, from cwd
 * @param {BuildMode} options
 * @param {string} cwd
 * @returns {AstryxError | null}
 */
export function buildInputProblem(file, options, cwd) {
  const filePath = path.resolve(cwd, file);
  if (!fs.existsSync(filePath))
    return new AstryxError(
      `File not found: ${filePath}`,
      themeSourceGuesses(file, cwd).map(guess => ({
        name: buildSuggestion(guess, options, cwd),
        reason: 'a theme source that exists',
      })),
      ERROR_CODES.ERR_FILE_NOT_FOUND,
    );
  if (fs.statSync(filePath).isDirectory())
    return new AstryxError(
      `${path.relative(cwd, filePath) || '.'} is a folder. Pass the theme file inside it.`,
      themeFilesIn(filePath).map(name => ({
        name: buildSuggestion(
          path
            .relative(cwd, path.join(filePath, name))
            .split(path.sep)
            .join('/'),
          options,
          cwd,
        ),
        reason: 'a theme source in that folder',
      })),
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  return null;
}

/**
 * The `theme build` command for `source` with the caller's mode flags, so a
 * suggestion never turns a check into a write or moves the outputs.
 * @param {string | string[]} source as the user types it, from cwd; several
 *   for a family (with `shape.familyKey`)
 * @param {BuildMode} mode
 * @param {string} cwd
 * @param {{group: string, build: string}} [words] the command's own words
 *   (`experimental theme compile`), else `theme build`
 * @param {SuggestionShape} [shape]
 * @returns {string}
 */
export function buildSuggestion(source, mode, cwd, words, shape = {}) {
  /** @param {string[]} ws quoted for the shell the command runs in (PowerShell too) */
  const quoted = ws => ws.map(w => quoteCommandArgument(w));
  // A glob stays as typed: the shell expands it.
  const src = (Array.isArray(source) ? source : [source])
    .map(one =>
      shape.glob ? one.replace(/['"]/g, '') : quoteCommandArgument(one),
    )
    .join(' ');
  return formatCliCommand(
    [
      ...quoted([
        ...(words ? words.group.split(' ') : ['theme']),
        words?.build ?? 'build',
      ]),
      ...(shape.family || shape.familyKey ? ['--family'] : []),
      src,
      ...quoted([
        ...(shape.familyKey ? ['--family-key', shape.familyKey] : []),
        // A family run refuses --out.
        ...(mode.out && !shape.family && !shape.familyKey
          ? ['--out', mode.out]
          : []),
        ...(mode.iconsSpecifier
          ? ['--icons-specifier', mode.iconsSpecifier]
          : []),
        ...(mode.check ? ['--check'] : []),
      ]),
    ].join(' '),
    cwd,
  );
}

/**
 * Refuse a build that would replace a file it does not own. A build never
 * writes over its input, two of its own outputs at one path, or an output
 * another theme in the same run already wrote. With `refuseUnmarked` (every
 * build but one whose caller owns the output folder), it also replaces only
 * outputs of a release of the build (isBuildOutput) and empty files, never
 * another file such as the user's own stylesheet, `package.json` or app
 * source.
 * @param {Array<{dest: string}>} writes
 * @param {string} filePath the theme source
 * @param {string} cwd
 * @param {{claimed?: Map<string, string>, rerun?: (out: string | null) => string, refuseUnmarked?: boolean, warnUnmarked?: boolean, acceptLegacy?: boolean, elsewhere?: string, onEditorFolder?: (warning: string) => void, onWarning?: (message: string) => void}} [options]
 *   `claimed`: outputs written earlier in this run, by the source that wrote
 *   them; `rerun`: this build's command with another --out, or without one;
 *   `acceptLegacy`: an output of the CLI before it was named Astryx counts
 *   as the build's own (the default paths, where the build always replaced
 *   them); `warnUnmarked` (with `refuseUnmarked`): a header-less file is replaced
 *   with a warning naming it, as a family build has always replaced one;
 *   `elsewhere`: the option that moves the outputs; `onEditorFolder`: takes
 *   the editor-folder warning instead of the logger (a watcher prints it
 *   once); `onWarning`: each warning's message too, for the result
 */
function assertOutputsReplaceable(
  writes,
  filePath,
  cwd,
  {
    claimed,
    rerun,
    refuseUnmarked = false,
    warnUnmarked = false,
    acceptLegacy = false,
    elsewhere = '--out',
    onEditorFolder,
    onWarning,
  } = {},
) {
  const rel = (/** @type {string} */ file) => path.relative(cwd, file);
  const sourceKey = outputKey(filePath);
  const seen = new Set();
  /** @type {string | false} */
  let warnedOtherSource = false;
  /** Header-less files replaced with a warning (`warnUnmarked`). @type {string[]} */
  const unmarkedReplaced = [];
  // The same build without --out, with its other options.
  const beside = {
    name: rerun ? rerun(null) : buildSuggestion(rel(filePath), {}, cwd),
    reason: 'write the outputs beside this source',
  };
  // A folder the theme editor made holds that theme's outputs only: another
  // source's outputs there would sit beside its settings as if they were
  // its own. A source inside the folder builds there as always; one outside
  // it writes there too, with a warning.
  let editorFolder = false;
  if (refuseUnmarked && writes.length) {
    const dir = path.resolve(path.dirname(writes[0].dest));
    const record = editorThemeRecord(dir);
    const fromDir = path.relative(dir, path.resolve(filePath));
    // On Windows a source on another drive has an absolute relative path.
    const inside = !fromDir.startsWith('..') && !path.isAbsolute(fromDir);
    if (record && !inside) editorFolder = true;
  }
  for (const write of writes) {
    const key = outputKey(write.dest);
    // A compiled local module is its own source's output: judged against
    // that source.
    const owner = /** @type {{source?: string}} */ (write).source ?? filePath;
    if (key === sourceKey) {
      throw new AstryxError(
        `The output ${rel(write.dest)} is the theme source itself. Pick another --out.`,
        [
          {
            // The same build without --out (its --icons-specifier kept).
            name: beside.name,
            reason: 'write the outputs beside the source',
          },
        ],
        ERROR_CODES.ERR_THEME_INVALID,
      );
    }
    if (seen.has(key)) {
      throw new AstryxError(
        `Two outputs of this build have the same path, ${rel(write.dest)}. --out must name the .css file, not the theme's .js or .d.ts.`,
        undefined,
        ERROR_CODES.ERR_THEME_INVALID,
      );
    }
    seen.add(key);
    const earlier = claimed?.get(key);
    if (earlier !== undefined) {
      const collision = new AstryxError(
        `${earlier} and ${rel(filePath)} both build ${rel(write.dest)}. Give each theme its own name; nothing was written.`,
        undefined,
        ERROR_CODES.ERR_THEME_INVALID,
      );
      /** @type {any} */ (collision).outputCollision = true;
      throw collision;
    }
    let stat;
    try {
      stat = fs.statSync(write.dest);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      throw new AstryxError(
        `The output ${rel(write.dest)} is a folder. Move the folder, or pick another ${elsewhere}.`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    const otherSource = refuseUnmarked
      ? builtFromOtherSource(write.dest, owner, cwd)
      : null;
    if (otherSource && !OUT_REFUSES_OTHER_SOURCE) {
      // One warning per build: every output of that source goes together.
      // It is printed after every output passes, so it names a replacement
      // that happens.
      if (warnedOtherSource) continue;
      warnedOtherSource = `${rel(write.dest)} was built from ${otherSource}; this build of ${rel(filePath)} replaces it.`;
    } else if (otherSource) {
      throw new AstryxError(
        `${rel(write.dest)} is the build output of another theme source, ${otherSource}, so this build does not replace it. Pick another ${elsewhere}.`,
        [beside],
        ERROR_CODES.ERR_FILE_EXISTS,
      );
    }
    // A file no release of the build wrote is the user's or another
    // tool's: only the user can say it may go.
    // A family build keeps its released rule: a file without the current
    // mark is replaced with a warning naming it.
    const ours = isBuildOutput(write.dest, {legacy: acceptLegacy});
    if (refuseUnmarked && stat.size > 0 && !ours) {
      if (warnUnmarked) {
        unmarkedReplaced.push(rel(write.dest));
        continue;
      }
      // A path that takes every output, where nothing is replaced; never
      // the same paths again.
      const free = freeOutPath(writes);
      throw new AstryxError(
        `${rel(write.dest)} is a file this build did not write (it has no build header: your own file or another tool's), so the build does not replace it. Build to another place with ${elsewhere}, or move or rename ${rel(write.dest)} and build again.`,
        free && rerun
          ? [
              {
                name: rerun(rel(free)),
                reason: 'a path where no output of this build exists yet',
              },
            ]
          : [],
        ERROR_CODES.ERR_FILE_EXISTS,
      );
    }
  }
  // Warned only once nothing refuses the build, so it names a write that
  // happens.
  if (warnedOtherSource) {
    logger.warn(`Warning: ${warnedOtherSource}`);
    onWarning?.(warnedOtherSource);
  }
  if (unmarkedReplaced.length) {
    const message = `${unmarkedReplaced.join(', ')} ${unmarkedReplaced.length > 1 ? 'have' : 'has'} no build header (an output of an earlier build, or a file of your own or another tool's), and this build of ${rel(filePath)} replaces ${unmarkedReplaced.length > 1 ? 'them' : 'it'}; to keep a file of your own there, build with another ${elsewhere}.`;
    logger.warn(`Warning: ${message}`);
    onWarning?.(message);
  }
  if (editorFolder) {
    const dir = path.dirname(writes[0].dest);
    const message = `${rel(dir) || '.'} is a folder the theme editor made, and ${rel(filePath)} is outside it; the build writes there anyway. Build beside the source, or pick another ${elsewhere}, to keep the editor's folder to its own theme.`;
    if (onEditorFolder) onEditorFolder(`Warning: ${message}`);
    else logger.warn(`Warning: ${message}`);
    onWarning?.(message);
  }
}

/**
 * An --out path where no output of this build exists yet, or null. The
 * stylesheet and its `.css.d.ts` follow the name --out gives; the module and
 * its types are named after the theme, so a new name beside them (`brand-2.css`)
 * helps only when those are free, else a new folder (`brand-2/brand.css`).
 * @param {Array<{dest: string}>} writes the stylesheet first
 * @returns {string | null}
 */
function freeOutPath(writes) {
  const css = writes[0]?.dest;
  if (!css) return null;
  const dir = path.dirname(css);
  const stem = path.basename(css).replace(/\.css$/i, '');
  /** Whether a write set (each output moved by `move`) touches any file. */
  const blocked = (/** @type {(dest: string) => string} */ move) =>
    writes.some(w => fs.existsSync(move(w.dest)));
  for (let n = 2; n < 100; n += 1) {
    const next = `${stem}-${n}`;
    // Only the stylesheet and its types follow --out's name.
    // The exact names a build with `--out <next>.css` writes, also when
    // --out did not end in .css (`o.txt` suggests `o.txt-2.css`).
    const renamed = (/** @type {string} */ dest) =>
      dest === css
        ? path.join(dir, `${next}.css`)
        : dest === `${css}.d.ts`
          ? path.join(dir, `${next}.css.d.ts`)
          : dest;
    if (!blocked(renamed)) return path.join(dir, `${next}.css`);
    const folder = (/** @type {string} */ dest) =>
      path.join(dir, next, path.basename(dest));
    if (!fs.existsSync(path.join(dir, next)) && !blocked(folder))
      return path.join(dir, next, path.basename(css));
  }
  return null;
}

/**
 * The other theme source a build output names in its `Source:` header, when
 * that source still exists and is not `source`. The name is resolved as
 * headerSourceCandidates says; a match is exact. A family output names
 * every member, and is this source's when any of them is. Null when the output is this source's,
 * names no source, or names one that is gone (an orphan a build may replace).
 * @param {string} dest
 * @param {string} source absolute theme source
 * @param {string} cwd
 * @returns {string | null}
 */
function builtFromOtherSource(dest, source, cwd) {
  const head = fileHead(dest);
  if (!head.includes(GENERATED_MARKER)) return null;
  const line = /Source: (.+)/.exec(head)?.[1]?.trim();
  if (!line) return null;
  const names = line.split(', ').map(name => name.trim());
  const own = path.resolve(source);
  const candidates = names.flatMap(name =>
    headerSourceCandidates(dest, name, cwd),
  );
  if (candidates.includes(own)) return null;
  const existing = candidates.find(file => {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  });
  return existing ? path.relative(cwd, existing) || existing : null;
}

/**
 * Publish the outputs a batch deferred, one theme at a time, in build order.
 * @param {Array<Array<{dest: string, content: string}>>} deferred
 */
export function writeDeferredBuildOutputs(deferred) {
  for (const writes of deferred.splice(0)) writeBuildOutputs(writes);
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
    const e = /** @type {NodeJS.ErrnoException} */ (error);
    // A place the outputs cannot be written: name it and its fix (the
    // writes go through temporary files beside each output, whose names
    // help nobody).
    if (e.code === 'EACCES' || e.code === 'EPERM' || e.code === 'EROFS') {
      const failed = e.path ? path.resolve(e.path) : null;
      const output = writes.find(w => path.resolve(w.dest) === failed);
      const place = output
        ? output.dest
        : failed
          ? path.dirname(failed)
          : path.dirname(writes[0].dest);
      const shownPlace = path.relative(process.cwd(), place) || place;
      throw new AstryxError(
        `Could not write the theme's outputs: ${shownPlace} is not writable (${e.code}). Give yourself write permission on it (chmod u+w ${shellWord(shownPlace)}), then build again. Nothing was changed.`,
        [
          {
            name: `ls -ld ${shellWord(shownPlace)}`,
            reason: 'see its permissions',
          },
        ],
        ERROR_CODES.ERR_WRITE_FAILED,
      );
    }
    const message = `Failed to write theme outputs: ${e.message}`;
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
 * Import specifier for install/scaffold instructions, from a file directly
 * in the project's src/ (the file the printed snippet says it is relative
 * to; callers pass the output folder from the outputs' project root): an output
 * under src/ is `./themes/gothic/gothic`, one beside src/ is
 * `../themes/gothic/gothic`.
 * @param {string} relDir the output folder, relative to the outputs' project root
 * @param {string} base
 * @returns {string}
 */
export function importSpecifier(relDir, base) {
  // An import specifier always uses `/`. On Windows the cwd-relative dir comes
  // from path.relative with `\`, which would print `./\themes\ocean/ocean`.
  const normalized = relDir === '.' ? '.' : relDir.split(path.sep).join('/');
  const fromSrc = path.posix.relative('src', normalized.replace(/\/+$/, ''));
  if (!fromSrc) return `./${base}`;
  // Only a parent step (`..` or `../…`), never a folder named like `..cache`.
  return fromSrc === '..' || fromSrc.startsWith('../')
    ? `${fromSrc}/${base}`
    : `./${fromSrc}/${base}`;
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
  const coreSrc = coreSrcPath();
  if (!coreSrc || !fs.existsSync(coreSrc)) return {};
  return (await coreThemeValues(coreSrc)).knownValues;
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
 * The `src` folder of the Core beside the CLI ({@link resolveCoreRoot}), or
 * null when there is none.
 * @returns {string | null}
 */
function coreSrcPath() {
  const coreRoot = resolveCoreRoot();
  return coreRoot ? path.join(coreRoot, 'src') : null;
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
 * @param {{includeTypes?: boolean}} [options]
 * @returns {string}
 */
function readComponentDeclarations(pascalName, options = {}) {
  const includeTypes = options.includeTypes === true;
  const cacheKey = `${pascalName}:${includeTypes ? 'with-types' : 'index-only'}`;
  if (_componentDeclCache.has(cacheKey)) {
    return _componentDeclCache.get(cacheKey) ?? '';
  }
  let contents = '';
  const coreRoot = resolveCoreRoot();
  if (coreRoot) {
    const candidateSets = [
      [path.join(coreRoot, 'dist', pascalName, 'index.d.ts')],
      [path.join(coreRoot, 'src', pascalName, 'index.ts')],
    ];
    if (includeTypes) {
      candidateSets[0].push(
        path.join(coreRoot, 'dist', pascalName, 'types.d.ts'),
      );
      candidateSets[1].push(path.join(coreRoot, 'src', pascalName, 'types.ts'));
    }
    for (const files of candidateSets) {
      if (fs.existsSync(files[0])) {
        for (const file of files) {
          try {
            if (fs.existsSync(file)) {
              contents += fs.readFileSync(file, 'utf-8') + '\n';
            }
          } catch {
            // ignore
          }
        }
        if (contents) break;
      }
    }
  }
  _componentDeclCache.set(cacheKey, contents);
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

  const coreSrc = coreSrcPath();
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

  const {owners} = await coreThemeValues(coreSrc);
  for (const {moduleName, components} of Object.hasOwn(owners, componentName)
    ? owners[componentName]
    : []) {
    // Try the exact rendered token first for documented subtargets such as
    // avatar-status-dot → AvatarStatusDotVariantMap, then the owning public
    // component name (for example, ProgressBar for progress-bar-fill).
    addCandidate(moduleName, toPascalCase(componentName));
    addCandidate(moduleName, moduleName);
    for (const name of components) addCandidate(moduleName, name);
  }
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
 * @param {{includeTypes?: boolean}} [options]
 * @returns {boolean}
 */
function componentHasAugmentableInterface(pascalName, interfaceName, options) {
  const decl = readComponentDeclarations(pascalName, options);
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
 * Extension points whose public module and interface do not follow the usual
 * `<Component><Prop>Map` convention. TextType reads CustomTextTypes from the
 * theme module, so both classification and declaration emission must resolve
 * this same public augmentation point.
 *
 * @type {Record<string, {moduleName: string, interfaceName: string, includeTypes?: boolean}>}
 */
const AUGMENTATION_OVERRIDES = {
  'text.type': {
    moduleName: 'theme',
    interfaceName: 'CustomTextTypes',
    includeTypes: true,
  },
};

/**
 * Resolve the public module/interface that can widen a component prop value.
 * @param {string} component
 * @param {string} prop
 * @returns {Promise<{moduleName: string, interfaceName: string}|null>}
 */
async function resolveAugmentationTarget(component, prop) {
  const override = AUGMENTATION_OVERRIDES[`${component}.${prop}`];
  if (override) {
    return componentHasAugmentableInterface(
      override.moduleName,
      override.interfaceName,
      {includeTypes: override.includeTypes},
    )
      ? {moduleName: override.moduleName, interfaceName: override.interfaceName}
      : null;
  }

  const propPascal = prop.charAt(0).toUpperCase() + prop.slice(1);
  const target = (await resolveAugmentationTargetCandidates(component)).find(
    candidate =>
      isComponentValueAugmentationPoint(
        candidate.moduleName,
        `${candidate.interfacePrefix}${propPascal}Map`,
      ),
  );
  return target
    ? {
        moduleName: target.moduleName,
        interfaceName: `${target.interfacePrefix}${propPascal}Map`,
      }
    : null;
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

  const target = await resolveAugmentationTarget(component, prop);
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

      const target = await resolveAugmentationTarget(component, prop);

      // Resolve the augmentation point again to name it. Classification has
      // already established that one exists (that is what `enrollment` means),
      // so this is a lookup, not a filter — but a target that somehow fails to
      // resolve here must not emit a `declare module` block against a
      // non-existent interface, which would create a dead sibling interface
      // rather than widening the component's prop union.
      if (!target) continue;

      const modulePath = `@astryxdesign/core/${target.moduleName}`;
      const {interfaceName} = target;

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
// Every theme source extension is in this list: jiti hands a file whose
// extension it does not list to Node's own loader, which cannot load `.jsx`
// or, on some Node versions, TypeScript.
const THEME_MODULE_EXTENSIONS = [
  ...new Set([
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.mtsx',
    '.ctsx',
    '.mjs',
    '.cjs',
    '.js',
    '.jsx',
    '.json',
    ...THEME_SOURCE_EXTENSIONS,
  ]),
];
// prettier-ignore
const registryGraphError = (/** @type {string} */ message) => new AstryxError(message, undefined, ERROR_CODES.ERR_THEME_INVALID);
// prettier-ignore
function parseRegistryModule(/** @type {string} */ source, /** @type {string} */ filePath) {
  try { return parse(source, {sourceType: 'unambiguous', plugins: sourcePlugins(filePath)}); }
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
    // A relative import as written, else as the single build's loader reads
    // it: with a module extension or a folder's index (`./icons` → icons.ts).
    else if (specifier.startsWith('.')) { resolved = fileURLToPath(new URL(specifier, pathToFileURL(parentPath))); if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) resolved = resolver.resolve(specifier); }
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
 * The sources of the themes a theme source extends, nearest first: the
 * module each `extends: name` imports `name` from, when it is a relative
 * import, then the one that module extends, a few hops at most. Empty when
 * the source extends nothing it imports.
 * @param {string} filePath
 * @param {string} source
 * @returns {Array<{file: string, source: string}>}
 */
function extendedThemeSources(filePath, source) {
  /** @type {Array<{file: string, source: string}>} */
  const chain = [];
  let file = filePath;
  let text = source;
  for (let hop = 0; hop < 4; hop++) {
    /** @type {any} */
    let ast;
    try {
      ast = parse(text, {
        sourceType: 'unambiguous',
        plugins: sourcePlugins(file),
      });
    } catch {
      return chain;
    }
    /** @type {string | null} */
    let base = null;
    /** @param {any} node */
    const find = node => {
      if (base || !node || typeof node !== 'object') return;
      if (
        node.type === 'ObjectProperty' &&
        !node.computed &&
        (node.key?.name ?? node.key?.value) === 'extends' &&
        node.value?.type === 'Identifier'
      ) {
        base = node.value.name;
        return;
      }
      for (const [k, v] of Object.entries(node)) {
        if (k === 'loc') continue;
        if (Array.isArray(v)) v.forEach(find);
        else if (v && typeof v === 'object' && v.type) find(v);
      }
    };
    find(ast.program);
    const from = ast.program.body.find(
      (/** @type {any} */ st) =>
        st.type === 'ImportDeclaration' &&
        String(st.source?.value ?? '').startsWith('.') &&
        st.specifiers.some((/** @type {any} */ x) => x.local?.name === base),
    );
    if (!from) return chain;
    try {
      file = resolveThemeModule(String(from.source.value), file);
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return chain;
    }
    chain.push({file, source: text});
  }
  return chain;
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
 * On Node 22.15 and later, on every path, a stylesheet that a module in the
 * theme's graph imports loads as an empty module (`withEmptyStylesheets`): a
 * base theme's module can import its own stylesheet for the app's bundler; an
 * asset one imports (an icon registry's .svg, a picture) loads as its URL.
 *
 * @param {string} filePath
 * @param {import('./core-interception.mjs').CoreInterception} [interception]
 * @returns {Promise<{theme: any, exportName: string, degraded: {topLevelAwait: boolean, commonJs: boolean}, colorModes: ["light"] | ["dark"] | null, others?: string[], defaultHolds?: string[]}>}
 */
// prettier-ignore
async function importThemeModule(filePath, interception, /** @type {any} */ loader = undefined, /** @type {string | undefined} */ pick = undefined, /** @type {Set<string>} */ unbuilt = new Set(), /** @type {Set<string>} */ imported = new Set()) {
  const jiti =
    loader ??
    createJiti(import.meta.url, {
      moduleCache: false,
      // The per-user transpile cache: an edited theme is transpiled again,
      // and the folder stays within its size limit.
      ...jitiCacheOptions(),
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
    try {
      try {
        mod = await withEmptyStylesheets(async () => jiti(filePath), {unbuilt, imported});
      } catch (error) {
        // Only a sync-loader limitation may fall back. Anything else is the
        // theme's own failure and belongs to the caller unchanged.
        if (!isSyncLoaderLimitation(error)) throw error;
        degraded.topLevelAwait = true;
        // Force asynchronous transformation instead of native import: this
        // keeps virtual Core interception active even when the module uses
        // top-level await.
        mod = await withEmptyStylesheets(() =>
          jiti.evalModule(fs.readFileSync(filePath, 'utf8'), {
            id: filePath,
            filename: filePath,
            ext: path.extname(filePath),
            cache: jiti.cache,
            async: true,
            forceTranspile: true,
          }),
          {unbuilt, imported},
        );
      }
    } finally {
      // Read after the load: the root is wrapped when the load requires it.
      degraded.commonJs = !commonJsPatch.covered;
      commonJsPatch.undo();
    }
  } else {
    mod = await withEmptyStylesheets(() => jiti.import(filePath), {unbuilt, imported});
  }

  // Both loads hand back the module. The theme is read from the module's own
  // exports, never from the module object itself: jiti's interop answers a
  // property the module lacks from its default export (and a missing
  // `default` with the module), so the module can pass for the theme while
  // its own keys hide the theme's fields.
  const isModule = mod != null && typeof mod === 'object';
  // A theme with one color mode says so with a `colorModes` export beside
  // the theme (`['light']` or `['dark']`); the build carries it into the
  // built module.
  const colorModes = oneColorMode(
    isModule && Object.hasOwn(mod, 'colorModes') ? mod.colorModes : undefined,
  );
  const hasDefault = isModule && Object.hasOwn(mod, 'default');
  const defaultExport = hasDefault ? mod.default : undefined;
  // A caller that already knows which export a build reads (from a load
  // as the build loads it) reads that one.
  if (pick !== undefined && isModule && Object.hasOwn(mod, pick)) {
    if (isThemeObject(mod[pick]))
      return {theme: mod[pick], exportName: pick, degraded, colorModes};
  }
  if (isThemeObject(defaultExport)) {
    return {theme: defaultExport, exportName: 'default', degraded, colorModes};
  }
  // A default export that holds themes (`export default {light, dark}`) is
  // no theme: named so, whether a theme is also exported by name or not. One
  // with a name of its own is a theme (its `extends` holds its base).
  const held =
    hasDefault &&
    defaultExport &&
    typeof defaultExport === 'object' &&
    typeof defaultExport.name !== 'string'
      ? Object.entries(defaultExport)
          .filter(([, value]) => isThemeObject(value))
          .map(([key]) => key)
      : [];
  if (isModule) {
    // With no default, the first theme export is built; any other theme the
    // module exports is named (`others`), so the build can say it was left
    // out rather than build one of a pair without a word.
    const themes = Object.entries(mod).filter(
      ([exportName, value]) =>
        exportName !== 'default' &&
        exportName !== 'module.exports' &&
        isThemeObject(value),
    );
    if (themes.length) {
      const [[exportName, theme]] = themes;
      const others = themes
        .slice(1)
        .filter(([, value]) => value !== theme)
        .map(([name]) => name);
      return {
        theme,
        exportName,
        degraded,
        colorModes,
        ...(others.length ? {others} : {}),
        ...(held.length ? {defaultHolds: held} : {}),
      };
    }
  }
  if (held.length)
    throw new ThemeShapeError(
      `The default export is an object holding themes (${held.join(', ')}), not a theme: export default the theme to build, or give each theme its own file.`,
    );
  // The loader's interop answers a null default with the module itself, so
  // read the export as the module wrote it.
  const ownDefault = hasDefault
    ? Object.getOwnPropertyDescriptor(mod, 'default')?.value
    : undefined;
  if (
    hasDefault &&
    (ownDefault === null ||
      (typeof ownDefault !== 'object' && typeof ownDefault !== 'function'))
  ) {
    throw new ThemeShapeError(
      `The default export is ${ownDefault === null ? 'null' : `a ${typeof ownDefault}`}, not a theme object.`,
    );
  }
  // A Promise of a theme (an async helper's result, its await left out) is
  // an object with no name: the build reads the export as it is and does
  // not await it.
  if (hasDefault && typeof ownDefault?.then === 'function') {
    throw new ThemeShapeError(
      'The default export is a Promise, not a theme object: the build reads the export as it is and does not await it. Export the theme itself, such as export default await …, or the defineTheme() result.',
    );
  }
  // A doc (`{type: 'theme', name, description, …}`, read from a file not
  // named as one) is no theme: `type` is no theme field, and a doc has no
  // tokens.
  if (
    isPlainObject(defaultExport) &&
    typeof defaultExport.type === 'string' &&
    defaultExport.tokens === undefined
  )
    throw themeDocError(filePath, 'export');
  // A plain-object default export is the module's theme even when it has
  // no tokens of its own (local tokens, typography or component styles may
  // be all it defines), or no name: the build's validation says what it
  // lacks.
  if (isPlainObject(defaultExport)) {
    return {theme: defaultExport, exportName: 'default', degraded, colorModes};
  }
  // A CommonJS module whose exports are the theme (`module.exports =
  // theme`) has no default of its own: interop answers `default` with
  // those exports, and without interop (a family build's loader) the module
  // is them.
  if (isModule && !hasDefault) {
    const exportsObject = mod.default ?? mod;
    if (isThemeObject(exportsObject)) {
      return {theme: exportsObject, exportName: 'default', degraded, colorModes};
    }
  }

  // A theme object (tokens of its own) whose name is missing or no text is
  // that theme without its name, not a module without a theme.
  const unnamed = isModule
    ? [
        ...(hasDefault ? [['default', defaultExport]] : []),
        ...Object.entries(mod).filter(
          ([k]) => k !== 'default' && k !== 'module.exports',
        ),
      ].find(
        ([, v]) =>
          v &&
          typeof v === 'object' &&
          v.tokens &&
          typeof v.tokens === 'object' &&
          typeof v.name !== 'string',
      )
    : undefined;
  if (unnamed) {
    const [exportName, value] = unnamed;
    let text = '';
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      // The line is left out.
    }
    const call = /\bdefineTheme\s*\(/.exec(text);
    const line =
      keyPathLine(text, ['name'], filePath) ??
      (call ? text.slice(0, call.index).split('\n').length : null);
    const stem = path
      .basename(filePath)
      .replace(/(?:\.theme)?\.[cm]?[jt]sx?$/, '');
    throw new ThemeNameError(
      `${exportName === 'default' ? 'The default export' : `The export ${exportName}`} is a theme with no name${value.name === undefined ? '' : ` (its name is ${value.name === null ? 'null' : `a ${typeof value.name}`}, not text)`}${line ? ` (line ${line})` : ''}, and the build names the theme's files after it. Give defineTheme a name, such as name: '${stem}'.`,
    );
  }
  throw new ThemeShapeError(
    `Could not find a defineTheme() result in ${filePath}.`,
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
 * @param {Set<any>} [seen] the themes already met on the way up its bases
 * @returns {boolean}
 */
function isThemeObject(value, seen = new Set()) {
  if (seen.has(value)) return false;
  seen.add(value);
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    ((value.tokens && typeof value.tokens === 'object') ||
      // A theme with no tokens of its own over a base it extends (a base
      // that reaches back to it is no theme: `extends` cycles).
      isThemeObject(value.extends, seen)),
  );
}

/**
 * Extract the theme definition from a JS/TS file, through jiti (full TS
 * support). A module that does not load fails with its own error: the theme
 * is never read from the file's text instead.
 *
 * @param {string} filePath
 * @param {import('./core-interception.mjs').CoreInterception} [interception]
 * @returns {Promise<{theme: any, exportName?: string, degraded: {topLevelAwait: boolean, commonJs: boolean}, colorModes?: ['light'] | ['dark'] | null, others?: string[], defaultHolds?: string[], unbuiltStylesheets?: string[], importedStylesheets?: string[]}>}
 *   `others`: the module's other theme exports, left out (it has no theme
 *   default); `defaultHolds`: the keys of a default export that holds themes
 */
// prettier-ignore
async function extractThemeDefinition(filePath, interception, /** @type {any} */ loader = undefined, /** @type {string | undefined} */ pick = undefined) {
  // A doc module is not run as a theme.
  if (DOC_FILE.test(filePath))
    throw new Error(
      `Failed to load theme from ${filePath}: ${themeDocError(filePath, 'name').message}`,
      {cause: themeDocError(filePath, 'name')},
    );
  // A stylesheet the source imports that is not there yet loads as an empty
  // module, and is named, so the build can refuse one it does not write.
  /** @type {Set<string>} */
  const unbuilt = new Set();
  // A stylesheet the source imports that is there loads empty too, and is
  // named, so the build can say its outputs do not carry it.
  /** @type {Set<string>} */
  const imported = new Set();
  try {
    const loaded = await importThemeModule(filePath, interception, loader, pick, unbuilt, imported);
    return {
      ...loaded,
      ...(unbuilt.size ? {unbuiltStylesheets: [...unbuilt]} : {}),
      ...(imported.size ? {importedStylesheets: [...imported]} : {}),
    };
  } catch (jitiError) {
    // A module may throw anything: what it threw is told as it is (a string,
    // an object, null), never read as an Error it is not.
    const je =
      jitiError instanceof Error
        ? jitiError
        : new Error(`it threw ${thrownText(jitiError)}`);
    throw new Error(
      `Failed to load theme from ${filePath}: ${themeLoadReason(je)}`,
      {cause: jitiError},
    );
  }
}

/**
 * The Core interception a standalone build loads a theme module with: none
 * when the selected Core generates adaptations itself and the theme's folder
 * resolves a Core of its own; else imports of Core are handed the selected
 * Core.
 * @param {string} filePath
 */
function standaloneInterception(filePath) {
  return _generateAdaptationCSS && themeFolderResolvesCore(filePath)
    ? undefined
    : interceptCore(_coreThemeModule, _coreRootModule);
}

/**
 * Load a built theme module (`<name>.js`) as the app's bundler loads it:
 * an import without its ending (a module beside the theme, `./icons`)
 * resolves to the file it names in any theme source extension, and a
 * stylesheet a module imports loads as an empty module. Nothing is cached,
 * so a module built again is read again.
 * @param {string} file
 * @returns {Promise<Record<string, any>>}
 */
export async function loadBuiltThemeModule(file) {
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
    ...jitiCacheOptions(),
    jsx: true,
    extensions: THEME_MODULE_EXTENSIONS,
  });
  return /** @type {Record<string, any>} */ (
    await withEmptyStylesheets(() => jiti.import(file))
  );
}

/**
 * Load a theme module as a standalone build of it loads it (the Core the
 * build selects, the same loader and interception) and name the export the
 * build reads. Callers that must agree with the build on which theme a
 * module defines read it here, never from the module's text.
 *
 * With `base`, also whether the theme extends that module's export, by
 * identity, anywhere up its `extends` chain (`extendsBase`): the module is
 * loaded once, and the theme module's imports of it (by any of
 * `base.specifiers`) are handed that one load, so the answer is about the
 * very object, not one that only looks like it.
 * @param {string} file
 * @param {{cwd?: string, base?: {file: string, exportName: string, specifiers: string[]}}} [ctx]
 * @returns {Promise<{theme: any, exportName: string, extendsBase?: boolean}>}
 */
export async function loadThemeExport(file, {cwd = process.cwd(), base} = {}) {
  const filePath = path.resolve(cwd, file);
  await selectCore(cwd, {projectOnly: false});
  const {theme, exportName = 'default'} = await extractThemeDefinition(
    filePath,
    standaloneInterception(filePath),
  );
  if (!base) return {theme, exportName};
  const recorder = interceptCore(_coreThemeModule, _coreRootModule);
  const shared = (
    await extractThemeDefinition(
      path.resolve(cwd, base.file),
      recorder,
      undefined,
      base.exportName,
    )
  ).theme;
  const withBase = {
    ...recorder,
    modules: {
      ...recorder.modules,
      ...Object.fromEntries(
        base.specifiers.map(s => [s, {[base.exportName]: shared}]),
      ),
    },
  };
  const again = await extractThemeDefinition(
    filePath,
    withBase,
    undefined,
    exportName,
  );
  let extendsBase = false;
  for (
    let at = recorder.parentOf(again.theme), depth = 0;
    at && depth < 64;
    at = recorder.parentOf(at), depth++
  )
    if (at === shared) {
      extendsBase = true;
      break;
    }
  return {theme, exportName, extendsBase};
}

/**
 * The input a theme module gives `defineTheme()` for the theme a build of
 * it reads, evaluated as the build evaluates the module (an import, an
 * expression, a spread or a computed key is its value), with the theme Core
 * made of it. When Core refuses the input, the input the module gave for
 * the named theme (else its last) and Core's error; null when the module
 * does not load at all.
 * `chain` holds the inputs of the themes it extends, nearest first, as far
 * as each was made by a `defineTheme()` call this load saw.
 * @param {string} file
 * @param {{cwd?: string, name?: string}} [ctx]
 * @returns {Promise<{input: any, theme: any, error: Error | null, chain: any[]} | null>}
 */
export async function loadThemeInput(file, {cwd = process.cwd(), name} = {}) {
  const filePath = path.resolve(cwd, file);
  await selectCore(cwd, {projectOnly: false});
  const interception = interceptCore(_coreThemeModule, _coreRootModule);
  /** @param {any} input */
  const chainOf = input => {
    const chain = [];
    /** @type {Set<any>} */
    const seen = new Set([input]);
    let parent = interception.inputOf(input?.extends);
    while (parent && typeof parent === 'object' && !seen.has(parent)) {
      seen.add(parent);
      chain.push(parent);
      parent = interception.inputOf(parent.extends);
    }
    return chain;
  };
  try {
    const {theme} = await extractThemeDefinition(filePath, interception);
    const input = interception.inputOf(theme) ?? null;
    return {input, theme, error: null, chain: chainOf(input)};
  } catch (e) {
    const given = interception.inputs;
    const input =
      given.filter(x => x && typeof x === 'object' && x.name === name).at(-1) ??
      given.at(-1);
    return input
      ? {
          input,
          theme: null,
          error: /** @type {Error} */ (e),
          chain: chainOf(input),
        }
      : null;
  }
}

/**
 * A one-mode `colorModes` value (`['light']` or `['dark']`), or null for
 * anything else: a theme with both modes needs no export.
 * @param {unknown} value
 * @returns {['light'] | ['dark'] | null}
 */
export function oneColorMode(value) {
  return Array.isArray(value) &&
    value.length === 1 &&
    (value[0] === 'light' || value[0] === 'dark')
    ? /** @type {['light'] | ['dark']} */ ([value[0]])
    : null;
}

/** Names a theme module's exports must take; ends a shape failure. */
const THEME_EXPORT_FIX =
  "Export the theme object: `export default defineTheme({name: 'my-theme', tokens: {...}})`, or a plain `export default {name: 'my-theme', tokens: {...}}`.";

/**
 * A thrown value that is not an Error, as text: a string as it is, an
 * object as JSON where it can be, null and undefined by name.
 * @param {unknown} value
 */
function thrownText(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null || value === undefined) return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Why a theme module did not load, with the step that fixes it. A module
 * whose default export is null or a primitive trips the loader's interop
 * before the build reads it; that is a theme shape failure, not an import one.
 * @param {Error} error
 * @returns {string}
 */
function themeLoadReason(error) {
  const message = error.message;
  if (error instanceof ThemeShapeError)
    return `${message}\n${THEME_EXPORT_FIX}`;
  if (error instanceof ThemeNameError || error instanceof ThemeDocError)
    return message;
  if (
    error instanceof TypeError &&
    /^Cannot read properties of (?:null|undefined)/.test(message) &&
    /jiti/.test(String(error.stack).split('\n')[1] ?? '')
  ) {
    return `its default export is null or not an object.\n${THEME_EXPORT_FIX}`;
  }
  const missing = missingThemePackage(error);
  if (missing) {
    // Node's "Require stack" names absolute paths; the package is the fact.
    return `Cannot find module '${missing}'.\nThe theme imports ${missing}, which is not installed. Install it, then build again.`;
  }
  const alias = unresolvedAlias(error);
  if (alias)
    return `Cannot find module '${alias}'.\nThe theme imports ${alias}, which names no package: a path alias (tsconfig paths, a bundler alias) or a # subpath import with no "imports" entry, which the theme loader does not map. Import it by a path relative to the theme file (such as '../lib/c'), then build again.`;
  // A module that did not resolve: the import hint. Any other failure (the
  // theme's own code, or Core refusing its input) is told as it is.
  const unresolved =
    /^(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND)$/.test(
      String(/** @type {any} */ (error).code ?? ''),
    ) || /Cannot (?:find|resolve) (?:module|package)/.test(message);
  return unresolved
    ? `${message}\nMake sure all imports in the theme file are resolvable.`
    : message;
}

/** A theme module that loaded but exports no theme object. */
class ThemeShapeError extends Error {}

/** A theme module whose theme object has no name. */
class ThemeNameError extends Error {}

/**
 * A module that is a doc, not a theme: a `*.doc.*` file (the name every doc
 * of the CLI's has), or one whose default export is a doc (`{type: 'theme',
 * …}`, a field no theme has). Nothing is built from it. `source` is the theme
 * source beside it that the doc describes, when there is one.
 */
class ThemeDocError extends Error {
  /** @param {string} message @param {string | null} source */
  constructor(message, source) {
    super(message);
    this.source = source;
  }
}

/** A doc module's name: `oceanTheme.doc.mjs`. */
const DOC_FILE = /\.doc\.[cm]?[jt]sx?$/i;

/**
 * The theme source beside a doc that has its name, `oceanTheme.ts` beside
 * `oceanTheme.doc.mjs`, or null.
 * @param {string} docFile
 */
function themeSourceOfDoc(docFile) {
  const stem = path.basename(docFile).replace(DOC_FILE, '');
  for (const ext of THEME_SOURCE_EXTENSIONS) {
    if (ext === '.json') continue;
    const file = path.join(path.dirname(docFile), `${stem}${ext}`);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

/**
 * The refusal for a doc module read as a theme.
 * @param {string} filePath
 * @param {'name' | 'export'} by how it is known to be a doc
 */
function themeDocError(filePath, by) {
  const source = themeSourceOfDoc(filePath);
  const what =
    by === 'name'
      ? `${path.basename(filePath)} is a doc module (a *.doc.* file describes a theme, a component or a command for the docs)`
      : `its default export is a doc (it has a type field, which no theme has, and no tokens)`;
  return new ThemeDocError(
    `${what}, not a theme, so nothing is built from it. Build the theme source itself${source ? `, ${path.basename(source)}` : ''}.`,
    source,
  );
}

/**
 * The command that moves a failed theme load forward: the install for a
 * package the theme imports and the app lacks, the same build for a file that
 * changed while it loaded, else the annotated template, which shows a theme
 * source that loads.
 * @param {Error} error
 * @param {string} shown the theme file as the message names it
 * @param {string} cwd
 * @returns {import('../../../foundation/response/base').Suggestion[]}
 */
function themeLoadSuggestions(error, shown, cwd, mode = {}) {
  const doc = error.cause instanceof ThemeDocError ? error.cause : null;
  if (doc?.source)
    return [
      {
        name: buildSuggestion(
          path.relative(cwd, doc.source) || doc.source,
          mode,
          cwd,
        ),
        reason: 'build the theme source the doc describes',
      },
    ];
  const missing = missingThemePackage(error.cause ?? error);
  if (missing) {
    const {installCommand, installGuidance} = installCommandFor(
      [missing],
      findPackageRoot(cwd) ?? cwd,
    );
    const install = installGuidance ?? installCommand;
    if (install) {
      return [
        {
          name: install,
          reason: `install ${missing}, which the theme imports`,
        },
      ];
    }
  }
  if (/changed while it was loading/.test(error.message)) {
    return [
      {
        name: buildSuggestion(shown, mode, cwd),
        reason: 'build again once the file is saved',
      },
    ];
  }
  return [
    {
      name: formatCliCommand('theme template theme.template.ts', cwd),
      reason: 'an annotated theme source that loads, to compare with',
    },
  ];
}

/**
 * The package a theme load failed on because it is not installed.
 * @param {unknown} error
 * @returns {string | null}
 */
export function missingThemePackage(error) {
  const message = error instanceof Error ? error.message : String(error);
  const specifier = /Cannot find (?:module|package) '([^']+)'/.exec(
    message,
  )?.[1];
  // A name the project maps itself (tsconfig paths or baseUrl) is no
  // package, however it is spelled: never one to install.
  if (!specifier || projectMapsImport(specifier, importerOf(message)))
    return null;
  return packageNameOf(specifier) ?? null;
}

/**
 * The module a "cannot find" error was imported from, as Node (`imported
 * from …`) or the loader's require stack names it, or null.
 * @param {string} message
 * @returns {string | null}
 */
function importerOf(message) {
  const from =
    /imported from (\S+)/.exec(message)?.[1] ??
    /Require stack:\s*\n- (.+)/.exec(message)?.[1];
  if (!from) return null;
  try {
    return from.startsWith('file:') ? fileURLToPath(from) : from.trim();
  } catch {
    return null;
  }
}

/**
 * The package an import specifier names, or undefined when it names none:
 * a relative or absolute path, a `#` subpath import, or a path alias such
 * as `@/lib/c` or `~/lib/c`, which a bundler or tsconfig maps and the
 * theme loader does not. A package name is `name` or `@scope/name`, of
 * the characters npm takes, never starting with `.` or `_`.
 * @param {string} specifier
 * @returns {string | undefined}
 */
export function packageNameOf(specifier) {
  const m =
    /^((?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*)(?:\/|$)/i.exec(
      specifier,
    );
  return m ? m[1] : undefined;
}

/**
 * The import a theme load failed on that names no package (a path alias,
 * a `#` subpath import with no entry), or null.
 * @param {unknown} error
 * @returns {string | null}
 */
function unresolvedAlias(error) {
  const message = error instanceof Error ? error.message : String(error);
  const specifier = /Cannot find (?:module|package) '([^']+)'/.exec(
    message,
  )?.[1];
  return specifier &&
    !/^\.{0,2}\//.test(specifier) &&
    !path.isAbsolute(specifier) &&
    (!packageNameOf(specifier) ||
      projectMapsImport(specifier, importerOf(message)))
    ? specifier
    : null;
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
  // Only doctor calls this, and doctor never reads the Core a copy installed
  // for the computer carries, which is often missing too: there the project's
  // installed Core loads the input.
  const cliCore = await loadCliCore();
  if (carriesCore() || !cliCore.themeModule) {
    await selectCore(cwd, {projectOnly: true});
  }
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
    return [
      ...new Set(
        inputs.flatMap(input =>
          validatePrivateVars(input, {defineTheme: _defineTheme}),
        ),
      ),
    ];
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
 * @param {'icons' | 'indicators' | 'componentIcons' | 'extends'} field the field (`extends`: the base a theme imports)
 * @returns {{exportName: string, importPath: string} | null}
 */
function extractRegistryInfo(filePath, field) {
  const content = fs.readFileSync(filePath, 'utf8');
  const defineIndex = content.indexOf('defineTheme(');
  // A plain-object theme writes its fields with no defineTheme() call.
  if (defineIndex < 0 && field !== 'extends') return null;
  const themeSource = content.slice(Math.max(defineIndex, 0));
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
 * A theme's component icon slot values: a theme from defineTheme keeps them
 * in `__componentIcons` when any is a function (its `componentIcons` is the
 * static view); otherwise `componentIcons` holds them.
 * @param {any} theme
 * @returns {Record<string, unknown> | undefined}
 */
function themeComponentIcons(theme) {
  return theme?.__componentIcons ?? theme?.componentIcons;
}

/**
 * The generated function that merges a theme's own slot values over its
 * base's, as `defineTheme` does: an own slot replaces the inherited one whole,
 * and an `undefined` own slot leaves it in place. It reads no global.
 * @param {string} name - A reserved function name.
 * @returns {string}
 */
function componentIconMergeFunction(name) {
  return `function ${name}(base, own) {
  const merged = {...base};
  for (const slot in own) {
    if (own[slot] !== undefined) merged[slot] = own[slot];
  }
  return merged;
}
`;
}

/**
 * The generated code that reads the static view of a theme's slot values:
 * every slot without a function. Like the icon node view, it reads no global
 * and declares only reserved local names.
 * @param {string} valuesName - A reserved local name bound to the values.
 * @param {string} viewName - A reserved local name.
 * @returns {string}
 */
function componentIconViewExpression(valuesName, viewName) {
  return `(() => {
  const ${viewName} = {};
  for (const slot in ${valuesName}) {
    const value = ${valuesName}[slot];
    if (value !== undefined && typeof value !== 'function') ${viewName}[slot] = value;
  }
  return ${viewName};
})()`;
}

/**
 * A relative import a module in `fromDir` writes, as a module in `toDir`
 * writes it, so it names the same file; a package or absolute specifier is
 * the same anywhere. The family module writes the theme source's imports
 * this way, and a single build names it for an import it keeps as written.
 * @param {string} specifier
 * @param {string} fromDir
 * @param {string} toDir
 */
function rebasedImport(specifier, fromDir, toDir) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../'))
    return specifier;
  if (path.resolve(fromDir) === path.resolve(toDir)) return specifier;
  const moved = path
    .relative(toDir, path.resolve(fromDir, specifier))
    .split(path.sep)
    .join('/');
  return moved.startsWith('./') || moved.startsWith('../')
    ? moved
    : `./${moved}`;
}

/**
 * Whether a relative import resolves from a module in `dir`, as the app's
 * bundler reads it (with a module extension or a folder's index).
 * @param {string} dir
 * @param {string} specifier
 */
function moduleAnswers(dir, specifier) {
  try {
    const resolved = createJiti(path.join(dir, 'index.js'), {
      extensions: THEME_MODULE_EXTENSIONS,
    }).resolve(specifier);
    return fs.statSync(resolved).isFile();
  } catch {
    return false;
  }
}

/**
 * The icon and slot imports a single build's module carries, made to load
 * anywhere ({@link selfContainedImports}), with the compiled modules to
 * write. An import --icons-specifier names is written as given.
 * @template {{imports: Array<{importPath: string, importedName: string, localName: string}>, iconsSpecifierImportPath?: string, iconsSpecifierLocalName?: string} | null} I
 * @template {{imports: Array<{importPath: string, importedName: string, localName: string}>} | null} C
 * @param {I} iconInfo
 * @param {C} componentIconInfo
 * @param {{sourceFile: string, outDir: string, modulesDir: string, cwd: string, header: (file: string) => string, iconsSpecifier?: string}} options
 * @returns {{iconInfo: I, componentIconInfo: C, writes: Array<{dest: string, content: string}>, warnings: string[]}}
 */
function selfContainedInfos(iconInfo, componentIconInfo, options) {
  const icons = iconInfo?.imports ?? [];
  const slots = componentIconInfo?.imports ?? [];
  const {
    entries: [{bindings, renamed}],
    writes,
    kept,
  } = selfContainedImports(
    [{sourceFile: options.sourceFile, bindings: [...icons, ...slots]}],
    {
      outDir: options.outDir,
      modulesDir: options.modulesDir,
      header: options.header,
      marker: GENERATED_MARKER,
      files: localModuleFiles,
      keep: binding =>
        options.iconsSpecifier !== undefined &&
        binding.importPath === iconInfo?.iconsSpecifierImportPath &&
        binding.localName === iconInfo?.iconsSpecifierLocalName,
    },
  );
  return {
    iconInfo: /** @type {I} */ (
      iconInfo && {
        ...iconInfo,
        imports: bindings.slice(0, icons.length),
        ...(iconInfo.iconsSpecifierImportPath !== undefined &&
        options.iconsSpecifier === undefined
          ? {
              iconsSpecifierImportPath:
                renamed.get(iconInfo.iconsSpecifierImportPath) ??
                iconInfo.iconsSpecifierImportPath,
            }
          : {}),
      }
    ),
    componentIconInfo: /** @type {C} */ (
      componentIconInfo && {
        ...componentIconInfo,
        imports: bindings.slice(icons.length),
      }
    ),
    writes,
    warnings: keptWarnings(kept, options.cwd),
  };
}

/**
 * The folder a build's compiled local modules go to: one per output stem,
 * beside the outputs, so two builds never compile to one path.
 * @param {string} outDir
 * @param {string} stem the module's name (the theme's, whatever --out names
 *   the stylesheet), or a family key
 */
function modulesFolder(outDir, stem) {
  return path.join(outDir, `${stem}.modules`);
}

/**
 * A warning for each local TypeScript or JSX module left uncompiled because a
 * file of the person's own holds its compiled path: the built module keeps
 * importing the TypeScript source.
 * @param {Array<{source: string, dest: string}>} kept
 * @param {string} cwd
 */
function keptWarnings(kept, cwd) {
  return kept.map(
    ({source, dest}) =>
      `${path.relative(cwd, dest) || dest} is a file this build did not write, so ${path.relative(cwd, source) || source} is not compiled there and the built module keeps importing that TypeScript or JSX source, which an app whose bundler does not compile TypeScript from node_modules cannot load. Move that file, or build to another --out.`,
  );
}

/**
 * Read each value of a loaded theme (in plain objects and arrays, at any
 * depth), so a getter or Proxy the module wrote that throws fails here, as
 * a load: "Failed to load theme from <file>: <message> (reading <field>)".
 * @param {any} theme
 * @param {string} filePath
 */
function readThemeValues(theme, filePath) {
  /** @type {Set<any>} */
  const seen = new Set();
  /** @param {any} value @param {string[]} at */
  const walk = (value, at) => {
    if (
      !value ||
      typeof value !== 'object' ||
      seen.has(value) ||
      at.length > 32
    )
      return;
    seen.add(value);
    if (!Array.isArray(value) && !isPlainObject(value)) return;
    /** @type {Array<string | symbol>} */
    let keys;
    try {
      keys = Reflect.ownKeys(value);
    } catch (error) {
      throw readFailure(error, at);
    }
    for (const key of keys) {
      if (typeof key !== 'string') continue;
      /** @type {any} */
      let next;
      try {
        next = value[key];
      } catch (error) {
        throw readFailure(error, [...at, key]);
      }
      walk(next, [...at, key]);
    }
  };
  /** @param {unknown} error @param {string[]} at */
  const readFailure = (error, at) =>
    new Error(
      `Failed to load theme from ${filePath}: ${error instanceof Error ? error.message : thrownText(error)}${at.length ? ` (reading ${at.join('.')})` : ''}`,
      {cause: error},
    );
  walk(theme, []);
}

/**
 * Whether a theme object is one defineTheme() made: it carries the surface
 * data defineTheme adds (the `__onDark` key, set even when it is empty) or a
 * built module's mark, with its tokens. Any other object is raw input.
 * @param {any} theme
 */
function isDefinedTheme(theme) {
  return (
    theme.tokens !== undefined &&
    (Object.hasOwn(theme, '__onDark') || theme.__built === true)
  );
}

/**
 * A plain-object theme as defineTheme() input: a field given as undefined
 * is a field not given (`extends: undefined` names no base), and a plain
 * base it extends is made with defineTheme() first, its own base before it,
 * so a base's `extends`, typography and [light, dark] pairs are resolved as
 * the theme's own are.
 * @param {any} theme
 * @param {Set<any>} [seen] the bases already met, for one that extends itself
 * @returns {any}
 */
function defineThemeInput(theme, seen = new Set([theme])) {
  // Each value as the build writes it (a BigInt as its digits, a boxed
  // primitive as itself), so defineTheme reads what is written, as the
  // value judge does.
  const input = Object.fromEntries(
    Object.entries(theme)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        key === 'extends' ? value : writtenPrimitives(value),
      ]),
  );
  const base = input.extends;
  if (base && typeof base === 'object' && !isDefinedTheme(base)) {
    // A plain base that reaches back to a theme already on the way (`a`
    // extends `b`, `b` extends `a`) has no base to build from.
    if (seen.has(base)) {
      const names = [...seen, base].map(t =>
        typeof t?.name === 'string' ? `"${t.name}"` : 'a theme with no name',
      );
      throw new AstryxError(
        `The themes extend each other in a cycle (${names.join(' extends ')}), so none has a base to build from. Give the cycle a theme that extends nothing.`,
        undefined,
        ERROR_CODES.ERR_THEME_INVALID,
      );
    }
    seen.add(base);
    input.extends = _defineTheme(defineThemeInput(base, seen));
  }
  return input;
}

/**
 * The stylesheets a theme's modules import that are there and that its
 * outputs do not carry, each as an app writes its import: a stylesheet the
 * theme file imports by the specifier it writes (`'pkg/fonts.css'`) or, for
 * a relative one, its path from the working folder; one a module the theme
 * imports brings in (`loaded`, from the load), by its path when it is a file
 * of the project. Read from the source as well as the load: a load the
 * module cache answers runs no import again.
 * @param {string} filePath the theme source
 * @param {string} source its text
 * @param {string[]} loaded the stylesheet files the load brought in
 * @param {string} outPath the stylesheet this build writes
 * @param {string} cwd
 * @returns {string[]}
 */
function carriedStylesheets(filePath, source, loaded, outPath, cwd) {
  /** @param {string} file */
  const real = file => {
    try {
      return fs.realpathSync(file);
    } catch {
      return path.resolve(file);
    }
  };
  const own = real(outPath);
  /** @type {Map<string, string>} each named stylesheet, by its real file */
  const named = new Map();
  const require = createRequire(filePath);
  for (const {specifier, typeOnly} of moduleImports(source, filePath) ?? []) {
    const query = specifier.lastIndexOf('?');
    const bare =
      query > specifier.lastIndexOf('/')
        ? specifier.slice(0, query)
        : specifier;
    if (typeOnly || !STYLESHEET_FILE.test(bare)) continue;
    const relative = bare.startsWith('./') || bare.startsWith('../');
    let file;
    try {
      file = relative
        ? path.resolve(path.dirname(filePath), bare)
        : require.resolve(bare);
    } catch {
      continue;
    }
    if (!fs.existsSync(file)) continue;
    const key = real(file);
    if (key === own || named.has(key)) continue;
    named.set(
      key,
      relative ? path.relative(cwd, file) || file : `'${specifier}'`,
    );
  }
  for (const file of loaded) {
    const key = real(file);
    if (key === own || named.has(key)) continue;
    const shown = path.relative(cwd, file);
    // A package's own stylesheet a module of it imports is the package's.
    if (
      !shown ||
      shown.startsWith('..') ||
      shown.split(path.sep).includes('node_modules')
    )
      continue;
    named.set(key, shown);
  }
  return [...named.values()];
}

/**
 * Refuse a theme whose source imports a stylesheet that is not there, unless
 * it is the stylesheet this build writes (which loads empty, so the first
 * build from a clean checkout writes it).
 * @param {string} filePath the theme source
 * @param {string[]} unbuilt the stylesheets it imports that are not there
 * @param {string} outPath the stylesheet this build writes
 * @param {string} cwd
 * @param {{check?: boolean, out?: string, iconsSpecifier?: string}} options
 */
function refuseMissingStylesheets(filePath, unbuilt, outPath, cwd, options) {
  const missing = unbuilt.filter(
    file => path.resolve(file) !== path.resolve(outPath),
  );
  if (missing.length === 0) return;
  const shown = path.relative(cwd, filePath) || filePath;
  throw new AstryxError(
    `Failed to load theme from ${shown}: it imports ${missing.map(file => path.relative(cwd, file) || file).join(', ')}, which is not there and is not the stylesheet this build writes (${path.relative(cwd, outPath) || outPath}). Create the file, correct the import, or build what writes it first. Nothing was written.`,
    themeLoadSuggestions(new Error('missing stylesheet'), shown, cwd, {
      check: options.check,
      out: options.out,
      iconsSpecifier: options.iconsSpecifier,
    }),
    ERROR_CODES.ERR_THEME_LOAD,
  );
}

/**
 * One import statement for a carried registry or slot binding. Ordinary named
 * imports stay byte-compatible; paths with quotes or escapes are encoded, and
 * default, namespace, and aliased bindings are kept.
 * @param {{importPath: string, importedName: string, localName: string}} binding
 * @param {string} [specifier] - Replaces the import path when given.
 * @returns {string}
 */
function importStatement({importPath, importedName, localName}, specifier) {
  const source =
    specifier !== undefined
      ? JSON.stringify(specifier)
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
  return `import ${binding} from ${source};\n`;
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
 * Component icon slots without a function are written as JSON. When a slot
 * value is a function, the module keeps the values, carried through
 * `componentIconInfo`'s imports, as `__componentIcons`, and the theme's
 * `componentIcons` is the static view, as `DefinedTheme['componentIcons']` is.
 *
 * @param {any} themeDef
 * @param {import('./icon-imports.mjs').IconImports | null} iconInfo
 * @param {string} [iconsSpecifier] - Overrides the selected registry specifier.
 * @param {{themeBinding?: string, iconsExpression?: string, indicatorsExpression?: string, artifactBaseName?: string, cssFileName?: string, exportIcons?: boolean, componentIconInfo?: {imports: import('./icon-imports.mjs').IconImports['imports'], expression: string, mergeName?: string} | null}} [moduleOptions]
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
  const cssFileName = moduleOptions.cssFileName ?? `${artifactBaseName}.css`;
  const exportIcons = moduleOptions.exportIcons ?? true;
  const iconImport = (iconInfo?.imports ?? [])
    .map(binding =>
      importStatement(
        binding,
        iconsSpecifier !== undefined &&
          binding.importPath === iconInfo?.iconsSpecifierImportPath &&
          binding.localName === iconInfo?.iconsSpecifierLocalName
          ? iconsSpecifier
          : undefined,
      ),
    )
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

  const componentIconValues = themeComponentIcons(themeDef);
  const componentIconInfo = moduleOptions.componentIconInfo ?? null;
  const carriesSlotFunctions = hasFunctionIconEntry(componentIconValues);
  if (carriesSlotFunctions && !componentIconInfo) {
    throw new AstryxError(
      `Theme "${themeDef.name}" has componentIcons slot functions that the build cannot carry. ` +
        'Import the slot functions from their own module into the theme file.',
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  const componentIconValuesName = `${themeBinding}ComponentIconValues`;
  const componentIconPrelude =
    carriesSlotFunctions && componentIconInfo
      ? componentIconInfo.imports
          .map(binding => importStatement(binding))
          .join('') +
        (componentIconInfo.mergeName
          ? componentIconMergeFunction(componentIconInfo.mergeName)
          : '') +
        `const ${componentIconValuesName} = ${componentIconInfo.expression};\n`
      : '';

  // Resolve token values — tuples become light-dark() strings
  /** @type {Record<string, unknown>} */
  const resolvedTokens = {};
  if (themeDef.tokens) {
    for (const [key, value] of Object.entries(themeDef.tokens)) {
      resolvedTokens[key] = resolveTokenValue(value);
    }
  }

  const tokensStr = JSON.stringify(resolvedTokens, bigIntAsText, 2)
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
    const body = JSON.stringify(value, bigIntAsText, 2)
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
    ) +
    (carriesSlotFunctions
      ? `  componentIcons: ${componentIconViewExpression(
          componentIconValuesName,
          `${themeBinding}ComponentIconView`,
        )
          .split('\n')
          .map((line, i) => (i === 0 ? line : '  ' + line))
          .join('\n')},\n  __componentIcons: ${componentIconValuesName},\n`
      : serializeField('componentIcons', componentIconValues, true));

  return `${iconImport}${componentIconPrelude}${iconDeclaration}${iconNodesDeclaration}/**
 * ${themeDef.name} theme — built by \`${getCliInvocation()} theme build\`
 * Import the CSS file alongside this module:
 *
 *   import { ${themeBinding} } from './${artifactBaseName}';
 *   import './${cssFileName}';
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
  const coreSrc = coreSrcPath();
  if (!coreSrc || !fs.existsSync(coreSrc)) return null;

  const propsByKey = targetsByKey(await coreThemeTargets(coreSrc));
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
 * @param {Set<string>} [deadKeys] takes each `<part>\u0000<style key>` the warnings say builds a selector nothing matches
 * @returns {string[]}
 */
export function validateComponentOverridesAgainstRegistry(
  themeDef,
  knownComponents,
  deadKeys = new Set(),
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
            deadKeys.add(`${component}\u0000${key}`);
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
 * @param {Set<string>} [deadKeys] takes each `<part>\u0000<style key>` that builds a selector nothing matches
 * @returns {Promise<string[]>}
 */
async function validateComponentOverrides(themeDef, deadKeys = new Set()) {
  const knownComponents = await getKnownComponents();
  if (knownComponents == null) return [];
  const warnings = validateComponentOverridesAgainstRegistry(
    themeDef,
    knownComponents,
    deadKeys,
  );
  // Style keys no element can carry: a pseudo-class or pseudo-element
  // written as a style key (`':hover'` builds `[data-="hover"]`), and a
  // value a closed prop never takes (Button's size has no `xxl`, and no
  // theme can add one). Either builds a selector nothing matches.
  const layers = [
    ...getThemeComponentLayers(themeDef).map(l => l.components),
    ...adaptationRuleValues(themeDef)
      .map((/** @type {any} */ v) => v?.components)
      .filter(isRecord),
  ];
  for (const components of layers)
    for (const [component, rules] of Object.entries(components)) {
      const knownProps = knownComponents.propsByKey[component];
      if (!knownProps || !isRecord(rules)) continue;
      for (const key of Object.keys(rules))
        for (const {prop, value} of componentValuePairs(key)) {
          if (!prop) {
            deadKeys.add(`${component}\u0000${key}`);
            warnings.push(
              `Style key "${key}" on component "${component}" is no prop or state: a pseudo-class or pseudo-element goes inside a style key, such as base: {'${key}': {…}}. As written it builds a selector nothing matches.`,
            );
            continue;
          }
          if (!knownProps.includes(prop)) continue;
          const values = (await getKnownValues(component))[prop] ?? [];
          if (
            values.length > 0 &&
            (await classifyComponentValue(component, prop, value)) ===
              'unresolved'
          ) {
            deadKeys.add(`${component}\u0000${key}`);
            warnings.push(
              `Style key "${key}" on component "${component}": ${prop} takes ${values.join(', ')}, and a theme cannot add a value to it, so "${value}" builds a selector nothing matches.`,
            );
          }
        }
    }
  return [...new Set(warnings)];
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
 * The refusal of an option given an empty or blank value, which names
 * nothing: what to give instead, and the command without it; null for any
 * other value. Stable `theme build` refuses a blank --out with it; the
 * editor's compile refuses an empty or blank --out and --icons-specifier.
 * @param {string} flag
 * @param {unknown} value
 * @param {string} instead
 * @param {string} without the command without the option
 * @returns {AstryxError | null}
 */
export function blankOptionProblem(flag, value, instead, without) {
  if (typeof value !== 'string' || value.trim()) return null;
  return new AstryxError(
    `${flag} is ${value === '' ? 'empty' : 'blank'}; ${instead}. Nothing was written.`,
    [{name: without, reason: 'do this instead'}],
    ERROR_CODES.ERR_INVALID_ARGUMENT,
  );
}

/**
 * The warning for an --icons-specifier given an empty or blank value, which
 * a stable build writes as given (the built module imports its registry
 * from it); null for any other value.
 * @param {unknown} value
 * @returns {string | null}
 */
function blankSpecifierWarning(value) {
  if (typeof value !== 'string' || value.trim()) return null;
  return `--icons-specifier is ${value === '' ? 'empty' : 'blank'}, so the built module imports its icon registry from ${JSON.stringify(value)}, which nothing loads: name the registry module, or leave out --icons-specifier to keep the theme source's own import`;
}

/**
 * Compile a defineTheme file to CSS + CSS .d.ts + JS + JS .d.ts (and an
 * optional `.variants.d.ts`). Performs the writes and returns a `theme.build` receipt,
 * or `null` when the theme produced no CSS (nothing to build). Throws
 * AstryxError (stable code) on failure. Progress is emitted through the shared
 * `logger` (silent by default).
 *
 * @param {string} file - Theme file path, resolved against `cwd`.
 * @param {{out?: string, check?: boolean, iconsSpecifier?: string}} [options] -
 *   `out` overrides the output CSS path, or names the folder for it; `check` compares against on-disk outputs
 *   instead of writing. `iconsSpecifier` overrides the icon registry import
 *   specifier in the generated module (e.g. `./icons.mjs`); when omitted, the
 *   direct registry specifiers from the theme source are emitted unchanged.
 * @param {{cwd?: string, projectCore?: boolean}} [ctx] `projectCore`: only the
 *   project's installed Core (spec AST-081 FR3)
 * @param {{compact?: boolean, trailers?: ThemeBuildTrailer[]}} [report]
 * @param {ThemeBuildHandOff} [handOff] - what the CLI's batch, family, and
 *   scratch builds hand a build; never an option of the public themeBuild.
 * @returns {Promise<any>}
 */
async function themeBuildInternal(
  file,
  options = {},
  {cwd = process.cwd(), projectCore = false} = {},
  report = {},
  handOff = {},
) {
  // A blank --out names no file: the build would write files named by the
  // spaces alone. An empty one writes beside the source, as a build without
  // --out does (the editor's compile refuses both, before it builds).
  if (options.out !== '') {
    const blank = blankOptionProblem(
      '--out',
      options.out,
      'name a file or folder, or leave out --out to write beside the source',
      buildSuggestion(file, {...options, out: undefined}, cwd),
    );
    if (blank) throw blank;
  }
  // A backslash in --out separates folders on every platform, as it does in
  // the other theme paths (a Windows path copied into a POSIX shell).
  if (typeof options.out === 'string' && options.out.includes('\\'))
    options = {...options, out: options.out.replace(/\\/g, '/')};
  const filePath = path.resolve(cwd, file);

  // Core's facts first, before the build reads the theme: kept facts then do
  // not depend on it, and a build after an edit to the theme reads them back.
  await keepCoreThemeFacts(coreSrcPath());

  {
    const problem = buildInputProblem(file, options, cwd);
    if (problem) throw problem;
  }

  // A theme the theme editor made is built from its settings by the editor;
  // a plain build reads its settings module as last written (released CLIs
  // built it, so it still does, and says so).
  {
    const dir = path.dirname(filePath);
    const slug = path.basename(dir);
    if (
      (!handOff.commandWords || handOff.commandWords.group === 'theme') &&
      path.basename(filePath) === `${slug}.theme.ts` &&
      editorThemeRecord(dir)
    )
      (editorFolderListener ?? (w => logger.warn(w)))(
        `Warning: ${path.relative(cwd, filePath)} is a theme the theme editor made (${slug}.settings.json is beside it). This build reads ${slug}.settings.ts as last written; to build it from its settings, run ${formatCliCommand(`experimental theme editor show ${shellWord(slug)}`, cwd)}.${
          // The app imports the theme's app copy, which only the editor's
          // own build writes (and its --check checks): this one neither
          // writes it nor ${options.check ? 'checks' : 'updates'} it.
          fs.existsSync(
            path.join(path.dirname(dir), '..', 'src', 'themes', slug),
          )
            ? ` It ${options.check ? 'does not check' : 'does not write'} the app copy in src/themes/${slug}/, which the app imports; ${formatCliCommand(`experimental theme compile ${shellWord(path.relative(cwd, filePath).split(path.sep).join('/'))}${options.check ? ' --check' : ''}`, cwd)} ${options.check ? 'checks the build and the copy' : 'builds it and writes the copy'}.`
            : ''
        }`,
      );
  }

  assertThemeSourceFile(filePath, cwd, options);

  if (!report.compact) {
    logger.log(`\nBuilding theme from ${path.relative(cwd, filePath)}...`);
  }
  // A compact report has no per-theme heading, and a family's warnings are
  // read together, so each warning names its file.
  const source =
    report.compact || handOff.prepareFamily
      ? `${path.relative(cwd, filePath)}: `
      : '';

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
    handOff.familyInterception ?? standaloneInterception(filePath);

  // Extract theme definition
  let themeDef;
  /** The export actually selected by the loader, not the first AST match. */
  let themeExportName;
  /** The module's other theme exports, which this build leaves out. @type {string[]} */
  let leftOutThemes;
  /** The keys of a default export that holds themes, not a theme. @type {string[]} */
  let defaultHolds;
  /** Stylesheets the source imports that are not there yet. @type {string[]} */
  let unbuiltStylesheets;
  /** Stylesheets the source imports that are there. @type {string[]} */
  let importedStylesheets;
  /** Paths through the load that interception could not fully observe. */
  let loadDegradation;
  /** The one color mode the theme module exports, or null for both. */
  /** @type {['light'] | ['dark'] | null} */
  let colorModes;
  /**
   * The theme file's bytes as loaded: read before and after the load, and the
   * registry scan below reads these rather than the file again. An editor's
   * in-place save truncates before it writes, so a later read can find an
   * empty file the load never saw; a file that changed while it loaded is not
   * built from.
   * @type {string}
   */
  let themeSource;
  try {
    const before = fs.readFileSync(filePath, 'utf8');
    const loaded = await extractThemeDefinition(
      filePath,
      interception,
      handOff.familyLoader,
    );
    const after = fs.readFileSync(filePath, 'utf8');
    if (before !== after || before === '') {
      throw new Error(
        `${filePath} changed while it was loading. Build again once it is saved.`,
      );
    }
    themeSource = before;
    themeDef = loaded.theme;
    themeExportName = loaded.exportName;
    leftOutThemes = loaded.others ?? [];
    defaultHolds = loaded.defaultHolds ?? [];
    unbuiltStylesheets = loaded.unbuiltStylesheets ?? [];
    importedStylesheets = loaded.importedStylesheets ?? [];
    loadDegradation = loaded.degraded;
    colorModes = handOff.colorModes ?? loaded.colorModes ?? null;
    // Every value of the theme is read here, where a getter or Proxy of the
    // module's that throws is a failed load naming the file and the field,
    // never a failure of a check that reads it later.
    readThemeValues(themeDef, filePath);
  } catch (e) {
    const err = /** @type {Error} */ (e);
    const shown = path.relative(cwd, filePath) || filePath;
    // A theme file that is a link and does not load: named with the file it
    // points to (some loaders read its relative imports from the link's
    // folder, others from the file's own), never with Node's require stack.
    // Only an unresolved relative import is about the link; any other
    // failure (a package not installed) keeps its own remedy.
    let link = null;
    try {
      if (
        fs.lstatSync(filePath).isSymbolicLink() &&
        /Cannot find (?:module|package) '\.\.?\//.test(err.message)
      )
        link = fs.realpathSync(filePath);
    } catch {
      link = null;
    }
    const message = err.message
      .replace(/\n+Require stack:(?:\n- [^\n]*)*/, '')
      .split(filePath)
      .join(shown);
    throw new AstryxError(
      link
        ? `${shown} is a link to ${path.relative(cwd, link) || link}, and it could not be loaded (a relative import may be read from the link's folder or from the file's own, depending on the loader); build the file itself: ${message}`
        : message,
      link
        ? [
            {
              // The file itself, with its outputs kept inside the working
              // folder (beside the link) when the file is outside it.
              name: buildSuggestion(
                path.relative(cwd, link) || link,
                {
                  ...options,
                  // The caller's --out, else beside the link when the file
                  // is outside the working folder.
                  out:
                    options.out ??
                    (path.relative(cwd, link).startsWith('..') ||
                    path.isAbsolute(path.relative(cwd, link))
                      ? path
                          .relative(
                            cwd,
                            path.join(
                              path.dirname(filePath),
                              `${path.basename(filePath).replace(/\.[^.]+$/, '')}.css`,
                            ),
                          )
                          .split(path.sep)
                          .join('/')
                      : undefined),
                },
                cwd,
              ),
              reason: 'build the file itself',
            },
          ]
        : themeLoadSuggestions(err, shown, cwd, options),
      ERROR_CODES.ERR_THEME_LOAD,
    );
  }

  // The marker is scoped to that isolated load: drop it before the theme
  // reaches anything that reads or writes it. (Symbol keys are invisible to
  // JSON.stringify and Object.keys, so it could not reach output regardless.)
  // Both reads happen BEFORE the strip, which is what removes the evidence.
  const ancestryObserved =
    !handOff.prepareFamily ||
    !interception ||
    interception.observed(themeDef) ||
    Object.hasOwn(themeDef, 'extends');
  if (handOff.prepareFamily && interception) interception.retain(themeDef);
  const sourceParent =
    handOff.prepareFamily && interception
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
    const shown = path.relative(cwd, filePath);
    throw new AstryxError(
      `Theme "${themeDef.name ?? path.basename(filePath)}" in ${shown} is a plain object, so a family build cannot see which theme it extends. A family member is made with defineTheme(...) from @astryxdesign/core/theme; build a plain-object theme on its own.`,
      [
        {
          name: buildSuggestion(shown, options, cwd),
          reason: 'build this theme on its own',
        },
      ],
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
  const standaloneIcons = !handOff.prepareFamily;
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
  // Names the slot values, their static view, and their merge function take
  // in the built module.
  const componentIconNames = [
    `${toIdentifier(themeDef.name)}ThemeComponentIconValues`,
    `${toIdentifier(themeDef.name)}ThemeComponentIconView`,
    `${toIdentifier(themeDef.name)}ThemeMergeComponentIcons`,
  ];
  const iconResolution = {
    readSource: (/** @type {string} */ file) =>
      path.resolve(file) === path.resolve(filePath)
        ? themeSource
        : fs.readFileSync(file, 'utf8'),
    resolveModule: resolveThemeModule,
    reservedNames: [...reservedNames(functionEntries), ...componentIconNames],
    functionEntries,
    rawInput: 'extends' in themeDef,
    hasIcons:
      Object.keys(themeDef.icons ?? {}).length > 0 ||
      Object.keys(themeDef.extends?.icons ?? {}).length > 0,
  };
  let iconInfo = standaloneIcons
    ? await resolveIconImports(filePath, themeExportName, iconResolution)
    : null;
  /** @type {import('./icon-imports.mjs').IconImports | null} */
  let componentIconInfo = null;

  // A null part or style key: Core throws on it, so it is refused before
  // anything is written, at the line that gives it. A null value keeps its
  // meaning (Core writes it as it is), so it is warned at its line.
  const shownSource = path.relative(cwd, filePath) || filePath;
  // A value the theme this one extends gives, and this file does not write,
  // is that theme's: it is named as inherited, and a family leaves it to
  // that theme's own member, which names its file and line.
  const parentTheme = themeDef.extends ?? interception?.parentOf(themeDef);
  // The files of the themes this source extends, to name the file and line
  // that write a value this file does not.
  const extendedSources = extendedThemeSources(filePath, themeSource);
  /** @param {any} value @param {string[]} keys */
  const valueAt = (value, keys) =>
    keys.reduce(
      (/** @type {any} */ v, k) =>
        v !== null && typeof v === 'object' ? v[k] : undefined,
      value,
    );
  /**
   * @template {{path: string[]}} T
   * @param {T[]} items
   * @returns {Array<T & {line: number | null, inherited: boolean, elsewhere: boolean, from: {file: string, line: number} | null}>}
   */
  const placed = items =>
    items.flatMap(item => {
      const line = keyPathLine(themeSource, item.path, filePath);
      /** @type {{file: string, line: number} | null} */
      let from = null;
      if (line == null)
        for (const base of extendedSources) {
          const at = keyPathLine(base.source, item.path, base.file);
          if (at == null) continue;
          from = {file: path.relative(cwd, base.file) || base.file, line: at};
          break;
        }
      // From the theme it extends only when that theme holds this very
      // value: a resolved base holds every token, so holding the path alone
      // says nothing.
      const inherited =
        line == null &&
        (from != null ||
          (parentTheme != null &&
            valueAt(parentTheme, item.path) !== undefined &&
            Object.is(
              valueAt(parentTheme, item.path),
              valueAt(themeDef, item.path),
            )));
      return inherited && handOff.prepareFamily
        ? []
        : [{...item, line, inherited, elsewhere: line == null, from}];
    });
  const nulls = placed(nullThemeValues(themeDef));
  /** @param {{path: string[], why: string, line: number | null, inherited?: boolean, elsewhere?: boolean, from?: {file: string, line: number} | null, at?: {file: string, line: number} | null}} n */
  const nullLine = n =>
    `${n.path.join('.')}${n.line != null ? ` (line ${n.line})` : n.at ? ` (in ${n.at.file}, line ${n.at.line})` : n.from ? ` (in ${n.from.file}, line ${n.from.line}, the theme it extends)` : n.inherited ? ' (from the theme it extends)' : n.elsewhere ? ` (not written in this file as it is: computed in it, or from ${parentTheme != null ? '' : 'the theme it extends or '}a module it imports)` : ''}: ${n.why}`;
  const unbuildable = nulls.filter(n => n.unbuildable);
  if (unbuildable.length > 0) {
    const first = unbuildable.find(n => n.line != null);
    throw new AstryxError(
      `${shownSource} ${unbuildable.every(n => n.inherited || n.elsewhere) ? 'gets, from another file,' : 'gives'} null where the build reads a block: ${unbuildable.map(nullLine).join('; ')}. Nothing was written.`,
      first
        ? [
            {
              name: `sed -n ${first.line}p ${quoteCommandArgument(shownSource)}`,
              reason: 'see the line that gives it',
            },
          ]
        : undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }

  // A part key Core cannot build as written: a pseudo key that is no single
  // selector makes the browser drop other rules or style other elements,
  // and a custom property with capitals is set under another name than
  // var() reads. A theme that built before still builds the same: each is
  // warned at its line, with the form that works.
  const badKeys = placed(styleKeyProblems(themeDef));
  // A value Core writes as it is but no browser reads (an object, a pair
  // with a missing half, a token that reads itself or a var() no token
  // sets): warned at its line, the output the same. A var() target is judged
  // only against the Core that names its tokens.
  const tokenDefaults = _coreThemeModule?.tokenDefaults;
  const setNames = new Set([
    ...Object.keys(tokenDefaults ?? {}),
    ...[
      themeDef,
      themeDef.onDark ?? themeDef.__onDark,
      themeDef.onLight ?? themeDef.__onLight,
    ].flatMap((/** @type {any} */ s) => [
      ...Object.keys(s?.tokens ?? {}),
      ...Object.keys(s?.localTokens ?? {}),
    ]),
  ]);
  const badValues = writtenValueProblems(themeDef, {
    reads: tokenDefaults ? name => setNames.has(name) : undefined,
    rootTokens: tokenDefaults,
    surfaceDefaults: coreSurfaceTokens(),
  });
  const badValueLines = placed(badValues);
  const cannotWrite = badValueLines.filter(n => n.unbuildable);
  if (cannotWrite.length > 0) {
    const first = cannotWrite.find(n => n.line != null);
    throw new AstryxError(
      `${shownSource} gives a value the build cannot write: ${cannotWrite.map(nullLine).join('; ')}. Nothing was written.`,
      first
        ? [
            {
              name: `sed -n ${first.line}p ${quoteCommandArgument(shownSource)}`,
              reason: 'see the line that gives it',
            },
          ]
        : undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  // defineTheme() drops a field it does not take, so only the source shows
  // a misspelled one.
  const fields = coreInputFields();
  const badFields = fields
    ? sourceFieldProblems(
        {file: filePath, source: themeSource},
        fields,
        (from, specifier) => {
          try {
            const file = resolveThemeModule(specifier, from);
            return {file, source: fs.readFileSync(file, 'utf8')};
          } catch {
            return null;
          }
        },
      ).map(f => ({
        path: f.path,
        why: f.why,
        line: f.file === filePath ? f.line : null,
        at:
          f.file === filePath || f.line == null
            ? null
            : {file: path.relative(cwd, f.file) || f.file, line: f.line},
        inherited: false,
        elsewhere: false,
        from: null,
      }))
    : [];
  // A field the source reader cannot place (the theme reached through a
  // member, an array element, a call) is judged on the input itself, the
  // one defineTheme reads, and named without a line: never dropped.
  const loadedInput =
    interception?.inputOf(themeDef) ??
    (isDefinedTheme(themeDef) ? null : themeDef);
  if (fields && loadedInput) {
    const placed = new Set(badFields.map(f => f.path.join('.')));
    for (const f of inputFieldProblems(loadedInput, fields))
      if (!placed.has(f.path.join('.')))
        badFields.push({
          path: f.path,
          why: f.why,
          line: null,
          at: null,
          inherited: false,
          elsewhere: false,
          from: null,
        });
  }
  // A typography value Core builds into something no browser uses (a font
  // stack in one family, a quoted name with a space, a role weight with no
  // type scale), or of a type the field does not take (a weight as a
  // number): warned at its line, as the editor refuses it. Only what
  // this file writes: a theme it extends is judged in its own file. A build
  // that loads the project's own Core captures no input: the values the
  // source writes are read from it.
  // A build that loads the project's own Core also judges the typography
  // the theme resolved to, which holds a value the source computes or
  // imports (a family joined at run time).
  const levels = fields?.levels ?? [];
  const typographyInput =
    interception?.inputOf(themeDef)?.typography ??
    // A plain-object theme is its own input.
    themeDef.typography ??
    sourceTypography(themeSource, filePath);
  /** @type {Map<string, {path: string[], why: string, value: unknown}>} */
  const typographyProblems = new Map();
  for (const t of [
    ...typographyInputProblems(typographyInput, levels),
    ...(interception
      ? []
      : typographyInputProblems(themeDef.__axes?.typography, levels)),
  ])
    if (!typographyProblems.has(t.path.join('.')))
      typographyProblems.set(t.path.join('.'), t);
  // Each at the line that writes it: its whole key path, a shorter one (a
  // typography const), or its key beside that value (a role const, a
  // spread); a value no line writes is named without one, never dropped.
  const badTypography = [...typographyProblems.values()].map(t => {
    let line = null;
    for (let i = 0; line == null && i < t.path.length - 1; i += 1)
      line = keyPathLine(themeSource, t.path.slice(i), filePath);
    line ??= keyValueLine(themeSource, t.path.at(-1) ?? '', t.value, filePath);
    return {...t, line, inherited: false, elsewhere: line == null, from: null};
  });

  // A radius scale missing a field builds every scaled corner as NaNpx:
  // warned at its line, as the editor refuses it.
  const radiusInput =
    interception?.inputOf(themeDef)?.radius ??
    // A plain-object theme is its own input.
    (isDefinedTheme(themeDef) ? undefined : themeDef.radius) ??
    sourceInputField(themeSource, filePath, 'radius');
  const badRadius = radiusInputProblems(radiusInput).map(t => {
    const line =
      keyPathLine(themeSource, t.path, filePath) ??
      keyPathLine(themeSource, ['radius'], filePath);
    return {...t, line, inherited: false, elsewhere: line == null, from: null};
  });

  // Validate component overrides
  // The style keys that build a selector nothing matches (warned below):
  // no setting of theirs, and none they hold, takes part in which shows.
  /** @type {Set<string>} */
  const deadKeys = new Set();
  const warnings = await validateComponentOverrides(themeDef, deadKeys);
  /** @type {string[]} */
  const warningMessages = [];
  /** Advisories about a correct theme — see the `notices` note on the receipt. */
  const noticeMessages = [];
  /** @type {Array<import('./setting-effects.mjs').SettingIssueEntry & {line: number | null}>} */
  const settingIssues = [];
  const blankSpecifier = handOff.prepareFamily
    ? null
    : blankSpecifierWarning(options.iconsSpecifier);
  for (const w of [
    ...warnings,
    ...(blankSpecifier ? [blankSpecifier] : []),
    // A file of two themes and no default: one is built, and the other is
    // named, with the way to build it.
    ...(leftOutThemes.length || defaultHolds.length
      ? [
          `${
            defaultHolds.length
              ? `has a default export that holds themes (${defaultHolds.join(', ')}), not a theme, and exports ${leftOutThemes.length + 1} ${leftOutThemes.length ? 'themes' : 'theme'} by name`
              : `exports ${leftOutThemes.length + 1} themes and no default`
          } (${[themeExportName, ...leftOutThemes].join(', ')}), and this build builds ${themeExportName} only: export default the theme to build, or give each theme its own file`,
        ]
      : []),
    ...nulls.filter(n => !n.unbuildable).map(nullLine),
    ...badKeys.map(nullLine),
    ...badValueLines.map(nullLine),
    ...badTypography.map(nullLine),
    ...badRadius.map(nullLine),
    ...badFields.map(nullLine),
  ]) {
    // The source reader and the loaded value can name one field alike.
    if (warningMessages.includes(w)) continue;
    warningMessages.push(w);
    logger.warn(`  [warn] ${source}${w}`);
  }

  // A theme that sets a private var directly is refused before anything is
  // written (a --check too): it is not a theme the build accepts, so no
  // output, receipt or success may say otherwise.
  // The message names no file: a batch and a family name the one it is
  // about, and a single build is about the file it was given.
  const privateVarErrors = validatePrivateVars(themeDef, {
    defineTheme: _defineTheme,
  });
  if (privateVarErrors.length > 0) {
    const refusal = new AstryxError(
      `${privateVarErrors.join('\n')}\n${privateVarErrors.length} private var error(s). Use standard CSS properties instead.`,
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
    Object.defineProperty(refusal, PRIVATE_VAR_REFUSAL, {value: true});
    throw refusal;
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
    // A theme defineTheme() made carries the surface data it adds (the
    // `__onDark` key, set even when it is empty) or a built module's mark;
    // any other object is raw input, a plain `{name, tokens}` included: only
    // defineTheme() turns a [light, dark] pair into light-dark() and adds
    // Core's media-surface rules. A theme with no tokens is raw input too,
    // whatever it carries (a resolved theme always has its tokens).
    const resolved = isDefinedTheme(themeDef);
    // A base the source imports and extends that resolved to nothing (an
    // export the package does not have) is refused naming it, never built as
    // a theme with no base.
    if (
      !resolved &&
      Object.hasOwn(themeDef, 'extends') &&
      themeDef.extends === undefined
    ) {
      const base = themeBaseBinding(filePath, themeExportName);
      const written =
        base?.importPath !== undefined
          ? {importPath: base.importPath, exportName: base.exportName}
          : null;
      if (written)
        throw new AstryxError(
          `Theme "${themeDef.name}" extends ${written.exportName} from '${written.importPath}', which is undefined: '${written.importPath}' does not export ${written.exportName}, so the theme would build without its base. Import the base theme that package exports, or install the version that exports ${written.exportName}.`,
          undefined,
          ERROR_CODES.ERR_THEME_LOAD,
        );
    }
    const needsResolution =
      !resolved ||
      INPUT_ONLY_FIELDS.some(field => themeDef[field] !== undefined) ||
      ('localTokens' in themeDef && themeDef.__localTokenLineage === undefined);
    if (needsResolution) {
      try {
        resolvedTheme = _defineTheme(defineThemeInput(themeDef));
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
        reservedNames: [
          ...reservedNames(resolvedFunctionEntries),
          ...componentIconNames,
        ],
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

    // A slot function cannot be serialized, so the module imports it from
    // where the theme source does. Static slot values are written as JSON.
    if (
      standaloneIcons &&
      hasFunctionIconEntry(themeComponentIcons(resolvedTheme))
    ) {
      componentIconInfo = await resolveIconImports(filePath, themeExportName, {
        ...iconResolution,
        field: 'componentIcons',
        mergeName: `${toIdentifier(themeDef.name)}ThemeMergeComponentIcons`,
        hasIcons: true,
        functionEntries: true,
        reservedNames: [
          ...reservedNames(true),
          ...componentIconNames,
          ...(iconInfo?.imports.map(binding => binding.localName) ?? []),
          ...(iconInfo ? [iconInfo.exportName] : []),
        ],
      });
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

    // Core writes a BigInt it meets as a value as its digits, but a BigInt
    // inside an object it writes as JSON text throws: it gets the digits
    // too. A boxed primitive in a part would be written as JSON text (with
    // its quotes), where a token writes its text: it gets its primitive.
    resolvedTheme = writtenPrimitives(resolvedTheme);

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
    // A setting the browser never shows as written: another rule of the
    // theme layer reaching the same element sets the same property and
    // wins there (a shorthand after the setting, a more specific rule of
    // the theme it extends, two situations whose order decides). Read from
    // the rules just generated; a declaration is the theme's when its
    // source, or a local theme it extends, writes it. Warned at its line,
    // with the change that makes it show; the output is the same.
    const writtenIn = [
      {file: filePath, source: themeSource},
      ...extendedSources,
    ].map(s => ({file: s.file, lineOf: keyPathIndex(s.source, s.file)}));
    // The rules of the theme it extends, generated once when first asked.
    const blocks = blockPaths(
      resolvedTheme.components,
      components =>
        _generateThemeRulesSplit(
          _defineTheme({name: resolvedTheme.name, components}),
          [],
        ).component,
    );
    for (const entry of settingIssueEntries(
      settingEffectIssues(
        component,
        at => {
          for (const [layer, {lineOf}] of writtenIn.entries())
            for (const keys of declarationPaths(at, blocks))
              if (lineOf(keys, {fromRoot: true}) != null)
                return {path: keys, layer};
          return null;
        },
        {
          skip: at =>
            declarationPaths(at, blocks).some(p =>
              deadKeys.has(`${p[1]}\u0000${p[2]}`),
            ),
        },
      ),
    )) {
      // At its line in the theme's file, or in the local theme it extends
      // that writes it (a family member's included).
      const writer = writtenIn.find(
        w => w.lineOf(entry.path, {fromRoot: true}) != null,
      );
      const line = writer?.lineOf(entry.path, {fromRoot: true}) ?? null;
      const file =
        writer && writer.file !== filePath
          ? path.relative(cwd, writer.file) || writer.file
          : null;
      const placedEntry = {...entry, line, ...(file ? {file} : {})};
      const w = `${entry.message}${settingIssueLocation(placedEntry)}. Fix: ${entry.fix}.`;
      settingIssues.push(placedEntry);
      warningMessages.push(w);
      logger.warn(`  [warn] ${source}${w}`);
    }
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

    // A theme with light-dark() values pins the scheme where html forces a
    // mode (a Theme's mode, or the host's data-theme). Inspect root and
    // rule-owned values, not generated CSS, which also carries
    // theme-independent data-token defaults with light-dark().
    const themeOwnValues = JSON.stringify(
      [
        resolvedTheme.tokens ?? {},
        resolvedTheme.localTokens ?? {},
        resolvedTheme.components ?? {},
        ...(resolvedTheme.__adaptationRules ?? []).flatMap(
          (
            /** @type {{tokens?: Record<string, string>, localTokens?: Record<string, string>, components?: object}} */ rule,
          ) => [
            rule.tokens ?? {},
            rule.localTokens ?? {},
            rule.components ?? {},
          ],
        ),
      ],
      bigIntAsText,
    );
    // A theme follows the page's scheme: it pins the scheme only where the
    // page or the Theme provider forces a mode (`data-theme` on html).
    // Following the reader's device is the page's own choice, made by
    // reset.css or the app's own `color-scheme` on html, never by a theme.
    const colorSchemeDecl =
      themeOwnValues.includes('light-dark(') ||
      adaptationCss.component.includes('light-dark(')
        ? '  html[data-theme="light"] { color-scheme: light; }\n  html[data-theme="dark"] { color-scheme: dark; }\n\n'
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
  // What `--check` prints to rebuild, from the working folder.
  // The project's own invocation, each path quoted for the shell.
  const rebuildCommand = formatCliCommand(
    [
      'theme',
      'build',
      sourceRelative,
      ...(options.out
        ? ['--out', path.relative(cwd, path.resolve(cwd, options.out))]
        : []),
    ]
      .map(shellWord)
      .join(' '),
    cwd,
  );
  // Stable provenance recorded in @generated headers — versions, not a
  // timestamp, so identical inputs produce byte-identical output.
  const versions = resolveToolVersions(cwd);

  // Derive the default CSS name from the theme name so .css/.js/.d.ts
  // share one scheme; an explicit --out still wins.
  const baseName = themeDef.name;
  // Every write stays inside cwd. A CLI-internal caller that renders into a
  // scratch directory it creates and removes names that directory instead.
  const writeRoot = handOff.writeRoot ?? cwd;
  let outPath;
  if (options.out) {
    // A leading ~ reaches the build only when the shell did not expand it
    // (quoted, or from a script or a config): it names a folder called ~
    // in the project, never the home folder. The build writes there, as it
    // always has, and says so.
    if (/^~(?:[\\/]|$)/.test(options.out)) {
      const rest = options.out.replace(/^~[\\/]*/, '');
      const w = `--out ${options.out} starts with "~", which is not your home folder here: a shell expands ~ only when it is not quoted, so the build writes in a folder named ~ in the project (${path.join(cwd, '~', rest)}). To write in the home folder, give it in full (${path.join(os.homedir(), rest)}).`;
      warningMessages.push(w);
      logger.warn(`Warning: ${w}`);
    }
    outPath = path.resolve(cwd, options.out);
    // A folder, or a path that ends in a separator, names where the outputs
    // go: write `<folder>/<name>.css`, never a file named like the folder.
    if (/[\\/]$/.test(options.out) || isDirectorySync(outPath)) {
      outPath = path.join(outPath, `${baseName}.css`);
    }
    // The stylesheet is CSS whatever its name; a name that does not end in
    // .css still builds, and the module's import names the file as written.
    // The name's extension is what follows its last dot, a leading one too:
    // `.css` is a name with no stem, which writes hidden files.
    const file = path.basename(outPath);
    // A name of another kind of file a stylesheet has never names the
    // stylesheet: a TypeScript declaration file (`p.css.d.ts`, where CSS
    // breaks every TypeScript file that imports the stylesheet) or a source
    // map (`p.css.map`, which bundlers and devtools read as JSON).
    const otherKind = /\.d\.[cm]?ts$/i.test(file)
      ? {
          suffix: /(?:\.css)?\.d\.[cm]?ts$/i,
          what: 'a TypeScript declaration file, where a build writes types',
        }
      : /\.css\.map$/i.test(file)
        ? {
            suffix: /\.css\.map$/i,
            what: "a stylesheet's source map, which bundlers and devtools read as JSON",
          }
        : null;
    if (otherKind) {
      const fixed = path
        .join(
          path.dirname(options.out),
          `${file.replace(otherKind.suffix, '') || baseName}.css`,
        )
        .split(path.sep)
        .join('/');
      throw new AstryxError(
        `--out ${options.out} names ${otherKind.what}, not the stylesheet. --out names the .css file, such as ${fixed}. Nothing was written.`,
        [
          {
            name: buildSuggestion(
              path.relative(cwd, filePath),
              {iconsSpecifier: options.iconsSpecifier, out: fixed},
              cwd,
              handOff.commandWords,
            ),
            reason: 'the same build, naming the stylesheet',
          },
        ],
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    const dot = file.lastIndexOf('.');
    const ext = dot < 0 ? '' : file.slice(dot).toLowerCase();
    // `p.css.bak` slips a suffix after the stylesheet's name: its stem is p.
    const stem = (dot < 0 ? file : file.slice(0, dot))
      .replace(/\.d$/, '')
      .replace(/\.css$/i, '');
    if (ext !== '.css' || !stem) {
      const fixed = path
        .join(path.dirname(options.out), `${stem || baseName}.css`)
        .split(path.sep)
        .join('/');
      // The result's warnings say it too, as text does.
      const w = stem
        ? `--out names the stylesheet, which is CSS; give it a .css name such as ${fixed}.`
        : `--out names a stylesheet with no name before .css, which writes hidden files; give it a name such as ${fixed}.`;
      warningMessages.push(w);
      logger.warn(`Warning: ${w}`);
    }
    // A build keeps the explicit output inside the write root, relative or
    // absolute. Check mode writes nothing, so it refuses only a relative path
    // that escapes cwd.
    if (!options.check || !path.isAbsolute(options.out)) {
      confineOutput(outPath, writeRoot, OUT_REMEDY, options.out);
    }
  } else {
    outPath = path.join(path.dirname(filePath), `${baseName}.css`);
  }
  // A stylesheet the source imports that is not there yet loads empty only
  // when it is the stylesheet this build writes (an app importing the source
  // gets its CSS); any other is a missing file, refused before anything is
  // written.
  // A family member's are judged by the family build, which knows the
  // family's stylesheet.
  if (!handOff.prepareFamily)
    refuseMissingStylesheets(
      filePath,
      unbuiltStylesheets,
      outPath,
      cwd,
      options,
    );
  // A stylesheet the source imports for its side effect (`import
  // './brand.css'`) loads empty, and the outputs do not carry it: said, so
  // the app imports it beside the theme's stylesheet.
  // Each is named as an app writes its import: a package stylesheet by the
  // specifier the source wrote, a file of the project by its path.
  for (const shown of carriedStylesheets(
    filePath,
    themeSource,
    importedStylesheets,
    outPath,
    cwd,
  )) {
    const w = `${path.relative(cwd, filePath) || filePath} imports ${shown}, which the built outputs do not carry (a theme's module and stylesheet hold only the theme): import it in your app beside ${path.relative(cwd, outPath) || outPath}.`;
    warningMessages.push(w);
    logger.warn(`Warning: ${w}`);
  }
  // The header names the source and command from the project root of the
  // outputs, so a build from any folder writes the same bytes, `--check`
  // agrees with it, and a later build reads the source back exactly.
  const headerBase = headerRoot(path.dirname(outPath), cwd);
  const headerSource = headerPath(headerBase, filePath);
  const buildCommand = `astryx theme build ${headerSource}${options.out ? ' --out ' + headerPath(headerBase, outPath) : ''}`;

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
    ? generatedHeader(headerSource, 'ts', buildCommand, versions) + variantDecl
    : null;

  // Generate all file contents in memory first. The main .d.ts references
  // the variants file (when present) via a triple-slash directive so
  // importing the theme also loads the custom-variant augmentations.
  const cssContent =
    generatedHeader(headerSource, 'css', buildCommand, versions) + css;
  const cssDtsContent =
    generatedHeader(headerSource, 'ts', buildCommand, versions) +
    'export {};\n';
  // The theme's local modules the built module carries by import (an icon
  // registry, a slot value, their helpers) are compiled to JavaScript in the
  // build's own modules folder when they are TypeScript or JSX, and every
  // local import names its file: the module loads in any bundler and in
  // plain Node.
  const local = handOff.prepareFamily
    ? null
    : selfContainedInfos(iconInfo, componentIconInfo, {
        sourceFile: filePath,
        outDir,
        // Named after the module, which --out does not rename, so a rebuild
        // to the theme's own name (as integration verify does) writes the
        // same imports.
        modulesDir: modulesFolder(outDir, baseName),
        cwd,
        header: file =>
          generatedHeader(
            headerPath(headerBase, file),
            'js',
            buildCommand,
            versions,
          ),
        iconsSpecifier: options.iconsSpecifier,
      });
  // A family member's module is generated by themeBuildFamily, which carries
  // its registries and slot functions through the family's own imports.
  const jsContent = handOff.prepareFamily
    ? ''
    : generatedHeader(headerSource, 'js', buildCommand, versions) +
      generateBuiltModule(
        resolvedTheme || themeDef,
        local?.iconInfo ?? iconInfo,
        options.iconsSpecifier,
        {
          componentIconInfo: local?.componentIconInfo ?? componentIconInfo,
          // The module's usage comment names the stylesheet this build
          // writes beside it, whatever --out names it.
          cssFileName: path.basename(outPath),
        },
      ) +
      // The one color mode, beside the theme export (a two-mode theme
      // exports none, so its module is unchanged).
      (colorModes
        ? `export const colorModes = [${JSON.stringify(colorModes[0])}];\n`
        : '');
  // A relative registry or slot import is written as the theme source
  // spells it: an app can put the compiled module beside the outputs. With
  // the outputs in another folder (--out), one that nothing there answers to
  // is said, with the import that names the source's own file from there.
  if (!handOff.prepareFamily && path.resolve(outDir) !== path.dirname(filePath))
    for (const spec of new Set(
      [
        ...((local?.iconInfo ?? iconInfo)?.imports ?? []),
        ...((local?.componentIconInfo ?? componentIconInfo)?.imports ?? []),
      ]
        .filter(
          binding =>
            !(
              options.iconsSpecifier !== undefined &&
              binding.importPath === iconInfo?.iconsSpecifierImportPath &&
              binding.localName === iconInfo?.iconsSpecifierLocalName
            ),
        )
        .map(binding => binding.importPath)
        .filter(spec => spec.startsWith('./') || spec.startsWith('../')),
    )) {
      // A compiled module this build writes answers to its import.
      if (
        local?.writes.some(
          write => path.resolve(outDir, spec) === path.resolve(write.dest),
        ) ||
        moduleAnswers(outDir, spec)
      )
        continue;
      const there = rebasedImport(spec, path.dirname(filePath), outDir);
      const registry = spec === iconInfo?.iconsSpecifierImportPath;
      const w = `${path.relative(cwd, jsPath)} imports '${spec}' as the theme source writes it, and nothing answers to it from ${path.relative(cwd, outDir) || '.'}/, so the built module does not load there: ${registry ? `give --icons-specifier '${there}' (the registry, from there)` : `the module is '${there}' from there`}, or put the compiled module there`;
      warningMessages.push(w);
      logger.warn(`  [warn] ${source}${w}`);
    }
  const dtsContent =
    generatedHeader(headerSource, 'ts', buildCommand, versions) +
    generateBuiltTypes(resolvedTheme || themeDef, iconInfo, variantsFileName) +
    (colorModes
      ? `export declare const colorModes: readonly [${JSON.stringify(colorModes[0])}];\n`
      : '');

  // A family the caller knows the app loads (a font stylesheet it writes
  // for the theme) is not named as unloaded.
  const unloadedFonts = [
    ...new Set([
      ...collectUnloadedFonts(resolvedTheme),
      ...adaptationRuleValues(resolvedTheme).flatMap(
        (/** @type {any} */ value) =>
          collectUnloadedFonts(value, resolvedTheme),
      ),
    ]),
  ].filter(family => !handOff.loadedFonts?.(family));

  if (handOff.prepareFamily) {
    return {
      filePath,
      exportName: themeExportName,
      sourceRelative: sourceRelative.split(path.sep).join('/'),
      theme: displayTheme,
      sourceTheme: themeDef,
      sourceParent,
      iconInfo: extractRegistryInfo(filePath, 'icons'),
      indicatorInfo: extractRegistryInfo(filePath, 'indicators'),
      componentIconInfo: extractRegistryInfo(filePath, 'componentIcons'),
      variantDecl,
      css: cssPlan,
      versions,
      tokenCount,
      componentCount,
      warnings: warningMessages,
      settingIssues,
      unloadedFonts,
      unbuiltStylesheets,
    };
  }

  const writes = [
    {dest: outPath, content: cssContent},
    {dest: cssDtsPath, content: cssDtsContent, warnWhenMissing: true},
    {dest: jsPath, content: jsContent},
    {dest: dtsPath, content: dtsContent},
  ];
  if (variantDtsPath && variantContent) {
    writes.push({dest: variantDtsPath, content: variantContent});
  }
  writes.push(...(local?.writes ?? []));
  for (const w of local?.warnings ?? []) {
    warningMessages.push(w);
    logger.warn(`Warning: ${w}`);
  }

  // A named pipe, a device or a socket where an output goes is never read
  // or replaced: an open of one can wait for good. A check refuses it too.
  for (const write of writes) {
    const kind = irregularFileKind(write.dest);
    if (kind && kind !== 'a folder')
      throw new AstryxError(
        `${path.relative(cwd, write.dest) || write.dest} is ${kind}, not a file, so the build neither reads nor replaces it: remove it, then build again. Nothing was written.`,
        undefined,
        ERROR_CODES.ERR_FILE_EXISTS,
      );
  }

  // Every output a build writes stays inside cwd, including the defaults
  // beside the theme file. Check mode writes nothing, so it compares outputs
  // outside cwd read-only.
  if (!options.check) {
    confineOutputs(writes, writeRoot, options.out ? OUT_REMEDY : SOURCE_REMEDY);
    // This write build with another --out, or none: its --icons-specifier
    // kept, quoted for the shell.
    const rerun = (/** @type {string | null} */ out) =>
      buildSuggestion(
        path.relative(cwd, filePath),
        {iconsSpecifier: options.iconsSpecifier, out: out ?? undefined},
        cwd,
      );
    // Beside the source or at a path --out names, only build outputs are
    // replaced: a file of the user's own of the same name is kept. A caller
    // that owns the output folder (the theme editor) repairs it instead.
    assertOutputsReplaceable(writes, filePath, cwd, {
      claimed: handOff.claimedOutputs,
      rerun,
      refuseUnmarked: !handOff.ownsOutputs,
      // At the default paths the build always replaced what was there, so an
      // output of the CLI before it was named Astryx is still its own; a path
      // --out names keeps its released rule (the current mark only).
      acceptLegacy: !options.out,
      onEditorFolder: editorFolderListener ?? undefined,
      // The result's warnings carry what text prints.
      onWarning: message => warningMessages.push(message),
    });
  }

  // Check mode: compare generated content against what's on disk instead of
  // writing. A file is "stale" if it's missing or its content differs once the
  // volatile @generated `Command:` line is ignored. Returns a
  // receipt listing stale/missing outputs so callers (CI) can fail on drift.
  if (options.check) {
    const stale = staleBuildOutputs(writes, cwd);
    const upToDate = stale.length === 0;
    const checkedLine = `  checked: ${checkedBuildOutputs(writes, cwd).join(', ')}`;
    if (upToDate) {
      logger.log(`\n[ok] Theme outputs are up to date with ${sourceRelative}.`);
      logger.log(checkedLine);
    } else {
      logger.error(
        `\n[fail] ${stale.length} theme output(s) are out of date with ${sourceRelative}:`,
      );
      logger.error(checkedLine);
      for (const s of stale) {
        logger.error(
          `  ${s.reason === 'missing' ? 'missing' : 'stale'}: ${s.path}`,
        );
      }
      // prettier-ignore
      const remedy = outsideCheckRemedy(writes, [filePath], writeRoot, relative => [relative(filePath), ...(options.out ? ['--out', relative(outPath)] : []), ...(options.iconsSpecifier ? ['--icons-specifier', options.iconsSpecifier] : [])]);
      if (remedy) logger.error(`\n  ${remedy.join('\n  ')}`);
      else
        logger.error(
          `\n  Rebuild with: ${rebuildLine(rebuildCommand, handOff.commandWords)}`,
        );
    }
    warnMissingDeclarations(writes, cwd);
    return /** @type {import('../theme.type.mjs').ThemeBuildCheckResponse} */ ({
      type: 'theme.build.check',
      data: {
        name: themeDef.name,
        upToDate,
        stale,
        checked: checkedBuildOutputs(writes, cwd),
        // The code a stale check exits 1 with, for --json callers.
        ...(upToDate ? {} : {code: ERROR_CODES.ERR_THEME_STALE}),
        // A check reads the settings a build would warn about, so a check
        // (`astryx doctor`, an editor) can say them without writing.
        ...(settingIssues.length ? {settingIssues} : {}),
      },
    });
  }

  // A batch publishes every theme's outputs after all of them are built, so
  // two themes that build the same files are refused before either writes.
  if (handOff.deferredWrites) handOff.deferredWrites.push(writes);
  else writeBuildOutputs(writes);
  for (const write of writes) {
    handOff.claimedOutputs?.set(outputKey(write.dest), sourceRelative);
  }

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

  // From the outputs' project root, whatever folder the build ran in: the
  // snippet is relative to a file in that project's src/.
  const relOutDir = path.relative(headerRoot(outDir, cwd), outDir) || '.';
  const jsImport = importSpecifier(relOutDir, baseName);
  const cssImport = importSpecifier(relOutDir, path.basename(outPath));
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
  // The result names the recipe's command bare, as every machine-read
  // command is; the printed note starts it the way this project runs the CLI.
  /** @param {string} family @param {string} recipe */
  const fontNotice = (family, recipe) =>
    handOff.fontHelp?.notice(family) ??
    `Font "${family}" is named by this theme but not loaded; add a <link> or @font-face in your app (recipe: ${recipe})`;
  /** @type {string[]} */
  const fontNotices = [];
  for (const family of unloadedFonts) {
    noticeMessages.push(fontNotice(family, 'astryx docs typography'));
    fontNotices.push(
      fontNotice(family, formatCliCommand('docs typography', cwd)),
    );
  }

  /** @type {ThemeBuildTrailer} */
  const trailer = {
    themeName: themeDef.name,
    exportName,
    jsImport,
    cssImport,
    unloadedFonts,
    fontNotices,
    fontHelp: handOff.fontHelp ?? null,
    install: handOff.install ?? null,
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
      settingIssues,
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
 * @property {string[]} fontNotices One notice per unloaded font family, as printed.
 * @property {FontHelp | null} [fontHelp] How the caller loads fonts, when it does.
 * @property {string | null} [install] How the app takes the theme, when the
 *   caller wires it another way than importing these outputs (the editor's
 *   app copy).
 */

/**
 * Print a standalone build's install snippet and font guidance.
 * @param {ThemeBuildTrailer} trailer
 */
function printBuildTrailer(trailer) {
  if (trailer.install) logger.log(`\n${trailer.install}\n`);
  else
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
    logger.log(
      formatFontLoadingHelp(
        trailer.themeName,
        trailer.unloadedFonts,
        trailer.fontHelp?.recipe,
      ),
    );
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
  // A theme the caller wires another way says how, once each.
  for (const trailer of trailers)
    if (trailer.install) logger.log(`\n${trailer.install}\n`);
  const imported = trailers.filter(trailer => !trailer.install);
  const [first] = imported;
  if (first)
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
  if (imported.length > 1) {
    logger.log('Each built theme imports the same way:');
    for (const trailer of imported) {
      logger.log(
        `  import { ${trailer.exportName} } from '${trailer.jsImport}'; import '${trailer.cssImport}';`,
      );
    }
  }
  const fonts = groupUnloadedFonts(trailers);
  // One caller's recipe serves the batch only when every theme takes it.
  const help = trailers.every(t => t.fontHelp) ? trailers[0].fontHelp : null;
  if (fonts.length > 0)
    logger.log(formatBatchFontLoadingHelp(fonts, help?.recipe));
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
 * @param {ThemeBuildHandOff} [handOff]
 * @returns {Promise<{receipt: import('../theme.type.mjs').ThemeBuildResponse | import('../theme.type.mjs').ThemeBuildCheckResponse | null, trailer: ThemeBuildTrailer | null}>}
 */
export async function themeBuildForReport(
  file,
  options = {},
  ctx = {},
  {compact = false} = {},
  handOff = {},
) {
  /** @type {ThemeBuildTrailer[]} */
  const trailers = [];
  const receipt = /** @type {any} */ (
    await themeBuildInternal(file, options, ctx, {compact, trailers}, handOff)
  );
  return {receipt, trailer: trailers[0] ?? null};
}

/** @param {string} file @param {{out?: string, check?: boolean, iconsSpecifier?: string}} [options] @param {{cwd?: string, projectCore?: boolean}} [ctx] `projectCore`: read only the project's installed Core, never the carried one (doctor; spec AST-081 FR3) @returns {Promise<import('../theme.type.mjs').ThemeBuildResponse | import('../theme.type.mjs').ThemeBuildCheckResponse | null>} */
export async function themeBuild(file, options = {}, ctx = {}) {
  const {out, check, iconsSpecifier} = options;
  return /** @type {any} */ (
    themeBuildInternal(file, {out, check, iconsSpecifier}, ctx)
  );
}

/**
 * {@link themeBuild} with the CLI's hand-off: the same build, outputs, and
 * receipt, plus what only the CLI's batch and scratch builds pass.
 * CLI-internal: not exported from the API entry.
 * @param {string} file
 * @param {{out?: string, check?: boolean, iconsSpecifier?: string}} options
 * @param {{cwd?: string, projectCore?: boolean}} ctx
 * @param {ThemeBuildHandOff} handOff
 * @returns {Promise<import('../theme.type.mjs').ThemeBuildResponse | import('../theme.type.mjs').ThemeBuildCheckResponse | null>}
 */
export async function themeBuildWithHandOff(file, options, ctx, handOff) {
  return /** @type {any} */ (
    themeBuildInternal(file, options, ctx, {}, handOff)
  );
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
/**
 * How a family member's module carries slot functions: its parent's values,
 * then its own. A member supplies its own slot functions through a named
 * import of its whole `componentIcons` map, merged as `defineTheme` merges;
 * own static values are written as JSON. Null when the member has no slot
 * function, so its static values are written as JSON alone.
 * @param {any} member
 * @param {any} parent - The member's parent in the family, if any.
 * @param {{themeBinding: string | undefined, parentBinding: string | null | undefined, outDir: string, registryImports: Array<{specifier: string, exportName: string}>, expression: (own: string | null, inherited: string | null) => string | undefined, compileLocal?: (importPath: string, filePath: string) => {specifier: string, sourceFile: string} | null}} context
 * @returns {{imports: Array<{importPath: string, importedName: string, localName: string}>, expression: string, mergeName?: string} | null}
 */
function familyComponentIcons(member, parent, context) {
  const values = themeComponentIcons(member.theme);
  if (!hasFunctionIconEntry(values)) return null;
  const inheritedValues = themeComponentIcons(parent?.theme);
  const inherited =
    context.parentBinding && inheritedValues
      ? `${context.parentBinding}.${hasFunctionIconEntry(inheritedValues) ? '__componentIcons' : 'componentIcons'}`
      : null;
  /** @type {Array<{importPath: string, importedName: string, localName: string}>} */
  const imports = [];
  let own = null;
  const binding =
    context.themeBinding ?? `${toIdentifier(member.theme.name)}Theme`;
  const info = member.componentIconInfo;
  if (info) {
    const input = familyRegistryInput(
      info,
      member.filePath,
      context.outDir,
      undefined,
      context.compileLocal,
    );
    const importPath = input.specifier ?? info.importPath;
    own = `${binding}ComponentIconSource`;
    imports.push({importPath, importedName: info.exportName, localName: own});
    context.registryImports.push({
      specifier: input.validate ?? importPath,
      exportName: info.exportName,
    });
  } else {
    // Without an import, a member's own slots are the ones that differ from
    // its parent's; they must all be static.
    /** @type {Record<string, unknown>} */
    const ownValues = {};
    for (const [slot, value] of Object.entries(values ?? {})) {
      if (
        inheritedValues &&
        Object.hasOwn(inheritedValues, slot) &&
        inheritedValues[slot] === value
      )
        continue;
      if (typeof value === 'function') {
        throw new AstryxError(
          `Theme "${member.theme.name}" must supply its componentIcons slot functions through a named import of its whole componentIcons map for family output.`,
          undefined,
          ERROR_CODES.ERR_THEME_INVALID,
        );
      }
      ownValues[slot] = value;
    }
    if (Object.keys(ownValues).length > 0) own = JSON.stringify(ownValues);
  }
  if (info) {
    // An imported map can hold an `undefined` slot: it keeps the parent's,
    // and a root drops it, as `defineTheme` does.
    const mergeName = `${binding}MergeComponentIcons`;
    return {
      imports,
      expression: `${mergeName}(${inherited ?? '{}'}, ${own})`,
      mergeName,
    };
  }
  const expression = context.expression(own, inherited);
  return expression ? {imports, expression} : null;
}
/** Rebase a scraped relative registry import to the aggregate module; a TypeScript or JSX module is compiled under the output folder (`compileLocal`), and the module imports the compiled file. @param {any} info @param {string} filePath @param {string} outDir @param {string | undefined} override @param {(importPath: string, filePath: string) => {specifier: string, sourceFile: string} | null} [compileLocal] @returns {{info: any, specifier: string | undefined, validate?: string}} `validate`: the source module's own file, from the aggregate, for the registry graph check (the compiled file is written after it) */
// prettier-ignore
function familyRegistryInput(info, filePath, outDir, override, compileLocal) {
  if (!info || override !== undefined) return {info, specifier: override};
  const source = info.importPath;
  if (!source.startsWith('./') && !source.startsWith('../')) return {info, specifier: undefined};
  const compiled = compileLocal?.(source, filePath);
  if (compiled) { let validate = path.relative(outDir, compiled.sourceFile).split(path.sep).join('/'); if (!validate.startsWith('./') && !validate.startsWith('../')) validate = `./${validate}`; return {info, specifier: compiled.specifier, validate}; }
  return {info, specifier: rebasedImport(source, path.dirname(filePath), outDir)};
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
    try { ast = parse(fs.readFileSync(key, 'utf8'), {sourceType: 'unambiguous', plugins: sourcePlugins(key)}); }
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
  try { try { await withEmptyStylesheets(async () => loader(filePath)); } catch (error) { if (!isSyncLoaderLimitation(error)) throw error; await withEmptyStylesheets(() => loader.evalModule(fs.readFileSync(filePath, 'utf8'), {id: filePath, filename: filePath, ext: path.extname(filePath), cache: loader.cache, async: true, forceTranspile: true})); } }
  finally { patch.undo(); }
}

/** The require of this module, for the module cache a family build loads into. */
const moduleRequire = createRequire(import.meta.url);

/**
 * Build a theme family. The members share one module cache while they load,
 * so a theme they extend is one module; the modules the build loaded from
 * outside installed packages are forgotten when it ends, so a later build
 * in the same process reads each member as it is then, never as it was.
 * @param {string[]} files
 * @param {{familyKey: string, check?: boolean, iconsSpecifier?: string}} options
 * @param {{cwd?: string}} [ctx]
 * @param {{commandWords?: {group: string, build: string}}} [handOff] - the CLI's words for the rebuild hint
 */
export async function themeBuildFamily(files, options, ctx = {}, handOff = {}) {
  const cache = moduleRequire.cache;
  const before = new Set(Object.keys(cache));
  try {
    return await buildFamily(files, options, ctx, handOff);
  } finally {
    for (const id of Object.keys(cache))
      if (!before.has(id) && !id.split(/[\\/]/).includes('node_modules'))
        delete cache[id];
  }
}

/** @param {string[]} files @param {{familyKey: string, check?: boolean, iconsSpecifier?: string}} options @param {{cwd?: string}} [ctx] @param {{commandWords?: {group: string, build: string}}} [handOff] - the CLI's words for the rebuild hint */
async function buildFamily(
  files,
  options,
  {cwd = process.cwd()} = {},
  handOff = {},
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
  // An empty --icons-specifier is written as given, as before: said once
  // for the family.
  const blankSpecifier = blankSpecifierWarning(options.iconsSpecifier);
  if (blankSpecifier) logger.warn(`  [warn] ${blankSpecifier}`);
  await selectCore(cwd);
  const familyInterception = interceptCore(_coreThemeModule, _coreRootModule);
  // prettier-ignore
  const familyLoader = createJiti(import.meta.url, {moduleCache: true, ...jitiCacheOptions(), interopDefault: false, jsx: true, extensions: THEME_MODULE_EXTENSIONS, virtualModules: familyInterception.modules});
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
    /** @type {any} */
    let member;
    try {
      // `check` rides along for the suggestions a member's refusal makes; a
      // prepared member writes nothing either way.
      // prettier-ignore
      member = await themeBuildInternal(file, {iconsSpecifier: options.iconsSpecifier, check: options.check}, {cwd}, {}, {prepareFamily: true, familyLoader, familyInterception});
    } catch (error) {
      // A member's refusal names the member.
      if (isPrivateVarRefusal(error))
        /** @type {Error} */ (error).message =
          `${file}: ${/** @type {Error} */ (error).message}`;
      throw error;
    }
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
  // A member may import the family's stylesheet (`import './k.css'` in the
  // root, so an app importing the source gets the family's CSS): it loads
  // empty, and the first build writes it. Any other is a missing file.
  for (const member of members)
    refuseMissingStylesheets(
      member.filePath,
      member.unbuiltStylesheets ?? [],
      outPath,
      cwd,
      options,
    );
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
  const rebuildCommand = `${getCliInvocation()} theme build --family ${members
    .map(member => member.sourceRelative)
    .join(' ')} --family-key ${baseName}`;
  const headerBase = headerRoot(outDir, cwd);
  const headerSources = members.map(member =>
    headerPath(headerBase, member.filePath),
  );
  const headerSource = headerSources.join(', ');
  const buildCommand = `astryx theme build --family ${headerSources.join(' ')} --family-key ${baseName}`;
  const bindings = allocateFamilyBindings(members);
  const css = generateFamilyCSS(members);
  /** @type {Array<{specifier: string, exportName: string}>} */
  const registryImports = [];
  // Each member's local TypeScript or JSX registry module is compiled under
  // the family's output folder, all in one plan, so two members' modules of
  // one name never share a compiled file; the family module imports the
  // compiled files.
  /** @type {Array<{sourceFile: string, bindings: Array<{importPath: string, importedName: string, localName: string}>}>} */
  const localEntries = members.map(member => ({
    sourceFile: member.filePath,
    bindings: [member.iconInfo, member.indicatorInfo, member.componentIconInfo]
      .filter(info => info && typeof info.importPath === 'string')
      .filter(
        info =>
          info !== member.iconInfo || options.iconsSpecifier === undefined,
      )
      .map(info => ({
        importPath: info.importPath,
        importedName: 'default',
        localName: 'local',
      })),
  }));
  const localPlan = selfContainedImports(localEntries, {
    outDir,
    modulesDir: modulesFolder(outDir, baseName),
    header: file =>
      generatedHeader(
        headerPath(headerBase, file),
        'js',
        buildCommand,
        root.versions,
      ),
    marker: GENERATED_MARKER,
    files: localModuleFiles,
  });
  /** @type {Map<string, {dest: string, content: string}>} */
  const localWrites = new Map(
    localPlan.writes.map(write => [write.dest, write]),
  );
  /** @param {string} importPath @param {string} memberFile */
  const compileLocal = (importPath, memberFile) => {
    const at = members.findIndex(member => member.filePath === memberFile);
    const planned = localPlan.entries[at];
    const sourceFile = planned?.compiled.get(importPath);
    const specifier = planned?.renamed.get(importPath);
    return sourceFile && specifier ? {specifier, sourceFile} : null;
  };
  // The root's own base, when the family does not select it: a package
  // theme the module imports, as the root's standalone module does, for the
  // registries it inherits (icons, indicators, slot functions).
  /** @type {Map<string, {binding: string, importLine: string}>} */
  const rootBases = new Map();
  /** The receipt's account of that base. @type {{theme: string, package: string | null, export: string | null} | null} */
  let familyBase = null;
  /** The root whose base it is, for the text line. */
  let familyBaseOf = '';
  for (const member of members) {
    if (!member.unselectedBase) continue;
    // The root's own `extends`, and where its binding comes from: an import
    // of a package is a package base; an import of a file of the project, or
    // a theme the root's file defines itself, is a local base.
    const binding = themeBaseBinding(member.filePath, member.exportName);
    const fromPackage =
      binding?.importPath !== undefined &&
      !binding.importPath.startsWith('.') &&
      !path.isAbsolute(binding.importPath)
        ? binding
        : null;
    familyBaseOf = member.theme.name;
    familyBase = {
      theme: member.unselectedBase,
      package: fromPackage ? packageOfSpecifier(fromPackage.importPath) : null,
      export: binding?.importPath !== undefined ? binding.exportName : null,
    };
    const inherits = [
      themeIconEntries(member.sourceParent),
      member.sourceParent?.indicators,
      themeComponentIcons(member.sourceParent),
    ].some(value => value && Object.keys(value).length > 0);
    if (!inherits) continue;
    if (!fromPackage)
      throw new AstryxError(
        `Theme "${member.theme.name}" extends "${member.unselectedBase}", ${binding?.local ? `a theme ${path.basename(member.filePath)} defines itself` : binding?.importPath !== undefined ? `a theme of ${binding.importPath}` : 'a theme'} the family does not select, and the family module can carry the icons it inherits only from a package it imports. Select "${member.unselectedBase}" too (in a theme file of its own), or build "${member.theme.name}" on its own.`,
        undefined,
        ERROR_CODES.ERR_THEME_INVALID,
      );
    const local = `${bindings.get(member.theme.name)}Base`;
    rootBases.set(member.theme.name, {
      binding: local,
      importLine: `import { ${fromPackage.exportName} as ${local} } from ${JSON.stringify(fromPackage.importPath)};\n`,
    });
  }
  const js = members
    .map(member => {
      const themeBinding = bindings.get(member.theme.name);
      const base = rootBases.get(member.theme.name) ?? null;
      const parentBinding = member.parentName
        ? bindings.get(member.parentName)
        : (base?.binding ?? null);
      // prettier-ignore
      const icon = familyRegistryInput(member.iconInfo, member.filePath, outDir, options.iconsSpecifier, compileLocal);
      // prettier-ignore
      const indicator = familyRegistryInput(member.indicatorInfo, member.filePath, outDir, undefined, compileLocal);
      // prettier-ignore
      for (const registry of [icon, indicator]) if (registry.info) registryImports.push({specifier: registry.validate ?? registry.specifier ?? registry.info.importPath, exportName: registry.info.exportName});
      const ownIcons = icon.info ? `${themeBinding}Icons` : null;
      // A parent with function entries keeps them in `__icons`; its `icons`
      // is the node view.
      const parent =
        members.find(other => other.theme.name === member.parentName) ??
        (base ? {theme: member.sourceParent} : undefined);
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
      const componentIconInfo = familyComponentIcons(member, parent, {
        themeBinding,
        parentBinding,
        outDir,
        registryImports,
        expression,
        compileLocal,
      });
      return (
        (base?.importLine ?? '') +
        indicatorImport +
        generateBuiltModule(member.theme, iconImports, icon.specifier, {
          themeBinding,
          iconsExpression: expression(ownIcons, inheritedIcons),
          indicatorsExpression: expression(ownIndicators, inheritedIndicators),
          artifactBaseName: baseName,
          exportIcons: false,
          componentIconInfo,
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
        generatedHeader(headerSource, 'css', buildCommand, root.versions) + css,
    },
    {
      dest: cssDtsPath,
      warnWhenMissing: true,
      content:
        generatedHeader(headerSource, 'ts', buildCommand, root.versions) +
        'export {};\n',
    },
    {
      dest: jsPath,
      content:
        generatedHeader(headerSource, 'js', buildCommand, root.versions) + js,
    },
    {
      dest: dtsPath,
      content:
        generatedHeader(headerSource, 'ts', buildCommand, root.versions) +
        declarations +
        (augmentations ? `\n${augmentations}` : ''),
    },
    ...localWrites.values(),
  ];
  const outputs = {
    css: path.relative(cwd, outPath),
    cssDts: path.relative(cwd, cssDtsPath),
    js: path.relative(cwd, jsPath),
    dts: path.relative(cwd, dtsPath),
  };
  /** What the output check warns of, for the result. @type {string[]} */
  const outputWarnings = [];
  // A family build's outputs stay inside cwd too; check mode only reads them.
  if (!options.check) {
    confineOutputs(writes, cwd, FAMILY_REMEDY);
    // The family key is a name the person picks, as --out is: the outputs
    // replace this build's own earlier outputs, and warn over another
    // source's. A header-less file there is replaced as a family build has
    // always replaced one (an output of a CLI before 0.6.7), with a warning
    // naming it.
    assertOutputsReplaceable(writes, root.filePath, cwd, {
      elsewhere: '--family-key',
      refuseUnmarked: true,
      warnUnmarked: true,
      // The result's warnings carry what text prints.
      onWarning: message => outputWarnings.push(message),
    });
  }
  // Each member's settings that do not show as written, at the member's
  // file when the member's own source writes them.
  // (A member that extends another reports the other's setting too: once.)
  const familySettingIssues = [
    ...new Map(
      members
        .flatMap(member =>
          (member.settingIssues ?? []).map(
            (/** @type {any} */ issue) => ({
              ...issue,
              file: issue.file ?? path.relative(cwd, member.filePath),
            }),
          ),
        )
        .map(issue => [
          JSON.stringify([issue.file, issue.path, issue.by.path, issue.by.key]),
          issue,
        ]),
    ).values(),
  ];
  if (options.check) {
    const stale = staleBuildOutputs(writes, cwd);
    const upToDate = stale.length === 0;
    const checkedLine = `  checked: ${checkedBuildOutputs(writes, cwd).join(', ')}`;
    if (upToDate) {
      logger.log(
        `\n[ok] Theme family outputs are up to date with ${sourceRelative}.`,
      );
      logger.log(checkedLine);
    } else {
      logger.error(
        `\n[fail] ${stale.length} theme family output(s) are out of date:`,
      );
      logger.error(checkedLine);
      for (const entry of stale) {
        logger.error(
          `  ${entry.reason === 'missing' ? 'missing' : 'stale'}: ${entry.path}`,
        );
      }
      // prettier-ignore
      const remedy = outsideCheckRemedy(writes, members.map(member => member.filePath), cwd, relative => ['--family', ...members.map(member => relative(member.filePath)), '--family-key', baseName, ...(options.iconsSpecifier ? ['--icons-specifier', options.iconsSpecifier] : [])]);
      if (remedy) logger.error(`\n  ${remedy.join('\n  ')}`);
      else
        logger.error(
          `\n  Rebuild with: ${rebuildLine(rebuildCommand, handOff.commandWords)}`,
        );
    }
    warnMissingDeclarations(writes, cwd);
    return /** @type {import('../theme.type.mjs').ThemeBuildCheckResponse} */ ({
      type: 'theme.build.check',
      data: {
        name: root.theme.name,
        upToDate,
        stale,
        checked: checkedBuildOutputs(writes, cwd),
        // The code a stale check exits 1 with, for --json callers.
        ...(upToDate ? {} : {code: ERROR_CODES.ERR_THEME_STALE}),
        ...(familySettingIssues.length
          ? {settingIssues: familySettingIssues}
          : {}),
      },
    });
  }
  writeBuildOutputs(writes);
  for (const output of Object.values(outputs)) logger.log(`[ok] ${output}`);
  // The base the outputs require, as the receipt's `base` says it.
  if (familyBase)
    logger.log(
      familyBase.package
        ? `  requires ${familyBase.package} (${familyBase.export}) for ${familyBaseOf}'s base ${familyBase.theme}`
        : `  ${familyBaseOf}'s base ${familyBase.theme} is a local theme${familyBase.export ? ` (${familyBase.export})` : ''} the family does not select`,
    );
  const themeBindings = members.map(member => bindings.get(member.theme.name));
  // From the outputs' project root, whatever folder the build ran in: the
  // snippet is relative to a file in that project's src/.
  const relOutDir = path.relative(headerRoot(outDir, cwd), outDir) || '.';
  const jsImport = importSpecifier(relOutDir, baseName);
  const cssImport = `${jsImport}.css`;
  logger.log(`
Load the family CSS once, then select any member by theme identity (paths are relative to a file in src/; adjust if yours lives elsewhere):
  import { ${themeBindings.join(', ')} } from '${jsImport}';
  import '${cssImport}';
Or load the same stylesheet natively:
  <link rel="stylesheet" href="${cssImport}" />
`);
  // A member's registry left uncompiled for a file of your own is said, as a
  // single build says it.
  const keptLocal = keptWarnings(localPlan.kept, cwd);
  for (const w of keptLocal) logger.warn(`Warning: ${w}`);
  // Each member's warnings name the member they are about; a warning about
  // the family's outputs (one it replaces, a module it leaves uncompiled)
  // comes after them.
  const warnings = [
    ...new Set([
      ...members.flatMap(member =>
        member.warnings.map(
          (/** @type {string} */ w) =>
            `${path.relative(cwd, member.filePath)}: ${w}`,
        ),
      ),
      ...keptLocal,
      ...outputWarnings,
    ]),
  ];
  const unloadedFonts = [
    ...new Set(members.flatMap(member => member.unloadedFonts)),
  ];
  /** @param {string} family @param {string} recipe */
  const familyNotice = (family, recipe) =>
    `Font "${family}" is named by this theme family but not loaded; add a <link> or @font-face in your app (recipe: ${recipe})`;
  // The result names the command bare; the printed note as this project
  // runs the CLI.
  const notices = unloadedFonts.map(family =>
    familyNotice(family, 'astryx docs typography'),
  );
  for (const family of unloadedFonts)
    logger.log(
      `  note: ${familyNotice(family, formatCliCommand('docs typography', cwd))}`,
    );
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
      // Each member's settings that do not show as written, at the member's
      // file when its own source writes them.
      settingIssues: familySettingIssues,
      // The base the family's root extends that the family does not select:
      // a requirement of the outputs (an installed package the app keeps).
      ...(familyBase ? {base: familyBase} : {}),
    },
  };
}

/**
 * The binding a theme's own `extends` names, as its source writes it: the
 * theme the module exports as `exportName` (through consts, a defineTheme()
 * call or a plain object), its `extends` field, and where that name comes
 * from. An import gives its specifier and the name it imports; a theme the
 * file defines itself is `local`. Null when the source does not show it (no
 * `extends`, a computed one, or an export the reader cannot place).
 * @param {string} filePath
 * @param {string | undefined} exportName
 * @returns {{importPath: string, exportName: string, local?: undefined} | {local: string, importPath?: undefined, exportName?: undefined} | null}
 */
function themeBaseBinding(filePath, exportName) {
  /** @type {any} */
  let ast;
  try {
    ast = parse(fs.readFileSync(filePath, 'utf8'), {
      sourceType: 'unambiguous',
      plugins: sourcePlugins(filePath),
    });
  } catch {
    return null;
  }
  /** @type {Map<string, {source: string, imported: string}>} */
  const imports = new Map();
  /** @type {Map<string, any>} */
  const consts = new Map();
  /** @type {Map<string, any>} the node each export gives */
  const exported = new Map();
  /** @param {any} declaration */
  const addDeclaration = declaration => {
    if (declaration?.type !== 'VariableDeclaration') return;
    for (const d of declaration.declarations)
      if (d.id?.type === 'Identifier' && d.init) consts.set(d.id.name, d.init);
  };
  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration' && node.importKind !== 'type')
      for (const spec of node.specifiers)
        if (spec.type === 'ImportSpecifier')
          imports.set(spec.local.name, {
            source: node.source.value,
            imported: spec.imported.name ?? spec.imported.value,
          });
        else if (spec.type === 'ImportDefaultSpecifier')
          imports.set(spec.local.name, {
            source: node.source.value,
            imported: 'default',
          });
    addDeclaration(node);
    if (node.type === 'ExportNamedDeclaration') {
      addDeclaration(node.declaration);
      if (node.declaration?.type === 'VariableDeclaration')
        for (const d of node.declaration.declarations)
          if (d.id?.type === 'Identifier') exported.set(d.id.name, d.id);
      if (!node.source)
        for (const spec of node.specifiers ?? [])
          if (spec.type === 'ExportSpecifier')
            exported.set(spec.exported.name ?? spec.exported.value, spec.local);
    }
    if (node.type === 'ExportDefaultDeclaration')
      exported.set('default', node.declaration);
  }
  /** @param {any} node @returns {any} */
  const unwrap = node => {
    while (
      node &&
      /^(?:TSAsExpression|TSSatisfiesExpression|TSNonNullExpression|TSTypeAssertion|ParenthesizedExpression)$/.test(
        node.type,
      )
    )
      node = node.expression;
    return node;
  };
  /** @param {any} node @param {number} depth @returns {any} the theme object literal */
  const themeObject = (node, depth = 0) => {
    node = unwrap(node);
    if (!node || depth > 8) return null;
    if (node.type === 'Identifier')
      return consts.has(node.name)
        ? themeObject(consts.get(node.name), depth + 1)
        : null;
    if (node.type === 'CallExpression')
      return themeObject(node.arguments?.[0], depth + 1);
    return node.type === 'ObjectExpression' ? node : null;
  };
  const object = themeObject(exported.get(exportName ?? 'default'));
  const field = object?.properties.find(
    (/** @type {any} */ p) =>
      p.type === 'ObjectProperty' &&
      !p.computed &&
      (p.key.name ?? p.key.value) === 'extends',
  );
  const value = unwrap(field?.value);
  if (value?.type !== 'Identifier') return null;
  const imported = imports.get(value.name);
  if (imported)
    return {importPath: imported.source, exportName: imported.imported};
  return consts.has(value.name) ? {local: value.name} : null;
}

/**
 * The package a bare import specifier names: `@scope/name/sub` is
 * `@scope/name`, `name/sub` is `name`.
 * @param {string} specifier
 */
function packageOfSpecifier(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}
