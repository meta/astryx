// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Direct coverage for `parseDebugEvent`, the boundary a consumer reads
 * recorded runs back through.
 *
 * The recorder is not the only way a record reaches a reader: a warehouse row,
 * a hand-edited NDJSON line, or a replay from another pipeline all arrive here
 * as `unknown`. So the privacy contract has to hold at the PARSER too, not only
 * at the writer — a v2 record carrying a raw session id is rejected rather than
 * handed back typed, and a v1 record carrying one is still readable, because
 * that is what v1 meant.
 *
 * @position packages/cli/authoring/debug — validator coverage
 */

import {describe, expect, it} from 'vitest';
import {parseDebugEvent} from './parse.mjs';

const RAW_SESSION = 'session-alpha-bravo-charlie';

/**
 * A minimal valid record. Every test starts here and changes one thing, so a
 * failure names the field under test rather than a missing neighbour.
 *
 * @param {{schemaVersion?: number, env?: Record<string, unknown>}} [overrides]
 */
function makeEvent({schemaVersion = 2, env = {}} = {}) {
  return {
    schemaVersion,
    id: '00000000-0000-4000-8000-000000000000',
    startedAt: '2026-09-04T00:00:00.000Z',
    endedAt: '2026-09-04T00:00:01.000Z',
    durationMs: 1000,
    command: 'docs',
    commandPath: ['docs'],
    argv: ['docs'],
    args: {},
    options: {},
    optionSources: {},
    globalOptions: {},
    outcome: 'ok',
    exitCode: 0,
    signal: null,
    error: null,
    output: {
      jsonMode: false,
      envelopeTypes: [],
      handled: false,
      helpDisplayed: false,
      resultCount: null,
      emptyResult: null,
      resultKind: null,
      directMatch: null,
      stdout: '',
      stderr: '',
      stdoutBytes: 0,
      stderrBytes: 0,
      truncated: false,
    },
    env: {
      cliVersion: '9.9.9',
      nodeVersion: '22.0.0',
      platform: 'darwin',
      arch: 'arm64',
      ci: false,
      ciName: null,
      agent: null,
      agentIdentity: null,
      agentSessionId: null,
      agentSessionIdHash: null,
      agentSessionIdSource: null,
      invocationSource: 'unknown',
      oneOff: false,
      packageManager: 'pnpm',
      tty: false,
      locale: 'en-US',
      timezone: 'UTC',
      ...env,
    },
    project: {
      inProject: true,
      hasConfig: true,
      initialized: true,
      integrationCount: 0,
    },
    redacted: true,
  };
}

describe('parseDebugEvent — schema versions', () => {
  it('accepts a v3 record', () => {
    expect(parseDebugEvent(makeEvent({schemaVersion: 3})).schemaVersion).toBe(
      3,
    );
  });

  it('accepts a v2 record', () => {
    expect(parseDebugEvent(makeEvent()).schemaVersion).toBe(2);
  });

  it('accepts a v1 record', () => {
    expect(parseDebugEvent(makeEvent({schemaVersion: 1})).schemaVersion).toBe(
      1,
    );
  });

  it('rejects a version it has never emitted', () => {
    expect(() => parseDebugEvent(makeEvent({schemaVersion: 4}))).toThrow(
      /schemaVersion/,
    );
  });
});

describe('parseDebugEvent — the raw session id, per version', () => {
  it('reads a v1 record that carries the raw id', () => {
    // v1 meant "the raw value is here". Refusing to read those back would make
    // the privacy change look like data loss to anyone holding older records.
    const parsed = parseDebugEvent(
      makeEvent({schemaVersion: 1, env: {agentSessionId: RAW_SESSION}}),
    );
    expect(parsed.env.agentSessionId).toBe(RAW_SESSION);
  });

  it('rejects a v2 record that carries the raw id', () => {
    // A v2 record with a raw id did not come from this CLI. Accepting it would
    // let the identifier back in through the boundary that exists to keep it
    // out, and hand a v2 reader a value its own type says is never there.
    expect(() =>
      parseDebugEvent(makeEvent({env: {agentSessionId: RAW_SESSION}})),
    ).toThrow(/agentSessionId/);
  });

  it('names the field and the remedy when it rejects one', () => {
    expect(() =>
      parseDebugEvent(makeEvent({env: {agentSessionId: RAW_SESSION}})),
    ).toThrow(/agentSessionIdHash/);
  });

  it('accepts a v2 record with the id explicitly null', () => {
    expect(parseDebugEvent(makeEvent()).env.agentSessionId).toBe(null);
  });

  it('accepts a v2 record that omits the field entirely', () => {
    const event = makeEvent();
    delete event.env.agentSessionId;
    expect(parseDebugEvent(event).env.agentSessionId).toBe(null);
  });

  it('still accepts the hash on a v2 record — it is the join key', () => {
    const hash = 'a'.repeat(64);
    const parsed = parseDebugEvent(
      makeEvent({
        env: {
          agentSessionIdHash: hash,
          agentSessionIdSource: 'ASTRYX_AGENT_SESSION_ID',
        },
      }),
    );
    expect(parsed.env.agentSessionIdHash).toBe(hash);
    expect(parsed.env.agentSessionIdSource).toBe('ASTRYX_AGENT_SESSION_ID');
  });
});

describe('parseDebugEvent — the boundary still rejects malformed input', () => {
  it('rejects a non-object', () => {
    expect(() => parseDebugEvent('nope')).toThrow(/debug event is invalid/);
  });

  it('rejects an unknown field, so a typo is not silently kept', () => {
    expect(() => parseDebugEvent({...makeEvent(), surprise: 1})).toThrow(
      /debug event is invalid/,
    );
  });

  it('rejects a negative result count', () => {
    const event = makeEvent();
    event.output.resultCount = -1;
    expect(() => parseDebugEvent(event)).toThrow(/resultCount/);
  });

  it('labels the error with the caller-supplied label', () => {
    expect(() => parseDebugEvent('nope', 'runs.ndjson line 4')).toThrow(
      /runs\.ndjson line 4 is invalid/,
    );
  });
});
