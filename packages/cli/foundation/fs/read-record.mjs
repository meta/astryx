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
  for (const seen of runs) {
    if (exactRuns.has(seen)) {
      const had = seen.get(probed);
      if (had === undefined) {
        seen.set(probed, (probedState ??= exactState(probed, kind, seen)));
      } else if (weak(had) && mayTake(had, GIVES[kind])) {
        // A path first only checked for, or only resolved, or a folder first
        // only probed, now resolved, statted, read or listed: what the later
        // call returned counts, so it is checked by that from here on.
        keepState(
          seen,
          probed,
          (probedState ??= exactState(probed, kind, seen)),
        );
      }
    } else {
      const had = seen.get(file);
      if (had === undefined) {
        seen.set(file, (state ??= stateOf(file)));
      } else if (weak(had)) {
        // A state another record handed in, such as a kept entry's `present`,
        // gives way to what this read returned.
        keepState(seen, file, (state ??= stateOf(file)));
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
 * @param {Map<string, string>} seen - The run recording it.
 * @returns {string}
 */
function exactState(file, kind, seen) {
  switch (kind) {
    case 'read': {
      const looked = lookedUpOf(seen).get(file);
      return looked ? stampOf(looked) : stateOf(file);
    }
    case 'presence':
      return presenceState(file);
    case 'realpath': {
      const run = viewOf(seen);
      const real = realPathState(file, run.folders, run.looked);
      return real === '-' ? '-' : `${RESOLVED}${real}`;
    }
    default: {
      const looked = lookedUpOf(seen).get(file);
      if (!looked) return probeStamp(file);
      return looked.isDirectory() ? `dir:${looked.ino}` : stampOf(looked);
    }
  }
}

/**
 * What each exact run has seen while it recorded real-path lookups, by the
 * run's record: the folders it resolved, each once however many paths under
 * it it looks up, and the stat it took of each path (lookedUpOf). A check
 * sees the filesystem afresh (stillInState).
 * @type {WeakMap<Map<string, string>, {folders: Map<string, string>, looked: Map<string, import('node:fs').Stats>}>}
 */
const resolvedInRun = new WeakMap();

/**
 * What the run recording into `seen` has seen (resolvedInRun).
 * @param {Map<string, string>} seen
 * @returns {{folders: Map<string, string>, looked: Map<string, import('node:fs').Stats>}}
 */
function viewOf(seen) {
  let view = resolvedInRun.get(seen);
  if (!view) {
    view = {folders: new Map(), looked: new Map()};
    resolvedInRun.set(seen, view);
  }
  return view;
}

/**
 * The stat of each path, no link, that the run recording into `seen` took
 * when it looked up where the path resolves: a later read or stat of the
 * path in the run records the stamp from it, the stamp the path had when the
 * run first touched it, as a lookup that took the whole stamp recorded.
 * @param {Map<string, string>} seen
 * @returns {Map<string, import('node:fs').Stats>}
 */
function lookedUpOf(seen) {
  return viewOf(seen).looked;
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
 * What a real-path lookup records before where the path resolves
 * (realPathState): the lookup's answer, and no more, until a stat or a read
 * of the same path records that call's fuller state instead.
 */
export const RESOLVED = 'real:';

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

/** fs.lstatSync as loaded, before installRecorder wraps it. */
const lstatSyncRaw = fs.lstatSync;

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
 * A stat's stamp ({@link fileStamp}).
 * @param {import('node:fs').Stats} stat
 * @returns {string}
 */
function stampOf({size, mtimeMs, ctimeMs, ino}) {
  return `${size}:${mtimeMs}:${ctimeMs}:${ino}`;
}

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
 * A real-path lookup's state: a stamp of where `file` resolves, which
 * changes whenever the lookup could resolve it elsewhere, or absent. The
 * program still receives what its own lookup returned; this state only shows
 * a change, and it is worked out the same way when it is recorded and when it
 * is checked.
 *
 * A path whose last part is a link, or the root, or a path ending in a
 * separator, is resolved whole. Any other
 * resolves through its folder, so the state is the folder's resolved path
 * with the last part's name: one lstat per path, and one lookup per folder,
 * which `folders` shares across the paths one check reads. A file replaced
 * whole keeps the state, as it keeps its path; what a step read of its
 * content has a stamp of its own.
 * @param {string} file
 * @param {Map<string, string> | null} [folders] - Folders already resolved,
 *   by path: by this check, or by the run that records the lookup; never
 *   shared beyond one check or one run.
 * @param {Map<string, import('node:fs').Stats> | null} [looked] - Where the
 *   run that records the lookup keeps the path's stat (lookedUpOf).
 * @returns {string}
 */
function realPathState(file, folders = null, looked = null) {
  /** @type {import('node:fs').Stats | undefined} */
  let stat;
  try {
    stat = lstatSyncRaw(file, {throwIfNoEntry: false});
  } catch {
    return resolvedPath(file);
  }
  if (!stat) return '-';
  const parent = path.dirname(file);
  // A path ending in a separator (a folder URL) has its last part followed
  // by lstat, so a link there is resolved whole too.
  if (stat.isSymbolicLink() || parent === file || file.endsWith(path.sep)) {
    return resolvedPath(file);
  }
  looked?.set(file, stat);
  let real = folders?.get(parent);
  if (real === undefined) {
    real = resolvedPath(parent);
    folders?.set(parent, real);
  }
  return real === '-' ? '-' : path.join(real, path.basename(file));
}

/**
 * The path `file` resolves to whole, or absent. The native lookup resolves
 * the same links as the program's own in a fraction of the time; where it
 * fails for a reason other than a missing path, the program's own lookup
 * answers, so the state cannot flip between the two.
 * @param {string} file
 * @returns {string}
 */
function resolvedPath(file) {
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
 * @param {Map<string, string> | null} [folders] - Folders this check has
 *   resolved (realPathState): one map per check, never kept longer.
 * @returns {boolean}
 */
export function stillInState(file, state, folders = null) {
  if (state.startsWith(RESOLVED)) {
    const real = realPathState(file, folders);
    return (real === '-' ? '-' : `${RESOLVED}${real}`) === state;
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
  /** @type {Map<string, string>} */
  const folders = new Map();
  for (const [file, state] of recorded) {
    if (!stillInState(file, state, folders)) return false;
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
 * one, except that a later call's fuller state replaces a weaker one (takes):
 * present < resolved < a folder's probe state < a full stamp. What the later
 * call returned counts, as when a run reads a path it checked for (see
 * `note`). Every place that adds a state to a record goes through this rule.
 * @param {Map<string, string>} seen
 * @param {string} file
 * @param {string | (() => string)} state - The state, or what gives it, asked
 *   only when the rule could keep it: a stat costs more than the check.
 * @param {StateKind} [gives] - With `state` given by a function: the kind of
 *   state it gives.
 */
export function keepState(seen, file, state, gives = 'probe') {
  const had = seen.get(file);
  if (had !== undefined && !weak(had)) return;
  if (typeof state === 'function') {
    if (had !== undefined && !mayTake(had, gives)) return;
    state = state();
  }
  if (had === undefined || takes(had, state)) seen.set(file, state);
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
  if (had.startsWith(RESOLVED)) return gives !== 'resolved';
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
  if (had.startsWith(RESOLVED)) {
    return state !== PRESENT && !state.startsWith(RESOLVED);
  }
  return (
    had.startsWith('dir:') &&
    !state.startsWith('dir:') &&
    !state.startsWith(RESOLVED) &&
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
