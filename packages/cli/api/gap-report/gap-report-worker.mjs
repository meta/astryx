// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Isolated worker for one project or integration gap-report handler.
 *
 * A handler runs in its own JavaScript isolate so process.exit, process.exitCode,
 * late promise continuations, and stdout cannot affect the CLI process. The
 * parent sends an abort message at the timeout boundary, then terminates this
 * worker after a short grace period.
 */

import {parentPort, workerData} from 'node:worker_threads';
import {importUserModule} from '../../foundation/fs/module-loader.mjs';

if (parentPort == null) {
  throw new Error('Gap report handler worker requires a parent port.');
}
const port = /** @type {NonNullable<typeof parentPort>} */ (parentPort);

const controller = new AbortController();
port.once('message', message => {
  if (message?.type === 'abort') controller.abort();
});

/** @param {unknown} error @returns {string} */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @param {unknown} message */
function send(message) {
  try {
    port.postMessage(message);
  } catch (error) {
    port.postMessage({kind: 'error', message: errorMessage(error)});
  }
}

async function run() {
  try {
    const mod = await importUserModule(workerData.modulePath);
    const handler =
      workerData.handlerSource === 'project'
        ? /** @type {any} */ (mod?.default)?.gapReport
        : mod?.gapReport;
    if (
      handler == null ||
      typeof handler !== 'object' ||
      typeof handler.handle !== 'function'
    ) {
      throw new Error(
        'Gap report handler could not be reloaded in its worker.',
      );
    }

    const exitCodeBefore = process.exitCode;
    send({kind: 'ready'});
    const value = await handler.handle(workerData.report, {
      signal: controller.signal,
    });
    if (process.exitCode !== exitCodeBefore) {
      send({kind: 'exit-code'});
    } else {
      send({kind: 'result', value});
    }
  } catch (error) {
    send({kind: 'error', message: errorMessage(error)});
  } finally {
    port.close();
  }
}

void run();
