// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Temp folders and files a command makes, removed when a stop (Ctrl-C,
 * SIGTERM, or the terminal closing) ends the process: an `exit` listener
 * does not run on a death by signal, and a `finally` does not run either.
 * @input paths tracked while their work runs
 * @output each tracked path removed before the stop ends the process
 * @position foundation/fs — used by the render host and the editor's render
 *   folder, the places that make temp folders while a command can be stopped
 */

import * as fs from 'node:fs';

/** The signals that stop a command, the terminal closing among them. */
export const STOP_SIGNALS = /** @type {const} */ ([
  'SIGINT',
  'SIGTERM',
  'SIGHUP',
]);

/** The paths to remove on a stop. @type {Set<string>} */
const tracked = new Set();

/** @param {string} p */
const remove = p => {
  try {
    fs.rmSync(p, {recursive: true, force: true});
  } catch {
    // Gone already, or held open: the stop goes on.
  }
};

/**
 * Remove every tracked path, then step aside: the signal goes on to the
 * listeners after this one, and with none it ends the process as it would
 * have without this listener. Runs before every other listener, so a
 * listener that ends the process at once still finds the paths removed.
 * @param {NodeJS.Signals} sig
 */
function onStop(sig) {
  for (const p of tracked) remove(p);
  tracked.clear();
  unlisten();
  if (process.listenerCount(sig) === 0) process.kill(process.pid, sig);
}

function unlisten() {
  for (const sig of STOP_SIGNALS) process.removeListener(sig, onStop);
}

/**
 * Remove `p` if a stop ends the process while the work runs. The returned
 * function stops tracking it (the work removes it itself when it ends).
 * @param {string} p
 * @returns {() => void}
 */
export function removeOnStop(p) {
  if (!tracked.size)
    for (const sig of STOP_SIGNALS) process.prependListener(sig, onStop);
  tracked.add(p);
  return () => {
    tracked.delete(p);
    if (!tracked.size) unlisten();
  };
}
