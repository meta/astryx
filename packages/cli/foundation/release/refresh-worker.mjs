// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The background update check, as its own detached process.
 *
 * Started by `maybeStartCheck` (global-state.mjs) with one argument, the
 * per-user configuration folder. It writes nothing to any stream and never
 * reaches a person: it is not a command and takes no options. Its whole job
 * is `runCheck`, which asks the registry for the newest release and installs
 * nothing.
 *
 * @input  argv[2]: the per-user configuration folder
 * @output the updated state on disk
 * @position foundation/release — one of the two detached processes the CLI
 *   starts; the other is agent-text-worker.mjs.
 */

import {runCheck} from './global-state.mjs';

const stateDir = process.argv[2];
if (stateDir) {
  try {
    runCheck({stateDir});
  } catch {
    // A failed check changes nothing.
  }
}
