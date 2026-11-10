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
 * @input argv[2]: JSON {entry, root, served, withoutSegmenter, timeoutMs}
 * @output one IPC message: the worker's answer, or {hostError: message}, or
 *   {hostExit: code}
 * @position foundation/render — started by render-page.mjs
 */

import {Worker} from 'node:worker_threads';

/** @type {{entry: string, root: string, served: {dir: string, integrations: string[]} | null, withoutSegmenter: boolean, timeoutMs: number}} */
const input = JSON.parse(process.argv[2] ?? '{}');

/** @param {unknown} message */
function answer(message) {
  if (!process.connected) process.exit(0);
  process.send?.(message, () => process.exit(0));
}

process.once('disconnect', () => process.exit(0));
// A margin past the CLI's own limit, so the CLI reports the timeout first.
setTimeout(() => process.exit(0), input.timeoutMs + 5000);

const worker = new Worker(new URL('./page-worker.mjs', import.meta.url), {
  workerData: input,
  execArgv: [],
  stdout: true,
  stderr: true,
  resourceLimits: {maxOldGenerationSizeMb: 4096},
});
// The page's own writes to stdout/stderr never reach the CLI's output.
worker.stdout.resume();
worker.stderr.resume();
worker.once('message', answer);
worker.once('error', (/** @type {any} */ error) => answer({hostError: String(error?.message ?? error)}));
worker.once('exit', code => answer({hostExit: code}));
