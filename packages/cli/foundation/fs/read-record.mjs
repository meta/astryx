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
 * Add the path `file` a call was given to every running operation's map,
 * with its state now, unless it is there already. Every recorded fs call
 * comes here, so the common case, a path already recorded in full, costs a
 * map lookup and one character (weak).
 * @param {Map<string, string>[]} runs
 * @param {string} file
 * @param {ReadKind} [kind] - What the call returned, which is what an exact
 *   run records of the path.
 * @param {string} [answer] - What a real-path lookup returned; none when it
 *   threw.
 */
function note(runs, file, kind = 'read', answer = undefined) {
  let state;
  let exact;
  /** @type {string | undefined} */
  let checked;
  for (const seen of runs) {
    if (exactRuns.has(seen)) {
      const had = seen.get(file);
      if (had === undefined) {
        seen.set(file, (exact ??= exactState(file, kind, answer)));
      } else if (weak(had) && mayTake(had, GIVES[kind])) {
        // A path first only checked for, or only resolved, or a folder first
        // only probed, now resolved, statted, read or listed: what the later
        // call returned counts, so it is checked by that from here on.
        keepState(seen, file, (exact ??= exactState(file, kind, answer)));
      }
    } else {
      // A file read or a folder listed is checked itself; a probe is checked
      // by its folder, whose time changes when an entry is added, removed or
      // renamed.
      checked ??= kind === 'read' ? file : path.dirname(file);
      const had = seen.get(checked);
      if (had === undefined) {
        seen.set(checked, (state ??= stateOf(checked)));
      } else if (weak(had)) {
        // A state another record handed in, such as a kept entry's `present`,
        // gives way to what this read returned.
        keepState(seen, checked, (state ??= stateOf(checked)));
      }
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
 * @param {string} [answer] - What a real-path lookup returned; none when it
 *   threw.
 * @returns {string}
 */
function exactState(file, kind, answer) {
  switch (kind) {
    case 'read':
      return stateOf(file);
    case 'presence':
      return presenceState(file);
    case 'realpath':
      return answer === undefined ? '-' : `${RESOLVED}${answer}`;
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
 * What a real-path lookup records: the path it returned, after this prefix,
 * until a stat or a read of the same path records that call's fuller state
 * instead. A check looks the path up again the same way (resolvedNow).
 */
export const RESOLVED = 'real:';

/**
 * Whether a state is a real-path lookup's (RESOLVED): one an entry checks
 * without the path's content.
 * @param {string} state
 * @returns {boolean}
 */
export function lookedUp(state) {
  return state.startsWith(RESOLVED);
}

/**
 * What kind of state each call gives (see keepState).
 * @type {Record<ReadKind, StateKind>}
 */
const GIVES = {
  read: 'stamp',
  stat: 'probe',
  presence: 'presence',
  realpath: 'resolved',
};

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
    const kind = readKind(name);
    /**
     * @this {unknown}
     * @param {...any} args
     */
    const wrapped = function (...args) {
      const runs = reads.getStore();
      const target = args[0];
      if (!runs || !(typeof target === 'string' || target instanceof URL)) {
        return original.apply(this, args);
      }
      const file =
        typeof target === 'string'
          ? path.resolve(target)
          : fileURLToPath(target);
      if (kind !== 'realpath') {
        // Its state is taken when it is first read, before the read, so a
        // change made while the operation runs shows as a change afterwards.
        note(runs, file, kind);
        return original.apply(this, args);
      }
      // A real-path lookup records what it answered: the path, or none when
      // it threw.
      let answer;
      try {
        answer = original.apply(this, args);
      } catch (error) {
        note(runs, file, kind);
        throw error;
      }
      note(runs, file, kind, String(answer));
      return answer;
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
 * What a real-path lookup of `file` answers now, as a state: the path the
 * program's own lookup returns, so a check agrees with the record on links
 * and on letter case; or absent.
 * @param {string} file
 * @returns {string}
 */
function resolvedNow(file) {
  try {
    return `${RESOLVED}${realpathSyncRaw(file)}`;
  } catch {
    return '-';
  }
}

/**
 * Whether a recorded path is still in the state recorded for it, by the kind
 * of state that was recorded.
 * @param {string} file - The recorded path.
 * @param {string} state
 * @returns {boolean}
 */
export function stillInState(file, state) {
  if (lookedUp(state)) return resolvedNow(file) === state;
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
  for (const seen of runs) {
    for (const [file, state] of states) {
      // The common cases need no rule: a path the record does not hold yet,
      // and one a value reused again in the run handed in already.
      const had = seen.get(file);
      if (had === undefined) seen.set(file, state);
      else if (had !== state && weak(had)) keepState(seen, file, state);
    }
  }
}

/**
 * Keep `state` as the state read of `file`, one state per path: the first
 * one, except that a later call's fuller state replaces a weaker one (takes):
 * present < resolved < a folder's probe state < a full stamp. What the later
 * call returned counts, as when a run reads a path it checked for (see
 * `note`). Every place that adds a state to a record goes through this rule.
 * @param {Map<string, string>} seen
 * @param {string} file
 * @param {string | ((file: string, seen: Map<string, string>) => string)} state
 *   The state, or what gives it from the path and the record, asked only
 *   when the rule could keep it: a stat costs more than the check.
 * @param {StateKind} [gives] - With `state` given by a function: the kind of
 *   state it gives.
 */
export function keepState(seen, file, state, gives = 'probe') {
  const had = seen.get(file);
  if (had === undefined) {
    seen.set(file, typeof state === 'function' ? state(file, seen) : state);
    return;
  }
  if (!weak(had)) return;
  if (typeof state === 'function') {
    if (!mayTake(had, gives)) return;
    state = state(file, seen);
  }
  if (takes(had, state)) seen.set(file, state);
}

/**
 * The kind of state a call gives, which says what it may replace: a full
 * stamp (a read or a listing), a stamp or a folder's probe state (a stat),
 * where a path resolves (a real-path lookup), or whether it is there (an
 * existence check, which replaces nothing).
 * @typedef {'stamp' | 'probe' | 'resolved' | 'presence'} StateKind
 */

/**
 * Whether a later call's state may replace `had`: present, where a path
 * resolves, or a folder's probe state, each starting with a letter. A stamp
 * starts with a digit and absent is `-`: they are kept. Every record checks
 * this on each call it sees, so it reads one character.
 * @param {string} had
 * @returns {boolean}
 */
function weak(had) {
  return had.charCodeAt(0) > 57;
}

/**
 * Whether a state of kind `gives` could replace `had` (keepState): what a
 * record asks before it works a state out.
 * @param {string} had
 * @param {StateKind} gives
 * @returns {boolean}
 */
function mayTake(had, gives) {
  if (gives === 'presence') return false;
  if (had === PRESENT) return true;
  if (lookedUp(had)) return gives !== 'resolved';
  return gives === 'stamp' && had.startsWith('dir:');
}

/**
 * Whether `state` replaces `had`: present gives way to any other state;
 * where a path resolves, to a stat's or a read's state; a folder's probe
 * state, to a full stamp or absent.
 * @param {string} had
 * @param {string} state
 * @returns {boolean}
 */
function takes(had, state) {
  if (had === PRESENT) return state !== PRESENT;
  if (lookedUp(had)) return state !== PRESENT && !lookedUp(state);
  return (
    had.startsWith('dir:') &&
    !state.startsWith('dir:') &&
    !lookedUp(state) &&
    state !== PRESENT
  );
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
        recordStates(recorded);
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
