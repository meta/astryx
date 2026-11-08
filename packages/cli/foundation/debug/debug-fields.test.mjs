// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract coverage for DebugEvent result and agent-session fields.
 *
 * @position packages/cli/foundation/debug — recorded-event contract coverage
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createHash} from 'node:crypto';
import {
  begin,
  finish,
  recordCommandResult,
  resetRecorder,
  setEventHandler,
} from './recorder.mjs';
import {NO_RESULT_SET, resultSetOf} from './command-result.mjs';
import {captureEnv} from './event.mjs';
import {parseDebugEvent} from '../../authoring/debug/parse.mjs';

const ATTRIBUTION_ENV_KEYS = [
  'AGENT',
  'AGENT_SESSION_ID',
  'CURSOR_TRACE_ID',
  'CURSOR_AGENT',
  'CLAUDECODE',
  'CLAUDE_CODE',
  'AIDER_MODEL',
  'GITHUB_COPILOT_AGENT',
  'REPLIT_USER',
  'CODESPACES',
  'TERM_PROGRAM',
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'CIRCLECI',
  'BUILDKITE',
  'TRAVIS',
  'JENKINS_URL',
  'TEAMCITY_VERSION',
  'TF_BUILD',
  'BITBUCKET_BUILD_NUMBER',
  'CODEBUILD_BUILD_ID',
  'DRONE',
  'VERCEL',
  'NETLIFY',
];

function clearAttributionEnv() {
  for (const key of ATTRIBUTION_ENV_KEYS) vi.stubEnv(key, '');
}

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

describe('DebugEvent additive fields', () => {
  it('keeps every existing field and adds null result fields', () => {
    const event = collectEvent();
    expect(Object.keys(event).sort()).toEqual(
      [
        'args',
        'argv',
        'command',
        'commandPath',
        'durationMs',
        'endedAt',
        'env',
        'error',
        'exitCode',
        'globalOptions',
        'id',
        'optionSources',
        'options',
        'outcome',
        'output',
        'project',
        'redacted',
        'schemaVersion',
        'signal',
        'startedAt',
      ].sort(),
    );
    expect(Object.keys(event.output).sort()).toEqual(
      [
        'directMatch',
        'emptyResult',
        'envelopeTypes',
        'handled',
        'helpDisplayed',
        'jsonMode',
        'resultCount',
        'resultKind',
        'stderr',
        'stderrBytes',
        'stdout',
        'stdoutBytes',
        'truncated',
      ].sort(),
    );
    expect(Object.keys(event.env).sort()).toEqual(
      [
        'agent',
        'agentIdentity',
        'agentSessionId',
        'agentSessionIdHash',
        'agentSessionIdSource',
        'arch',
        'ci',
        'ciName',
        'cliVersion',
        'invocationSource',
        'locale',
        'nodeVersion',
        'oneOff',
        'packageManager',
        'platform',
        'timezone',
        'tty',
      ].sort(),
    );
    expect(event.output).toMatchObject({
      resultCount: null,
      emptyResult: null,
      resultKind: null,
      directMatch: null,
    });
    expect(() => parseDebugEvent(event)).not.toThrow();
  });

  it('accepts persisted schema-v1 events that predate the fields', () => {
    const legacy = structuredClone(collectEvent());
    // A record written by an older CLI: v1, and carrying the raw session id
    // that v2 retired. Reading history back must keep working.
    legacy.schemaVersion = 1;
    legacy.env.agentSessionId = 'legacy-raw-session';
    for (const key of [
      'resultCount',
      'emptyResult',
      'resultKind',
      'directMatch',
    ]) {
      delete legacy.output[key];
    }
    for (const key of [
      'agentIdentity',
      'agentSessionIdHash',
      'agentSessionIdSource',
      'invocationSource',
    ]) {
      delete legacy.env[key];
    }
    expect(parseDebugEvent(legacy)).toMatchObject({
      schemaVersion: 1,
      output: {
        resultCount: null,
        emptyResult: null,
        resultKind: null,
        directMatch: null,
      },
      env: {
        agentIdentity: null,
        agentSessionId: 'legacy-raw-session',
        agentSessionIdHash: null,
        agentSessionIdSource: null,
        invocationSource: 'unknown',
      },
    });
  });

  it('records count, empty, kind, and direct-match facts', () => {
    const event = collectEvent(() => {
      recordCommandResult(
        resultSetOf([{domain: 'template'}, {domain: 'component'}], {
          count: 9,
          empty: false,
          directMatch: true,
          fallbackKind: 'mixed',
        }),
      );
    });
    expect(event.output).toMatchObject({
      resultCount: 9,
      emptyResult: false,
      resultKind: 'mixed',
      directMatch: true,
    });
  });

  it('records a successful empty result set', () => {
    const event = collectEvent(() =>
      recordCommandResult(
        resultSetOf([], {count: 0, fallbackKind: 'component'}),
      ),
    );
    expect(event.outcome).toBe('ok');
    expect(event.output).toMatchObject({
      resultCount: 0,
      emptyResult: true,
      // Nothing matched, so the kind comes from what was looked FOR. A null
      // here would be indistinguishable from a command that never reported.
      resultKind: 'component',
      directMatch: null,
    });
  });

  it('records a command that declares it has no result set', () => {
    const event = collectEvent(() => recordCommandResult(NO_RESULT_SET));
    expect(event.output).toMatchObject({
      resultKind: 'none',
      resultCount: null,
      emptyResult: null,
      directMatch: null,
    });
  });

  it('derives one kind, mixed, or the fallback from the results themselves', () => {
    const of = (/** @type {any[]} */ items, /** @type {any} */ fallback) =>
      resultSetOf(items, {count: items.length, fallbackKind: fallback})
        .resultKind;
    expect(of([{domain: 'component'}, {domain: 'component'}], 'mixed')).toBe(
      'component',
    );
    expect(of([{domain: 'component'}, {domain: 'doc'}], 'mixed')).toBe('mixed');
    // Nothing to read a kind from — an empty answer, or items that tag
    // themselves with something this scale does not carry.
    expect(of([], 'component')).toBe('component');
    expect(of([{domain: 'sandwich'}], 'mixed')).toBe('mixed');
  });

  it('leaves resultKind null when a run reports nothing at all', () => {
    // The whole point of `none`: a run that reported NOTHING still looks
    // different from one that declared it has nothing, and that difference is
    // what makes a missed command visible instead of invisible.
    const event = collectEvent(() => {});
    expect(event.output.resultKind).toBe(null);
  });
});

describe('environment attribution', () => {
  it('detects an explicit agent and hashes its session id', () => {
    clearAttributionEnv();
    vi.stubEnv('AGENT', 'test-agent');
    vi.stubEnv('AGENT_SESSION_ID', 'agent-session-123');
    const env = captureEnv();
    expect(env).toMatchObject({
      agent: 'test-agent',
      agentIdentity: 'test-agent',
      agentSessionId: null,
      agentSessionIdSource: 'AGENT_SESSION_ID',
      invocationSource: 'ai',
    });
    expect(env.agentSessionIdHash).toBe(
      createHash('sha256').update('agent-session-123', 'utf8').digest('hex'),
    );
  });

  it('uses the generic AGENT identity', () => {
    clearAttributionEnv();
    vi.stubEnv('AGENT', 'generic-agent');
    expect(captureEnv()).toMatchObject({
      agent: 'generic-agent',
      agentIdentity: 'generic-agent',
      invocationSource: 'ai',
    });
  });

  it('reads no Astryx-owned or metadata variable for attribution', () => {
    clearAttributionEnv();
    // The removed variables, set: none of them attributes the run.
    vi.stubEnv('ASTRYX_AGENT_ID', 'old-agent');
    vi.stubEnv('ASTRYX_AGENT_SESSION_ID', 'old-session');
    vi.stubEnv(
      'ASTRYX_AGENT_METADATA',
      'id=old-agent,session_id=old-session,invocation_id=old-invocation',
    );
    vi.stubEnv('AGENT_METADATA', JSON.stringify({id: 'meta-agent'}));
    expect(captureEnv()).toMatchObject({
      agentIdentity: null,
      agentSessionIdHash: null,
      agentSessionIdSource: null,
    });
  });

  it('leaves agent fields null without a signal', () => {
    clearAttributionEnv();
    vi.stubEnv('CI', '1');
    expect(captureEnv()).toMatchObject({
      agent: null,
      agentIdentity: null,
      agentSessionId: null,
      agentSessionIdHash: null,
      agentSessionIdSource: null,
      invocationSource: 'automation',
    });
  });

  it('keeps vscode in the legacy field without calling it AI', () => {
    clearAttributionEnv();
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('CI', '1');
    expect(captureEnv()).toMatchObject({
      agent: 'vscode',
      agentIdentity: null,
      invocationSource: 'automation',
    });
  });
});
