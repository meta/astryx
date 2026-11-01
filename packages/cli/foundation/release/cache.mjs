// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The per-user cache of CLI releases.
 *
 * Global mode answers some runs with a release other than the copy that
 * started them (spec AST-081 FR2, FR6): the release that matches a project's
 * Core, the newest release for the global copy, or the Core a copy carries
 * outside a project. Each is installed here, once, through the package
 * manager, and reused by every later run:
 *
 *     <user cache>/astryx/releases/<version>/
 *       package.json                 (an empty private package)
 *       node_modules/@astryxdesign/cli
 *       node_modules/@astryxdesign/core
 *       release.json                 (written last: the release is verified)
 *
 * A release counts only once `release.json` exists. It is written after the
 * install finished, the CLI started and reported its own version, and the
 * release supports this computer's Node. An install builds in a temporary
 * folder beside the others and is renamed into place, so a run never sees a
 * half-installed release, and a lock keeps two runs from installing the same
 * release at once.
 *
 * The package manager is npm, started from the Node that runs the CLI, so the
 * registry, proxy, and offline settings in the user's npm configuration
 * apply. No Astryx setting changes where or how releases install.
 *
 * @input  a release version
 * @output the release's folder, or why it is unavailable
 * @position foundation/release — used by the bin's hand-off, by the carried
 *   Core lookup, and by the background refresh worker.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {satisfiesRange} from '../env/semver.mjs';
import {readJson} from './project.mjs';
import {userCacheDir as userCacheDirFor} from '../env/user-dirs.mjs';
import {foreignLockIsSilent} from './lock-lease.mjs';
import {relativeWithin} from '../fs/path-compare.mjs';

/**
 * The per-user cache directory every Astryx cache lives in, never inside a
 * project (`foundation/env/user-dirs.mjs`).
 * @returns {string}
 */
export function userCacheDir() {
  return userCacheDirFor();
}

/**
 * The folder all cached releases live in.
 * @param {string} [cacheDir]
 * @returns {string}
 */
export function releasesDir(cacheDir = userCacheDir()) {
  return path.join(cacheDir, 'releases');
}

/** A release version safe to use as a folder name and an npm spec. */
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Is `version` a plain release version?
 * @param {unknown} version
 * @returns {version is string}
 */
export function isReleaseVersion(version) {
  return typeof version === 'string' && VERSION_RE.test(version);
}

/**
 * A cached, verified release.
 * @typedef {object} CachedRelease
 * @property {string} version
 * @property {string} dir the release folder
 * @property {string} cliDir its `@astryxdesign/cli`
 * @property {string} coreDir its `@astryxdesign/core`
 * @property {string} bin the CLI's `astryx` entry file
 */

/**
 * The entry file a CLI package's `astryx` bin points at.
 * @param {string} cliDir
 * @returns {string | null}
 */
export function cliBinOf(cliDir) {
  const pkg = readJson(path.join(cliDir, 'package.json'));
  const bin =
    typeof pkg?.bin === 'string' ? pkg.bin : pkg?.bin && pkg.bin.astryx;
  if (typeof bin !== 'string') return null;
  const file = path.join(cliDir, bin);
  return fs.existsSync(file) ? file : null;
}

/**
 * The files whose bytes a cached release's marker records, relative to the
 * release folder: enough to notice a damaged or half-written release without
 * reading every file on each run.
 * @param {string} bin the CLI's entry file
 * @param {string} dir the release folder
 * @returns {string[]}
 */
function checkedFiles(bin, dir) {
  return [
    path.join('node_modules', '@astryxdesign', 'cli', 'package.json'),
    path.join('node_modules', '@astryxdesign', 'core', 'package.json'),
    path.relative(dir, bin),
  ];
}

/**
 * The sha256 of a file, or null when it cannot be read.
 * @param {string} file
 * @returns {string | null}
 */
function fileHash(file) {
  try {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * The cached release `version`, when it is installed and verified: its
 * marker parses, names the version, and records the bytes of the CLI's and
 * Core's package.json and the CLI's entry file, and those files still have
 * them, and the number and total size of the two packages' files are the
 * ones recorded. Anything else is a damaged release, which counts as absent and is
 * replaced the next time a run needs it.
 * @param {string} version
 * @param {string} [cacheDir]
 * @returns {CachedRelease | null}
 */
export function cachedRelease(version, cacheDir = userCacheDir()) {
  if (!isReleaseVersion(version)) return null;
  const key = `${cacheDir}\0${version}`;
  if (verified.has(key)) return verified.get(key) ?? null;
  const result = verifyRelease(version, cacheDir);
  // Only a verified release is remembered; an absent one is looked at again,
  // since another run may be installing it.
  if (result) verified.set(key, result);
  return result;
}

/**
 * Releases this process already verified, so a run checks each one once.
 * @type {Map<string, CachedRelease>}
 */
const verified = new Map();

/** Forget which releases this process verified, so the next look checks again. */
export function forgetVerifiedReleases() {
  verified.clear();
}

/**
 * The number of files and their total size under a package folder.
 * @param {string} dir
 * @returns {{count: number, bytes: number}}
 */
function treeSize(dir) {
  let count = 0;
  let bytes = 0;
  /** @param {string} d */
  const walk = d => {
    for (const entry of fs.readdirSync(d, {withFileTypes: true})) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else {
        count += 1;
        bytes += fs.statSync(p).size;
      }
    }
  };
  walk(dir);
  return {count, bytes};
}

/**
 * The size record of a release's two packages.
 * @param {string} dir the release folder
 * @returns {{cli: {count: number, bytes: number}, core: {count: number, bytes: number}} | null}
 */
export function releaseTree(dir) {
  try {
    return {
      cli: treeSize(path.join(dir, 'node_modules', '@astryxdesign', 'cli')),
      core: treeSize(path.join(dir, 'node_modules', '@astryxdesign', 'core')),
    };
  } catch {
    return null;
  }
}

/**
 * The check behind {@link cachedRelease}.
 * @param {string} version
 * @param {string} cacheDir
 * @returns {CachedRelease | null}
 */
function verifyRelease(version, cacheDir) {
  const dir = path.join(releasesDir(cacheDir), version);
  const marker = readJson(path.join(dir, 'release.json'));
  if (!marker || marker.version !== version || !marker.files) return null;
  const cliDir = path.join(dir, 'node_modules', '@astryxdesign', 'cli');
  const coreDir = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  const bin = cliBinOf(cliDir);
  if (!bin) return null;
  for (const rel of checkedFiles(bin, dir)) {
    const want = marker.files[rel.split(path.sep).join('/')];
    if (typeof want !== 'string' || fileHash(path.join(dir, rel)) !== want) {
      return null;
    }
  }
  // Every other file of the two packages: a deleted or truncated module
  // changes the count or the total size.
  if (
    JSON.stringify(releaseTree(dir)) !== JSON.stringify(marker.tree ?? null)
  ) {
    return null;
  }
  return {version, dir, cliDir, coreDir, bin};
}

/**
 * Is `dir` inside the release cache? A copy that lives there was started by
 * global mode, never installed by a person.
 * @param {string} dir
 * @param {string} [cacheDir]
 * @returns {boolean}
 */
export function isInReleaseCache(dir, cacheDir = userCacheDir()) {
  return (
    relativeWithin(realOrSelf(releasesDir(cacheDir)), realOrSelf(dir)) !== null
  );
}

/**
 * @param {string} p
 * @returns {string}
 */
function realOrSelf(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * How to start npm, never through a shell, so nothing a project declares is
 * read by one: npm's own entry file run with this Node, from beside the
 * running Node, else from beside an `npm` on the PATH (on Windows, npm's
 * `npm.cmd` shim sits next to its `node_modules`); else `npm` on the PATH,
 * started directly. An `npm` beside the running Node or on the PATH that
 * links to npm's entry file (as distribution packages install it, such as
 * `/usr/bin/npm` to `/usr/lib/node_modules_22/npm/bin/npm-cli.js`) counts as
 * that entry file.
 * @param {{env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, execPath?: string}} [where]
 *   `execPath`: the Node that runs npm (default: this one)
 * @returns {{command: string, prefix: string[], shell: false}}
 */
export function npmCommand(where = {}) {
  const {
    env = process.env,
    platform = process.platform,
    execPath = process.execPath,
  } = where;
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const nodeDir = paths.dirname(execPath);
  const entry = (/** @type {string} */ dir) =>
    paths.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const candidates = [
    ...(platform === 'win32'
      ? [entry(nodeDir)]
      : [
          paths.join(
            nodeDir,
            '..',
            'lib',
            'node_modules',
            'npm',
            'bin',
            'npm-cli.js',
          ),
          entry(nodeDir),
        ]),
    ...String(env.PATH ?? env.Path ?? '')
      .split(platform === 'win32' ? ';' : ':')
      .filter(Boolean)
      .filter(dir =>
        fs.existsSync(
          paths.join(dir, platform === 'win32' ? 'npm.cmd' : 'npm'),
        ),
      )
      .flatMap(dir =>
        platform === 'win32'
          ? [entry(dir)]
          : [
              paths.join(
                dir,
                '..',
                'lib',
                'node_modules',
                'npm',
                'bin',
                'npm-cli.js',
              ),
            ],
      ),
  ];
  if (platform !== 'win32') {
    // An `npm` that links to npm's entry file: beside the running Node first.
    for (const dir of [
      nodeDir,
      ...String(env.PATH ?? '')
        .split(':')
        .filter(Boolean),
    ]) {
      try {
        const real = fs.realpathSync(paths.join(dir, 'npm'));
        if (paths.basename(real) === 'npm-cli.js') candidates.push(real);
      } catch {
        // No npm there.
      }
    }
  }
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return {command: execPath, prefix: [file], shell: false};
    }
  }
  return {command: 'npm', prefix: [], shell: false};
}

/**
 * Whether `spec` reads as an npm version range and nothing else: versions,
 * `x`/`*` wildcards, prerelease tags, the range operators, `||`, and spaces.
 * Anything a shell or npm would read as more, such as `&`, `;`, a lone `|`,
 * quotes, or a URL, is refused.
 * @param {string} spec
 * @returns {boolean}
 */
export function isVersionRange(spec) {
  if (typeof spec !== 'string' || spec.trim() === '' || spec.length > 256) {
    return false;
  }
  if (/[^0-9A-Za-z.\-+^~<>=|*\s]/u.test(spec)) return false;
  return !/(?:^|[^|])\|(?:[^|]|$)/u.test(spec);
}

/**
 * The result of running npm.
 * @typedef {object} NpmResult
 * @property {number | null} status
 * @property {NodeJS.Signals | null} [signal] the signal that ended npm, such as Ctrl-C's
 * @property {string} stdout
 * @property {string} stderr
 * @property {Error} [error]
 */

/**
 * Run npm synchronously with no output on the caller's streams.
 * @param {string[]} args
 * npm runs under npm-guard.mjs, which gives it a process group of its own
 * and ends that group when the time limit passes, when this run goes away
 * (even killed outright), or when this run receives Ctrl-C. So no install
 * outlives the run that started it.
 *
 * @param {string[]} args
 * @param {{cwd?: string, timeoutMs?: number, pidFile?: string, npm?: {command: string, prefix: string[], shell?: false}}} [options]
 *   `pidFile` receives npm's process id while it runs (the release lock's
 *   record); `npm` replaces how npm is started (tests).
 * @returns {NpmResult}
 */
export function runNpm(args, options = {}) {
  const {command, prefix} = options.npm ?? npmCommand();
  const timeoutMs = options.timeoutMs ?? 300_000;
  const direct = process.platform === 'win32';
  const result = direct
    ? spawnSync(command, [...prefix, ...args], {
        cwd: options.cwd ?? os.tmpdir(),
        encoding: 'utf-8',
        // Never a shell: a declared range must not reach one.
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
        // npm defers SIGTERM until its work finishes, so a time limit has to
        // end it outright or the limit never takes effect.
        killSignal: 'SIGKILL',
        windowsHide: true,
      })
    : spawnSync(
        process.execPath,
        [
          GUARD,
          String(timeoutMs),
          options.pidFile ?? '',
          command,
          ...prefix,
          ...args,
        ],
        {
          cwd: options.cwd ?? os.tmpdir(),
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
          // A backstop only: the guard ends npm at the limit itself.
          timeout: timeoutMs + 30_000,
          killSignal: 'SIGKILL',
          windowsHide: true,
        },
      );
  const timedOut = !direct && result.status === 124;
  return {
    status: timedOut ? null : result.status,
    signal: result.signal ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ...(timedOut
      ? {error: Object.assign(new Error('npm timed out'), {code: 'ETIMEDOUT'})}
      : result.error
        ? {error: result.error}
        : {}),
  };
}

/** The guard npm runs under. */
const GUARD = fileURLToPath(new URL('./npm-guard.mjs', import.meta.url));

/**
 * The newest published version that `spec` (a dist-tag or a range) names,
 * asked of the registry through npm.
 * @param {string} name e.g. `@astryxdesign/core`
 * @param {string} spec e.g. `latest`, `^0.6.8`
 * @param {{run?: typeof runNpm}} [options]
 * @returns {string | null}
 */
export function resolvePublishedVersion(name, spec, options = {}) {
  if (!isVersionRange(spec) || !/^@astryxdesign\/[a-z-]+$/u.test(name)) {
    return null;
  }
  const run = options.run ?? runNpm;
  const result = run(
    ['view', `${name}@${spec}`, 'version', '--json', ...BOUNDED_FETCH],
    {timeoutMs: 60_000},
  );
  if (result.status !== 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || 'null');
  } catch {
    return null;
  }
  const versions = (Array.isArray(parsed) ? parsed : [parsed]).filter(
    isReleaseVersion,
  );
  return versions.length > 0 ? versions[versions.length - 1] : null;
}

/**
 * The release the registry tags `latest` for the CLI, and the Node range it
 * declares; null when the registry cannot be asked, with the reason given to
 * `onFailure`: `npm-missing` (npm cannot be started), `npm-failed: <npm's
 * error code>` (npm ran and failed, such as on ECONNREFUSED or E404), or
 * `bad-reply` (npm's answer names no release).
 * @param {{run?: typeof runNpm, onFailure?: (reason: string) => void}} [options]
 * @returns {{version: string, node: string | null} | null}
 */
export function resolveLatestRelease(options = {}) {
  const run = options.run ?? runNpm;
  const fail = (/** @type {string} */ reason) => {
    options.onFailure?.(reason);
    return null;
  };
  const result = run(
    [
      'view',
      '@astryxdesign/cli@latest',
      'version',
      'engines',
      '--json',
      ...BOUNDED_FETCH,
    ],
    {timeoutMs: 60_000},
  );
  if (result.status !== 0) {
    if (/** @type {any} */ (result.error)?.code === 'ENOENT') {
      return fail('npm-missing');
    }
    const code =
      /npm (?:error|ERR!) code (\S+)/u.exec(result.stderr)?.[1] ??
      /** @type {any} */ (result.error)?.code ??
      (result.signal ? result.signal : `exit ${result.status}`);
    return fail(`npm-failed: ${code}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || 'null');
  } catch {
    return fail('bad-reply');
  }
  const info = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed;
  if (typeof info === 'string') {
    return isReleaseVersion(info)
      ? {version: info, node: null}
      : fail('bad-reply');
  }
  if (!info || !isReleaseVersion(info.version)) return fail('bad-reply');
  const node = info.engines?.node;
  return {version: info.version, node: typeof node === 'string' ? node : null};
}

/**
 * Registry requests give up after one retry and 30 seconds each, so a run with
 * no network fails in seconds with ERR_VERSIONS_UNAVAILABLE instead of waiting
 * out npm's default retries. Registry, proxy, and offline settings still come
 * from the user's npm configuration.
 */
const BOUNDED_FETCH = [
  '--fetch-retries=1',
  '--fetch-timeout=30000',
  // One quick retry, so an offline run learns it is offline in seconds.
  '--fetch-retry-mintimeout=2000',
  '--fetch-retry-maxtimeout=10000',
];

/**
 * How long a failed install of a release is remembered, so offline runs do
 * not start npm again on every run (spec AST-081 FR2): 2 minutes after a
 * first failure, so a passing registry hiccup is retried soon, and 10 minutes
 * after a second failure in a row. A successful install forgets it.
 * @param {number} failures the failures in a row, 1 or more
 * @returns {number}
 */
export function failedInstallWaitMs(failures) {
  return (failures >= 2 ? 10 : 2) * 60_000;
}

/**
 * The record of a failed install of `version`: a file in the release cache,
 * shared by every copy of the CLI that uses this cache.
 * @param {string} version
 * @param {string} cacheDir
 * @returns {string}
 */
function failedRecordPath(version, cacheDir) {
  return path.join(releasesDir(cacheDir), `.failed-${version}.json`);
}

/**
 * The recorded failed installs of `version` in a row, when the last was
 * within its wait (failedInstallWaitMs), or null.
 * @param {string} version
 * @param {string} cacheDir
 * @param {number} [now]
 * @returns {{at: number, reason: string, failures: number, waitMs: number} | null}
 */
export function recentFailedInstall(version, cacheDir, now = Date.now()) {
  const record = readFailedInstall(version, cacheDir);
  if (!record) return null;
  const waitMs = failedInstallWaitMs(record.failures);
  const age = now - record.at;
  return age >= 0 && age < waitMs ? {...record, waitMs} : null;
}

/**
 * The record of failed installs of `version`, whatever its age, or null.
 * @param {string} version
 * @param {string} cacheDir
 * @returns {{at: number, reason: string, failures: number} | null}
 */
function readFailedInstall(version, cacheDir) {
  const record = readJson(failedRecordPath(version, cacheDir));
  if (
    !record ||
    typeof record.at !== 'number' ||
    typeof record.reason !== 'string'
  ) {
    return null;
  }
  const failures =
    Number.isInteger(record.failures) && record.failures > 0
      ? record.failures
      : 1;
  return {at: record.at, reason: record.reason, failures};
}

/**
 * Remember, or forget, a failed install of `version`. Never fails a run.
 * @param {string} version
 * @param {string} cacheDir
 * @param {string | null} reason null forgets it
 */
function recordFailedInstall(version, cacheDir, reason) {
  const file = failedRecordPath(version, cacheDir);
  try {
    if (reason === null) {
      fs.rmSync(file, {force: true});
      return;
    }
    fs.mkdirSync(path.dirname(file), {recursive: true});
    const failures = (readFailedInstall(version, cacheDir)?.failures ?? 0) + 1;
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(
      tmp,
      `${JSON.stringify({at: Date.now(), reason, failures})}\n`,
    );
    fs.renameSync(tmp, file);
  } catch {
    // An unwritable cache already answers for itself.
  }
}

/**
 * The longest an install may take: generous, so a slow but moving download
 * finishes, while a stalled one still ends in ERR_VERSIONS_UNAVAILABLE.
 */
export const INSTALL_TIMEOUT_MS = 15 * 60_000;

/**
 * The exit statuses a package manager uses when Ctrl-C, a closed terminal, or
 * a termination request stopped it.
 * @type {Record<number, NodeJS.Signals>}
 */
const EXIT_SIGNALS = {129: 'SIGHUP', 130: 'SIGINT', 143: 'SIGTERM'};

/** Sleep the thread without spinning. @param {number} ms */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** How long a lock may stand before a run treats its holder as gone. */
const STALE_LOCK_MS = 30 * 60_000;

/**
 * How long a lock held from another computer (a shared cache) may stand,
 * however often its holder renews it; one whose holder stops renewing it is
 * taken over sooner (lock-lease.mjs).
 */
const FOREIGN_LOCK_MS = 20 * 60_000;

/** How long a lock with no owner record may stand: its holder died taking it. */
const UNOWNED_LOCK_MS = 10_000;

/**
 * Is process `pid` on this computer still running?
 * @param {number} pid
 * @returns {boolean}
 */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it runs, as another user.
    return /** @type {NodeJS.ErrnoException} */ (error).code === 'EPERM';
  }
}

/**
 * Has the run holding `lockDir` gone? Its owner record names a process on
 * this computer that no longer runs; or there is no record and the lock is
 * older than a run needs to write one; or another computer holds it for
 * longer than an install takes, or its holder there stopped renewing it; or
 * it is older than any install.
 * @param {string} lockDir
 * @param {number} now
 * @returns {boolean}
 */
function lockIsStale(lockDir, now) {
  let age;
  try {
    age = now - fs.statSync(lockDir).mtimeMs;
  } catch {
    return false;
  }
  if (age > STALE_LOCK_MS) return true;
  const owner = readJson(path.join(lockDir, 'owner.json'));
  if (!owner) return age > UNOWNED_LOCK_MS;
  if (owner.host !== os.hostname() || !Number.isInteger(owner.pid)) {
    return age > FOREIGN_LOCK_MS || foreignLockIsSilent(lockDir, now);
  }
  // A live holder on this computer is installing, however slowly.
  return !isAlive(owner.pid);
}

/**
 * Take a lock folder, or return false when another live run holds it. A lock
 * whose holder has gone, such as a run stopped with Ctrl-C or killed, is taken
 * over at once, and one from another computer once its holder has stopped
 * renewing it. Throws when the cache folder cannot be written.
 * @param {string} lockDir
 * @param {{now?: number}} [options] the clock, for tests
 * @returns {boolean}
 */
export function tryLock(lockDir, {now = Date.now()} = {}) {
  fs.mkdirSync(path.dirname(lockDir), {recursive: true});
  try {
    fs.mkdirSync(lockDir);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') {
      throw error;
    }
    if (!lockIsStale(lockDir, now)) return false;
    // The run that held it is gone; end the install it left running, if any,
    // before starting another.
    endRecordedInstall(lockDir, {now});
    const aside = `${lockDir}.stale-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      fs.renameSync(lockDir, aside);
    } catch {
      // Another run took it over first.
      return false;
    }
    fs.rmSync(aside, {recursive: true, force: true});
    try {
      fs.mkdirSync(lockDir);
    } catch {
      return false;
    }
  }
  try {
    fs.writeFileSync(
      path.join(lockDir, 'owner.json'),
      JSON.stringify({pid: process.pid, host: os.hostname(), at: Date.now()}),
    );
  } catch {
    // Without a record the lock still expires on its own.
  }
  return true;
}

/**
 * What the system says about the process `pid`: its arguments (exact from
 * `/proc`; split on spaces from `ps` or PowerShell, so a path with a space in
 * it never matches), and when it started (ms since the epoch). Read from `/proc` where there is one, else from `ps` (or
 * PowerShell on Windows); null for what cannot be read.
 * @param {number} pid
 * @param {string} procRoot
 * @returns {{argv: string[] | null, startedAt: number | null}}
 */
function processFactsOf(pid, procRoot) {
  try {
    let argv = fs
      .readFileSync(path.join(procRoot, String(pid), 'cmdline'), 'utf-8')
      .split('\u0000')
      .filter(Boolean);
    // npm sets its process title to its command line, which Linux shows as
    // one argument ("npm install @astryxdesign/cli@0.7.2 …"): split it as the
    // ps path does.
    if (argv.length === 1) argv = argv[0].trim().split(/\s+/u);
    /** @type {number | null} */
    let startedAt = null;
    try {
      // Field 22 of /proc/<pid>/stat: start time in clock ticks after boot
      // (100 a second on Linux); /proc/stat's btime: boot, in seconds.
      const stat = fs.readFileSync(
        path.join(procRoot, String(pid), 'stat'),
        'utf-8',
      );
      const ticks = Number(
        stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19],
      );
      const btime = Number(
        /^btime (\d+)$/mu.exec(
          fs.readFileSync(path.join(procRoot, 'stat'), 'utf-8'),
        )?.[1],
      );
      if (Number.isFinite(ticks) && Number.isFinite(btime)) {
        startedAt = btime * 1000 + ticks * 10;
      }
    } catch {
      // Start time unknown.
    }
    return {argv, startedAt};
  } catch {
    // No process table here.
  }
  if (process.platform === 'win32') {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$p = Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if ($p) { [DateTimeOffset]::new($p.CreationDate).ToUnixTimeMilliseconds(); $p.CommandLine }`,
      ],
      {encoding: 'utf-8', windowsHide: true, timeout: 10_000},
    );
    const [started, ...rest] = (result.stdout ?? '').trim().split(/\r?\n/u);
    const line = rest.join(' ').trim();
    return {
      argv: line
        ? line.split(/\s+/u).map(arg => arg.replace(/^"(.*)"$/u, '$1'))
        : null,
      startedAt: Number(started) || null,
    };
  }
  const result = spawnSync(
    'ps',
    ['-o', 'lstart=', '-o', 'args=', '-p', String(pid)],
    {
      encoding: 'utf-8',
      timeout: 5000,
    },
  );
  const line = (result.stdout ?? '').split(/\r?\n/u)[0] ?? '';
  // `lstart` is a fixed 24-character date, such as `Tue Oct 20 03:52:54 2026`.
  const startedAt = Date.parse(line.slice(0, 24));
  const args = line.slice(24).trim();
  return {
    argv: args ? args.split(/\s+/u) : null,
    startedAt: Number.isFinite(startedAt) ? startedAt : null,
  };
}

/**
 * Whether a process's arguments are this CLI's install of `version`, as
 * runNpm starts it: the program (`argv[0]`) is npm, or node running npm's
 * entry file `npm-cli.js` (`argv[1]`), each exactly by name, and the arguments
 * include `install` and `@astryxdesign/cli@<version>`. A program that only has
 * `npm` somewhere in its name or arguments is not.
 * @param {string[]} argv
 * @param {string} version
 * @returns {boolean}
 */
export function isReleaseInstall(argv, version) {
  const name = (/** @type {string | undefined} */ arg) =>
    (arg ?? '')
      .split(/[\\/]/u)
      .pop()
      ?.replace(/\.(?:exe|cmd)$/iu, '')
      .toLowerCase() ?? '';
  const program = name(argv[0]);
  const npm =
    program === 'npm' ||
    (/^node(?:[-.\d]*)$/u.test(program) && name(argv[1]) === 'npm-cli.js');
  return (
    npm &&
    argv.includes('install') &&
    argv.includes(`@astryxdesign/cli@${version}`)
  );
}

/**
 * End the npm process group a stale lock records, only when that process is
 * surely the install the lock was taken for: its command line is this CLI's
 * install of the lock's release (isReleaseInstall), the lock is younger than
 * any install may take, and the process started no earlier than the lock.
 * Anything less certain is left alone, and the lock is simply taken over,
 * since a recorded process id can name an unrelated process once the install
 * ended.
 * @param {string} lockDir a `.lock-<version>` folder
 * @param {{now?: number, procRoot?: string, factsOf?: (pid: number) => {argv: string[] | null, startedAt: number | null}}} [options]
 *   the clock, the process table's folder, and the fact reader, for tests
 * @returns {'ended' | 'left'} whether a process group was ended
 */
export function endRecordedInstall(
  lockDir,
  {now = Date.now(), procRoot = '/proc', factsOf} = {},
) {
  let pid;
  try {
    pid = Number(fs.readFileSync(path.join(lockDir, 'npm.pid'), 'utf-8'));
  } catch {
    return 'left';
  }
  if (!Number.isInteger(pid) || pid <= 1 || !isAlive(pid)) return 'left';
  const version = /^\.lock-(.+)$/u.exec(path.basename(lockDir))?.[1];
  if (!version) return 'left';
  const owner = readJson(path.join(lockDir, 'owner.json'));
  const at = typeof owner?.at === 'number' ? owner.at : null;
  if (at === null || !(now - at >= 0 && now - at < INSTALL_TIMEOUT_MS)) {
    return 'left';
  }
  const facts = (factsOf ?? (id => processFactsOf(id, procRoot)))(pid);
  if (!facts.argv || !isReleaseInstall(facts.argv, version)) return 'left';
  // Started before the lock was taken: an older process that reuses the id.
  // A second's slack covers clocks that round.
  if (facts.startedAt === null || facts.startedAt < at - 1000) return 'left';
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, 'SIGKILL');
    return 'ended';
  } catch {
    // Already gone.
    return 'left';
  }
}

/**
 * Remove a folder by renaming it aside first, so a run never sees it half
 * removed.
 * @param {string} dir
 */
function removeAside(dir) {
  const aside = `${dir}.removing-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    fs.renameSync(dir, aside);
  } catch {
    return;
  }
  fs.rmSync(aside, {recursive: true, force: true});
}

/**
 * Why a release could not be made available.
 * @typedef {object} ReleaseUnavailable
 * @property {string} version
 * @property {string} reason one plain sentence
 * @property {NodeJS.Signals} [signal] the install was stopped by this signal
 */

/**
 * Install release `version` into the cache, verify it, and return it. A
 * release already cached returns at once. When another run is installing the
 * same release, this waits for it.
 *
 * @param {string} version
 * @param {{cacheDir?: string, run?: typeof runNpm, nodeVersion?: string, waitMs?: number, onProgress?: (event: 'install' | 'wait', version: string) => void}} [options]
 *   `onProgress` hears once when an install starts and once when the run
 *   starts waiting for another run's install.
 * @returns {CachedRelease | ReleaseUnavailable}
 */
export function ensureRelease(version, options = {}) {
  const {
    cacheDir = userCacheDir(),
    run = runNpm,
    nodeVersion = process.versions.node,
    waitMs = INSTALL_TIMEOUT_MS + 60_000,
    onProgress = () => {},
  } = options;
  if (!isReleaseVersion(version)) {
    return {version: String(version), reason: 'it is not a release version'};
  }
  const existing = cachedRelease(version, cacheDir);
  if (existing) {
    // Installed by now, by any copy: forget any failure.
    if (readFailedInstall(version, cacheDir)) {
      recordFailedInstall(version, cacheDir, null);
    }
    return existing;
  }
  // A recent failed install is not retried: offline, every run would start
  // npm again and wait for it (FR2).
  const failed = recentFailedInstall(version, cacheDir);
  if (failed) {
    const minutes = Math.max(1, Math.round((Date.now() - failed.at) / 60_000));
    return {
      version,
      reason: `${failed.reason}; last tried ${minutes} minute${minutes === 1 ? '' : 's'} ago, tried again after ${failed.waitMs / 60_000} minutes`,
    };
  }
  try {
    const result = ensureLocked(version, {
      cacheDir,
      run,
      nodeVersion,
      waitMs,
      onProgress,
    });
    // Stopped with Ctrl-C (or closed): the lock and scratch folder are already
    // cleared; end the run the way the signal would have.
    if ('signal' in result && result.signal)
      process.kill(process.pid, result.signal);
    if ('bin' in result) recordFailedInstall(version, cacheDir, null);
    else if (
      'reason' in result &&
      !('signal' in result && result.signal) &&
      result.reason !== 'another run is still installing it'
    ) {
      recordFailedInstall(version, cacheDir, result.reason);
    }
    return result;
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code;
    return {
      version,
      reason: `the release cache ${releasesDir(cacheDir)} cannot be written${code ? ` (${code})` : ''}`,
    };
  }
}

/**
 * `ensureRelease` under the per-release lock.
 * @param {string} version
 * @param {{cacheDir: string, run: typeof runNpm, nodeVersion: string, waitMs: number, onProgress: (event: 'install' | 'wait', version: string) => void}} options
 * @returns {CachedRelease | ReleaseUnavailable}
 */
function ensureLocked(
  version,
  {cacheDir, run, nodeVersion, waitMs, onProgress},
) {
  const root = releasesDir(cacheDir);
  const lockDir = path.join(root, `.lock-${version}`);
  const deadline = Date.now() + waitMs;
  let waiting = false;
  while (!tryLock(lockDir)) {
    const ready = cachedRelease(version, cacheDir);
    if (ready) return ready;
    if (Date.now() > deadline) {
      return {version, reason: 'another run is still installing it'};
    }
    if (!waiting) {
      waiting = true;
      onProgress('wait', version);
    }
    sleep(200);
  }
  // A run stopped mid-install (Ctrl-C, a closed terminal) frees the lock and
  // its scratch folder on the way out; a killed one is taken over by the
  // owner check in tryLock.
  const release = () => {
    for (const entry of safeList(root)) {
      if (entry.startsWith(`.tmp-${version}-${process.pid}-`)) {
        fs.rmSync(path.join(root, entry), {recursive: true, force: true});
      }
    }
    fs.rmSync(lockDir, {recursive: true, force: true});
  };
  /** @param {NodeJS.Signals} signal */
  const onSignal = signal => {
    release();
    removeSignalHandlers();
    process.kill(process.pid, signal);
  };
  const signals = /** @type {NodeJS.Signals[]} */ ([
    'SIGINT',
    'SIGTERM',
    'SIGHUP',
  ]);
  const removeSignalHandlers = () => {
    for (const signal of signals) process.off(signal, onSignal);
  };
  for (const signal of signals) process.on(signal, onSignal);
  try {
    const again = cachedRelease(version, cacheDir);
    if (again) return again;
    // Under the lock, anything left for this version is a damaged release or
    // the scratch folder of a run that stopped: clear both.
    for (const entry of safeList(root)) {
      if (
        entry.startsWith(`.tmp-${version}-`) ||
        entry.startsWith(`${version}.removing-`) ||
        entry.startsWith(`.lock-${version}.stale-`)
      ) {
        fs.rmSync(path.join(root, entry), {recursive: true, force: true});
      }
    }
    removeAside(path.join(root, version));
    verified.delete(`${cacheDir}\0${version}`);
    onProgress('install', version);
    return installLocked(version, {cacheDir, run, nodeVersion});
  } finally {
    removeSignalHandlers();
    release();
  }
}

/**
 * A folder's entries, or none.
 * @param {string} dir
 * @returns {string[]}
 */
function safeList(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * The install itself, under the lock.
 * @param {string} version
 * @param {{cacheDir: string, run: typeof runNpm, nodeVersion: string}} options
 * @returns {CachedRelease | ReleaseUnavailable}
 */
function installLocked(version, {cacheDir, run, nodeVersion}) {
  const root = releasesDir(cacheDir);
  const tmp = path.join(
    root,
    `.tmp-${version}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  );
  fs.mkdirSync(tmp, {recursive: true});
  try {
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      `${JSON.stringify({name: 'astryx-release', private: true}, null, 2)}\n`,
    );
    const install = run(
      [
        'install',
        '--no-save',
        '--no-package-lock',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--prefer-offline',
        ...BOUNDED_FETCH,
        '--loglevel=error',
        `@astryxdesign/cli@${version}`,
        `@astryxdesign/core@${version}`,
      ],
      {
        cwd: tmp,
        timeoutMs: INSTALL_TIMEOUT_MS,
        pidFile: path.join(root, `.lock-${version}`, 'npm.pid'),
      },
    );
    // Our own time limit ends npm: that is a timeout, not a stopped run.
    if (/** @type {any} */ (install.error)?.code === 'ETIMEDOUT') {
      return {
        version,
        reason: `the install did not finish within ${INSTALL_TIMEOUT_MS / 60_000} minutes`,
      };
    }
    const stoppedBy = install.signal ?? EXIT_SIGNALS[install.status ?? -1];
    if (stoppedBy) {
      return {version, reason: 'the install was stopped', signal: stoppedBy};
    }
    if (install.status !== 0) {
      return {version, reason: npmFailure(install)};
    }
    const cliDir = path.join(tmp, 'node_modules', '@astryxdesign', 'cli');
    const cliPkg = readJson(path.join(cliDir, 'package.json'));
    if (cliPkg?.version !== version) {
      return {version, reason: 'the package manager installed another version'};
    }
    const engine = cliPkg?.engines?.node;
    if (typeof engine === 'string' && !satisfiesRange(nodeVersion, engine)) {
      return {
        version,
        reason: `it needs Node ${engine}, and this computer runs Node ${nodeVersion}`,
      };
    }
    const bin = cliBinOf(cliDir);
    if (!bin) return {version, reason: 'its CLI has no astryx command'};
    // A check, not a person's run: the shared update-notifier variable keeps
    // a release that prints update notices from printing them here, and from
    // using up the day's notices (spec AST-081 FR10).
    const started = spawnSync(process.execPath, [bin, '--version'], {
      cwd: tmp,
      encoding: 'utf-8',
      env: {...process.env, NO_UPDATE_NOTIFIER: '1'},
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      windowsHide: true,
    });
    const reported = String(started.stdout ?? '')
      .trim()
      .split(/\r?\n/)
      .pop();
    if (started.status !== 0 || reported !== version) {
      return {version, reason: 'its CLI did not start and report its version'};
    }
    /** @type {Record<string, string | null>} */
    const files = {};
    for (const rel of checkedFiles(bin, tmp)) {
      files[rel.split(path.sep).join('/')] = fileHash(path.join(tmp, rel));
    }
    fs.writeFileSync(
      path.join(tmp, 'release.json'),
      `${JSON.stringify({version, verifiedAt: new Date().toISOString(), files, tree: releaseTree(tmp)}, null, 2)}\n`,
    );

    const dest = path.join(root, version);
    try {
      fs.renameSync(tmp, dest);
    } catch {
      // A finished release already holds the name; keep that one.
    }
    return (
      cachedRelease(version, cacheDir) ?? {
        version,
        reason: 'it could not be saved in the cache',
      }
    );
  } catch (error) {
    return {
      version,
      reason: `installing it failed (${error instanceof Error ? error.message : String(error)})`,
    };
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}

/**
 * One sentence on why npm failed.
 * @param {NpmResult} result
 * @returns {string}
 */
function npmFailure(result) {
  if (result.error && /** @type {any} */ (result.error).code === 'ENOENT') {
    return 'npm, which installs releases, was not found';
  }
  const text = `${result.stderr}\n${result.stdout}`;
  if (/E404|404 Not Found|No matching version|ETARGET/i.test(text)) {
    return 'the registry does not have it';
  }
  if (
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|offline|network/i.test(
      text,
    )
  ) {
    return 'the registry could not be reached';
  }
  return 'the package manager could not install it';
}
