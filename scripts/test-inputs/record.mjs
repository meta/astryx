// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Records what a process touches on disk, for the test-inputs record.
 * @input ASTRYX_TEST_INPUTS_DIR (where to write) and ASTRYX_TEST_INPUTS_FOR
 *   (whose inputs these are: a test file, or a step that runs before the
 *   tests). Nothing is recorded while either is unset.
 * @output One JSON line per owner and process (one with empty lists too, so
 *   a test file that touches nothing still has its line) in
 *   `$ASTRYX_TEST_INPUTS_DIR/<pid>.<thread>.jsonl`: the paths read or probed, the folders listed, the paths
 *   written, and whether the process did something whose reads it cannot see
 *   (a process that is not Node, a shell command, a worker thread, a Node
 *   child stopped by a signal before it wrote its own lines).
 * @position Preloaded with `--import` into every Node process of a recording
 *   run: the processes a recorded process starts inherit it through
 *   NODE_OPTIONS. Main's full unit run records; scripts/test-inputs/merge.mjs
 *   turns the lines into the record that pull requests select tests with
 *   (spec:AST-030 FR13). Node built-ins only.
 */

import childProcess from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import module from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import workerThreads from 'node:worker_threads';

const OUT = process.env.ASTRYX_TEST_INPUTS_DIR;
const SELF = fileURLToPath(import.meta.url);

if (OUT && !globalThis.__astryxTestInputs) {
  const reads = new Set();
  const probes = new Set();
  const lists = new Set();
  const writes = new Set();
  const unseen = new Set();
  const realDirs = new Map();
  const {realpathSync} = fs;
  const owner = () => process.env.ASTRYX_TEST_INPUTS_FOR;
  // A process or worker that a recorded one started inherits its owner;
  // Vitest's own workers start with none and take one per test file.
  const started = Boolean(owner());
  // Each process and thread appends its lines to one file of its own. A
  // process killed while it writes leaves its last line cut short; the merge
  // reads such a line as one it cannot see (merge.mjs readLines). Node's own
  // appendFileSync calls the exported fs functions, which the wrappers below
  // watch, so what writing a line touches is not recorded.
  const {appendFileSync} = fs;
  let writingLine = false;
  const writeLine = (who, entry) => {
    writingLine = true;
    try {
      appendFileSync(
        path.join(OUT, `${process.pid}.${workerThreads.threadId}.jsonl`),
        `${JSON.stringify({
          for: who,
          reads: [],
          probes: [],
          lists: [],
          writes: [],
          unseen: [],
          ...entry,
        })}\n`,
      );
    } finally {
      writingLine = false;
    }
  };
  const preload = `--import=${SELF}`;
  // A worker thread loads the recorder only from the preload this process
  // started with; a process that imported it at run time passes none on.
  const preloaded =
    (process.env.NODE_OPTIONS ?? '').includes(preload) ||
    process.execArgv.includes(preload);

  // The path as the disk resolves it, so a fixture's link into the checkout
  // records the checkout's file. Its folder resolves while the path is used
  // (a fixture folder may be gone by the time the record is written).
  const resolved = target => {
    const absolute = path.resolve(target);
    const dir = path.dirname(absolute);
    let real = realDirs.get(dir);
    if (real === undefined) {
      try {
        real = realpathSync.native(dir);
      } catch {
        real = dir;
      }
      realDirs.set(dir, real);
    }
    return path.join(real, path.basename(absolute));
  };
  const note = (set, target) => {
    if (!owner() || writingLine) return;
    // A started process (a child or a worker) tells its starter what it found
    // only by what it writes or sends, so its lines so far are written first:
    // stopped later, it loses only what it never passed on.
    if (set === writes && started) flushSoFar({inputsOnly: true});
    if (target instanceof URL) target = fileURLToPath(target);
    else if (Buffer.isBuffer(target)) target = target.toString();
    if (typeof target === 'string' && target !== '') set.add(resolved(target));
  };
  const originals = [fs, fsp, childProcess].map(object => [
    object,
    {...object},
  ]);
  const watch = (object, name, set) => {
    const original = object[name];
    if (typeof original !== 'function') return;
    object[name] = function (target, ...rest) {
      note(set, target);
      return original.call(this, target, ...rest);
    };
  };
  // A read of a path that is not there is a probe: creating the path would
  // change what the test sees, but nothing built it.
  const missing = error =>
    error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
  const watchRead = (object, name, kind) => {
    const original = object[name];
    if (typeof original !== 'function') return;
    object[name] = function (target, ...rest) {
      if (!owner()) return original.call(this, target, ...rest);
      if (kind === 'promise') {
        return original.call(this, target, ...rest).then(
          value => {
            note(reads, target);
            return value;
          },
          error => {
            note(missing(error) ? probes : reads, target);
            throw error;
          },
        );
      }
      try {
        const value = original.call(this, target, ...rest);
        note(kind === 'exists' && value === false ? probes : reads, target);
        return value;
      } catch (error) {
        note(missing(error) ? probes : reads, target);
        throw error;
      }
    };
  };
  const watchPair = (object, name) => {
    const original = object[name];
    if (typeof original !== 'function') return;
    // A recursive copy (`cp`) reads the whole tree under its source natively,
    // so its source counts as a listing: a change anywhere under it can
    // change what the test sees.
    const source = name.startsWith('cp') ? lists : reads;
    object[name] = function (from, to, ...rest) {
      note(source, from);
      note(writes, to);
      return original.call(this, from, to, ...rest);
    };
  };

  const READS = [
    'readFile',
    'stat',
    'lstat',
    'access',
    'open',
    'realpath',
    'readlink',
  ];
  const LISTS = ['readdir', 'opendir'];
  const WRITES = ['writeFile', 'appendFile', 'rm', 'unlink', 'truncate'];
  const PAIRS = ['copyFile', 'rename', 'cp', 'link'];
  for (const name of READS) {
    watch(fs, name, reads);
    watchRead(fs, `${name}Sync`, 'sync');
    watchRead(fsp, name, 'promise');
  }
  watchRead(fs, 'existsSync', 'exists');
  watch(fs, 'exists', reads);
  watch(fs, 'createReadStream', reads);
  for (const name of ['watch', 'watchFile']) watch(fs, name, lists);
  for (const name of LISTS) {
    watch(fs, name, lists);
    watch(fs, `${name}Sync`, lists);
    watch(fsp, name, lists);
  }
  for (const name of WRITES) {
    watch(fs, name, writes);
    watch(fs, `${name}Sync`, writes);
    watch(fsp, name, writes);
  }
  watch(fs, 'createWriteStream', writes);
  // A link is written at its second argument; its target is only named.
  const watchSymlink = (object, name) => {
    const original = object[name];
    object[name] = function (target, at, ...rest) {
      note(writes, at);
      return original.call(this, target, at, ...rest);
    };
  };
  watchSymlink(fs, 'symlink');
  watchSymlink(fs, 'symlinkSync');
  watchSymlink(fsp, 'symlink');
  // A folder made here, not one that was already there (`recursive` over an
  // existing folder writes nothing).
  const {existsSync} = fs;
  const watchMkdir = (object, name) => {
    const original = object[name];
    object[name] = function (target, ...rest) {
      if (owner() && !existsSync(target)) note(writes, target);
      return original.call(this, target, ...rest);
    };
  };
  watchMkdir(fs, 'mkdir');
  watchMkdir(fs, 'mkdirSync');
  watchMkdir(fsp, 'mkdir');
  // A temporary folder is named by its result.
  const {mkdtempSync} = fs;
  fs.mkdtempSync = function (...args) {
    const made = mkdtempSync.apply(this, args);
    note(writes, made);
    return made;
  };
  const {mkdtemp} = fsp;
  fsp.mkdtemp = async function (...args) {
    const made = await mkdtemp.apply(this, args);
    note(writes, made);
    return made;
  };
  for (const name of PAIRS) {
    watchPair(fs, name);
    watchPair(fs, `${name}Sync`);
    watchPair(fsp, name);
  }
  // Named imports of `node:fs` (`import {readFileSync} from 'node:fs'`) read
  // the patched functions only after this.
  module.syncBuiltinESMExports();

  // A Node child records its own reads: it inherits this preload and its
  // owner through the environment. Any other program, a shell, or a child
  // given an environment without them reads where this process cannot see.
  const nodePrograms = new Map();
  const isNodeProgram = file => {
    if (
      file === process.execPath ||
      /^node(?:\.exe)?$/.test(path.basename(file))
    )
      return true;
    if (nodePrograms.has(file)) return nodePrograms.get(file);
    let script = false;
    const dirs =
      path.isAbsolute(file) || file.includes('/')
        ? ['']
        : (process.env.PATH ?? '').split(path.delimiter);
    for (const dir of dirs) {
      try {
        const head = fs
          .readFileSync(path.resolve(dir, file), {encoding: 'utf8', flag: 'r'})
          .slice(0, 128);
        script = /^#!.*\bnode\b/.test(head);
        break;
      } catch {
        // Not in this folder.
      }
    }
    nodePrograms.set(file, script);
    return script;
  };
  const recorded = env =>
    env == null ||
    ((env.NODE_OPTIONS ?? '').includes(preload) &&
      env.ASTRYX_TEST_INPUTS_FOR === owner());
  const optionsOf = rest =>
    rest.find(
      arg => arg != null && typeof arg === 'object' && !Array.isArray(arg),
    ) ?? {};
  // A recorded Node child writes what it found before each message it sends
  // and each file it writes, so a child stopped by a signal once it answered
  // (a page host) loses nothing it passed on. Its standard output is the one
  // channel it can pass things on without that, so a child stopped by a
  // signal while its starter read that output (or, run synchronously, kept
  // it) marks its owner unseen. The owner is the one when the child started:
  // a test may have ended by the time it stops.
  const stoppedBefore = program =>
    `stops ${program} before it writes its record`;
  const watchStop = (who, program, child) => {
    child?.on?.('exit', (_code, signal) => {
      if (signal && (child.stdout != null || child.stderr != null)) {
        writeLine(who, {unseen: [stoppedBefore(program)]});
      }
    });
    return child;
  };
  const syncStop = (program, run) => {
    try {
      const result = run();
      if (result?.signal) unseen.add(stoppedBefore(program));
      return result;
    } catch (error) {
      if (error?.signal) unseen.add(stoppedBefore(program));
      throw error;
    }
  };
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
    const original = childProcess[name];
    childProcess[name] = function (file, ...rest) {
      const who = owner();
      if (!who) return original.call(this, file, ...rest);
      const options = optionsOf(rest);
      const program = path.basename(String(file));
      if (options.shell) unseen.add('runs a shell command');
      else if (!isNodeProgram(String(file))) unseen.add(`runs ${program}`);
      else if (!recorded(options.env))
        unseen.add(`runs ${program} without its recorder`);
      else if (name.endsWith('Sync'))
        return syncStop(program, () => original.call(this, file, ...rest));
      else return watchStop(who, program, original.call(this, file, ...rest));
      return original.call(this, file, ...rest);
    };
  }
  // A forked child is always Node; it records only when its environment
  // keeps the recorder.
  const originalFork = childProcess.fork;
  childProcess.fork = function (modulePath, ...rest) {
    const who = owner();
    if (who && recorded(optionsOf(rest).env)) {
      return watchStop(
        who,
        path.basename(String(modulePath)),
        originalFork.call(this, modulePath, ...rest),
      );
    }
    if (who) {
      unseen.add(
        `forks ${path.basename(String(modulePath))} without its recorder`,
      );
    }
    return originalFork.call(this, modulePath, ...rest);
  };
  for (const name of ['exec', 'execSync']) {
    const original = childProcess[name];
    childProcess[name] = function (command, ...rest) {
      if (owner()) unseen.add('runs a shell command');
      return original.call(this, command, ...rest);
    };
  }
  // A worker thread of a preloaded process loads the recorder too and records
  // under the same owner, unless it is given an environment without it.
  const {Worker, SHARE_ENV} = workerThreads;
  workerThreads.Worker = class extends Worker {
    constructor(file, options = {}) {
      if (
        owner() &&
        (!preloaded || (options.env !== SHARE_ENV && !recorded(options.env)))
      ) {
        unseen.add('starts a worker thread without its recorder');
      }
      super(file, options);
    }
  };

  // Modules Node loads itself (a native import, a CLI's own files in a child
  // process) are reads too.
  module.registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith('file:')) note(reads, new URL(url));
      return nextLoad(url, context);
    },
  });

  // Each wrapper keeps its original's own properties, which callers read
  // (`realpathSync.native`, `exec[util.promisify.custom]`).
  for (const [object, before] of originals) {
    for (const [name, original] of Object.entries(before)) {
      if (typeof original !== 'function' || object[name] === original) continue;
      for (const key of Reflect.ownKeys(original)) {
        if (key === 'name' || key === 'length' || key === 'prototype') continue;
        Object.defineProperty(
          object[name],
          key,
          Object.getOwnPropertyDescriptor(original, key),
        );
      }
    }
  }
  module.syncBuiltinESMExports();

  if (!(process.env.NODE_OPTIONS ?? '').includes(preload)) {
    process.env.NODE_OPTIONS =
      `${process.env.NODE_OPTIONS ?? ''} ${preload}`.trim();
  }

  const flush = () => {
    const who = owner();
    if (who) {
      writeLine(who, {
        reads: [...reads],
        probes: [...probes],
        lists: [...lists],
        writes: [...writes],
        unseen: [...unseen],
      });
    }
    reads.clear();
    probes.clear();
    lists.clear();
    writes.clear();
    unseen.clear();
  };
  process.on('exit', flush);
  // What a started process found so far, written before it passes anything
  // on. An owner with nothing new writes nothing here; before a write, only
  // new inputs count, so a process that writes many files in a row writes
  // one line for them, not one each.
  const flushSoFar = ({inputsOnly = false} = {}) => {
    const inputs = reads.size + probes.size + lists.size + unseen.size;
    if (inputs > 0 || (!inputsOnly && writes.size > 0)) flush();
  };
  if (started) {
    if (typeof process.send === 'function') {
      const send = process.send;
      process.send = function (...args) {
        flushSoFar();
        return send.apply(this, args);
      };
    }
    const port = workerThreads.parentPort;
    if (port != null) {
      const postMessage = port.postMessage;
      port.postMessage = function (...args) {
        flushSoFar();
        return postMessage.apply(this, args);
      };
    }
  }

  globalThis.__astryxTestInputs = {
    /** Ends the current owner's lines and records for `next` from now on. */
    switchTo(next) {
      flush();
      if (next) process.env.ASTRYX_TEST_INPUTS_FOR = next;
      else delete process.env.ASTRYX_TEST_INPUTS_FOR;
    },
    /**
     * Records `run` for `name` (a step a test runs for the rest, such as a
     * shared build), then goes back to the owner before it.
     * @template T
     * @param {string} name
     * @param {() => Promise<T>} run
     * @returns {Promise<T>}
     */
    async as(name, run) {
      const before = owner();
      this.switchTo(name);
      try {
        return await run();
      } finally {
        this.switchTo(before);
      }
    },
  };
}
