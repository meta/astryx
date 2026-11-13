// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Host process for `astryx experimental render`: runs page-worker.mjs
 * in a worker thread and sends its one answer to the CLI.
 *
 * A crash of Node itself ends only this process, never the CLI. The page runs
 * in a thread, so this process can still act while the page loops: it exits
 * when the CLI goes away (the IPC channel closes) or when its own time limit
 * passes, so a page that never finishes never outlives the CLI.
 *
 * When the page ends without an answer, the host says why: the last stage the
 * page reported, how long it ran, the memory left, and the last lines the page
 * wrote to stderr. Each way the host itself ends without an answer has its own
 * exit code (HOST_EXIT), so none of them reads as a clean exit.
 *
 * @input argv[2]: JSON {entry, root, served, withoutSegmenter, timeoutMs}
 * @output one IPC message: the worker's answer, or {hostError, stage}, or
 *   {hostExit, reason, stage, elapsedMs, rssMb, freeMb, stderrTail}
 * @position foundation/render — started by render-page.mjs
 */

import * as os from 'node:os';
import {Worker} from 'node:worker_threads';
import {HOST_EXIT} from './host-exit.mjs';

/** @type {{entry: string, root: string, served: {dir: string, integrations: string[]} | null, withoutSegmenter: boolean, timeoutMs: number}} */
const input = JSON.parse(process.argv[2] ?? '{}');
const started = Date.now();
let stage = 'starting';
let stderrTail = '';
let answered = false;

/** @param {unknown} message */
function answer(message) {
  if (answered) return;
  answered = true;
  if (!process.connected) process.exit(HOST_EXIT.noChannel);
  process.send?.(message, () => process.exit(0));
}

/** What the page was doing and what it had left, for an end without an answer. */
function state() {
  return {
    stage,
    elapsedMs: Date.now() - started,
    rssMb: Math.round(process.memoryUsage().rss / 2 ** 20),
    freeMb: Math.round(os.freemem() / 2 ** 20),
    stderrTail: stderrTail.trim().split('\n').slice(-5).join('\n'),
  };
}

process.once('disconnect', () => process.exit(HOST_EXIT.disconnected));
// A margin past the CLI's own limit, so the CLI reports the timeout first.
setTimeout(() => {
  answer({hostExit: null, reason: 'host-timeout', ...state()});
  setTimeout(() => process.exit(HOST_EXIT.timeout), 1000).unref();
}, input.timeoutMs + 5000);

const worker = new Worker(new URL('./page-worker.mjs', import.meta.url), {
  workerData: input,
  execArgv: [],
  stdout: true,
  stderr: true,
  resourceLimits: {maxOldGenerationSizeMb: 4096},
});
// The page's own writes to stdout/stderr never reach the CLI's output; the
// last stderr lines go into the reason for an end without an answer.
worker.stdout.resume();
worker.stderr.setEncoding('utf8');
worker.stderr.on('data', (/** @type {string} */ chunk) => {
  stderrTail = (stderrTail + chunk).slice(-4000);
});
worker.on('message', (/** @type {any} */ message) => {
  // A progress note, not the answer.
  if (
    message &&
    typeof message.stage === 'string' &&
    Object.keys(message).length === 1
  ) {
    stage = message.stage;
    return;
  }
  answer(message);
});
worker.once('error', (/** @type {any} */ error) =>
  answer({hostError: String(error?.message ?? error), stage}),
);
worker.once('exit', code =>
  answer({hostExit: code, reason: 'worker-ended', ...state()}),
);
