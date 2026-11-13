// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it, vi} from 'vitest';
import {makeAnswer} from './host-answer.mjs';
import {HOST_EXIT} from './host-exit.mjs';

/** @param {{sendError?: Error | null, throws?: boolean, connected?: boolean}} [options] */
function host({sendError = null, throws = false, connected = true} = {}) {
  const phases = /** @type {string[]} */ ([]);
  const exit = vi.fn();
  const send = vi.fn((_message, done) => {
    if (throws) throw new Error('channel closed');
    done(sendError);
  });
  const answer = makeAnswer({
    send,
    exit,
    connected: () => connected,
    record: phase => phases.push(phase),
  });
  return {answer, exit, send, phases};
}

describe("the render host's answer", () => {
  it('exits 0 only after the channel accepted the answer', () => {
    const h = host();
    h.answer({html: 'x'});
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(0);
    expect(h.phases).toEqual(['sending', 'sent']);
  });

  it('exits with its own code when the send fails, never 0', () => {
    const h = host({sendError: new Error('EPIPE')});
    h.answer({html: 'x'});
    expect(h.exit).toHaveBeenCalledWith(HOST_EXIT.sendFailed);
    expect(h.phases).toEqual(['sending', 'send-failed']);
  });

  it('exits with the send-failed code when the send throws', () => {
    const h = host({throws: true});
    h.answer({html: 'x'});
    expect(h.exit).toHaveBeenCalledWith(HOST_EXIT.sendFailed);
  });

  it('exits with the no-channel code when no channel is left', () => {
    const h = host({connected: false});
    h.answer({html: 'x'});
    expect(h.send).not.toHaveBeenCalled();
    expect(h.exit).toHaveBeenCalledWith(HOST_EXIT.noChannel);
  });

  it('sends one answer only', () => {
    const h = host();
    h.answer({html: 'x'});
    h.answer({hostExit: 1, reason: 'worker-ended'});
    expect(h.send).toHaveBeenCalledTimes(1);
  });
});
