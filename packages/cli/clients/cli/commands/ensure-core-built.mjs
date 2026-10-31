// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared test helper: build @astryxdesign/core once, race-free.
 *
 * `astryx theme build` imports the compiled @astryxdesign/core/theme entry
 * (there is no in-CLI fallback generator), so any test exercising it needs a
 * built core. The CI `test` job runs `pnpm test` without a prior core build,
 * and Vitest runs test files in parallel worker forks. When two build-theme
 * suites each ran `if (!exists) pnpm -F @astryxdesign/core build` in their own
 * beforeAll, both workers saw dist missing and launched concurrent builds that
 * collided on the shared packages/core/dist: one worker cleaned dist while the
 * other was mid-write, failing nondeterministically ("Could not resolve
 * dist/index.js" / "ENOTEMPTY rmdir dist/hooks").
 *
 * This serializes the build behind a filesystem lock so exactly one worker
 * builds and the rest wait for it to release the lock before reading dist:
 * dist/theme/index.js appears long before the build's declarations do.
 *
 * The node project's global setup also rebuilds a build older than Core's
 * sources, before any test worker forks: a reused worktree checked out to a
 * new head keeps its old dist, and the suites would otherwise test the new CLI
 * against the old theme build. The files the build and the test setup
 * generate from those sources are not sources. A suite's beforeAll builds
 * only a missing Core: rebuilding a stale one mid-run would delete dist under
 * suites still reading it. Each checkout has its own lock, so one worktree's
 * rebuild never holds up another's suites. Each node run also holds a lease in
 * the checkout while it runs (ended by its teardown or its exit), and a stale
 * rebuild waits, on a timer and for at most two minutes, until every run that
 * started before it has ended, so a second run never rebuilds Core under a run
 * already in progress; past the limit it stops with an error naming each
 * live run and its lease file (a run killed by SIGHUP leaves its lease, and
 * another process can take its pid).
 */

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);
// The build's last output: `build:css` writes it after the compiled modules,
// their declarations and the declaration extensions, so a build that was
// interrupted or failed before it finished has no marker and reads as missing.
// (`dist/theme/index.js`, which the build-theme suites import, comes about
// 11 s into a 38 s build.)
export const CORE_BUILD_MARKER = path.join(
  REPO_ROOT,
  'packages/core/dist/astryx.css',
);
// What the build compiles, and the scripts and config it compiles with: a file
// here newer than the marker means dist is stale. A checkout rewrites the files
// it changes, so they read as newer. The translations live outside src, in
// locales. The scripts are the ones Core's `build*` scripts run that write
// output (not its checks).
export const CORE_SOURCES = [
  path.join(REPO_ROOT, 'packages/core/src'),
  path.join(REPO_ROOT, 'packages/core/locales'),
  path.join(REPO_ROOT, 'packages/core/package.json'),
  path.join(REPO_ROOT, 'packages/core/babel.config.json'),
  path.join(REPO_ROOT, 'packages/core/babel-plugin-add-extensions.cjs'),
  path.join(REPO_ROOT, 'packages/core/tsconfig.build.json'),
  path.join(REPO_ROOT, 'tsconfig.json'),
  path.join(REPO_ROOT, 'packages/core/scripts/build-pseudo-locale.mjs'),
  path.join(REPO_ROOT, 'scripts/generate-i18n-runtime.mjs'),
  path.join(REPO_ROOT, 'scripts/add-declaration-extensions.mjs'),
  path.join(REPO_ROOT, 'scripts/build-css.mjs'),
  path.join(REPO_ROOT, 'scripts/stylex-module-resolution.cjs'),
];
// Git-ignored output generated from those sources, by the build and again by
// the Vitest global setup (internal/test-utils/src/globalSetup.ts): rewritten
// after a build, it would read as newer than that build.
export const CORE_GENERATED = [
  path.join(REPO_ROOT, 'packages/core/src/i18n/generated-locales'),
  path.join(REPO_ROOT, 'packages/core/locales/pseudo.json'),
];
/**
 * The lock directory (mkdir is atomic across processes) that guards the Core
 * build of the checkout at `repoRoot`: one per checkout.
 * @param {string} repoRoot
 * @returns {string}
 */
export function coreBuildLockDir(repoRoot) {
  const key = createHash('sha256')
    .update(path.resolve(repoRoot))
    .digest('hex')
    .slice(0, 16);
  return path.join(os.tmpdir(), `astryx-core-build-${key}.lock`);
}
const LOCK_DIR = coreBuildLockDir(REPO_ROOT);

/**
 * The directory where each node test run of the checkout at `repoRoot` holds
 * a lease for as long as it runs: one file per run, named by its process id
 * and holding the time it started.
 * @param {string} repoRoot
 */
export function coreRunLeaseDir(repoRoot) {
  return coreBuildLockDir(repoRoot).replace(/\.lock$/, '.runs');
}
const RUN_LEASE_DIR = coreRunLeaseDir(REPO_ROOT);

/** @param {number} pid */
function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const {code} = /** @type {NodeJS.ErrnoException} */ (error);
    // ESRCH: no such process, so it has ended. EPERM: it runs as another user.
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw error;
  }
}

/**
 * Registers this process as a running test run of the checkout, and returns
 * the function that ends its lease (the global setup's teardown).
 * @param {{leaseDir?: string, pid?: number, now?: number}} [options]
 */
export function registerTestRun({
  leaseDir = RUN_LEASE_DIR,
  pid = process.pid,
  now = Date.now(),
} = {}) {
  fs.mkdirSync(leaseDir, {recursive: true});
  const file = path.join(leaseDir, String(pid));
  fs.writeFileSync(file, String(now));
  return () => fs.rmSync(file, {force: true});
}

/**
 * The runs in `leaseDir` that started before this one (by start time, then
 * process id) and are still alive: those may be reading the build now. A run
 * that started later waits for this one instead, so two runs never wait for
 * each other. A lease whose process is gone is removed.
 * @param {string} leaseDir
 * @param {{pid?: number, isAlive?: (pid: number) => boolean}} [options]
 */
export function earlierLiveRuns(
  leaseDir,
  {pid = process.pid, isAlive = processIsAlive} = {},
) {
  /** @type {string[]} */
  let names;
  try {
    names = fs.readdirSync(leaseDir);
  } catch (error) {
    // No run has registered in this checkout yet.
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  /** @param {string} name */
  const startOf = name => {
    try {
      return Number(fs.readFileSync(path.join(leaseDir, name), 'utf8'));
    } catch (error) {
      // The run ended, and its lease went, between the listing and this read.
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        return NaN;
      }
      throw error;
    }
  };
  const own = startOf(String(pid));
  const ownStart = Number.isFinite(own) ? own : Infinity;
  /** @type {number[]} */
  const earlier = [];
  for (const name of names) {
    const other = Number(name);
    if (!Number.isInteger(other) || other === pid) continue;
    if (!isAlive(other)) {
      fs.rmSync(path.join(leaseDir, name), {force: true});
      continue;
    }
    const start = startOf(name);
    if (start < ownStart || (start === ownStart && other < pid)) {
      earlier.push(other);
    }
  }
  return earlier;
}

const BUILD_TIMEOUT_MS = 180_000;
// A lock older than this is assumed abandoned by a crashed/killed worker.
const STALE_LOCK_MS = BUILD_TIMEOUT_MS + 20_000;
const POLL_MS = 250;

/** @param {number} ms */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Whether `entry` is missing or older than any file under `roots` (files or
 * directories; `node_modules`, `dist` and the paths in `generated` are
 * skipped).
 * @param {string} entry
 * @param {readonly string[]} roots
 * @param {readonly string[]} [generated]
 * @returns {boolean}
 */
export function coreBuildIsStale(entry, roots, generated = []) {
  let built;
  try {
    built = fs.statSync(entry).mtimeMs;
  } catch (error) {
    // Not built yet.
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      return true;
    }
    throw error;
  }
  const skipped = new Set(generated.map(p => path.resolve(p)));
  const pending = [...roots];
  while (pending.length > 0) {
    const current = /** @type {string} */ (pending.pop());
    if (skipped.has(path.resolve(current))) {
      continue;
    }
    let stat;
    try {
      stat = fs.statSync(current);
    } catch (error) {
      // Removed while the walk ran.
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        continue;
      }
      throw error;
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current)) {
        if (name !== 'node_modules' && name !== 'dist') {
          pending.push(path.join(current, name));
        }
      }
    } else if (stat.mtimeMs > built) {
      return true;
    }
  }
  return false;
}

function buildCore() {
  execFileSync('pnpm', ['-F', '@astryxdesign/core', 'build'], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    timeout: BUILD_TIMEOUT_MS,
  });
}

/**
 * @param {string} lockDir
 * @param {number} staleLockMs
 */
function lockIsStale(lockDir, staleLockMs) {
  try {
    return Date.now() - fs.statSync(lockDir).mtimeMs > staleLockMs;
  } catch {
    // Vanished between the exists check and stat — treat as released.
    return false;
  }
}

/**
 * Whether another worker holds the lock: it is building, and dist is not
 * whole yet.
 * @param {string} lockDir
 * @param {number} staleLockMs
 */
function lockIsHeld(lockDir, staleLockMs) {
  return fs.existsSync(lockDir) && !lockIsStale(lockDir, staleLockMs);
}

/**
 * Try to acquire the lock. Returns true if this worker now holds it.
 * @param {string} lockDir
 * @param {number} staleLockMs
 */
function tryAcquire(lockDir, staleLockMs) {
  try {
    fs.mkdirSync(lockDir);
    return true;
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'EEXIST') {
      throw err;
    }
    if (lockIsStale(lockDir, staleLockMs)) {
      fs.rmSync(lockDir, {recursive: true, force: true});
      try {
        fs.mkdirSync(lockDir);
        return true;
      } catch (retryErr) {
        if (/** @type {NodeJS.ErrnoException} */ (retryErr).code !== 'EEXIST') {
          throw retryErr;
        }
      }
    }
    return false;
  }
}

/**
 * Run `build` unless `isBuilt()`, in exactly one process at a time: the one
 * holding `lockDir`. Every other caller returns only once no process holds
 * the lock and the build is current, so none reads a build still being
 * written.
 * @param {{isBuilt: () => boolean, build: () => void, lockDir: string, staleLockMs?: number, pollMs?: number}} options
 */
export function ensureBuiltOnce({
  isBuilt,
  build,
  lockDir,
  staleLockMs = STALE_LOCK_MS,
  pollMs = POLL_MS,
}) {
  const deadline = Date.now() + staleLockMs;
  while (Date.now() < deadline) {
    if (!lockIsHeld(lockDir, staleLockMs) && isBuilt()) {
      return;
    }
    if (tryAcquire(lockDir, staleLockMs)) {
      try {
        if (!isBuilt()) {
          build();
        }
      } finally {
        fs.rmSync(lockDir, {recursive: true, force: true});
      }
      return;
    }
    // Another worker is building; wait for it to release the lock.
    sleepSync(pollMs);
  }

  // Waited past the stale threshold without the lock coming free — build it
  // ourselves rather than let the suite fail on a missing entry.
  build();
}

/**
 * Build Core when `entry` is missing, or also when it is older than
 * `roots` with `rebuildStale`, in one process at a time.
 * @param {{entry: string, roots: readonly string[], generated?: readonly string[], build: () => void, lockDir: string, rebuildStale?: boolean, staleLockMs?: number, pollMs?: number}} options
 */
export function ensureCoreBuiltAt({
  entry,
  roots,
  generated = [],
  build,
  lockDir,
  rebuildStale = false,
  staleLockMs,
  pollMs = POLL_MS,
}) {
  ensureBuiltOnce({
    isBuilt: rebuildStale
      ? () => !coreBuildIsStale(entry, roots, generated)
      : () => fs.existsSync(entry),
    build,
    lockDir,
    staleLockMs,
    pollMs,
  });
}

/**
 * Ensure packages/core/dist is built exactly once, even when called
 * concurrently from parallel Vitest workers. A build-theme suite's beforeAll
 * calls it with no options and builds only a missing Core; the node global
 * setup rebuilds a build older than Core's sources (`ensureCoreBuiltForRun`),
 * before any worker forks, and once every run that started before it has
 * ended, so never under a running suite.
 * @param {{rebuildStale?: boolean}} [options]
 */
export function ensureCoreBuilt({rebuildStale = false} = {}) {
  ensureCoreBuiltAt({
    entry: CORE_BUILD_MARKER,
    roots: CORE_SOURCES,
    generated: CORE_GENERATED,
    build: buildCore,
    lockDir: LOCK_DIR,
    rebuildStale,
  });
}

/** How long a run waits for the runs that started before it, ms. */
export const EARLIER_RUN_WAIT_MS = 120_000;

/**
 * Waits while the build is stale and a run that started before this one is
 * still live (`leaseDir`), on a timer, so the event loop stays free and Ctrl-C
 * still stops the run. Gives up after `limitMs`. Resolves to the runs still
 * live when it gave up, or to none.
 * @param {{entry: string, roots: readonly string[], generated?: readonly string[], leaseDir: string, isAlive?: (pid: number) => boolean, pid?: number, pollMs?: number, limitMs?: number}} options
 * @returns {Promise<number[]>}
 */
export async function waitForEarlierRuns({
  entry,
  roots,
  generated = [],
  leaseDir,
  isAlive,
  pid,
  pollMs = POLL_MS,
  limitMs = EARLIER_RUN_WAIT_MS,
}) {
  const deadline = Date.now() + limitMs;
  let announced = false;
  for (;;) {
    if (!fs.existsSync(entry) || !coreBuildIsStale(entry, roots, generated)) {
      return [];
    }
    const earlier = earlierLiveRuns(leaseDir, {pid, isAlive});
    if (earlier.length === 0 || Date.now() >= deadline) {
      return earlier;
    }
    if (!announced) {
      console.warn(
        `[ensure-core-built] Core changed; waiting up to ${Math.round(limitMs / 1000)} s for the test run already running in this checkout (pid ${earlier.join(', ')}) to end before rebuilding it.`,
      );
      announced = true;
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
}

/**
 * The node global setup's Core step: once the runs that started earlier have
 * ended, a stale build is rebuilt. If one is still live at the limit, this run
 * stops with an error naming it: rebuilding would delete dist under that run,
 * and testing the stale build would test old code.
 * @param {{entry: string, roots: readonly string[], generated?: readonly string[], build: () => void, lockDir: string, leaseDir: string, isAlive?: (pid: number) => boolean, pid?: number, pollMs?: number, limitMs?: number}} options
 */
export async function ensureCoreBuiltForRunAt({
  entry,
  roots,
  generated = [],
  build,
  lockDir,
  leaseDir,
  isAlive,
  pid,
  pollMs,
  limitMs,
}) {
  const stillLive = await waitForEarlierRuns({
    entry,
    roots,
    generated,
    leaseDir,
    isAlive,
    pid,
    pollMs,
    limitMs,
  });
  if (stillLive.length > 0) {
    throw new Error(
      `[ensure-core-built] Core's sources changed since packages/core/dist was built, and test run ${stillLive.join(', ')} in this checkout still uses that build after ${Math.round((limitMs ?? EARLIER_RUN_WAIT_MS) / 1000)} s: rebuilding would delete dist under it, and this run would test old code. Run again once it ends; if that process is not a test run, remove its lease: ${stillLive.map(pid => path.join(leaseDir, String(pid))).join(', ')}.`,
    );
  }
  ensureCoreBuiltAt({
    entry,
    roots,
    generated,
    build,
    lockDir,
    rebuildStale: true,
    pollMs,
  });
}

/**
 * `ensureCoreBuiltForRunAt` for this checkout: the node global setup's step.
 * @param {{limitMs?: number}} [options]
 */
export function ensureCoreBuiltForRun({limitMs} = {}) {
  return ensureCoreBuiltForRunAt({
    entry: CORE_BUILD_MARKER,
    roots: CORE_SOURCES,
    generated: CORE_GENERATED,
    build: buildCore,
    lockDir: LOCK_DIR,
    leaseDir: RUN_LEASE_DIR,
    limitMs,
  });
}
