// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Runs a list of CLI invocations in one new process.
 *
 * @input A project folder, the argument lists to run there in order, and the
 *   environment for the process.
 * @output One promise per invocation. Each resolves to that run's `runCli`
 *   result (`{status, code, stdout, stderr}`) when the run ends.
 * @position Test helper. A suite runs a project's reads here when no read for
 *   another project may answer them. The reads share the process, so the CLI
 *   loads its catalog once for all of them.
 */

import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const SELF = fileURLToPath(import.meta.url);

/** The process writes each result to this descriptor, as one JSON line. */
const RESULTS_FD = 3;

/**
 * @typedef {{status: number, code: number, stdout: string, stderr: string}} CliResult
 */

/**
 * Promises for the `count` results that `lines` brings, one JSON line each.
 * A line that does not parse rejects only its own result.
 * @param {import('node:stream').Readable} lines
 * @param {number} count
 * @returns {{results: Promise<CliResult>[], rejectRest: (error: (done: number) => Error) => void}}
 *   `rejectRest` rejects each result no line has settled yet.
 */
export function resultsFromLines(lines, count) {
  /** @type {{resolve: (result: CliResult) => void, reject: (error: Error) => void}[]} */
  const settlers = [];
  const results = Array.from(
    {length: count},
    () =>
      /** @type {Promise<CliResult>} */ (
        new Promise((resolve, reject) => settlers.push({resolve, reject}))
      ),
  );
  // A result that no test awaits yet must not count as an unhandled
  // rejection.
  for (const result of results) result.catch(() => {});
  let done = 0;
  let unread = '';
  lines.setEncoding('utf8').on('data', chunk => {
    unread += chunk;
    for (let end = unread.indexOf('\n'); end >= 0; end = unread.indexOf('\n')) {
      const line = unread.slice(0, end);
      unread = unread.slice(end + 1);
      const settler = settlers[done];
      done += 1;
      try {
        settler?.resolve(JSON.parse(line));
      } catch {
        settler?.reject(
          new Error(`Run ${done} wrote a line that is not JSON: ${line}`),
        );
      }
    }
  });
  return {
    results,
    rejectRest: error => {
      for (const {reject} of settlers.slice(done)) reject(error(done));
    },
  };
}

/**
 * Starts one process that runs `invocations` in `cwd`, in order. A test that
 * awaits a later result also waits for every run before it, even when a
 * filter skips the tests that read those runs.
 * @param {string} cwd
 * @param {string[][]} invocations
 * @param {NodeJS.ProcessEnv} env
 * @returns {{results: Promise<CliResult>[], stop: () => void}}
 */
export function startCliSequence(cwd, invocations, env) {
  const child = spawn(
    process.execPath,
    [SELF, cwd, JSON.stringify(invocations)],
    {env, stdio: ['ignore', 'ignore', 'pipe', 'pipe']},
  );
  let stderr = '';
  child.stderr?.setEncoding('utf8').on('data', chunk => (stderr += chunk));
  const {results, rejectRest} = resultsFromLines(
    /** @type {import('node:stream').Readable} */ (child.stdio[RESULTS_FD]),
    invocations.length,
  );
  child.on('close', code =>
    rejectRest(
      done =>
        new Error(
          `The CLI process ended (${code}) after ${done} of ${invocations.length} runs.\n${stderr}`,
        ),
    ),
  );
  return {results, stop: () => child.kill()};
}

/** Runs the invocations named on the command line, one after another. */
async function main() {
  const cwd = process.argv[2];
  const invocations = JSON.parse(process.argv[3]);
  const {runCli} = await import('./run-cli.mjs');
  for (const args of invocations) {
    const result = await runCli(args, cwd);
    fs.writeSync(RESULTS_FD, `${JSON.stringify(result)}\n`);
  }
  // A handle the CLI leaves open must not keep this process alive.
  process.exit(0);
}

if (process.argv[1] === SELF) await main();
