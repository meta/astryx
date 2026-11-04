// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Update notices (spec AST-081 FR10), the way `gh` and the Vercel CLI
 * tell their users about a newer release: after the command finishes, on
 * standard error, at most once a day per notice, never in machine-readable
 * output, and never when the environment turns them off (`CI`,
 * `NO_UPDATE_NOTIFIER`; update-notice-env.mjs). Unlike `gh`, a notice prints
 * when standard error is not a terminal too, because agents run the CLI
 * without one.
 *
 * Each notice is two lines:
 *
 *     A new release of Astryx is available: 0.7.2 → 0.7.3
 *     To upgrade, run: npm i -g @astryxdesign/cli@latest
 *
 * - Outside a project, about the global copy that answered, with the command
 *   of the package manager that installed it (npm, pnpm, Yarn, Bun, Volta),
 *   read from where it lives, as the Vercel CLI does.
 * - Inside a project, about the project's release, with the project's install
 *   and `upgrade` commands.
 * - In any folder, about an `astryx` command first on the search path that
 *   predates the hand-off and so answers every folder itself.
 *
 * A newer release needs a check that has reached the registry
 * (global-state.mjs); the last kind needs none. When the newest release needs
 * a newer Node than the computer runs, the second line says so. Prerelease and
 * canary versions are never reported as behind. The times of the notices are
 * kept in the per-user state file; a time that cannot be recorded keeps the
 * notice from printing, so it never prints on every run.
 *
 * @input  the per-user state, the release choice, the project's files, the
 *   search path, the clock, and the environment
 * @output notice lines, and the facts doctor reports
 * @position foundation/release — printed by handoff.mjs's startRun after the
 *   command, read by doctor.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {userConfigDir} from '../env/user-dirs.mjs';
import {astryxCommandsOnSearchPath} from '../env/search-path.mjs';
import {
  CLI_PACKAGE,
  commandInFolder,
  detectPackageManager,
  getCliInvocation,
} from '../env/package-manager.mjs';
import {findAstryxProject, findPackageRoot} from '../fs/paths.mjs';
import {satisfiesRange, semverCompare} from '../env/semver.mjs';
import {isInReleaseCache, isReleaseVersion} from './cache.mjs';
import {
  knownLatest,
  readGlobalState,
  stateFile,
  tryStateLock,
  writeGlobalState,
} from './global-state.mjs';
import {
  coreVersionOf,
  globalFolderOf,
  isGlobalCopy,
  projectRootOf,
} from './choose.mjs';
import {readReleaseFacts} from './project.mjs';
import {samePath} from '../fs/path-compare.mjs';
import {updateNoticesOff} from './update-notice-env.mjs';

/** A notice prints at most once in this long. */
export const NOTICE_INTERVAL_MS = 24 * 60 * 60_000;

/** Notice times older than this are dropped from the state file. */
const FORGET_AFTER_MS = 30 * 24 * 60 * 60_000;

/**
 * The CLI package at its newest release, for every upgrade command. Spelled
 * out, not built from package-manager.mjs's constant: that module reaches
 * this one through the run context, so its bindings are not ready when this
 * module loads.
 */
const LATEST = '@astryxdesign/cli@latest';

/**
 * Whether notice `key` may print now; when it may, its time is recorded
 * first, and a time that cannot be recorded keeps it from printing.
 * @param {string} key
 * @param {{stateDir?: string, now?: number}} [options]
 * @returns {boolean}
 */
export function takeNotice(
  key,
  {stateDir = userConfigDir(), now = Date.now()} = {},
) {
  try {
    fs.mkdirSync(stateDir, {recursive: true});
  } catch {
    return false;
  }
  // Read, decide, and record under one lock: of the runs that finish at the
  // same moment, exactly one takes the notice.
  const outcome = tryStateLock(stateDir, () => {
    const state = readGlobalState(stateDir);
    const shown = state.notifiedAt ?? {};
    const last = shown[key];
    if (typeof last === 'number' && now - last < NOTICE_INTERVAL_MS) {
      const skips = withSkip(state.noticeSkips, key, 'already-shown', now);
      if (skips) writeGlobalState({...state, noticeSkips: skips}, stateDir);
      return /** @type {const} */ ('already-shown');
    }
    /** @type {Record<string, number>} */
    const next = {};
    for (const [k, t] of Object.entries(shown)) {
      if (typeof t === 'number' && now - t < FORGET_AFTER_MS) next[k] = t;
    }
    next[key] = now;
    return writeGlobalState({...state, notifiedAt: next}, stateDir)
      ? /** @type {const} */ ('taken')
      : /** @type {const} */ ('state-unwritable');
  });
  // A skip is recorded only inside the lock that made the decision. A lock
  // held past the wait, or a state file that cannot be written, records
  // nothing: doctor names a lock's holder from the lock itself.
  return outcome.ran && outcome.value === 'taken';
}

/** A skip with the same reason is recorded again only after this long. */
const SKIP_RECORD_INTERVAL_MS = 60 * 60_000;

/**
 * `skips` with `key`'s skip set to `reason` at `now`, dropping skips older
 * than {@link FORGET_AFTER_MS}; null when the same reason was recorded within
 * {@link SKIP_RECORD_INTERVAL_MS}, so a notice skipped on every run does not
 * rewrite the state file on every run.
 * @param {Record<string, import('./global-state.mjs').NoticeSkip> | undefined} skips
 * @param {string} key
 * @param {import('./global-state.mjs').NoticeSkip['reason']} reason
 * @param {number} now
 * @returns {Record<string, import('./global-state.mjs').NoticeSkip> | null}
 */
function withSkip(skips, key, reason, now) {
  const last = skips?.[key];
  if (last?.reason === reason && now - last.at < SKIP_RECORD_INTERVAL_MS) {
    return null;
  }
  /** @type {Record<string, import('./global-state.mjs').NoticeSkip>} */
  const next = {};
  for (const [k, skip] of Object.entries(skips ?? {})) {
    if (
      skip &&
      typeof skip.at === 'number' &&
      now - skip.at < FORGET_AFTER_MS
    ) {
      next[k] = skip;
    }
  }
  next[key] = {reason, at: now};
  return next;
}

/**
 * Record why notice `key` did not print (state `noticeSkips`), for diagnosis
 * only. It adds to a state file that already exists and never creates one, so
 * a run that keeps no state (a project's own CLI before any check) writes
 * nothing. It is written only while this run holds the state file's lock:
 * when the lock stays taken or the file cannot be written, nothing is
 * recorded, and a run never fails because of it.
 * @param {string} key
 * @param {import('./global-state.mjs').NoticeSkip['reason']} reason
 * @param {{stateDir?: string, now?: number}} [options]
 */
export function recordNoticeSkip(
  key,
  reason,
  {stateDir = userConfigDir(), now = Date.now()} = {},
) {
  try {
    if (!fs.existsSync(stateFile(stateDir))) return;
    tryStateLock(stateDir, () => {
      const state = readGlobalState(stateDir);
      const skips = withSkip(state.noticeSkips, key, reason, now);
      if (skips) writeGlobalState({...state, noticeSkips: skips}, stateDir);
    });
  } catch {
    // Diagnosis only.
  }
}

/**
 * The newest notice skip the state file records, with the notice it was for.
 * @param {{stateDir?: string}} [options]
 * @returns {({key: string} & import('./global-state.mjs').NoticeSkip) | null}
 */
export function lastNoticeSkip({stateDir = userConfigDir()} = {}) {
  /** @type {({key: string} & import('./global-state.mjs').NoticeSkip) | null} */
  let newest = null;
  for (const [key, skip] of Object.entries(
    readGlobalState(stateDir).noticeSkips ?? {},
  )) {
    if (
      skip &&
      typeof skip.at === 'number' &&
      (!newest || skip.at > newest.at)
    ) {
      newest = {key, ...skip};
    }
  }
  return newest;
}

/**
 * Is `version` a plain release older than `newest`?
 * @param {string | null | undefined} version
 * @param {string | null | undefined} newest
 * @returns {boolean}
 */
function isBehind(version, newest) {
  return (
    isReleaseVersion(version) &&
    isReleaseVersion(newest) &&
    !version.includes('-') &&
    !newest.includes('-') &&
    semverCompare(newest, version) > 0
  );
}

/**
 * The command that upgrades a CLI installed for the computer, by the package
 * manager whose global folder holds it (the Vercel CLI reads it the same
 * way); npm when none is recognized. A CLI that npm installed under a prefix
 * of its own (`npm i -g --prefix ~/.local`, `NPM_CONFIG_PREFIX`, or `prefix=`
 * in an `.npmrc`) is upgraded into that same prefix, named with `--prefix`,
 * so the upgrade lands where the running copy is whatever npm's settings are
 * when it runs. pnpm, Yarn, and Bun read their global folder from their own
 * settings, so their plain command reinstalls in place.
 * @param {string} cliRoot the CLI package's folder
 * @param {{execPath?: string, home?: string, platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv}} [where]
 * @returns {string}
 */
export function globalUpgradeCommand(cliRoot, where = {}) {
  let at = cliRoot;
  try {
    at = fs.realpathSync(cliRoot);
  } catch {
    // Read the path as given.
  }
  if (/[\\/]\.volta[\\/]/iu.test(at)) return `volta install ${LATEST}`;
  const {
    home = os.homedir(),
    platform = process.platform,
    env = process.env,
  } = where;
  const global = globalFolderOf(at, {home, platform, env});
  // Each reads the same settings that named its global folder, so its plain
  // command reinstalls into that folder.
  if (global?.manager === 'bun') return `bun add -g ${LATEST}`;
  if (global?.manager === 'yarn') return `yarn global add ${LATEST}`;
  if (
    global?.manager === 'pnpm' ||
    /[\\/]pnpm[\\/]|[\\/]global[\\/]v?\d+[\\/]/iu.test(at)
  ) {
    return `pnpm add -g ${LATEST}`;
  }
  const prefix = npmOwnPrefix(at, where);
  return prefix
    ? `npm i -g --prefix ${prefix} ${LATEST}`
    : `npm i -g ${LATEST}`;
}

/**
 * The npm prefix that holds the CLI at `at`, as a person types it (`~` for
 * the home folder outside Windows), when it is not one npm uses by default:
 * Node's own prefix, `/usr/local` or `/usr`, or `%APPDATA%\\npm` on Windows.
 * Null for any other layout.
 * @param {string} at the CLI package's real path
 * @param {{execPath?: string, home?: string, platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv}} where
 * @returns {string | null}
 */
function npmOwnPrefix(at, where) {
  const {
    execPath = process.execPath,
    home = os.homedir(),
    platform = process.platform,
    env = process.env,
  } = where;
  const win = platform === 'win32';
  const paths = win ? path.win32 : path.posix;
  const parts = at.split(/[\\/]/);
  const n = parts.length;
  if (parts[n - 1] !== 'cli' || parts[n - 2] !== '@astryxdesign') return null;
  if (parts[n - 3] !== 'node_modules') return null;
  // npm's global folder: `<prefix>/lib/node_modules` on macOS and Linux,
  // `<prefix>\\node_modules` on Windows.
  const depth = win ? n - 3 : n - 4;
  if (!win && parts[n - 4] !== 'lib') return null;
  const prefix = parts.slice(0, depth).join(win ? '\\' : '/') || paths.sep;
  const defaults = win
    ? [
        paths.dirname(execPath),
        ...(env.APPDATA ? [paths.join(env.APPDATA, 'npm')] : []),
      ]
    : [paths.dirname(paths.dirname(execPath)), '/usr/local', '/usr'];
  if (defaults.some(d => samePath(d, prefix, platform))) return null;
  if (!win) {
    const rel = paths.relative(home, prefix);
    if (rel === '') return '~';
    if (!rel.startsWith('..') && !paths.isAbsolute(rel)) return `~/${rel}`;
  }
  return /\s/.test(prefix) ? JSON.stringify(prefix) : prefix;
}

/**
 * The second line of a notice: the command, after the Node it needs when the
 * computer runs an older one.
 * @param {string} command
 * @param {string | null} node the Node range the newest release declares
 * @param {string} [nodeVersion]
 * @returns {string}
 */
export function upgradeLine(
  command,
  node,
  nodeVersion = process.versions.node,
) {
  return node && !satisfiesRange(nodeVersion, node)
    ? `To upgrade, install Node ${node} (this computer runs Node ${nodeVersion}), then run: ${command}`
    : `To upgrade, run: ${command}`;
}

/**
 * The first line of a newer-release notice.
 * @param {string} current
 * @param {string} newest
 * @returns {string}
 */
export function availableLine(current, newest) {
  return `A new release of Astryx is available: ${current} → ${newest}`;
}

/**
 * @typedef {object} GlobalBehind
 * @property {string} current the global copy's version
 * @property {string} newest the newest release known
 * @property {string | null} node the Node range it declares
 * @property {string} command the command that upgrades the global copy
 */

/**
 * Whether the global copy is older than the newest release known.
 * @param {{self: {version: string, root: string}, stateDir?: string}} options
 * @returns {GlobalBehind | null}
 */
export function globalBehind({self, stateDir = userConfigDir()}) {
  const latest = knownLatest(stateDir);
  if (!latest || !isBehind(self.version, latest.version)) return null;
  return {
    current: self.version,
    newest: latest.version,
    node: latest.node,
    command: globalUpgradeCommand(self.root),
  };
}

/**
 * @typedef {object} ProjectLag
 * @property {string} root the project's folder
 * @property {string} current the release that answers it
 * @property {string} newest the newest release known
 * @property {string | null} node the Node range the newest release declares
 * @property {string} install the command that installs the newest release
 * @property {string} upgrade the command that migrates the project
 */

/**
 * The install verb of each package manager.
 * @type {Record<string, string>}
 */
const ADD = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  yarn: 'yarn add',
  bun: 'bun add',
};

/**
 * The command that adds a package to the project of a run in `cwd`, with the
 * project's package manager (spec AST-081 FR12). Null when `cwd` belongs to
 * no project `spec:AST-040` FR9 defines, and in a folder inside the project
 * whose package.json is not the project's (see {@link installFolder}): a run
 * there loads integrations from that package.json, so a package added to the
 * project would stay unused there, and the advice is
 * {@link RUN_FROM_PROJECT}.
 * @param {string} cwd
 * @returns {((name: string) => string) | null}
 */
export function projectAddCommand(cwd) {
  const target = installFolder(cwd);
  if (target == null || target.moved) return null;
  const add = ADD[detectPackageManager(cwd)] ?? ADD.npm;
  return name => `${add} ${name}`;
}

/**
 * The commands that bring a project's own CLI and Core to one release, with
 * the project's package manager: when the CLI is newer, Core up to it and then
 * the codemods from Core's release; otherwise the CLI to Core's release.
 * Null in a folder that belongs to no project, or whose package.json is not
 * the project's (see {@link installFolder}).
 * @param {{cwd: string, cli: string, core: string}} options
 * @returns {string | null}
 */
export function alignCliAndCore({cwd, cli, core}) {
  const target = installFolder(cwd);
  if (target == null || target.moved) return null;
  const root = projectRootOf(readReleaseFacts(cwd)) ?? cwd;
  return alignIn(root, cli, core);
}

/**
 * The commands that bring the CLI and Core of the project at `root` to one
 * release, run in `root`.
 * @param {string} root
 * @param {string} cli
 * @param {string} core
 * @returns {string}
 */
function alignIn(root, cli, core) {
  const add = ADD[detectPackageManager(root)] ?? ADD.npm;
  if (semverCompare(cli, core) > 0) {
    return `${add} @astryxdesign/core@${cli}, then ${getCliInvocation(root, {installed: true})} upgrade --from ${core} --apply`;
  }
  return `${add} ${CLI_PACKAGE}@${core}`;
}

/**
 * Where a command that adds an Astryx package runs, for a run in `cwd`: in
 * the project `spec:AST-040` FR9 defines, which stops at a repository root
 * and never counts the home folder (spec AST-081 FR2, FR10). Null when `cwd`
 * belongs to no such project, so no command adds anything. When `cwd`'s
 * nearest package.json is not the project's, as in a tool folder that
 * installs its own Core, a package manager would add to the tool's
 * package.json, so `moved` says the command runs in the project's folder.
 * @param {string} cwd
 * @returns {{dir: string, moved: boolean} | null}
 */
export function installFolder(cwd) {
  const project = findAstryxProject(cwd);
  if (project == null) return null;
  const nearest = findPackageRoot(cwd);
  if (nearest == null || nearest === project) return {dir: cwd, moved: false};
  return {dir: project, moved: true};
}

/**
 * What to tell a run in a folder inside a project whose package.json is not
 * the project's: run from the project's folder, since adding there would make
 * the folder a project of its own (spec AST-081 FR2).
 */
export const RUN_FROM_PROJECT =
  "Run this from the Astryx project's folder, or declare an Astryx package in this folder's package.json to make it a project of its own.";

/**
 * The command that adds the CLI at Core's version, for a run in `cwd` whose
 * Core is `core`, with the project's package manager in the project root.
 * `command` is null in a folder inside the project whose package.json is not
 * the project's (see {@link installFolder}), where the advice is
 * {@link RUN_FROM_PROJECT}. Null when the folder belongs to no project.
 * @param {{cwd: string, core: string}} options
 * @returns {{root: string, core: string, command: string | null} | null}
 */
export function cliInstallAdvice({cwd, core}) {
  const target = installFolder(cwd);
  if (target == null) return null;
  if (target.moved) return {root: target.dir, core, command: null};
  const root = projectRootOf(readReleaseFacts(cwd)) ?? cwd;
  return {root, core, command: addCliCommand(root, core)};
}

/**
 * The hint for a project with no CLI of its own, answered by `answered` while
 * its Core is `core`: the command that adds the CLI at Core's version, with
 * the project's package manager (see {@link cliInstallAdvice}). Null when no
 * command fits, or when the project the command adds to already matches.
 * @param {{cwd: string, answered: string, core: string}} options
 * @returns {{root: string, line: string} | null}
 */
export function noCliHint({cwd, answered, core}) {
  if (core === answered) return null;
  const advice = cliInstallAdvice({cwd, core});
  if (advice == null) return null;
  return {
    root: advice.root,
    line: noCliHintLine(answered, core, advice.command),
  };
}

/**
 * The hint's text.
 * @param {string} answered
 * @param {string} core
 * @param {string | null} command the command that adds the CLI at Core's
 *   version; null in a folder whose package.json is not the project's
 * @returns {string}
 */
export function noCliHintLine(answered, core, command) {
  const head = `astryx: this project has no Astryx CLI installed; answered by CLI ${answered} while its Core is ${core}.`;
  return command
    ? `${head} To match, run: ${command}`
    : `${head} ${RUN_FROM_PROJECT}`;
}

/**
 * The command that installs the CLI at `version` in the project at `root`,
 * with its package manager.
 * @param {string} root
 * @param {string} version
 * @returns {string}
 */
export function addCliCommand(root, version) {
  return `${ADD[detectPackageManager(root)] ?? ADD.npm} ${CLI_PACKAGE}@${version}`;
}

/**
 * Whether the project's release is older than the newest release known, and
 * the commands that upgrade it.
 * @param {{cwd: string, current: string, stateDir?: string}} options
 * @returns {ProjectLag | null}
 */
export function projectLag({cwd, current: given, stateDir = userConfigDir()}) {
  const latest = knownLatest(stateDir);
  if (!latest) return null;
  const facts = readReleaseFacts(cwd);
  if (!facts.inProject) return null;
  const target = installFolder(cwd);
  if (target == null) return null;
  const root = target.moved ? target.dir : (projectRootOf(facts) ?? cwd);
  // From a folder inside the project, the project's own release: its CLI's,
  // else its Core's, so the project gets one notice and one --from.
  const projectFacts = target.moved ? readReleaseFacts(root) : null;
  const current = projectFacts
    ? (projectFacts.cli?.version ?? coreVersionOf(projectFacts) ?? given)
    : given;
  if (!isBehind(current, latest.version)) return null;
  const newest = latest.version;
  const pm = detectPackageManager(root);
  // The CLI is always installed beside Core: a project that installed only
  // Core gets it too, as recommended, so its version is pinned with Core's.
  // From a folder inside the project whose package.json is not the
  // project's, the install runs in the project's folder (see installFolder).
  const add = `${ADD[pm] ?? ADD.npm} @astryxdesign/core@${newest} ${CLI_PACKAGE}@${newest}`;
  const install = target.moved ? commandInFolder(root, add) : add;
  // The command runs after the install above, so the picker's guess is the
  // project's own CLI (spec AST-081 FR5).
  const stem = getCliInvocation(root, {installed: true});
  return {
    root,
    current,
    newest,
    node: latest.node,
    install,
    upgrade: target.moved
      ? commandInFolder(root, `${stem} upgrade --from ${current} --apply`)
      : `${stem} upgrade --from ${current} --apply`,
  };
}

/**
 * The first `astryx` on the search path, when it is an Astryx CLI release
 * that predates the hand-off and is not the running copy.
 * @param {{selfRoot?: string, searchPath?: string, platform?: NodeJS.Platform}} [options]
 * @returns {{file: string, version: string | null, command: string} | null}
 */
export function oldGlobalCommand({selfRoot, ...options} = {}) {
  const first = astryxCommandsOnSearchPath(options)[0];
  if (!first?.astryx || !first.cliRoot || first.handsOff !== false) return null;
  if (selfRoot && samePath(real(selfRoot), real(first.cliRoot))) return null;
  return {
    file: first.file,
    version: first.version,
    command: globalUpgradeCommand(first.cliRoot),
  };
}

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

/**
 * The two lines about a global copy that predates the hand-off.
 * @param {{version: string | null, command: string}} old
 * @returns {string[]}
 */
export function oldGlobalLines(old) {
  return [
    `The astryx command on this computer runs CLI ${old.version ?? 'of an unknown version'}, which answers every folder itself.`,
    `To upgrade, run: ${old.command}`,
  ];
}

/**
 * The notice lines to print after a command, each notice recorded as shown.
 * Empty in machine-readable runs and when the environment turns notices off.
 * Never throws.
 * @param {{
 *   cwd: string,
 *   self: {version: string, root: string},
 *   choice: {inProject: boolean, version: string, copy?: string, coreVersion?: string | null},
 *   json?: boolean,
 *   stateDir?: string,
 *   cacheDir?: string,
 *   now?: number,
 *   env?: Record<string, string | undefined>,
 *   searchPath?: string,
 * }} options
 * @returns {string[]}
 */
export function noticeLines({
  cwd,
  self,
  choice,
  json = false,
  stateDir = userConfigDir(),
  cacheDir,
  now = Date.now(),
  env = process.env,
  searchPath,
}) {
  // A run inside the release cache is the CLI checking a release it
  // installed, never a person's run.
  if (json || updateNoticesOff(env) || isInReleaseCache(cwd, cacheDir)) {
    return [];
  }
  /** @type {string[]} */
  const lines = [];
  const take = (/** @type {string} */ key) => takeNotice(key, {stateDir, now});
  try {
    // A project with no CLI of its own, answered by a release other than its
    // Core's: once a day per project, how to match them (FR2).
    if (choice.inProject && choice.copy === 'starting' && choice.coreVersion) {
      const hint = noCliHint({
        cwd,
        answered: choice.version,
        core: choice.coreVersion,
      });
      if (hint && take(`no-cli:${hint.root}`)) lines.push(hint.line);
    }
  } catch {
    // A hint never fails a run.
  }
  try {
    if (choice.inProject) {
      // The project's version is its own CLI's, or, with none, its Core's.
      const current =
        choice.copy === 'starting' && choice.coreVersion
          ? choice.coreVersion
          : choice.version;
      // A folder that belongs to no project (spec AST-040 FR9) gets no
      // project notice; the skip says why.
      const noProject = installFolder(cwd) == null;
      const lag = noProject ? null : projectLag({cwd, current, stateDir});
      if (!lag) {
        recordNoticeSkip('project', noProject ? 'no-project' : 'no-newer', {
          stateDir,
          now,
        });
      }
      if (lag && take(`project:${lag.root}`)) {
        lines.push(
          availableLine(lag.current, lag.newest),
          upgradeLine(`${lag.install}, then ${lag.upgrade}`, lag.node),
        );
      }
    } else if (isGlobalCopy(self.root, cacheDir)) {
      const behind = globalBehind({self, stateDir});
      if (!behind) recordNoticeSkip('global', 'no-newer', {stateDir, now});
      if (behind && take('global')) {
        lines.push(
          availableLine(behind.current, behind.newest),
          upgradeLine(behind.command, behind.node),
        );
      }
    }
  } catch {
    // A notice never fails a run.
  }
  try {
    const shown = readGlobalState(stateDir).notifiedAt?.['old-global'];
    if (typeof shown !== 'number' || now - shown >= NOTICE_INTERVAL_MS) {
      const old = oldGlobalCommand({
        selfRoot: self.root,
        ...(searchPath === undefined ? {} : {searchPath}),
      });
      if (old && take('old-global')) lines.push(...oldGlobalLines(old));
    }
  } catch {
    // Nor does this one.
  }
  return lines;
}
