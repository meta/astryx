// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which files and folders an operation read, so a long-running caller
 * can tell whether its inputs changed since.
 *
 * @input An operation run inside `recordReads(seen, fn)`.
 * @output `seen` gets every file whose content the operation read through fs
 *   or imported as a doc module (`recordContentRead`), and every folder it
 *   listed or probed, each with its state when first read;
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
 * @param {string} file
 */
function note(runs, file) {
  let state;
  for (const seen of runs) {
    if (!seen.has(file)) seen.set(file, (state ??= stateOf(file)));
  }
}

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

let recording = false;

/** fs.statSync as loaded, before installRecorder wraps it. */
const statSyncRaw = fs.statSync;

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
        // A file read is checked itself; a probe or listing is checked by its
        // folder, whose time changes when an entry is added, removed or
        // renamed.
        const checked =
          CONTENT_READS.has(name) || name === 'readdirSync'
            ? file
            : path.dirname(file);
        // Its state is taken when it is first read, before the read, so a
        // change made while the operation runs shows as a change afterwards.
        note(runs, checked);
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
    const {size, mtimeMs, ctimeMs, ino} = statSyncRaw(file);
    return `${size}:${mtimeMs}:${ctimeMs}:${ino}`;
  } catch {
    return '-';
  }
}

const stateOf = fileStamp;

/**
 * Whether every recorded path is still in the state it had when it was read.
 * @param {Map<string, string>} recorded - From recordReads.
 * @returns {boolean}
 */
export function unchangedSince(recorded) {
  for (const [file, state] of recorded) {
    if (stateOf(file) !== state) return false;
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
 * Run `fn`, adding to `seen` each path it reads, with that path's state when
 * it was first read (see the file header).
 * @template T
 * @param {Map<string, string>} seen
 * @param {() => T} fn
 * @returns {T}
 */
export function recordReads(seen, fn) {
  installRecorder();
  return reads.run([...(reads.getStore() ?? []), seen], fn);
}

/**
 * A loader whose value is kept while every file and folder it read is
 * unchanged, and loaded again after a change, so a long-running process sees
 * an edit. A failed load is tried again on the next call. What a kept value
 * read counts as read by the operation that asks for it.
 * @template T
 * @param {() => Promise<T>} load
 * @returns {(options?: {fresh?: boolean}) => Promise<T>}
 */
export function reusedWhileUnchanged(load) {
  /** @type {{reads: Map<string, string>, value: Promise<T>} | undefined} */
  let last;
  return ({fresh = false} = {}) => {
    if (!fresh && last && unchangedSince(last.reads)) {
      const {reads: recorded, value} = last;
      return value.then(result => {
        const runs = reads.getStore();
        if (runs) for (const [file, state] of recorded) {
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
