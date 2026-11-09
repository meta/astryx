// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file In-process CLI test harness.
 *
 * Drives the REAL Astryx program — all commands, the preAction --json gate, the
 * hooks, and the json-shim — via createProgram() + parseAsync, instead of
 * spawning `node bin/astryx.mjs` per assertion. That makes CLI suites fast and
 * deterministic (no per-test Node cold-start to starve under parallel load).
 *
 * Drop-in for the per-file spawn helpers: returns `{status, code, stdout,
 * stderr}` (both `status` and `code` are the exit code — the spawnSync helpers
 * read `.status`, the execFileSync ones read `.code`). Accepts the cwd either
 * positionally (`runCli(args, dir)`, the execFileSync convention) or as an
 * option (`runCli(args, {cwd})`, the spawnSync convention). It IS async
 * (command actions are async), so call sites use `await runCli(...)`.
 *
 * The real bin bootstrap + true process boundary are covered separately by a
 * small e2e smoke that still spawns the binary.
 *
 * Runs take turns. Each run holds the process's working folder, console, exit
 * and argv until it settles. The end of a test waits for its run. A run whose
 * test has already ended, for example by a timeout, does not start. A run still
 * going a test timeout after its test ended is stuck: the harness puts the
 * process back and releases the run. A released run that wakes later cannot
 * end the test worker, move the working folder or write into a later run.
 */

import {AsyncLocalStorage} from 'node:async_hooks';
import {clearTimeout, setTimeout} from 'node:timers';
import {format} from 'node:util';
import {onTestFinished} from 'vitest';
import {createProgram} from '../clients/cli/index.mjs';
import {setJsonMode} from '../foundation/response/json.mjs';
import {handleCommanderError} from '../clients/cli/lib/json-shim.mjs';
import {REPO_ROOT} from './repo-root.mjs';

/** Settles when the latest run has given the process back. */
let lastTurn = Promise.resolve();

/**
 * One run's hold on the process.
 * @typedef {object} Run
 * @property {boolean} finished the run's test has ended
 * @property {boolean} released the run was stuck when its test ended. The
 *   harness put the process back and ignores what the run does after that.
 * @property {(() => void) | null} restore puts back what the run changed in
 *   the process, once
 * @property {boolean} [wroteLate] a write of the released run was dropped
 */

/**
 * The run that the calling code belongs to, through each async step of that
 * run, and the calls of released runs that the harness ignored. Copies of this
 * module share them, since a test file can load it natively and through
 * Vitest. Released runs that have not settled are kept too.
 * @type {{context: AsyncLocalStorage<Run>, ignored: {call: string, args: unknown[]}[], alive: Set<Run>, guarded?: boolean}}
 */
const runs = /** @type {any} */ (
  globalThis[Symbol.for('astryx.test-utils.run-cli')] ??= {
    context: new AsyncLocalStorage(),
    ignored: [],
    alive: new Set(),
  }
);

/** The console as this module found it, for the harness's own warnings. */
const warn = console.warn.bind(console);

/** Whether the calling code belongs to a released run. */
function inReleasedRun() {
  return runs.context.getStore()?.released === true;
}

/**
 * Record a call of a released run that the harness ignored, and warn. A
 * released run that wakes means that something hung, so CI logs show it.
 * @param {string} call
 * @param {unknown[]} args
 */
function noteIgnored(call, args) {
  runs.ignored.push({call, args});
  const shown = args.map(arg => JSON.stringify(arg)).join(', ');
  warn(
    `runCli: the harness ignored ${call}(${shown}) of a run released after its test ended.`,
  );
}

/**
 * Whether the calling code belongs to a released run. If so, the caller drops
 * the write. The write is recorded, and the first one of each run warns.
 * @param {string} text
 */
function isReleasedRunWrite(text) {
  const run = runs.context.getStore();
  if (!run?.released) return false;
  runs.ignored.push({call: 'write', args: [text]});
  if (!run.wroteLate) {
    run.wroteLate = true;
    warn(
      'runCli: the harness drops the output of a run released after its test ended.',
    );
  }
  return true;
}

/**
 * Whether the calling code belongs to a released run. If so, the call is
 * recorded, and the caller ignores it.
 * @param {string} call
 * @param {unknown[]} args
 */
function isReleasedRunCall(call, args) {
  if (!inReleasedRun()) return false;
  noteIgnored(call, args);
  return true;
}

if (/** @type {any} */ (globalThis).__vitest_worker__ && !runs.guarded) {
  runs.guarded = true;
  // A released run can wake up after its test. Its exit must not end the test
  // worker, and its chdir must not move a later test.
  const exit = process.exit;
  const chdir = process.chdir;
  // @ts-expect-error - test-only monkeypatch
  process.exit = code => {
    if (!isReleasedRunCall('exit', [code])) exit.call(process, code);
  };
  process.chdir = directory => {
    if (!isReleasedRunCall('chdir', [directory])) {
      chdir.call(process, directory);
    }
  };
}

/**
 * The calls that released runs made, which the harness ignored.
 * @returns {{call: string, args: unknown[]}[]}
 */
export function ignoredCallsOfReleasedRuns() {
  return runs.ignored.slice();
}

/**
 * When the run's test ends, wait for the run, then let the next run start.
 * The wait is the test's own timeout, which is the node project's
 * `testTimeout` unless the test sets one. A run still going then is stuck:
 * the harness puts the process back and releases the run. The test's result
 * is set before this, so a release never turns a failure into a pass. Outside
 * a test (in a hook, or outside Vitest), the caller awaits the run.
 * @param {Run} run
 * @param {Promise<void>} turn settles when the run has given the process back
 * @param {() => void} giveBack lets the next run start
 */
function watchTest(run, turn, giveBack) {
  if (!(/** @type {any} */ (globalThis).__vitest_worker__)) return;
  try {
    onTestFinished(
      async ({task}) => {
        run.finished = true;
        // Node's own timers: a test's fake timers do not reach them.
        const settled = await new Promise(resolve => {
          const timer = setTimeout(() => resolve(false), task.timeout);
          void turn.then(() => {
            clearTimeout(timer);
            resolve(true);
          });
        });
        if (settled) return;
        run.released = true;
        runs.alive.add(run);
        run.restore?.();
        giveBack();
      },
      // The wait above bounds this hook, so the hook has no timeout of its own.
      Number.POSITIVE_INFINITY,
    );
  } catch {
    // Not in a test.
  }
}

/**
 * Return the process to `dir`, or to the repository root once `dir` is gone.
 * @param {string} dir
 */
function restoreCwd(dir) {
  try {
    process.chdir(dir);
  } catch {
    process.chdir(REPO_ROOT);
  }
}

/** Thrown by the trapped process.exit to unwind parseAsync with the exit code. */
class ExitSignal extends Error {
  /** @param {number} code */
  constructor(code) {
    super(`process.exit(${code})`);
    this.name = 'ExitSignal';
    /** @type {number} */
    this.code = code;
  }
}

/**
 * Run the Astryx CLI in-process and capture its observable surface.
 *
 * @param {string[]} args argv after `astryx` (e.g. `['component', '--list']`)
 * @param {string | {cwd?: string, allCommands?: boolean}} [cwdOrOpts] cwd
 *   (positional), or `{cwd}`. The program has only the commands these
 *   arguments need, as a run of the bin builds it. `allCommands` builds it
 *   with every command, which no run of the bin does.
 * @returns {Promise<{status: number, code: number, stdout: string, stderr: string}>}
 */
export async function runCli(args, cwdOrOpts) {
  const cwd =
    typeof cwdOrOpts === 'string' ? cwdOrOpts : cwdOrOpts && cwdOrOpts.cwd;
  const allCommands =
    typeof cwdOrOpts === 'object' && cwdOrOpts?.allCommands === true;
  const previous = lastTurn;
  /** @type {() => void} */
  let giveBack = () => {};
  /** @type {Promise<void>} */
  const ownTurn = new Promise(resolve => {
    giveBack = resolve;
  });
  const turn = previous.then(() => ownTurn);
  lastTurn = turn;
  /** @type {Run} */
  const run = {finished: false, released: false, restore: null};
  watchTest(run, turn, giveBack);
  await previous;
  try {
    return await runs.context.run(run, () =>
      runNow(args, cwd, allCommands, run),
    );
  } finally {
    runs.alive.delete(run);
    giveBack();
  }
}

/** What a run whose test has ended gives back, having touched nothing. */
const NOT_STARTED = {
  status: 1,
  code: 1,
  stdout: '',
  stderr: 'runCli: the test ended before this run could start.\n',
};

/**
 * Run the program once, holding the process until the run settles.
 * @param {string[]} args
 * @param {string | undefined} cwd
 * @param {boolean} allCommands
 * @param {Run} run
 * @returns {Promise<{status: number, code: number, stdout: string, stderr: string}>}
 */
async function runNow(args, cwd, allCommands, run) {
  if (run.finished) return NOT_STARTED;
  const program = await createProgram(allCommands ? undefined : {argv: args});
  // Building the program can outlast the test, whose cleanup may then have
  // removed `cwd`.
  if (run.finished) return NOT_STARTED;
  // Commander's own exits (parse errors, --help, --version, unknown option)
  // throw a CommanderError instead of calling process.exit.
  program.exitOverride();

  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  const err = [];
  const origLog = console.log;
  const origError = console.error;
  const origStdout = process.stdout.write;
  const origStderr = process.stderr.write;
  const origExit = process.exit;
  const origCwd = process.cwd();
  const origArgv = process.argv;

  let status = 0;

  run.restore = () => {
    run.restore = null;
    if (cwd) restoreCwd(origCwd);
    process.argv = origArgv;
    console.log = origLog;
    console.error = origError;
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
    process.exit = origExit;
    process.exitCode = 0;
    setJsonMode(false);
  };

  // Capture at the console.* layer: Vitest replaces console.log/console.error
  // with its own collectors, so the CLI's output never reaches the raw streams —
  // patching process.stdout.write alone captures nothing. `format(...)` + "\n"
  // reproduces console.log's own formatting so parseJson(stdout) sees exactly
  // the envelope the binary would print. Direct stream writes (rare) are also
  // captured for fidelity.
  // A released run's writes go nowhere, so they never reach this run's output.
  console.log = (/** @type {unknown[]} */ ...a) => {
    const text = format(...a) + '\n';
    if (!isReleasedRunWrite(text)) out.push(text);
  };
  console.error = (/** @type {unknown[]} */ ...a) => {
    const text = format(...a) + '\n';
    if (!isReleasedRunWrite(text)) err.push(text);
  };
  // @ts-expect-error - test-only monkeypatch
  process.stdout.write = c => {
    const text = typeof c === 'string' ? c : c.toString();
    if (!isReleasedRunWrite(text)) out.push(text);
    return true;
  };
  // @ts-expect-error - test-only monkeypatch
  process.stderr.write = c => {
    const text = typeof c === 'string' ? c : c.toString();
    if (!isReleasedRunWrite(text)) err.push(text);
    return true;
  };
  // @ts-expect-error - test-only monkeypatch
  process.exit = code => {
    if (isReleasedRunCall('exit', [code])) return;
    throw new ExitSignal(Number(code) || 0);
  };

  // Reset the global CLI/JSON-contract state so runs never bleed into each other.
  setJsonMode(false);
  // An exit code here, while a released run is alive, is that run's late write.
  if (process.exitCode && runs.alive.size > 0) {
    noteIgnored('exitCode', [process.exitCode]);
  }
  process.exitCode = 0;
  process.__xdsJsonHandled = false;

  // The json-shim detects --json partly via process.argv: Commander parse
  // errors and --help fire BEFORE the preAction hook engages setJsonMode, so
  // the shim falls back to an argv scan (exactly as the real bin does). Present
  // the same argv the binary would see so those short-circuit paths behave
  // identically in-process.
  process.argv = ['node', 'astryx', ...args];

  try {
    if (cwd) process.chdir(cwd);
    await program.parseAsync(['node', 'astryx', ...args]);
    // Text-mode error paths set process.exitCode rather than calling exit. A
    // released run that wakes during this run can set it too. The harness
    // cannot tell the writes apart: exitCode is an accessor that the process
    // object does not let anyone replace. So it warns.
    if (status === 0 && process.exitCode) {
      status = Number(process.exitCode) || 0;
      if (runs.alive.size > 0) {
        warn(
          `runCli: this run's exit code ${status} may come from a run released after its test ended.`,
        );
      }
    }
  } catch (e) {
    if (e instanceof ExitSignal) {
      status = e.code;
    } else if (
      e &&
      typeof e === 'object' &&
      typeof (/** @type {any} */ (e).code) === 'string' &&
      /** @type {any} */ (e).code.startsWith('commander.')
    ) {
      // CommanderError from exitOverride() (parse error / --help / --version).
      // Mirror bin/astryx.mjs's error boundary: route it through the JSON shim
      // so --json consumers get a valid envelope (with the mapped ERR_ code)
      // and non-JSON callers get the Astryx `Error: …` line. handleCommanderError
      // calls process.exit, which our trap re-raises as an ExitSignal.
      try {
        handleCommanderError(e);
        status = /** @type {any} */ (e).exitCode ?? 1;
      } catch (e2) {
        if (e2 instanceof ExitSignal) status = e2.code;
        else throw e2;
      }
    } else if (
      e &&
      typeof e === 'object' &&
      typeof (/** @type {any} */ (e).exitCode) === 'number'
    ) {
      // Any other error carrying an exit code — preserve it.
      status = /** @type {any} */ (e).exitCode;
    } else {
      throw e; // genuine unexpected error — surface it
    }
  } finally {
    // A stuck run's test already put these back.
    run.restore?.();
  }

  return {status, code: status, stdout: out.join(''), stderr: err.join('')};
}
