// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which files and folders an operation read, so a long-running caller
 * can tell whether its inputs changed since.
 *
 * @input An operation run inside `recordReads(seen, fn)`.
 * @output `seen` gets every file whose content the operation read through fs
 *   or imported as a doc module (`recordContentRead`), and every folder it
 *   listed or probed, each with its state when first read; an exact run
 *   records each probed path by what the call returned instead.
 *   `unchangedSince(seen)` says whether all are still in that state.
 * @position Used by search's adapter to reuse a gathered catalog only while
 *   it is exact, by the docs adapter to rebuild the CLI's own docs tree after
 *   an edit (`reusedWhileUnchanged`), and by the doc importers and reader
 *   (../doc-compiler) to read an edited doc file again. A run inside another
 *   records into both, so an outer reuse sees what an inner one read.
 *   Outside `recordReads` nothing is recorded and every fs call behaves as
 *   before.
 */

import {AsyncLocalStorage} from 'node:async_hooks';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * The paths the running operations touched, one map per enclosing
 * `recordReads`: every file read and every folder listed or probed.
 * @type {AsyncLocalStorage<Map<string, string>[]>}
 */
const reads = new AsyncLocalStorage();

/**
 * Add `file` to every running operation's map, with its state now, unless it
 * is there already.
 * @param {Map<string, string>[]} runs
 * @param {string} file - What a run checks: the file read, or the folder of
 *   the path probed.
 * @param {string} [probed] - The path itself, which an exact run checks.
 * @param {ReadKind} [kind] - What the call returned, which is what an exact
 *   run records of the path.
 */
function note(runs, file, probed = file, kind = 'read') {
  let state;
  let probedState;
  const key = kind === 'realpath' ? REAL_PATH + probed : probed;
  for (const seen of runs) {
    if (exactRuns.has(seen)) {
      const had = seen.get(key);
      if (had === undefined) {
        seen.set(key, (probedState ??= exactState(probed, kind)));
      } else if (
        (had === PRESENT && (kind === 'read' || kind === 'stat')) ||
        (kind === 'read' && had.startsWith('dir:'))
      ) {
        // A path first only checked for, or a folder first only probed, now
        // statted, read or listed: what the later call returned counts, so
        // it is checked by that from here on.
        seen.set(key, (probedState ??= exactState(probed, kind)));
      }
    } else if (!seen.has(file)) {
      seen.set(file, (state ??= stateOf(file)));
    }
  }
}

/**
 * What a call returns about a path, which an exact run records: a read or a
 * listing the content, a stat the path's stamp, an existence check whether
 * it is there, a real-path lookup the path it resolves to.
 * @typedef {'read' | 'stat' | 'presence' | 'realpath'} ReadKind
 */

/**
 * The state an exact run records of `file` for a call of `kind`.
 * @param {string} file
 * @param {ReadKind} kind
 * @returns {string}
 */
function exactState(file, kind) {
  switch (kind) {
    case 'read':
      return stateOf(file);
    case 'presence':
      return presenceState(file);
    case 'realpath':
      return realPathState(file);
    default:
      return probeStamp(file);
  }
}

/**
 * The runs that record a probe by the path probed, not by its folder: a
 * record kept across processes, whose folders change for reasons that do not
 * touch the path (see `recordReads`).
 * @type {WeakSet<Map<string, string>>}
 */
const exactRuns = new WeakSet();

/** node:fs's module object, whose functions every import of it shares. */
const fs = createRequire(import.meta.url)('node:fs');

/** The fs reads whose path argument is recorded. */
const RECORDED = [
  'readFileSync',
  'readdirSync',
  'statSync',
  'lstatSync',
  'existsSync',
  'realpathSync',
  'accessSync',
  'openSync',
];

/** The reads that see a file's content, so the file itself is checked. */
const CONTENT_READS = new Set(['readFileSync', 'openSync']);

/**
 * What an existence check of a present path records: only that it is there,
 * all the check returns. An absent path records `-`, as every kind does.
 */
export const PRESENT = 'present';

/**
 * What a real-path lookup's record is keyed by, before the path: it records
 * the path the lookup resolved to, beside whatever else the path's own key
 * records.
 */
export const REAL_PATH = '\0realpath:';

/**
 * The path a recorded key stands for: the key itself, or the path a
 * real-path lookup looked up.
 * @param {string} key
 * @returns {string}
 */
export function recordedPath(key) {
  return key.startsWith(REAL_PATH) ? key.slice(REAL_PATH.length) : key;
}

/**
 * What each recorded call returns about its path (ReadKind). `accessSync`
 * answers by the file's mode too, so it is recorded as a stat.
 * @param {string} name
 * @returns {ReadKind}
 */
function readKind(name) {
  if (CONTENT_READS.has(name) || name === 'readdirSync') return 'read';
  if (name === 'existsSync') return 'presence';
  if (name === 'realpathSync') return 'realpath';
  return 'stat';
}

let recording = false;

/** fs.statSync as loaded, before installRecorder wraps it. */
const statSyncRaw = fs.statSync;

/** fs.realpathSync as loaded, before installRecorder wraps it. */
const realpathSyncRaw = fs.realpathSync;

/** fs.realpathSync's native lookup, which installRecorder never wraps. */
const realpathNative = fs.realpathSync.native;

/**
 * Wrap fs's read calls once so that, inside `reads.run`, each path they are
 * given is added to that run's set. Outside a run they behave exactly as
 * before.
 */
function installRecorder() {
  if (recording) return;
  recording = true;
  for (const name of RECORDED) {
    const original = fs[name];
    if (typeof original !== 'function') continue;
    /**
     * @this {unknown}
     * @param {...any} args
     */
    const wrapped = function (...args) {
      const runs = reads.getStore();
      const target = args[0];
      if (runs && (typeof target === 'string' || target instanceof URL)) {
        const file =
          typeof target === 'string'
            ? path.resolve(target)
            : fileURLToPath(target);
        // A file read or a folder listed is checked itself; a probe is
        // checked by its folder, whose time changes when an entry is added,
        // removed or renamed, or, in an exact run, by what it returned.
        const kind = readKind(name);
        const checked = kind === 'read' ? file : path.dirname(file);
        // Its state is taken when it is first read, before the read, so a
        // change made while the operation runs shows as a change afterwards.
        note(runs, checked, file, kind);
      }
      return original.apply(this, args);
    };
    Object.assign(wrapped, original);
    fs[name] = wrapped;
  }
  // ESM imports of node:fs see the wrapped functions too.
  syncBuiltinESMExports();
}

/**
 * One path's state: its size and modification time, plus its change time and
 * inode, which change on a rewrite even when npm stamps the same size and
 * modification time; or that it is absent.
 * @param {string} file
 * @returns {string}
 */
export function fileStamp(file) {
  try {
    // An absent path answers without an error: thousands of paths a kept
    // catalog checks are absent, and building an error costs more than the
    // stat.
    const stat = statSyncRaw(file, {throwIfNoEntry: false});
    if (!stat) return '-';
    const {size, mtimeMs, ctimeMs, ino} = stat;
    return `${size}:${mtimeMs}:${ctimeMs}:${ino}`;
  } catch {
    return '-';
  }
}

const stateOf = fileStamp;

/**
 * A probed path's state for an exact run: a folder's identity alone (a probe
 * reads whether it is there and what it is, not what it holds, and its time
 * changes whenever an entry in it changes), a file's full stamp, or absent.
 * @param {string} file
 * @returns {string}
 */
function probeStamp(file) {
  try {
    const stat = statSyncRaw(file, {throwIfNoEntry: false});
    if (!stat) return '-';
    if (stat.isDirectory()) return `dir:${stat.ino}`;
    return `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`;
  } catch {
    return '-';
  }
}

/**
 * Whether `file` is there, as an existence check answers: `present`, or
 * absent.
 * @param {string} file
 * @returns {string}
 */
function presenceState(file) {
  try {
    return statSyncRaw(file, {throwIfNoEntry: false}) ? PRESENT : '-';
  } catch {
    return '-';
  }
}

/**
 * The path `file` resolves to, or absent: a real-path lookup's state.
 *
 * The program still receives what its own lookup returned; this state only
 * shows a change. The native lookup resolves the same links in a fraction of
 * the time, which counts when a check reads hundreds of these, and where it
 * differs it shows more changes, never fewer: at worst an extra miss. Where
 * it fails for a reason other than a missing path, the program's own lookup
 * gives the state, so the state cannot flip between the two.
 * @param {string} file
 * @returns {string}
 */
function realPathState(file) {
  try {
    return realpathNative(file);
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return '-';
  }
  try {
    return realpathSyncRaw(file);
  } catch {
    return '-';
  }
}

/**
 * Whether a recorded path is still in the state recorded for it, by the kind
 * of state that was recorded.
 * @param {string} file - The recorded key: a path, or a real-path lookup's.
 * @param {string} state
 * @returns {boolean}
 */
export function stillInState(file, state) {
  if (file.startsWith(REAL_PATH)) {
    return realPathState(file.slice(REAL_PATH.length)) === state;
  }
  if (state === PRESENT) return presenceState(file) === state;
  return (
    (state.startsWith('dir:') ? probeStamp(file) : stateOf(file)) === state
  );
}

/**
 * Whether every recorded path is still in the state it had when it was read.
 * @param {Map<string, string>} recorded - From recordReads.
 * @returns {boolean}
 */
export function unchangedSince(recorded) {
  for (const [file, state] of recorded) {
    if (!stillInState(file, state)) return false;
  }
  return true;
}

/**
 * Count `file` as read by the running operation, as a content read through fs
 * would be, for a read that does not go through fs: a module import. Outside
 * `recordReads` it does nothing.
 * @param {string} file
 */
export function recordContentRead(file) {
  const runs = reads.getStore();
  if (runs) note(runs, path.resolve(file));
}

/**
 * Run `fn` with nothing it reads recorded: a cache's own bookkeeping, which
 * is not an input of what it keeps.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function withoutRecording(fn) {
  return reads.exit(fn);
}

/**
 * Count paths as read by the running operations, each with the state given:
 * what a value kept from an earlier read read. Outside `recordReads` it does
 * nothing.
 * @param {Iterable<[string, string]>} states
 */
export function recordStates(states) {
  const runs = reads.getStore();
  if (!runs) return;
  for (const [file, state] of states) {
    for (const seen of runs) keepState(seen, file, state);
  }
}

/**
 * Keep `state` as the state read of `file`, one state per path: the first
 * one, except that a path only checked for takes any other state read later,
 * and a folder only probed takes a full stamp read later. What the later
 * call returned counts, as when a run reads a path it checked for (see
 * `note`).
 * @param {Map<string, string>} seen
 * @param {string} file
 * @param {string} state
 */
export function keepState(seen, file, state) {
  const had = seen.get(file);
  if (
    had === undefined ||
    (had === PRESENT && state !== PRESENT) ||
    (had.startsWith('dir:') && !state.startsWith('dir:') && state !== PRESENT)
  ) {
    seen.set(file, state);
  }
}

/**
 * Run `fn`, adding to `seen` each path it reads, with that path's state when
 * it was first read (see the file header).
 * @template T
 * @param {Map<string, string>} seen
 * @param {() => T} fn
 * @param {{exact?: boolean}} [options] - `exact`: record a probe by the
 *   path probed, with what the call returned, instead of by its folder: an
 *   existence check whether the path is there, a real-path lookup the path
 *   it resolves to, a stat the path's stamp. A listing and a content read
 *   are recorded as ever. A folder's time changes whenever any entry in it is
 *   added or renamed, and a file's whenever it is written, so a record kept
 *   between runs stays valid longer this way.
 * @returns {T}
 */
export function recordReads(seen, fn, {exact = false} = {}) {
  installRecorder();
  if (exact) exactRuns.add(seen);
  return reads.run([...(reads.getStore() ?? []), seen], fn);
}

/**
 * A loader whose value is kept while every file and folder it read is
 * unchanged, and loaded again after a change, so a long-running process sees
 * an edit. A failed load is tried again on the next call. What a kept value
 * read counts as read by the operation that asks for it.
 * @template T
 * @param {() => Promise<T>} load
 * @param {(recorded: Map<string, string>) => boolean} [isUnchanged] - Whether
 *   recorded paths are unchanged; `unchangedSince` unless a caller passes the
 *   one it imports (so a test of that caller can hold the answer).
 * @returns {(options?: {fresh?: boolean}) => Promise<T>}
 */
export function reusedWhileUnchanged(load, isUnchanged = unchangedSince) {
  /** @type {{reads: Map<string, string>, value: Promise<T>} | undefined} */
  let last;
  return ({fresh = false} = {}) => {
    if (!fresh && last && isUnchanged(last.reads)) {
      const {reads: recorded, value} = last;
      return value.then(result => {
        const runs = reads.getStore();
        if (runs)
          for (const [file, state] of recorded) {
            for (const seen of runs) if (!seen.has(file)) seen.set(file, state);
          }
        return result;
      });
    }
    /** @type {Map<string, string>} */
    const seen = new Map();
    const value = recordReads(seen, load);
    const entry = {reads: seen, value};
    last = entry;
    value.catch(() => {
      if (last === entry) last = undefined;
    });
    return value;
  };
}
