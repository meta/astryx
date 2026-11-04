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
 */

import {format} from 'node:util';
import {createProgram} from '../clients/cli/index.mjs';
import {setJsonMode} from '../foundation/response/json.mjs';
import {handleCommanderError} from '../clients/cli/lib/json-shim.mjs';

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
 * @param {string | {cwd?: string}} [cwdOrOpts] cwd (positional) or `{cwd}`
 * @returns {Promise<{status: number, code: number, stdout: string, stderr: string}>}
 */
export async function runCli(args, cwdOrOpts) {
  const cwd =
    typeof cwdOrOpts === 'string' ? cwdOrOpts : cwdOrOpts && cwdOrOpts.cwd;
  const program = await createProgram();
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

  // Capture at the console.* layer: Vitest replaces console.log/console.error
  // with its own collectors, so the CLI's output never reaches the raw streams —
  // patching process.stdout.write alone captures nothing. `format(...)` + "\n"
  // reproduces console.log's own formatting so parseJson(stdout) sees exactly
  // the envelope the binary would print. Direct stream writes (rare) are also
  // captured for fidelity.
  console.log = (/** @type {unknown[]} */ ...a) => {
    out.push(format(...a) + '\n');
  };
  console.error = (/** @type {unknown[]} */ ...a) => {
    err.push(format(...a) + '\n');
  };
  // @ts-expect-error - test-only monkeypatch
  process.stdout.write = c => {
    out.push(typeof c === 'string' ? c : c.toString());
    return true;
  };
  // @ts-expect-error - test-only monkeypatch
  process.stderr.write = c => {
    err.push(typeof c === 'string' ? c : c.toString());
    return true;
  };
  // @ts-expect-error - test-only monkeypatch
  process.exit = code => {
    throw new ExitSignal(Number(code) || 0);
  };

  // Reset the global CLI/JSON-contract state so runs never bleed into each other.
  setJsonMode(false);
  process.exitCode = 0;
  process.__xdsJsonHandled = false;

  // The json-shim detects --json partly via process.argv: Commander parse
  // errors and --help fire BEFORE the preAction hook engages setJsonMode, so
  // the shim falls back to an argv scan (exactly as the real bin does). Present
  // the same argv the binary would see so those short-circuit paths behave
  // identically in-process.
  process.argv = ['node', 'astryx', ...args];

  if (cwd) process.chdir(cwd);
  try {
    await program.parseAsync(['node', 'astryx', ...args]);
    // Text-mode error paths set process.exitCode rather than calling exit.
    if (status === 0 && process.exitCode) status = Number(process.exitCode) || 0;
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
    if (cwd) process.chdir(origCwd);
    process.argv = origArgv;
    console.log = origLog;
    console.error = origError;
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
    process.exit = origExit;
    process.exitCode = 0;
    setJsonMode(false);
  }

  return {status, code: status, stdout: out.join(''), stderr: err.join('')};
}
