// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The render host's one answer to the CLI. The host exits 0 only after
 * the channel accepted the answer; a send that fails exits with its own code
 * (HOST_EXIT.sendFailed), so a lost answer never reads as a clean exit. Each
 * phase is recorded, so the CLI can tell "sent but not received" from "ended
 * before it answered".
 * @input send, exit, connected and record functions (process ones in the host)
 * @output an answer(message) function that sends at most once
 * @position foundation/render — used by page-host.mjs
 */

import {HOST_EXIT} from './host-exit.mjs';

/**
 * @param {{
 *   send: (message: unknown, done: (error: Error | null) => void) => unknown,
 *   exit: (code: number) => void,
 *   connected: () => boolean,
 *   record?: (phase: 'no-channel' | 'sending' | 'sent' | 'send-failed') => void,
 * }} io
 * @returns {(message: unknown) => void}
 */
export function makeAnswer({send, exit, connected, record = () => {}}) {
  let answered = false;
  return message => {
    if (answered) return;
    answered = true;
    if (!connected()) {
      record('no-channel');
      exit(HOST_EXIT.noChannel);
      return;
    }
    record('sending');
    try {
      send(message, error => {
        record(error ? 'send-failed' : 'sent');
        exit(error ? HOST_EXIT.sendFailed : 0);
      });
    } catch {
      record('send-failed');
      exit(HOST_EXIT.sendFailed);
    }
  };
}
