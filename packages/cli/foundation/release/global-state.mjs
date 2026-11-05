// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The per-user update state, and the background check that keeps it
 * current (spec AST-081 FR6).
 *
 * The CLI never installs a newer release for the computer; it tells its user
 * one exists, the way `gh` and the Vercel CLI do (notices.mjs). At most once a
 * day, never in the first day after the first run, a run starts a detached
 * check of the release the registry tags `latest`; no run waits for it. No
 * check starts when the standard `CI` variable is set, or when
 * `NO_UPDATE_NOTIFIER` is (update-notice-env.mjs).
 *
 *     <user config>/astryx/state.json
 *       firstRunAt   when a run first kept this state (no check before a day)
 *       checkedAt    when the last check started
 *       checkOkAt    when a check last reached the registry
 *       latest       the version `latest` named then
 *       latestNode   the Node range that release declares, or null
 *       agentText    the computer-level agent text: {writtenBy, attemptFor,
 *                    attemptAt}, the release that last wrote it and the last
 *                    background attempt (spec AST-081 FR8)
 *       notifiedAt   when each update notice last printed (notices.mjs)
 *
 * @input  the clock, the registry's `latest` tag (in the worker)
 * @output the newest release known, for notices and doctor
 * @position foundation/release — read by the bin and doctor; the check runs
 *   in refresh-worker.mjs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  cachedRelease,
  isReleaseVersion,
  recentFailedInstall,
  releasesDir,
  resolveLatestRelease,
  tryLock,
} from './cache.mjs';
import {readJson} from './project.mjs';
import {userConfigDir} from '../env/user-dirs.mjs';
import {computerAgentTextSettings} from '../env/user-settings.mjs';
import {isCi, updateNoticesOff} from './update-notice-env.mjs';

/** How often a check may start: once a day, as `gh` and update-notifier do. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60_000;

/**
 * @typedef {object} GlobalState
 * @property {number} [firstRunAt]
 * @property {number} [checkedAt]
 * @property {number} [checkOkAt]
 * @property {string} [latest]
 * @property {string | null} [latestNode]
 * @property {{at: number, reason: string}} [checkFailed] why the last check
 *   did not reach the registry, for diagnosis only (`astryx doctor`); cleared
 *   by a check that does. Not part of any contract.
 * @property {{writtenBy?: string, attemptFor?: string, attemptAt?: number}} [agentText]
 * @property {Record<string, number>} [notifiedAt] when each update notice
 *   last printed (notices.mjs)
 * @property {Record<string, NoticeSkip>} [noticeSkips] why each update notice
 *   last did not print, for diagnosis only: `astryx doctor` shows the newest.
 *   Not part of any contract; its shape may change in any release.
 */

/**
 * Why an update notice did not print: `already-shown` (it printed within the
 * day), `no-newer` (nothing newer is known), or `no-project` (the folder
 * installs Core but belongs to no Astryx project, so no install command
 * fits). Recorded only while the run
 * holds the state file's lock.
 * @typedef {{reason: 'already-shown' | 'no-newer' | 'no-project', at: number}} NoticeSkip
 */

/**
 * The state file.
 * @param {string} [stateDir] the per-user configuration folder
 * @returns {string}
 */
export function stateFile(stateDir = userConfigDir()) {
  return path.join(stateDir, 'state.json');
}

/**
 * The saved state; `{}` when there is none or it cannot be read.
 * @param {string} [stateDir]
 * @returns {GlobalState}
 */
export function readGlobalState(stateDir = userConfigDir()) {
  const state = readJson(stateFile(stateDir));
  return state && typeof state === 'object' && !Array.isArray(state)
    ? state
    : {};
}

/** How long a run waits for another run's change to the state file. */
const STATE_LOCK_WAIT_MS = 2000;

/** Sleep the thread without spinning. @param {number} ms */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Run `change` while holding the state file's lock, so runs that finish at
 * the same moment change the state one at a time: each reads what the one
 * before it wrote. Returns `change`'s result, or `undefined` when the lock
 * cannot be taken in time or the folder cannot be written, in which case
 * nothing changes.
 * @template T
 * @param {string} stateDir
 * @param {() => T} change
 * @returns {T | undefined}
 */
export function withStateLock(stateDir, change) {
  const outcome = tryStateLock(stateDir, change);
  return outcome.ran ? outcome.value : undefined;
}

/**
 * Who holds the state file's lock now, read from its owner record, for
 * diagnosis: null when it is free. `since` is when the lock folder was made.
 * @param {string} [stateDir]
 * @returns {{pid: number | null, host: string | null, since: number} | null}
 */
export function stateLockHolder(stateDir = userConfigDir()) {
  const lockDir = path.join(stateDir, '.lock-state');
  try {
    const since = fs.statSync(lockDir).mtimeMs;
    const owner = readJson(path.join(lockDir, 'owner.json'));
    return {
      pid: Number.isInteger(owner?.pid) ? owner.pid : null,
      host: typeof owner?.host === 'string' ? owner.host : null,
      since,
    };
  } catch {
    return null;
  }
}

/**
 * {@link withStateLock}, saying why `change` did not run: the lock stayed
 * taken past the wait (`lock-timeout`), or the folder cannot hold it
 * (`state-unwritable`).
 * @template T
 * @param {string} stateDir
 * @param {() => T} change
 * @returns {{ran: true, value: T} | {ran: false, reason: 'lock-timeout' | 'state-unwritable'}}
 */
export function tryStateLock(stateDir, change) {
  const lockDir = path.join(stateDir, '.lock-state');
  const deadline = Date.now() + STATE_LOCK_WAIT_MS;
  try {
    while (!tryLock(lockDir)) {
      if (Date.now() > deadline) return {ran: false, reason: 'lock-timeout'};
      sleep(10);
    }
  } catch {
    return {ran: false, reason: 'state-unwritable'};
  }
  try {
    return {ran: true, value: change()};
  } finally {
    fs.rmSync(lockDir, {recursive: true, force: true});
  }
}

/**
 * Write the whole state, atomically. Call only while holding the lock.
 * @param {GlobalState} state
 * @param {string} stateDir
 * @returns {boolean} whether it was written
 */
export function writeGlobalState(state, stateDir) {
  const file = stateFile(stateDir);
  try {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Merge `patch` into the saved state under the lock. An unwritable folder
 * never fails a run; the state is simply not kept.
 * @param {Partial<GlobalState>} patch
 * @param {string} [stateDir]
 * @returns {GlobalState}
 */
export function updateGlobalState(patch, stateDir = userConfigDir()) {
  try {
    fs.mkdirSync(stateDir, {recursive: true});
  } catch {
    // Unwritable: nothing is kept.
  }
  return (
    withStateLock(stateDir, () => {
      const next = {...readGlobalState(stateDir), ...patch};
      writeGlobalState(next, stateDir);
      return next;
    }) ?? {...readGlobalState(stateDir), ...patch}
  );
}

/**
 * The newest release the last check found, and the Node range it declares;
 * null when no check has reached the registry.
 * @param {string} [stateDir]
 * @returns {{version: string, node: string | null} | null}
 */
export function knownLatest(stateDir = userConfigDir()) {
  const state = readGlobalState(stateDir);
  if (typeof state.checkOkAt !== 'number' || !isReleaseVersion(state.latest)) {
    return null;
  }
  return {
    version: state.latest,
    node: typeof state.latestNode === 'string' ? state.latestNode : null,
  };
}

/**
 * The version of the newest release known, or null.
 * @param {string} [stateDir]
 * @returns {string | null}
 */
export function knownLatestRelease(stateDir = userConfigDir()) {
  return knownLatest(stateDir)?.version ?? null;
}

/**
 * Record the release that last wrote the computer-level agent text.
 * @param {string | null} version
 * @param {string} [stateDir]
 */
export function recordAgentTextWritten(version, stateDir = userConfigDir()) {
  if (!isReleaseVersion(version)) return;
  updateGlobalState({agentText: {writtenBy: version}}, stateDir);
}

/** A background attempt to write the agent text is retried after an hour. */
export const AGENT_TEXT_RETRY_MS = 60 * 60_000;

/**
 * The global copy keeps the computer-level agent text installed (spec
 * AST-081 FR8): when the person has not turned it off and the running global
 * version has not written it yet, as after the person upgraded the global
 * copy, that release's own background step writes it, detached, so no command
 * waits. Returns whether a step was started.
 *
 * @param {{
 *   release: {version: string, root: string},
 *   stateDir?: string,
 *   configDir?: string,
 *   now?: number,
 *   start?: (worker: string, stateDir: string) => void,
 * }} options
 * @returns {boolean}
 */
export function maybeKeepAgentText({
  release,
  stateDir = userConfigDir(),
  configDir,
  now = Date.now(),
  start = startWorker,
}) {
  if (!computerAgentTextSettings(configDir).install) return false;
  const {agentText} = readGlobalState(stateDir);
  if (agentText?.writtenBy === release.version) return false;
  if (
    agentText?.attemptFor === release.version &&
    typeof agentText.attemptAt === 'number' &&
    now - agentText.attemptAt < AGENT_TEXT_RETRY_MS
  ) {
    return false;
  }
  const worker = path.join(
    release.root,
    'foundation',
    'release',
    'agent-text-worker.mjs',
  );
  // A release without the step predates it; it never writes the text.
  if (!fs.existsSync(worker)) return false;
  updateGlobalState(
    {agentText: {...agentText, attemptFor: release.version, attemptAt: now}},
    stateDir,
  );
  // An attempt that cannot be recorded would start again on every run.
  if (readGlobalState(stateDir).agentText?.attemptAt !== now) return false;
  start(worker, stateDir);
  return true;
}

/**
 * Start the background step that installs this release's Core into the
 * per-user cache, so commands that read Core work offline outside a project
 * after one online run (spec AST-081 FR3, FR6): when the global copy carries
 * no Core beside it and none is cached for its release, no install of it is
 * under way, no recent attempt failed (the release cache's backoff), and
 * `CI` is not set. It never blocks a command, prints nothing, and a failure
 * is retried by a later run's step. Returns whether it was started.
 *
 * Never on Windows: a detached child there inherits the caller's open handles,
 * such as the pipes a tool or agent reads this run's output from, and the
 * caller would wait for the download to end. A component read on Windows
 * fetches the Core itself when it first needs it.
 * @param {{release: {version: string, root: string}, cacheDir: string, env?: NodeJS.ProcessEnv, start?: typeof startWorker, platform?: NodeJS.Platform}} options
 * @returns {boolean}
 */
export function maybeFetchCore({
  release,
  cacheDir,
  env = process.env,
  start = startWorker,
  platform = process.platform,
}) {
  if (isCi(env) || platform === 'win32') return false;
  if (!isReleaseVersion(release.version)) return false;
  const beside = readJson(
    path.join(release.root, '..', 'core', 'package.json'),
  );
  if (
    beside?.name === '@astryxdesign/core' &&
    beside.version === release.version
  ) {
    return false;
  }
  if (cachedRelease(release.version, cacheDir)) return false;
  if (recentFailedInstall(release.version, cacheDir)) return false;
  if (
    fs.existsSync(path.join(releasesDir(cacheDir), `.lock-${release.version}`))
  ) {
    return false;
  }
  const worker = path.join(
    release.root,
    'foundation',
    'release',
    'core-worker.mjs',
  );
  // A release without the step predates it.
  if (!fs.existsSync(worker)) return false;
  start(worker, cacheDir);
  return true;
}

/**
 * Start the background check when one is due: never when the environment
 * turns update notices off (`CI`, `NO_UPDATE_NOTIFIER`), never in the first
 * day after the first run, and at most once a day. Returns whether a check
 * was started.
 *
 * @param {{
 *   stateDir?: string,
 *   now?: number,
 *   env?: Record<string, string | undefined>,
 *   start?: (worker: string, stateDir: string) => void,
 * }} [options]
 * @returns {boolean}
 */
export function maybeStartCheck(options = {}) {
  const {
    stateDir = userConfigDir(),
    now = Date.now(),
    env = process.env,
    start = startWorker,
  } = options;
  if (updateNoticesOff(env)) return false;
  const state = readGlobalState(stateDir);
  if (typeof state.firstRunAt !== 'number') {
    updateGlobalState({firstRunAt: now}, stateDir);
    return false;
  }
  const last = Math.max(state.firstRunAt, state.checkedAt ?? 0);
  if (now - last < CHECK_INTERVAL_MS) return false;
  updateGlobalState({checkedAt: now}, stateDir);
  // A start time that cannot be recorded would start a check on every run.
  if (readGlobalState(stateDir).checkedAt !== now) return false;
  start(
    fileURLToPath(new URL('./refresh-worker.mjs', import.meta.url)),
    stateDir,
  );
  return true;
}

/**
 * Why the last update check did not reach the registry, when it failed after
 * the last one that did; null otherwise. For diagnosis only.
 * @param {string} [stateDir]
 * @returns {{at: number, reason: string} | null}
 */
export function lastCheckFailure(stateDir = userConfigDir()) {
  const state = readGlobalState(stateDir);
  const failed = state.checkFailed;
  if (
    !failed ||
    typeof failed.at !== 'number' ||
    typeof failed.reason !== 'string'
  ) {
    return null;
  }
  return typeof state.checkOkAt === 'number' && state.checkOkAt > failed.at
    ? null
    : {at: failed.at, reason: failed.reason};
}

/**
 * Start a detached worker that outlives this run and reaches no stream.
 * @param {string} worker
 * @param {string} stateDir
 */
function startWorker(worker, stateDir) {
  try {
    const child = spawn(process.execPath, [worker, stateDir], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => {});
    child.unref();
  } catch {
    // A check that cannot start is the same as a failed check.
  }
}

/**
 * The check itself: ask the registry for `latest` and save what it says. It
 * installs nothing. At most one check runs at a time.
 * @param {{stateDir?: string, resolve?: typeof resolveLatestRelease}} [options]
 * @returns {GlobalState}
 */
export function runCheck(options = {}) {
  const {stateDir = userConfigDir(), resolve = resolveLatestRelease} = options;
  const lockDir = path.join(stateDir, '.lock-check');
  try {
    if (!tryLock(lockDir)) return readGlobalState(stateDir);
  } catch {
    return readGlobalState(stateDir);
  }
  try {
    /** @type {string} */
    let reason = 'unknown';
    const latest = resolve({
      onFailure: why => {
        reason = why;
      },
    });
    if (!latest) {
      // Recorded so doctor can say why notices stopped (diagnosis only).
      return updateGlobalState(
        {checkFailed: {at: Date.now(), reason}},
        stateDir,
      );
    }
    return updateGlobalState(
      {
        latest: latest.version,
        latestNode: latest.node,
        checkOkAt: Date.now(),
        checkFailed: undefined,
      },
      stateDir,
    );
  } finally {
    fs.rmSync(lockDir, {recursive: true, force: true});
  }
}
