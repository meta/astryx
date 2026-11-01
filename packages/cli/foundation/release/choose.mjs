// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which release answers a run (spec AST-081 FR2, FR3, FR6, FR9).
 *
 * As released, the project decides who answers (DEC-10):
 *
 * - **In a project that installs its own CLI**, that CLI answers, whatever its
 *   version: every other copy hands the run to it, `astryx upgrade` included.
 * - **In a project with no CLI of its own** (only Core, or nothing installed
 *   yet), the copy that started the run answers, as it always has; a hint,
 *   once a day, names the command that adds the CLI at Core's version
 *   (notices.mjs).
 * - **When the project's own CLI cannot start**, the release equal to the
 *   project's Core answers (the matched release): the copy that started the
 *   run when it is that release, else the release in the per-user cache,
 *   installed first. When it cannot be obtained, the copy that started the
 *   run answers, announced (handoff.mjs).
 * - **Outside a project**, every copy answers itself, the global copy
 *   included; a newer release is announced, never installed (notices.mjs).
 *
 * Core deciding over the project's own CLI, and the matched release for a
 * project with only Core, are the next minor release's change.
 *
 * A copy never hands a run to itself, so a run is handed off at most once:
 * the copy it reaches makes the same choice and finds itself.
 *
 * @input  the folder, the running copy
 * @output a {@link ReleaseChoice}
 * @position foundation/release — called once per run by handoff.mjs.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  readReleaseFacts,
  readJson,
  CORE_PACKAGE_NAME,
  CLI_PACKAGE_NAME,
} from './project.mjs';
import {
  cliBinOf,
  isInReleaseCache,
  isReleaseVersion,
  resolvePublishedVersion,
  userCacheDir,
} from './cache.mjs';
import {relativeWithin, samePath} from '../fs/path-compare.mjs';

/**
 * The copy that is running.
 * @typedef {object} RunningCopy
 * @property {string} version its package version
 * @property {string} root its package folder
 */

/**
 * Who answers the run.
 * @typedef {object} ReleaseChoice
 * @property {'project' | 'starting' | 'matched' | 'carried' | 'fallback'} copy
 *   the kind of copy that answers (`meta.answeredBy.copy`): `project`, the
 *   project's own CLI; `starting`, the copy that started the run, in a project
 *   with no CLI of its own; `matched`, the release equal to the project's
 *   Core, when the project's own CLI cannot start; `carried`, outside a
 *   project; `fallback`, the copy that started the run when the matched
 *   release could not be obtained (spec AST-081 FR2, FR5)
 * @property {'self' | 'project-cli' | 'release'} answer `self`: this copy;
 *   `project-cli`: hand off to the project's CLI; `release`: hand off to the
 *   cached release `version`
 * @property {string} version the release that answers
 * @property {string | null} bin the entry file to hand off to (`project-cli`
 *   and a cached `release` that is already installed)
 * @property {string | null} coreVersion the Core the answering release pairs
 *   with, when known now
 * @property {boolean} inProject
 * @property {string | null} unavailable why the release cannot answer, when it
 *   cannot
 */

/**
 * @param {string} p
 * @returns {string}
 */
function real(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** Folder-name patterns of package-manager global installs that hold a package.json. */
const GLOBAL_OWNER_PATTERNS = [
  // pnpm: `<pnpm home>/global/5` before pnpm 10, `<pnpm home>/global/v11/<id>` since.
  /[\\/]global[\\/]v?\d+(?:[\\/][^\\/]+)?$/,
  // Yarn 1: `~/.config/yarn/global`, or `%LOCALAPPDATA%\Yarn\Data\global` on Windows.
  /[\\/]yarn[\\/](?:data[\\/])?global$/i,
  // Bun: `<BUN_INSTALL>/install/global`, `~/.bun/install/global` by default.
  /[\\/]install[\\/]global$/i,
];

/**
 * Where a global install's settings come from: the home folder, the
 * environment, and the platform. Defaults to this process's.
 * @typedef {{home?: string, env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform}} GlobalWhere
 */

/**
 * The value a line `<key> <value>` or `<key>=<value>` sets in a package
 * manager's settings file (`.yarnrc`, `.npmrc`, `bunfig.toml`), unquoted, or
 * null.
 * @param {string} file
 * @param {string} key
 * @returns {string | null}
 */
function settingIn(file, key) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(
    `^\\s*${escaped}\\s*(?:=|\\s)\\s*(.+?)\\s*$`,
    'mu',
  ).exec(text);
  if (!match) return null;
  return match[1].replace(/^(["'])(.*)\1$/u, '$2');
}

/**
 * An absolute folder from a setting, with `~` for the home folder; null for a
 * relative or empty one.
 * @param {string | null | undefined} value
 * @param {string} home
 * @param {NodeJS.Platform} platform
 * @returns {string | null}
 */
function absoluteFolder(value, home, platform) {
  if (!value) return null;
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const expanded = value.startsWith('~')
    ? paths.join(home, value.slice(1))
    : value;
  return paths.isAbsolute(expanded) ? paths.normalize(expanded) : null;
}

/**
 * The global folders the package managers' own settings name on this
 * computer, read the way each package manager reads them, never guessed from
 * a folder's layout:
 * - Bun: `$BUN_INSTALL/install/global`, else `~/.bun/install/global`, and a
 *   `globalDir` in `~/.bunfig.toml` or `$XDG_CONFIG_HOME/.bunfig.toml`.
 * - Yarn 1: the `global-folder` setting (`YARN_GLOBAL_FOLDER`,
 *   `npm_config_global_folder`, or `global-folder` in `~/.yarnrc`), else
 *   `<data folder>/global`: `%LOCALAPPDATA%\Yarn\Data` on Windows,
 *   `$XDG_DATA_HOME/yarn`, else `~/.config/yarn`.
 * - pnpm: `<PNPM_HOME>/global`, else `<data folder>/global` (`$XDG_DATA_HOME/pnpm`,
 *   else `%LOCALAPPDATA%\pnpm`, `~/Library/pnpm`, or `~/.local/share/pnpm`), and a
 *   `global-dir` in `~/.npmrc` or pnpm's `rc` file; a global install is a
 *   numbered folder below it.
 * @param {GlobalWhere} [where]
 * @returns {Array<{manager: 'bun' | 'yarn' | 'pnpm', folder: string}>}
 */
export function configuredGlobalFolders(where = {}) {
  const {
    home = os.homedir(),
    env = process.env,
    platform = process.platform,
  } = where;
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const abs = (/** @type {string | null | undefined} */ value) =>
    absoluteFolder(value, home, platform);
  const xdgConfig = abs(env.XDG_CONFIG_HOME) ?? paths.join(home, '.config');
  const xdgData = abs(env.XDG_DATA_HOME);
  const localAppData =
    abs(env.LOCALAPPDATA) ?? paths.join(home, 'AppData', 'Local');
  /** @type {Array<{manager: 'bun' | 'yarn' | 'pnpm', folder: string}>} */
  const out = [];
  // Bun
  out.push({
    manager: 'bun',
    folder: paths.join(
      abs(env.BUN_INSTALL) ?? paths.join(home, '.bun'),
      'install',
      'global',
    ),
  });
  for (const file of [
    paths.join(home, '.bunfig.toml'),
    paths.join(xdgConfig, '.bunfig.toml'),
  ]) {
    const dir = abs(settingIn(file, 'globalDir'));
    if (dir) out.push({manager: 'bun', folder: dir});
  }
  // Yarn 1
  const yarnSetting =
    abs(env.YARN_GLOBAL_FOLDER) ??
    abs(env.npm_config_global_folder) ??
    abs(settingIn(paths.join(home, '.yarnrc'), 'global-folder'));
  const yarnData =
    platform === 'win32'
      ? paths.join(localAppData, 'Yarn', 'Data')
      : xdgData
        ? paths.join(xdgData, 'yarn')
        : paths.join(home, '.config', 'yarn');
  out.push({
    manager: 'yarn',
    folder: yarnSetting ?? paths.join(yarnData, 'global'),
  });
  // pnpm
  // pnpm's data folder: PNPM_HOME, else $XDG_DATA_HOME/pnpm on any platform,
  // else the platform's own.
  const pnpmHome =
    abs(env.PNPM_HOME) ??
    (xdgData
      ? paths.join(xdgData, 'pnpm')
      : platform === 'win32'
        ? paths.join(localAppData, 'pnpm')
        : platform === 'darwin'
          ? paths.join(home, 'Library', 'pnpm')
          : paths.join(home, '.local', 'share', 'pnpm'));
  out.push({manager: 'pnpm', folder: paths.join(pnpmHome, 'global')});
  for (const file of [
    paths.join(home, '.npmrc'),
    paths.join(xdgConfig, 'pnpm', 'rc'),
  ]) {
    const dir = abs(settingIn(file, 'global-dir'));
    if (dir) out.push({manager: 'pnpm', folder: dir});
  }
  return out;
}

/**
 * The package manager's global folder that holds the CLI at `root`, when the
 * package manager's own settings name that folder (configuredGlobalFolders);
 * null otherwise. A folder that only looks like one, such as an app made with
 * `yarn add` alone or one under a folder named `install/global`, is not.
 * @param {string} root the CLI package's real folder
 * @param {GlobalWhere} [where]
 * @returns {{manager: 'bun' | 'pnpm' | 'yarn', folder: string} | null}
 */
export function globalFolderOf(root, where = {}) {
  const place = installPlaceOf(root);
  if (place.runner || !place.owner) return null;
  const owner = place.owner;
  const platform = where.platform ?? process.platform;
  for (const known of configuredGlobalFolders(where)) {
    // Compared as real folders, so a linked home folder reads the same.
    const folder = real(known.folder);
    if (known.manager === 'pnpm') {
      // `<global-dir>/<n>` before pnpm 11, `<global-dir>/v<n>/<id>` since.
      const rel = relativeWithin(folder, owner, platform);
      if (rel !== null && /^v?\d+(?:[\\/][^\\/]+)?$/u.test(rel)) {
        return {manager: 'pnpm', folder: owner};
      }
    } else if (samePath(folder, owner, platform)) {
      return {manager: known.manager, folder: owner};
    }
  }
  return null;
}

/** Path markers of package runners' temporary installs. */
const RUNNER_CACHE =
  /[\\/]_npx[\\/]|[\\/]dlx[-\\/]|[\\/]\.bun[\\/]install[\\/]cache[\\/]|[\\/]bunx-|[\\/]xfs-/i;

/**
 * Where an installed CLI package lives: its owner, the folder that holds the
 * `node_modules` it is in (above pnpm's `.pnpm` store), and whether that owner
 * is named like a package manager's default global folder (`knownGlobal`, a
 * hint only: isGlobalCopy decides from the package managers' settings). Pure:
 * reads no file, and
 * accepts either separator, so Windows paths read the same on every platform.
 * @param {string} root the package's real folder
 * @returns {{runner: boolean, owner: string | null, knownGlobal: boolean}}
 */
export function installPlaceOf(root) {
  if (RUNNER_CACHE.test(root)) {
    return {runner: true, owner: null, knownGlobal: false};
  }
  const sep = /^[A-Za-z]:\\|^\\\\/.test(root) ? '\\' : path.sep;
  const parts = root.split(/[\\/]/);
  const at = parts.lastIndexOf('node_modules');
  if (at < 1) return {runner: false, owner: null, knownGlobal: false};
  let owner = parts.slice(0, at).join(sep) || sep;
  // pnpm keeps the real folder in `<owner>/node_modules/.pnpm/<id>/node_modules`,
  // or, for its global folder before pnpm 11, in `<owner>/.pnpm/<id>/node_modules`.
  const pnpmAt = parts.lastIndexOf('.pnpm');
  if (pnpmAt > 0 && pnpmAt < at) {
    owner =
      parts
        .slice(0, parts[pnpmAt - 1] === 'node_modules' ? pnpmAt - 1 : pnpmAt)
        .join(sep) || sep;
  }
  return {
    runner: false,
    owner,
    knownGlobal: GLOBAL_OWNER_PATTERNS.some(re => re.test(owner)),
  };
}

/**
 * Whether `root` is inside a pnpm store's `links` folder (`<store>/v<N>/links`),
 * where the global virtual store keeps its packages.
 * @param {string} root
 * @returns {boolean}
 */
function inPnpmStoreLinks(root) {
  const parts = root.split(/[\\/]/);
  const at = parts.lastIndexOf('links');
  return at >= 2 && /^v\d+$/u.test(parts[at - 1]);
}

/**
 * Whether a global folder of pnpm's, as its settings name it, installs the
 * CLI package at `root`: `<global-dir>/v<N>/<id>/node_modules/@astryxdesign/cli`
 * (or `<global-dir>/<N>/node_modules/…` before pnpm 11) resolves to it.
 * @param {string} root the CLI package's real folder
 * @param {GlobalWhere} where
 * @returns {boolean}
 */
function linkedFromPnpmGlobal(root, where) {
  const platform = where.platform ?? process.platform;
  const cliIn = (/** @type {string} */ dir) =>
    path.join(dir, 'node_modules', '@astryxdesign', 'cli');
  for (const known of configuredGlobalFolders(where)) {
    if (known.manager !== 'pnpm') continue;
    /** @type {string[]} */
    let versions;
    try {
      versions = fs.readdirSync(known.folder);
    } catch {
      continue;
    }
    for (const version of versions.filter(v => /^v?\d+$/u.test(v))) {
      const dir = path.join(known.folder, version);
      /** @type {string[]} */
      let ids = [];
      try {
        ids = fs.readdirSync(dir);
      } catch {
        // Not a folder.
      }
      for (const candidate of [dir, ...ids.map(id => path.join(dir, id))]) {
        if (samePath(real(cliIn(candidate)), root, platform)) return true;
      }
    }
  }
  return false;
}

/**
 * Is the running copy the CLI package installed for the computer
 * (`npm i -g`, `pnpm add -g`, `yarn global add`, `bun add -g`, Volta)?
 *
 * Read from where the package lives: in a `node_modules` folder whose owner
 * holds no package.json (npm's global folder), or whose owner is a global
 * folder a package manager's own settings name (globalFolderOf). A copy in a
 * project, in a package runner's temporary install, or in the release cache
 * is not, and when unsure the answer is no: a copy that is not global runs no
 * update check and writes no agent skill.
 *
 * @param {string} cliRoot
 * @param {string} [cacheDir]
 * @param {GlobalWhere} [where]
 * @returns {boolean}
 */
export function isGlobalCopy(cliRoot, cacheDir = userCacheDir(), where = {}) {
  const root = real(cliRoot);
  const place = installPlaceOf(root);
  if (place.runner || !place.owner || isInReleaseCache(root, cacheDir)) {
    return false;
  }
  if (globalFolderOf(root, where)) return true;
  // pnpm's global virtual store keeps every package, a project's own CLI
  // included, in `<store>/v<N>/links/…`, whose folders hold no package.json:
  // global only when a pnpm global folder the settings name links to it.
  if (inPnpmStoreLinks(root)) return linkedFromPnpmGlobal(root, where);
  // npm's global folder holds no package.json; a project always has one.
  return !fs.existsSync(path.join(place.owner, 'package.json'));
}

/**
 * The Core release a project records, without asking the registry: the Core
 * the folder reads, else the version its lockfile records, else an exact
 * declared version; null for a range.
 * @param {import('./project.mjs').ReleaseFacts} facts
 * @returns {string | null}
 */
export function coreVersionOf(facts) {
  if (facts.core) return facts.core.version;
  if (isReleaseVersion(facts.lockedCoreVersion)) {
    return /** @type {string} */ (facts.lockedCoreVersion);
  }
  if (facts.declaredCoreRange) {
    return exactOrRange(CORE_PACKAGE_NAME, facts.declaredCoreRange).version;
  }
  return null;
}

/**
 * The release that matches a project's facts, before any registry question.
 * @param {import('./project.mjs').ReleaseFacts} facts
 * @returns {{version: string | null, range: {name: string, spec: string} | null}}
 */
export function matchedVersionOf(facts) {
  if (facts.core) return {version: facts.core.version, range: null};
  if (isReleaseVersion(facts.lockedCoreVersion)) {
    return {version: facts.lockedCoreVersion, range: null};
  }
  if (facts.declaredCoreRange) {
    return exactOrRange(CORE_PACKAGE_NAME, facts.declaredCoreRange);
  }
  if (facts.cli) return {version: facts.cli.version, range: null};
  if (isReleaseVersion(facts.lockedCliVersion)) {
    return {version: facts.lockedCliVersion, range: null};
  }
  if (facts.declaredCliRange) {
    return exactOrRange(CLI_PACKAGE_NAME, facts.declaredCliRange);
  }
  return {version: null, range: null};
}

/**
 * @param {string} name
 * @param {string} spec
 * @returns {{version: string | null, range: {name: string, spec: string} | null}}
 */
function exactOrRange(name, spec) {
  const trimmed = spec.trim().replace(/^=/, '').replace(/^v/, '');
  if (isReleaseVersion(trimmed)) return {version: trimmed, range: null};
  return {version: null, range: {name, spec}};
}

/**
 * Choose who answers a run started by `self` in `cwd`.
 *
 * A command that acts on the computer rather than the folder is chosen as
 * outside a project wherever it runs (`computer`), so a project's older CLI
 * never answers it.
 *
 * @param {{cwd: string, self: RunningCopy, cacheDir?: string, resolve?: typeof resolvePublishedVersion, computer?: boolean}} input
 * @returns {ReleaseChoice}
 */
export function chooseRelease({
  cwd,
  self,
  resolve = resolvePublishedVersion,
  computer = false,
}) {
  const facts = computer ? OUTSIDE : readReleaseFacts(cwd);
  const selfReal = real(self.root);

  if (!facts.inProject) {
    return {
      copy: 'carried',
      answer: 'self',
      version: self.version,
      bin: null,
      coreVersion: null,
      inProject: false,
      unavailable: null,
    };
  }

  // A project that installs its own CLI is answered by that CLI, whatever its
  // version, and a project with none by the copy that started the run, as
  // released (FR2, DEC-10; `spec:AST-017` FR12). Only a project whose own CLI
  // cannot start gets the Core-matched release.
  if (!facts.cli) {
    // A copy that lives inside the project itself, such as a workspace's own
    // CLI package beside its Core package, is the project's own CLI.
    const inside = isInside(selfReal, projectRootOf(facts));
    return {
      copy: inside ? 'project' : 'starting',
      answer: 'self',
      version: self.version,
      bin: null,
      coreVersion: coreVersionOf(facts),
      inProject: true,
      unavailable: null,
    };
  }
  {
    if (samePath(real(facts.cli.dir), selfReal)) {
      return {
        copy: 'project',
        answer: 'self',
        version: facts.cli.version,
        bin: null,
        coreVersion: facts.core?.version ?? null,
        inProject: true,
        unavailable: null,
      };
    }
    const bin = cliBinOf(facts.cli.dir);
    if (bin) {
      return {
        copy: 'project',
        answer: 'project-cli',
        version: facts.cli.version,
        bin,
        coreVersion: facts.core?.version ?? null,
        inProject: true,
        unavailable: null,
      };
    }
  }
  let {version, range} = matchedVersionOf(facts);
  if (!version && range) {
    version = resolve(range.name, range.spec);
    if (!version) {
      return {
        copy: 'matched',
        answer: 'release',
        version: `${range.name}@${range.spec}`,
        bin: null,
        coreVersion: null,
        inProject: true,
        unavailable: `no published release of ${range.name} matching "${range.spec}" could be found`,
      };
    }
  }

  const coreVersion = facts.core?.version ?? version;
  if (!version || version === self.version) {
    // A copy that lives inside the project itself, such as a workspace's own
    // CLI package beside its Core package, is the project's own CLI.
    if (isInside(selfReal, projectRootOf(facts))) {
      return {
        copy: 'project',
        answer: 'self',
        version: self.version,
        bin: null,
        coreVersion: facts.core?.version ?? null,
        inProject: true,
        unavailable: null,
      };
    }
    return {
      copy: 'matched',
      answer: 'self',
      version: self.version,
      bin: null,
      coreVersion,
      inProject: true,
      unavailable: null,
    };
  }
  return {
    copy: 'matched',
    answer: 'release',
    version,
    bin: null,
    coreVersion,
    inProject: true,
    unavailable: null,
  };
}

/**
 * The folder a project's facts point at: the declaring package.json's folder,
 * else the folder that holds the Core (the one above its node_modules, or the
 * workspace root above `packages/core`).
 * @param {import('./project.mjs').ReleaseFacts} facts
 * @returns {string | null}
 */
export function projectRootOf(facts) {
  if (facts.declaringDir) return facts.declaringDir;
  const dir = facts.core?.dir ?? facts.cli?.dir;
  if (!dir) return null;
  const parts = path.resolve(dir).split(path.sep);
  const at = parts.indexOf('node_modules');
  if (at > 0) return parts.slice(0, at).join(path.sep) || path.sep;
  return path.dirname(path.dirname(dir));
}

/**
 * Is `child` inside `parent` (both real paths), outside any node_modules
 * folder in between? A package installed into a project's node_modules is
 * found as the project's CLI already; this covers a copy that is part of the
 * project's own source, such as a workspace package.
 * @param {string} child
 * @param {string | null} parent
 * @returns {boolean}
 */
function isInside(child, parent) {
  if (!parent) return false;
  const rel = relativeWithin(real(parent), child);
  if (rel === null) return false;
  return !rel.split(/[\\/]/).includes('node_modules');
}

/** The facts of a folder outside any project. */
const OUTSIDE = Object.freeze({
  inProject: false,
  core: null,
  cli: null,
  declaringDir: null,
  declaredCoreRange: null,
  declaredCliRange: null,
  lockedCoreVersion: null,
  lockedCliVersion: null,
});

/** Options that take a value, so their value is not the command or topic. */
const VALUE_OPTIONS = new Set(['--lang', '--detail', '--depth']);

/**
 * Is this run a command that acts on the computer rather than the folder it
 * runs in? `astryx init --user`, which writes the computer-level agent text,
 * and `astryx docs global[/…]`, the docs of global mode itself, which the copy
 * that started the run answers, so they are readable inside a project whose
 * release predates them (spec AST-081 FR8, FR9).
 * @param {string[]} argv arguments after `astryx`
 * @returns {boolean}
 */
export function isComputerLevel(argv) {
  const words = [];
  for (let i = 0; i < argv.length && words.length < 2; i++) {
    const arg = argv[i];
    if (VALUE_OPTIONS.has(arg)) {
      i += 1;
      continue;
    }
    if (!arg.startsWith('-')) words.push(arg);
  }
  const [command, topic] = words;
  if (command === 'init') return argv.includes('--user');
  return (
    command === 'docs' &&
    typeof topic === 'string' &&
    (topic === 'global' || topic.startsWith('global/'))
  );
}

/**
 * The running copy, from its package folder.
 * @param {string} root
 * @returns {RunningCopy}
 */
export function runningCopy(root) {
  const pkg = readJson(path.join(root, 'package.json'));
  return {version: String(pkg?.version ?? '0.0.0'), root};
}

/**
 * Does the package at `cliDir` print its own who-answered line? Releases that
 * carry this module do; older ones answer silently, so the copy that hands a
 * run to them prints the line for them.
 * @param {string} cliDir
 * @returns {boolean}
 */
export function namesWhoAnswered(cliDir) {
  return fs.existsSync(
    path.join(cliDir, 'foundation', 'release', 'choose.mjs'),
  );
}

/**
 * The CLI package folder an entry file belongs to.
 * @param {string} bin
 * @returns {string}
 */
export function packageRootOf(bin) {
  let dir = path.dirname(real(bin));
  for (;;) {
    if (readJson(path.join(dir, 'package.json'))?.name === CLI_PACKAGE_NAME)
      return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.dirname(real(bin));
    dir = parent;
  }
}
