// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Environment adapter for app-theme doctor evidence. */

import {isOutsideProject} from '../../foundation/env/project-scope.mjs';
import {answeredBy} from '../../foundation/release/run-context.mjs';
import {
  knownLatestRelease,
  lastCheckFailure,
  stateLockHolder,
} from '../../foundation/release/global-state.mjs';
import {
  addVerbFor,
  alignCliAndCore,
  cliInstallAdvice,
  installFolder,
  listedPackageInstall,
  projectAddCommand,
  globalBehind,
  globalUpgradeCommand,
  lastNoticeSkip,
  projectLag,
} from '../../foundation/release/notices.mjs';
import {
  coreVersionOf,
  installPlaceOf,
  isGlobalCopy,
} from '../../foundation/release/choose.mjs';
import {readReleaseFacts} from '../../foundation/release/project.mjs';
import {astryxCommandsOnSearchPath} from '../../foundation/env/search-path.mjs';
import {
  readDeclaredDependencies,
  scanAutolinkCandidates,
} from '../../foundation/integrations/autolink.mjs';
import {
  computerSkillFile,
  displayHomePath,
  inspectComputerAgentText,
  skillCommandOf,
  skillInstallStepOf,
} from '../../foundation/agent-docs/computer-agent-text.mjs';
import {computerAgentTextSettings} from '../../foundation/env/user-settings.mjs';
import * as fs from 'node:fs';
import {resolveAgentDocsRoot} from '../../foundation/agent-docs/agent-docs-target.mjs';
import {placeSkillFiles, renderProjectSkill} from '../../foundation/agent-docs/skill-places.mjs';
import {managedFileState} from '../../foundation/agent-docs/managed-skill-file.mjs';
import {renderAgentDocsBlock} from '../../foundation/agent-docs/agent-docs.mjs';
import {readProjectPlaces} from '../../foundation/agent-docs/skill-place-files.mjs';
import {createRequire} from 'node:module';
import {placeholderUses} from '../../foundation/discovery/template-icons.mjs';
import {iconImportFindings} from '../../foundation/discovery/icon-imports.mjs';
import {projectMapsImport} from '../../foundation/render/ts-paths.mjs';
import {
  resolveIconModule,
  splitSpecifier,
} from '../../foundation/discovery/icon-set-discovery.mjs';
export {placeholderFixes} from '../../foundation/discovery/template-icons.mjs';
export {iconFeatureGate} from '../../foundation/integrations/icon-features.mjs';
export {
  iconUseCommand,
  unlistedIconSets,
} from '../../foundation/discovery/icon-set-discovery.mjs';
import {
  elementPropOrigins,
  rendersElement,
} from '../../foundation/discovery/module-exports.mjs';
import {cssImports} from '../../foundation/render/embedded-imports.mjs';
import {postcss} from '../../foundation/runtime/lazy-dependencies.mjs';
import {isValidSemver, satisfiesRange} from '../../foundation/env/semver.mjs';
import * as path from 'node:path';
import {
  persistedGather,
  recordedRun,
} from '../../foundation/fs/gather-cache.mjs';
import {getCliInvocation} from '../../foundation/env/package-manager.mjs';
import {
  Project,
  availableComputerIntegrations,
  computerIntegrationCandidates,
} from '../../foundation/config/project.mjs';
import {
  discoverUnmigratedThemeCopies,
  themeImportPackage,
} from '../../foundation/discovery/theme-discovery.mjs';
import {resolveThemeImports} from '../../foundation/discovery/theme-imports.mjs';
import {
  isLocalThemeOwner as isLocalThemeOwnerForWiring,
  readThemeState as readThemeStateForWiring,
  themeModuleStylesheets,
} from '../../foundation/config/theme-state.mjs';
import {
  CLI_ROOT,
  findProjectCoreDir,
  findInstalledPackage,
} from '../../foundation/fs/paths.mjs';
import {compareText} from '../../foundation/text/compare-text.mjs';
import {
  filesOnDisk,
  shippedImportFindings,
} from '../../foundation/integrations/shipped-imports.mjs';
export {
  isLocalThemeOwner,
  planThemeAppWrite,
  readThemeState,
  resolveThemeModule,
} from '../../foundation/config/theme-state.mjs';
export {
  fileMark,
  generatedSourceCommand,
  isPrivateVarRefusal,
  missingThemePackage,
  themeBuild,
  validateThemePrivateInputs,
} from '../theme/build/build.mjs';
export {
  installCommandFor as packageInstallCommand,
  installStepFor as packageInstallStep,
} from '../../foundation/discovery/template-needs.mjs';
export {addMatchingCore} from '../../foundation/release/notices.mjs';
export {fontServiceFamilies} from '../../foundation/fonts/font-stylesheet.mjs';
export {resolveRecordedTheme} from '../theme/theme.mjs';
export {themeIdentifier} from '../theme/_fork.mjs';
export {collectUnloadedFonts} from '../theme/build/font-warning.mjs';

// What the authoring-docs check reads (./_authoring-audit.mjs), reached only
// through this adapter.
export {
  AUTHORING_AUDIT,
  authoringAudit,
  authoringAuditData,
} from './_authoring-audit.mjs';

/** A doctor check record, kept as it is. */
const CHECK_CODEC = {
  encode: (/** @type {any} */ check) => check,
  decode: (/** @type {any} */ check) => check,
  /** A check record: its id, label, status and message. */
  valid: (/** @type {any} */ check) =>
    check != null &&
    typeof check === 'object' &&
    typeof check.id === 'string' &&
    typeof check.label === 'string' &&
    typeof check.status === 'string' &&
    typeof check.message === 'string',
};

/**
 * A doctor check that reads only files, kept between runs through the kept
 * gather (foundation/fs/gather-cache.mjs): a later `doctor` with every file,
 * folder, module and environment variable it read unchanged reads the check
 * back. Only the docs checks and the theme-wiring scan go through here; a
 * check that depends on the time, the network or anything else the stamps do
 * not see never does.
 * @template T
 * @param {{name: string, cwd: string, coreDir: string | null}} where - The
 *   check, the project folder, and the Core folder the project loads.
 * @param {() => Promise<T>} check
 * @param {{encode: (value: any) => any, decode: (stored: any) => any, valid?: (value: any) => boolean}} [codec]
 *   How the value is kept: a check record unless given.
 * @returns {Promise<T>}
 */
export function keptFileCheck(
  {name, cwd, coreDir},
  check,
  codec = CHECK_CODEC,
) {
  // Only a recorded run (`doctor` from the bin, with or without `--built`)
  // reads or keeps one: a hosted run names its commands its own way, so it
  // always checks.
  if (!recordedRun()) return check();
  return persistedGather(
    // With the command name the checks print commands with.
    ['doctor-check', name, cwd, coreDir, getCliInvocation(cwd)],
    check,
    codec,
  );
}

/**
 * The theme-wiring scan's result ({@link themeImportWiring}), kept exactly,
 * with its shape.
 */
export const THEME_WIRING_CODEC = {
  encode: (/** @type {any} */ value) => value,
  decode: (/** @type {any} */ value) => value,
  valid: (/** @type {any} */ value) =>
    value != null &&
    Array.isArray(value.wired) &&
    Array.isArray(value.unconfirmed) &&
    value.wired.every(
      (/** @type {any} */ w) =>
        w != null &&
        typeof w.slug === 'string' &&
        typeof w.owner === 'string' &&
        typeof w.file === 'string',
    ) &&
    value.unconfirmed.every(
      (/** @type {any} */ u) => u != null && typeof u.file === 'string',
    ),
};

/**
 * Package written to the generated app record for one discovered theme.
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme} theme
 */
export function themeRecordOwner(theme) {
  return themeImportPackage(theme);
}

export const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
]);

const SKIP_DIRS = new Set([
  '.git',
  '.next',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

/** @param {string} file */
export function readTextFile(file) {
  return fs.readFileSync(file, 'utf-8');
}

/** @param {string} file */
export function readTextFileIfExists(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return readTextFile(file);
  } catch {
    return null;
  }
}

/**
 * A bounded app-source walk that excludes dependencies, generated output, and
 * links. The doctor parses the returned bytes without executing app code.
 * @param {string} root
 * @param {string} generatedModule
 * @param {{stylesheets?: boolean, pages?: boolean}} [options] - also list
 *   `.css` files, and `.html` pages
 */
export function listProjectSourceFiles(root, generatedModule, options = {}) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const queue = [root];
  while (queue.length > 0 && files.length < 5000) {
    const dir = /** @type {string} */ (queue.shift());
    let entries;
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.astryx-')) {
          queue.push(file);
        }
      } else if (
        entry.isFile() &&
        file !== generatedModule &&
        (SOURCE_EXTENSIONS.has(path.extname(entry.name)) ||
          (options.stylesheets === true &&
            path.extname(entry.name) === '.css') ||
          (options.pages === true &&
            /^\.html?$/u.test(path.extname(entry.name))))
      ) {
        files.push(file);
      }
    }
  }
  return files;
}

/**
 * Each file in the project's own source that still uses the placeholder
 * component the CLI writes for a missing icon: the file, the component's
 * name, the meanings its uses name (null when none names one), and how many
 * uses it has. A file reads only as a syntax tree, so a commented-out or
 * quoted copy never counts. Read without executing app code.
 * @param {string} projectDir
 * @returns {Array<{file: string, local: string, meanings: string[] | null, uses: number}>}
 */
export function findIconPlaceholders(projectDir) {
  /** @type {Array<{file: string, local: string, meanings: string[] | null, uses: number}>} */
  const found = [];
  for (const file of listProjectSourceFiles(projectDir, '')) {
    let source;
    try {
      source = readTextFile(file);
    } catch {
      continue;
    }
    // Only a file with the placeholder's dash pattern is parsed.
    if (!source.includes('3 2.33')) continue;
    const uses = placeholderUses(source);
    if (!uses || uses.length === 0) continue;
    const shown = path.relative(projectDir, file).split(path.sep).join('/');
    const meanings = [
      ...new Set(uses.flatMap(each => each.meanings ?? [])),
    ].sort();
    found.push({
      file: shown,
      local: uses[0].local,
      meanings: meanings.length > 0 ? meanings : null,
      uses: uses.length,
    });
  }
  return found.sort((a, b) => compareText(a.file, b.file));
}

/**
 * Each file in the project's own source with icon imports that do not match
 * the project's icon sets (see `iconImportFindings`): an icon from a set that
 * is not in the list, or from a set later in the list than one that draws the
 * same meaning, and an icon-named import of an npm package that does not
 * resolve, that no path alias (`compilerOptions.paths` or `baseUrl`) maps, and
 * that the project's package.json does not declare. A file reads only as
 * a syntax tree. Read without executing app code.
 * @param {string} projectDir
 * @param {{sets: import('../../foundation/discovery/icon-set-discovery.mjs').DiscoveredIconSet[], choice: import('../../foundation/discovery/icon-set-discovery.mjs').IconSetChoice}} iconSets
 * @returns {Array<{file: string, imports: import('../../foundation/discovery/icon-imports.mjs').IconImportFinding[]}>}
 */
export function findIconImports(projectDir, iconSets) {
  const pkg = readPackageJson(path.join(projectDir, 'package.json')) ?? {};
  const declared = new Set(
    [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]
      .flatMap(field => Object.keys(pkg[field] ?? {}))
      .concat(typeof pkg.name === 'string' ? [pkg.name] : []),
  );
  // Only a file that names a set's module, a wrapped library, or an
  // icon-named export is parsed.
  const needles = [
    ...new Set(
      iconSets.sets.flatMap(set => [
        set.data.module,
        ...set.data.icons.flatMap(icon => (icon.module ? [icon.module] : [])),
        ...(set.data.source ? [set.data.source.package] : []),
      ]),
    ),
  ];
  /** @type {Map<any, Map<string, string>>} */
  const wrappedRead = new Map();
  /** @type {Array<{file: string, imports: import('../../foundation/discovery/icon-imports.mjs').IconImportFinding[]}>} */
  const found = [];
  for (const file of listProjectSourceFiles(projectDir, '')) {
    let source;
    try {
      source = readTextFile(file);
    } catch {
      continue;
    }
    if (
      !/Icon\b/u.test(source) &&
      !needles.some(each => source.includes(each))
    ) {
      continue;
    }
    const fromDir = path.dirname(file);
    const imports = iconImportFindings(
      source,
      iconSets,
      module =>
        !declared.has(splitSpecifier(module).name) &&
        resolveIconModule(module, fromDir) === null &&
        !projectMapsImport(module, file),
      wrappedRead,
    );
    if (!imports || imports.length === 0) continue;
    found.push({
      file: path.relative(projectDir, file).split(path.sep).join('/'),
      imports,
    });
  }
  return found.sort((a, b) => compareText(a.file, b.file));
}

/** @param {string} projectDir */
export async function discoverDoctorThemes(projectDir) {
  const project = await Project.load(projectDir, {core: 'project'});
  return project.themes();
}

/**
 * Resolve one discovered theme's built module and stylesheets.
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme} theme
 * @param {{cwd: string, ownerThemeCount: number}} options
 */
export function resolveDoctorThemeImports(theme, options) {
  return resolveThemeImports(theme, options);
}

/**
 * A finding for each relative import of a package theme's built module and
 * stylesheets that names no file its package ships (see
 * `shippedImportFindings`). A local theme is no package: none.
 * @param {import('../../foundation/config/theme-state.mjs').ResolvedAppTheme} theme
 * @returns {import('../../foundation/integrations/shipped-imports.mjs').ShippedImportFinding[]}
 */
export function themeShippedImportFindings(theme) {
  if (theme.source === 'local') return [];
  const moduleFile = realDoctorFile(theme.moduleFile);
  if (!moduleFile) return [];
  // The package that ships the module: the nearest package.json with a name
  // (a build folder may hold one that only sets "type").
  let packageDir = path.dirname(moduleFile);
  for (;;) {
    const name = readPackageJson(path.join(packageDir, 'package.json'))?.name;
    if (typeof name === 'string' && name !== '') break;
    const parent = path.dirname(packageDir);
    if (parent === packageDir) return [];
    packageDir = parent;
  }
  // The app's bundler builds from the package's files where they are,
  // installed or linked, so those files are what it ships here; doctor never
  // asks npm.
  return shippedImportFindings(packageDir, {
    files: filesOnDisk(packageDir),
    entries: [theme.moduleFile, theme.stylesheetFile, theme.fontStylesheetFile]
      .filter(file => typeof file === 'string')
      .map(file => realDoctorFile(file) ?? file),
  }).findings;
}

/** @param {string} projectDir */
export function discoverDoctorUnmigratedCopies(projectDir) {
  return discoverUnmigratedThemeCopies(projectDir);
}

/**
 * The real path of a file, links resolved; null when it does not exist.
 * @param {string} file
 * @returns {string | null}
 */
export function realDoctorFile(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return null;
  }
}

/**
 * Where each `<Name prop={value}>` value of a module is declared (see
 * `elementPropOrigins`).
 * @param {string} file
 * @param {Parameters<typeof elementPropOrigins>[1]} element
 */
export function doctorElementPropOrigins(file, element) {
  return elementPropOrigins(file, element);
}

/**
 * The stylesheets the app's registered themes load, read from the theme
 * module the CLI writes for them: an import of one is theme wiring, never
 * page styling. A package stylesheet matches by its name; a local one by
 * the file it names.
 * @param {string} target the scanned folder or file
 * @returns {{has: (spec: string, rel: string) => boolean}}
 */
export function doctorThemeWiring(target) {
  const none = {has: () => false};
  let base;
  try {
    base = fs.statSync(target).isDirectory() ? target : path.dirname(target);
  } catch {
    return none;
  }
  /** @type {Set<string>} */
  const names = new Set();
  /** @type {Set<string>} */
  const files = new Set();
  try {
    const {configured, module, projectDir} = readThemeStateForWiring(base);
    if (!configured || !module.expectedOriginal) return none;
    // (Only a stylesheet from its theme's recorded owner: the owner's
    // package, or a file in a local theme's folder. Another import in the
    // module is no wiring.)
    for (const {spec, owner} of themeModuleStylesheets(
      module.expectedOriginal.toString('utf-8'),
      module.typescript,
    )) {
      if (!isLocalThemeOwnerForWiring(owner)) {
        if (spec.startsWith(`${owner}/`)) names.add(spec);
        continue;
      }
      const file = path.resolve(path.dirname(module.file), spec);
      const folder = path.resolve(projectDir, owner);
      if (!path.relative(folder, file).startsWith('..')) files.add(file);
    }
  } catch {
    return none;
  }
  return {
    has: (spec, rel) =>
      names.has(spec) ||
      (spec.startsWith('.') &&
        files.has(path.resolve(base, path.dirname(rel), spec))),
  };
}

/**
 * Whether a module renders an element imported by name from a module (see
 * `rendersElement`).
 * @param {string} file
 * @param {Parameters<typeof rendersElement>[1]} element
 */
export function doctorRendersElement(file, element) {
  return rendersElement(file, element);
}

/**
 * The `@import` specifiers of a stylesheet, quoted or in `url()`, in any case
 * (see `cssImports`); empty for CSS that does not parse.
 * @param {string} css
 * @returns {Set<string>}
 */
export function doctorStylesheetImports(css) {
  return new Set(cssImports(css));
}

/**
 * The names of a stylesheet's at-rules, lowercased, read with postcss so
 * comments are ignored (`@stylex;` is `stylex`); empty for CSS that does not
 * parse.
 * @param {string} css
 * @returns {Set<string>}
 */
export function doctorStylesheetAtRules(css) {
  /** @type {Set<string>} */
  const names = new Set();
  try {
    postcss()
      .parse(css)
      .walkAtRules(rule => {
        names.add(rule.name.toLowerCase());
      });
  } catch {
    // Not valid CSS: no rules.
  }
  return names;
}

/**
 * The project folder of a path `doctor --built` checks: the nearest folder
 * at or above it that holds a package.json, or null.
 * @param {string} target
 * @param {string} cwd
 * @returns {string | null}
 */
export function builtProjectRoot(target, cwd) {
  let dir = path.resolve(cwd, target);
  try {
    if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir);
  } catch {
    dir = path.resolve(cwd);
  }
  for (let at = dir; ; at = path.dirname(at)) {
    if (fs.existsSync(path.join(at, 'package.json'))) return at;
    if (path.dirname(at) === at) return null;
  }
}

/**
 * The file a local stylesheet `@import` names, from the stylesheet that
 * imports it: a relative path, or a package's file as Node resolves it
 * (`@fontsource/inter/index.css`). Null for a URL (http, https, `//`) or an
 * import that does not resolve.
 * @param {string} specifier
 * @param {string} fromFile
 * @returns {string | null}
 */
export function doctorStylesheetImportFile(specifier, fromFile) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(specifier)) return null;
  const isFile = (/** @type {string} */ f) => {
    try {
      return fs.statSync(f).isFile();
    } catch {
      return false;
    }
  };
  // A bare name is a file beside the stylesheet first (`@import
  // "faces.css"`, as a browser reads it), then a package.
  const beside = path.resolve(path.dirname(fromFile), specifier);
  if (isFile(beside)) return beside;
  if (/^\.{1,2}\//.test(specifier)) return null;
  try {
    // Packages resolve from where the stylesheet really is (a linked
    // install, as pnpm makes, keeps its own dependencies there).
    let real = fromFile;
    try {
      real = fs.realpathSync(fromFile);
    } catch {
      real = fromFile;
    }
    const file = createRequire(real).resolve(specifier);
    return isFile(file) ? file : null;
  } catch {
    return null;
  }
}

/**
 * The `@astryxdesign/core` range a package's peerDependencies declare, and
 * whether it accepts `coreVersion` (spec:AST-017/FR12). The one rule every
 * doctor check uses to compare a package with the installed Core:
 * `theme-core-peers` for added theme packages, `integration-core-range` for
 * every other loaded integration.
 * @param {{peerDependencies?: Record<string, unknown>} | null | undefined} pkg
 * @param {string | null | undefined} coreVersion
 * Any declared string is judged by `satisfiesRange`, so an empty range
 * accepts every Core; only a missing range is `null`.
 * @returns {{range: string | null, accepts: boolean}}
 */
export function corePeerRange(pkg, coreVersion) {
  const raw = pkg?.peerDependencies?.['@astryxdesign/core'];
  const range = typeof raw === 'string' ? raw.trim() : null;
  return {
    range,
    accepts:
      range !== null &&
      typeof coreVersion === 'string' &&
      coreVersion !== '' &&
      satisfiesRange(coreVersion, range),
  };
}

/** @param {string} projectDir */
export function findDoctorCoreDir(projectDir) {
  return findProjectCoreDir(projectDir);
}

/** @param {string} projectDir @param {string} packageName */
export function findDoctorInstalledPackage(projectDir, packageName) {
  return findInstalledPackage(projectDir, packageName);
}

/**
 * Names of the `@astryxdesign/theme-*` packages installed in the nearest
 * `node_modules` at or above `cwd`, looking up to six levels.
 * @param {string} cwd
 * @returns {string[]}
 */
export function listDoctorThemePackages(cwd) {
  let dir = path.resolve(cwd);
  let nodeModules = null;
  for (let level = 0; level < 6; level++) {
    const candidate = path.join(dir, 'node_modules');
    if (fs.existsSync(candidate)) {
      nodeModules = candidate;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (!nodeModules) return [];
  const scopeDir = path.join(nodeModules, '@astryxdesign');
  let entries;
  try {
    entries = fs.readdirSync(scopeDir, {withFileTypes: true});
  } catch {
    return [];
  }
  /** @type {string[]} */
  const names = [];
  for (const entry of entries) {
    if (!entry.name.startsWith('theme-')) continue;
    // pnpm links packages into node_modules/.pnpm, and a symlink entry does
    // not report itself as a directory, so check what it points to.
    let isDirectory = entry.isDirectory();
    if (!isDirectory && entry.isSymbolicLink()) {
      try {
        isDirectory = fs
          .statSync(path.join(scopeDir, entry.name))
          .isDirectory();
      } catch {
        isDirectory = false;
      }
    }
    if (isDirectory) names.push(`@astryxdesign/${entry.name}`);
  }
  return names;
}

/** @param {string} file */
export function readPackageJson(file) {
  try {
    return JSON.parse(readTextFile(file));
  } catch {
    return null;
  }
}

/**
 * The integrations installed for the computer, and, outside a project, which
 * of them the folder loads (spec AST-081 FR12): those it uses, and the names
 * of the integrations the folder loads itself, whose copies win.
 * @param {string} cwd
 * @returns {Promise<{computerIntegrations: import('../../foundation/integrations/computer-integrations.mjs').ComputerIntegrationCandidate[], loadedComputerIntegrations: string[], folderIntegrations: string[]}>}
 */
export async function computerIntegrationsOutside(cwd) {
  const computerIntegrations = computerIntegrationCandidates(cwd);
  if (computerIntegrations.length === 0) {
    return {
      computerIntegrations,
      loadedComputerIntegrations: [],
      folderIntegrations: [],
    };
  }
  try {
    const project = await Project.load(cwd, {core: 'project'});
    /** @type {Array<{name: string, __computer?: boolean, __loadError?: string}>} */
    const loaded = project.loadedIntegrations;
    return {
      computerIntegrations,
      loadedComputerIntegrations: loaded
        .filter(i => i.__computer && !i.__loadError)
        .map(i => i.name),
      folderIntegrations: loaded.filter(i => !i.__computer).map(i => i.name),
    };
  } catch {
    return {
      computerIntegrations,
      loadedComputerIntegrations: [],
      folderIntegrations: [],
    };
  }
}

/**
 * Inside a project: the integrations installed for the computer it could add
 * (spec AST-081 FR12), leaving out every package it loads or declares.
 * @param {string} cwd
 * @param {string[]} loadedNames the integrations the project loads
 * @returns {Promise<import('../../foundation/integrations/computer-integrations.mjs').ComputerIntegrationCandidate[]>}
 */
export async function computerIntegrationsToAdd(cwd, loadedNames) {
  const installed = new Set([...loadedNames, ...declaredPackageNames(cwd)]);
  return availableComputerIntegrations(cwd, installed);
}

/**
 * The package names the folder's package.json declares, nearest first.
 * @param {string} cwd
 * @returns {string[]}
 */
function declaredPackageNames(cwd) {
  for (let dir = path.resolve(cwd); ;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return readDeclaredDependencies(dir).map(d => d.name);
    }
    const parent = path.dirname(dir);
    if (parent === dir) return [];
    dir = parent;
  }
}

/**
 * The computer-level agent text's setting, its state on disk, and the command
 * the skill file tells agents to run and the install step it records for when
 * that command is not found (each null when there is no file, or it names
 * none).
 * @returns {{settings: import('../../foundation/env/user-settings.mjs').ComputerAgentTextSettings, entries: Array<{path: string, state: import('../../foundation/agent-docs/computer-agent-text.mjs').ComputerAgentTextState, link?: true}>, command: string | null, install: string | null}}
 */
export function computerAgentTextState() {
  const settings = computerAgentTextSettings();
  let command = null;
  let install = null;
  try {
    const text = fs.readFileSync(computerSkillFile(), 'utf8');
    command = skillCommandOf(text);
    install = skillInstallStepOf(text);
  } catch {
    // No skill file, or one that cannot be read: no command to check.
  }
  return {
    settings,
    entries: inspectComputerAgentText({links: settings.links}),
    command,
    install,
  };
}

export {displayHomePath};

/**
 * The release facts doctor reports, read here so the checks stay pure
 * (spec AST-081 FR5, FR6, FR10; architecture:cli-surface INV21): who
 * answered, the newest release the computer knows of, how far the global copy
 * or the project is behind, and every `astryx` on the search path with the
 * command that upgrades it.
 * @param {string} cwd
 * @param {{project: boolean}} options
 * @returns {{answeredBy: {cli: string, core: string | null, copy: string}, latest: string | null, globalBehind: ReturnType<typeof globalBehind> | null, projectLag: ReturnType<typeof projectLag> | null, lastNoticeSkip: ReturnType<typeof lastNoticeSkip>, lastCheckFailure: ReturnType<typeof lastCheckFailure>, stateLock: ReturnType<typeof stateLockHolder>, searchPathCommands: Array<import('../../foundation/env/search-path.mjs').SearchPathCommand & {upgrade: string | null, runner: boolean}>}}
 */
export function releaseFacts(cwd, {project}) {
  const answered = answeredBy(cwd);
  return {
    answeredBy: answered,
    latest: knownLatestRelease(),
    lastNoticeSkip: lastNoticeSkip(),
    lastCheckFailure: lastCheckFailure(),
    stateLock: stateLockHolder(),
    globalBehind:
      !project && isGlobalCopy(CLI_ROOT)
        ? globalBehind({self: {version: answered.cli, root: CLI_ROOT}})
        : null,
    // The project's version is its own CLI's, or, with none, its Core's:
    // installed, else locked, else declared, as the daily notice reads it.
    projectLag: project
      ? projectLag({
          cwd,
          current:
            (answered.copy === 'starting' && projectCoreVersion(cwd)) ||
            answered.cli,
        })
      : null,
    searchPathCommands: astryxCommandsOnSearchPath().map(row => ({
      ...row,
      upgrade: row.cliRoot ? globalUpgradeCommand(row.cliRoot) : null,
      // A package runner's temporary install, which it puts first on the
      // search path only for the run it starts.
      runner: row.cliRoot ? installPlaceOf(row.cliRoot).runner : false,
    })),
  };
}

/** Whether `cwd` is outside every project. */
export function outsideProject(/** @type {string} */ cwd) {
  return isOutsideProject(cwd);
}

/**
 * The commands that bring a project's own CLI and Core to one release, with
 * the project's package manager: Core up to the CLI, then its codemods, when
 * the CLI is newer; else the CLI to the Core's release. Null when no
 * command fits (see `alignCliAndCore`).
 * @param {string} cwd
 * @param {string} cli
 * @param {string} core
 * @returns {string | null}
 */
export function alignCommand(cwd, cli, core) {
  return alignCliAndCore({cwd, cli, core});
}

/**
 * The Core release the project at `cwd` names: installed, else locked, else
 * declared; the version the daily hint and notice compare against (spec
 * AST-081 FR2). Null outside a project or when it names none.
 * @param {string} cwd
 * @returns {string | null}
 */
export function projectCoreVersion(cwd) {
  return coreVersionOf(readReleaseFacts(cwd));
}

/**
 * Whether the project at `cwd` installs its own CLI (spec AST-081 FR2).
 * @param {string} cwd
 * @returns {boolean}
 */
export function projectHasOwnCli(cwd) {
  return Boolean(readReleaseFacts(cwd).cli);
}

/**
 * The command that adds the CLI at `version` with the project's package
 * manager, and the Core it matches: from a folder whose package.json declares
 * no Astryx package, in the Astryx project above at that project's Core; null
 * when there is none (see `cliInstallAdvice`). For a project that declares
 * the CLI already, the command installs its dependencies (`declared`).
 * @param {string} cwd
 * @param {string} version
 * @returns {{command: string, core: string, declared: boolean} | null}
 */
export function addCliCommandFor(cwd, version) {
  const advice = cliInstallAdvice({cwd, core: version});
  return advice?.command
    ? {command: advice.command, core: advice.core, declared: advice.declared}
    : null;
}

/**
 * The command that adds a package to the project of `cwd`; null in a folder
 * that belongs to no project or whose package.json is not the project's (see
 * `projectAddCommand`).
 * @param {string} cwd
 * @returns {((name: string) => string) | null}
 */
export function installCommandFor(cwd) {
  return projectAddCommand(cwd);
}

/**
 * The command that installs the project's dependencies, when the project
 * `cwd` belongs to lists `name`, so a `name` that is not installed comes from
 * installing them; null otherwise (see `listedPackageInstall`).
 * @param {string} cwd
 * @param {string} name
 * @returns {string | null}
 */
export function dependencyInstallFor(cwd, name) {
  return listedPackageInstall(cwd, name);
}

/**
 * The command that installs the Core a theme's peer range accepts, with the
 * project's package manager; one version is saved exactly in a project that
 * pins its Core (see `addVerbFor`), and a range is quoted for the shell.
 * @param {string} projectDir
 * @param {string} range
 * @returns {string}
 */
export function coreAddCommand(projectDir, range) {
  const spec = `@astryxdesign/core@${range}`;
  return `${addVerbFor(projectDir, range)} ${isValidSemver(range) ? spec : `'${spec}'`}`;
}

/**
 * Whether `cwd` is inside a project whose package.json is not the project's,
 * so advice points at the project's folder (see `installFolder`).
 * @param {string} cwd
 * @returns {boolean}
 */
export function insideProjectElsewhere(cwd) {
  return installFolder(cwd)?.moved === true;
}

/** Folders `doctor --built` never reads: installs and version control. */
const BUILT_SKIPPED_DIRS = new Set(['node_modules', '.git', '.hg', '.sl']);

/** Folders that hold build output: read for stylesheets, never as source. */
const BUILD_OUTPUT_DIRS = new Set(['.next', 'dist', 'build', 'out', '.output']);

/** `doctor --built` reads at most this many files, of at most this size. */
export const BUILT_FILE_LIMIT = 20000;
export const BUILT_FILE_MAX_MB = 5;
const BUILT_FILE_MAX_BYTES = BUILT_FILE_MAX_MB * 1024 * 1024;

/**
 * The path `doctor --built` checks for paths given to `doctor` as words, or
 * null when one of them names nothing on disk: the path itself when there is
 * one, else the folder that holds them all. That folder must be `cwd` or a
 * folder in it, so the check never reaches past the project. Relative to
 * `cwd`; `.` is `cwd`.
 * @param {string} cwd
 * @param {string[]} paths
 * @returns {string | null}
 */
export function builtTargetOf(cwd, paths) {
  const resolved = paths.map(p => path.resolve(cwd, p));
  if (resolved.length === 0 || !resolved.every(p => fs.existsSync(p)))
    return null;
  if (paths.length === 1) return paths[0];
  const root = path.resolve(cwd);
  const inside = (/** @type {string} */ folder, /** @type {string} */ p) =>
    p === folder ||
    p.startsWith(folder.endsWith(path.sep) ? folder : `${folder}${path.sep}`);
  const folders = resolved.map(p =>
    fs.statSync(p).isDirectory() ? p : path.dirname(p),
  );
  if (!folders.every(f => inside(root, f))) return null;
  let shared = folders[0];
  while (shared !== root && !folders.every(f => inside(shared, f)))
    shared = path.dirname(shared);
  return path.relative(root, shared) || '.';
}

/**
 * The absolute path `doctor --built` checks, or null when it does not exist.
 * @param {string} cwd
 * @param {string} target
 * @returns {string | null}
 */
export function resolveBuiltPath(cwd, target) {
  const resolved = path.resolve(cwd, target);
  return fs.existsSync(resolved) ? resolved : null;
}

/**
 * The files under a `doctor --built` path, in a stable order: each with its
 * path relative to the folder (a file's own name when the path is one file),
 * whether it sits in build output, and a reader that returns its text, or
 * null when it cannot be read or is over 5 MB. Installs and version control
 * are skipped; at most `fileLimit` files are listed.
 * @param {string} target an existing absolute path
 * @param {{fileLimit?: number}} [options] `fileLimit`: BUILT_FILE_LIMIT
 *   unless the caller reads fewer
 * @returns {{files: {rel: string, built: boolean, read: () => string | null}[], truncated: boolean, missing?: number}}
 */
export function readBuiltPath(target, {fileLimit = BUILT_FILE_LIMIT} = {}) {
  /** @param {string} file */
  const reader = file => () => {
    try {
      if (fs.statSync(file).size > BUILT_FILE_MAX_BYTES) return null;
      return fs.readFileSync(file, 'utf8');
    } catch {
      return null;
    }
  };
  if (!fs.statSync(target).isDirectory()) {
    const inBuild = path
      .dirname(target)
      .split(path.sep)
      .some(part => BUILD_OUTPUT_DIRS.has(part));
    /** @type {{rel: string, built: boolean, read: () => string | null}[]} */
    const files = [
      {rel: path.basename(target), built: inBuild, read: reader(target)},
    ];
    let missing = 0;
    // A built page carries its styles and scripts in files it links: read
    // the local ones beside it, as built output.
    if (/\.html?$/iu.test(target)) {
      // A link inside an HTML comment is not one the page loads.
      const page = (reader(target)() ?? '').replace(/<!--[\s\S]*?-->/g, ' ');
      const seen = new Set([path.resolve(target)]);
      for (const match of page.matchAll(
        /<(?:link|script)\b[^>]*?\b(?:href|src)\s*=\s*(?:"([^"#?]+)|'([^'#?]+)|([^\s"'#?>]+))/giu,
      )) {
        const href = match[1] ?? match[2] ?? match[3];
        if (/^(?:[a-z][\w+.-]*:|\/\/)/iu.test(href)) continue;
        // A root-relative link names a file from the build root: the page's
        // folder or the nearest folder above it that holds the file.
        let file = path.resolve(path.dirname(target), href.replace(/^\//u, ''));
        if (href.startsWith('/')) {
          for (let dir = path.dirname(target); ; dir = path.dirname(dir)) {
            const candidate = path.join(dir, href);
            if (fs.existsSync(candidate)) {
              file = candidate;
              break;
            }
            if (path.dirname(dir) === dir) break;
          }
        }
        if (seen.has(file)) continue;
        if (!fs.existsSync(file)) {
          // Only a missing stylesheet could have held Astryx styles; a
          // missing favicon or manifest changes nothing.
          if (
            /\.css$/iu.test(href) ||
            /\brel\s*=\s*["']?stylesheet/iu.test(match[0])
          ) {
            missing++;
          }
          continue;
        }
        seen.add(file);
        files.push({
          rel: path
            .relative(path.dirname(target), file)
            .split(path.sep)
            .join('/'),
          built: true,
          read: reader(file),
        });
      }
    }
    return {files, truncated: false, missing};
  }
  /** @type {{rel: string, built: boolean, read: () => string | null}[]} */
  const files = [];
  // A path that is itself build output (`--built dist`) is read as built.
  /** @type {{dir: string, built: boolean}[]} */
  const stack = [
    {dir: target, built: BUILD_OUTPUT_DIRS.has(path.basename(target))},
  ];
  while (stack.length > 0) {
    const {dir, built} = /** @type {{dir: string, built: boolean}} */ (
      stack.pop()
    );
    let entries;
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
      continue;
    }
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (BUILT_SKIPPED_DIRS.has(entry.name)) continue;
        stack.push({
          dir: full,
          built: built || BUILD_OUTPUT_DIRS.has(entry.name),
        });
      } else if (entry.isFile()) {
        if (files.length >= fileLimit) return {files, truncated: true};
        files.push({
          rel: path.relative(target, full).split(path.sep).join('/'),
          built,
          read: reader(full),
        });
      }
    }
  }
  return {files, truncated: false};
}

/**
 * The integration packages whose components count as Astryx for a `--built`
 * path, read without running anything: each dependency the nearest
 * package.json above the path declares whose installed copy, resolved the way
 * the CLI autolinks integrations (a workspace root's hoisted copy included),
 * holds an integration manifest. Every `@astryxdesign/*` package counts
 * beside them.
 * @param {string} target the path as given
 * @param {string} cwd
 * @returns {string[]}
 */
export function builtIntegrationPackages(target, cwd) {
  const root = builtProjectRoot(target, cwd);
  return root
    ? [
        ...new Set(
          scanAutolinkCandidates(root).map(candidate => candidate.spec),
        ),
      ]
    : [];
}

/**
 * The install line for the font families a known package loads (an open
 * font the editor's table names), as the project's integration install
 * guidance gives it, else in the project's package manager, and
 * whether it loads every family given. A family no known package loads (a
 * self-hosted face) gets none: its package name would be a guess.
 * @param {string} projectDir
 * @param {string[]} families
 * @returns {Promise<{line: string | null, coversAll: boolean}>}
 */
export async function fontPackagesInstallLine(projectDir, families) {
  const {fontsourceSuggestion} = await import('../theme-edit/_settings.mjs');
  const {installLine} = await import('../theme-edit/_project.mjs');
  const known = families.map(family => {
    const s = fontsourceSuggestion(family);
    return s?.known ? s.pkg : null;
  });
  const packages = [
    ...new Set(
      known.filter(/** @returns {pkg is string} */ pkg => Boolean(pkg)),
    ),
  ];
  return {
    line: packages.length ? installLine(projectDir, packages) : null,
    coversAll: known.every(Boolean),
  };
}

/**
 * The project's skill files and each one's state against this release's
 * project skill, when the project's astryx.config `skills.to` saves no
 * `agents-md` place; null otherwise (the block is the project's place).
 * @param {string} cwd
 * @returns {Promise<Array<{file: string, state: import('../../foundation/agent-docs/managed-skill-file.mjs').ManagedFileState}> | null>}
 */
export async function savedProjectSkillFiles(cwd) {
  const root = resolveAgentDocsRoot(cwd);
  if (root == null) return null;
  const places = await readProjectPlaces(root);
  if (places.some(place => place.kind === 'agents-md')) return null;
  let text = '';
  try {
    text = renderProjectSkill(await renderAgentDocsBlock(root));
  } catch {
    // The agent-docs check reports a block that cannot render; every Astryx
    // file then reads as from another release.
  }
  return places.flatMap(place =>
    placeSkillFiles(place, root).map(file => ({file, state: managedFileState(file, text)})),
  );
}
