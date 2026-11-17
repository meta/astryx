// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The one `Logger`. Source of truth: the `Logger` type is generated from
 * the JSDoc here, and `logger` is the single instance every side-effecting
 * command (`upgrade`, `init`, `themeBuild`, the experimental icon commands)
 * writes progress through.
 *
 * It is silent by default, so a programmatic caller (or `--json` mode) sees
 * nothing but the returned `{type, data}`. The CLI calls `logger.setSilent(false)`
 * in human mode to route lines to the terminal: `log` → stdout (via `humanLog`),
 * `warn`/`error` → stderr. `humanLog` is itself a no-op in `--json` mode, so
 * machine output can never be corrupted. Any presentation (glyphs, framing) is
 * baked into the message by the caller — the logger is a dumb sink.
 *
 * @typedef {object} Logger
 * @property {(message?: string) => void} log   Progress / result line (stdout).
 * @property {(message?: string) => void} warn  Non-fatal warning line (stderr).
 * @property {(message?: string) => void} error Failure line (stderr).
 * @property {boolean} silent Whether output is currently suppressed.
 * @property {(silent: boolean) => void} setSilent Enable/disable output.
 */

import {humanLog} from '../foundation/response/json.mjs';

/**
 * The single logger instance. Silent until the CLI enables output.
 * @type {Logger}
 */
export const logger = {
  silent: true,
  setSilent(silent) {
    this.silent = silent;
  },
  log(message) {
    if (!this.silent) humanLog(message ?? '');
  },
  warn(message) {
    if (!this.silent) console.error(message ?? '');
  },
  error(message) {
    if (!this.silent) console.error(message ?? '');
  },
};
