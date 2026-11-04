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
  alignCliAndCore,
  cliInstallAdvice,
  installFolder,
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
import * as path from 'node:path';
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
  CLI_ROOT,
  findProjectCoreDir,
  findInstalledPackage,
} from '../../foundation/fs/paths.mjs';
export {
  isLocalThemeOwner,
  planThemeAppWrite,
  readThemeState,
  resolveThemeModule,
} from '../../foundation/config/theme-state.mjs';
export {themeBuild, validateThemePrivateInputs} from '../theme/build/build.mjs';
export {resolveRecordedTheme} from '../theme/theme.mjs';
export {collectUnloadedFonts} from '../theme/build/font-warning.mjs';

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
 */
export function listProjectSourceFiles(root, generatedModule) {
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
        SOURCE_EXTENSIONS.has(path.extname(entry.name))
      ) {
        files.push(file);
      }
    }
  }
  return files;
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

/** @param {string} projectDir */
export function discoverDoctorUnmigratedCopies(projectDir) {
  return discoverUnmigratedThemeCopies(projectDir);
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
 * when there is none (see `cliInstallAdvice`).
 * @param {string} cwd
 * @param {string} version
 * @returns {{command: string, core: string} | null}
 */
export function addCliCommandFor(cwd, version) {
  const advice = cliInstallAdvice({cwd, core: version});
  return advice?.command ? {command: advice.command, core: advice.core} : null;
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
 * are skipped; at most BUILT_FILE_LIMIT files are listed.
 * @param {string} target an existing absolute path
 * @returns {{files: {rel: string, built: boolean, read: () => string | null}[], truncated: boolean, missing?: number}}
 */
export function readBuiltPath(target) {
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
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (BUILT_SKIPPED_DIRS.has(entry.name)) continue;
        stack.push({
          dir: full,
          built: built || BUILD_OUTPUT_DIRS.has(entry.name),
        });
      } else if (entry.isFile()) {
        if (files.length >= BUILT_FILE_LIMIT) return {files, truncated: true};
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
  let dir = path.resolve(cwd, target);
  try {
    if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir);
  } catch {
    dir = path.resolve(cwd);
  }
  for (let at = dir; ; at = path.dirname(at)) {
    if (fs.existsSync(path.join(at, 'package.json'))) {
      return [
        ...new Set(scanAutolinkCandidates(at).map(candidate => candidate.spec)),
      ];
    }
    if (path.dirname(at) === at) return [];
  }
}
