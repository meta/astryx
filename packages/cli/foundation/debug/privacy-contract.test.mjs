// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The privacy contract for a recorded run, enforced.
 *
 * A record may be forwarded anywhere the project's `debug` handler chooses, so
 * these are the promises `DebugEventEnv` makes to the person whose runs are
 * being recorded:
 *
 *   1. no raw agent session id reaches a handler — only its hash;
 *   2. free text the environment supplied is scrubbed like argv;
 *   3. the values this CLI derives survive verbatim, or the record is useless;
 *   4. `redacted` is true only when every pass has actually run.
 *
 * Each of these was false at some point: the raw id was recorded beside its
 * hash, `env` skipped the scrubbing pass entirely, and `redacted: true` was
 * stamped on the event at creation — before anything had been scrubbed.
 *
 * @position packages/cli/foundation/debug — privacy contract coverage
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createHash} from 'node:crypto';
import {
  begin,
  currentEvent,
  finish,
  resetRecorder,
  setEventHandler,
} from './recorder.mjs';
import {captureEnv, SCHEMA_VERSION} from './event.mjs';
import {REDACTED, VERBATIM_ENV_FIELDS} from './redact.mjs';
import {parseDebugEvent} from '../../authoring/debug/parse.mjs';

const RAW_SESSION = 'session-alpha-bravo-charlie';
const RAW_SESSION_HASH = createHash('sha256')
  .update(RAW_SESSION, 'utf8')
  .digest('hex');

/** @param {() => void} [setup] */
function collectEvent(setup = () => {}) {
  /** @type {any[]} */
  const seen = [];
  setEventHandler(event => seen.push(event));
  begin({argv: ['docs'], cliVersion: '9.9.9'});
  setup();
  finish({exitCode: 0});
  expect(seen).toHaveLength(1);
  return seen[0];
}

beforeEach(() => {
  vi.unstubAllEnvs();
  resetRecorder();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetRecorder();
});

describe('no raw stable identifier is recorded', () => {
  it('hands the handler the hash and never the session id itself', () => {
    vi.stubEnv('AGENT', 'astryx-test-agent');
    vi.stubEnv('AGENT_SESSION_ID', RAW_SESSION);
    const event = collectEvent();

    expect(event.env.agentSessionId).toBe(null);
    expect(event.env.agentSessionIdHash).toBe(RAW_SESSION_HASH);
    expect(event.env.agentSessionIdSource).toBe('AGENT_SESSION_ID');
    // Not just the field: nowhere in the record at all.
    expect(JSON.stringify(event)).not.toContain(RAW_SESSION);
  });

  it('reads no Astryx-owned variable, so a session left in one is never recorded', () => {
    // spec:AST-017 FR14: the CLI reads no Astryx-owned environment variable.
    // A value left in a removed one records nothing, raw or hashed.
    vi.stubEnv('AGENT', '');
    vi.stubEnv('AGENT_SESSION_ID', '');
    vi.stubEnv('ASTRYX_AGENT_ID', 'metadata-agent');
    vi.stubEnv('ASTRYX_AGENT_SESSION_ID', RAW_SESSION);
    vi.stubEnv(
      'ASTRYX_AGENT_METADATA',
      JSON.stringify({id: 'metadata-agent', session_id: RAW_SESSION}),
    );
    const event = collectEvent();
    expect(event.env.agentSessionId).toBe(null);
    expect(event.env.agentSessionIdHash).toBe(null);
    expect(event.env.agentSessionIdSource).toBe(null);
    expect(JSON.stringify(event)).not.toContain(RAW_SESSION);
    expect(JSON.stringify(event)).not.toContain('metadata-agent');
  });

  it('still joins runs of one session, which is what the raw value was for', () => {
    vi.stubEnv('AGENT_SESSION_ID', RAW_SESSION);
    const first = collectEvent().env.agentSessionIdHash;
    resetRecorder();
    const second = collectEvent().env.agentSessionIdHash;
    expect(first).toBe(second);
    expect(first).not.toBe(null);
  });

  it('leaves the hash null when no signal supplied a session', () => {
    const env = captureEnv();
    expect(env.agentSessionId).toBe(null);
    expect(env.agentSessionIdHash).toBe(null);
  });
});

describe('environment free text is scrubbed', () => {
  it('scrubs a credential pasted into the agent identity', () => {
    // AGENT is free text: whatever the invoking tool exports lands
    // here, and `env` used to skip the scrubbing pass entirely.
    vi.stubEnv('AGENT', 'ghp_abcdefghijklmnopqrstuvwxyz01');
    const event = collectEvent();
    expect(event.env.agentIdentity).toBe(REDACTED);
    expect(event.env.agent).toBe(REDACTED);
    expect(JSON.stringify(event.env)).not.toContain('ghp_abcdef');
  });

  it('scrubs an email address in the agent identity', () => {
    vi.stubEnv('AGENT', 'someone@example.com');
    const event = collectEvent();
    expect(event.env.agentIdentity).toBe(REDACTED);
  });

  it('rewrites an absolute path in the agent identity', () => {
    vi.stubEnv('AGENT', '/users/someone/tools/my-agent');
    const event = collectEvent();
    expect(event.env.agentIdentity).not.toContain('/users/someone');
    expect(event.env.agentIdentity).toContain('…');
  });

  it('keeps ordinary free text readable', () => {
    // Scrubbing that ate every agent name would make the field worthless.
    vi.stubEnv('AGENT', 'astryx-test-agent');
    expect(collectEvent().env.agentIdentity).toBe('astryx-test-agent');
  });
});

describe('derived environment facts survive verbatim', () => {
  it('keeps the session hash intact despite its sensitive-looking name', () => {
    // `isSensitiveKey` matches the substring "session", so a key-based pass
    // over `env` would blank the hash — and with it the only way to join the
    // runs of one session, which is the whole reason the raw id can go.
    vi.stubEnv('AGENT_SESSION_ID', RAW_SESSION);
    const event = collectEvent();
    expect(event.env.agentSessionIdHash).toBe(RAW_SESSION_HASH);
    expect(event.env.agentSessionIdHash).not.toBe(REDACTED);
    expect(event.env.agentSessionIdSource).toBe('AGENT_SESSION_ID');
  });

  it('keeps the machine and runtime facts exactly as captured', () => {
    const event = collectEvent();
    expect(event.env.nodeVersion).toBe(process.versions.node);
    expect(event.env.platform).toBe(process.platform);
    expect(event.env.arch).toBe(process.arch);
    expect(event.env.cliVersion).toBe('9.9.9');
    // A timezone carries a slash and a locale a dash; neither may be mangled
    // by the path or entropy rules.
    if (event.env.timezone) expect(event.env.timezone).not.toContain('…');
    if (event.env.locale) expect(event.env.locale).not.toBe(REDACTED);
  });

  it('classifies every field of the snapshot, so a new one is scrubbed by default', () => {
    // The mirror of the allowlist. When a field is added to the snapshot this
    // fails, which is the point: someone decides whether it is derived (safe
    // verbatim) or free text (scrubbed) instead of inheriting either by
    // accident.
    const scrubbed = ['agent', 'agentIdentity', 'agentSessionId'];
    expect(Object.keys(captureEnv()).sort()).toEqual(
      [...VERBATIM_ENV_FIELDS, ...scrubbed].sort(),
    );
  });
});

describe('`redacted` says what actually happened', () => {
  it('is false while the event is still in flight', () => {
    begin({argv: ['docs']});
    expect(currentEvent()?.redacted).toBe(false);
  });

  it('is true on the record a handler receives', () => {
    expect(collectEvent().redacted).toBe(true);
  });
});

describe('the schema version marks the change', () => {
  it('delivers v3 records that validate against the published schema', () => {
    const event = collectEvent();
    expect(event.schemaVersion).toBe(3);
    expect(SCHEMA_VERSION).toBe(3);
    expect(() => parseDebugEvent(event)).not.toThrow();
  });
});
