// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit + subprocess tests for the "JSON is always JSON" contract.
 *
 * Guarantees under test:
 *   1. Every JSON envelope carries apiVersion (success and error).
 *   2. humanLog/humanWarn are suppressed in JSON mode (stdout discipline).
 *   3. jsonOut supports optional meta as a sibling of data.
 *   4. An uncaught throw in --json mode becomes a JSON error envelope
 *      (the bin error boundary), never a raw stack trace.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  API_VERSION,
  jsonOut,
  jsonError,
  toErrorEnvelope,
  setJsonMode,
  isJsonMode,
  humanLog,
  humanWarn,
} from './json.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(
  __dirname,
  '..',
  '..',
  'clients',
  'cli',
  'bin',
  'astryx.mjs',
);

/** @param {string[]} args @param {{cwd?: string}} [options] */
function runCli(args, {cwd = process.cwd()} = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 20_000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, FORCE_COLOR: '0', CI: ''},
  });
}

describe('json envelope shape', () => {
  let logs;
  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...a) =>
      logs.push(a.join(' ')),
    );
    setJsonMode(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setJsonMode(false);
  });

  it('jsonOut stamps apiVersion + type + data', () => {
    jsonOut({type: 'docs.list', data: [{name: 'Button'}]});
    const env = JSON.parse(logs[0]);
    expect(env.apiVersion).toBe(API_VERSION);
    expect(env.type).toBe('docs.list');
    expect(env.data).toEqual([{name: 'Button'}]);
    // The only meta every result carries names who answered (AST-081 FR5).
    expect(Object.keys(env.meta)).toEqual(['answeredBy']);
    const {cli, core, copy} = env.meta.answeredBy;
    expect(typeof cli).toBe('string');
    expect(core === null || typeof core === 'string').toBe(true);
    expect(['project', 'matched', 'carried']).toContain(copy);
  });

  it('jsonOut attaches optional meta as a sibling of data', () => {
    jsonOut({type: 'discover.list', data: [], meta: {configured: false}});
    const env = JSON.parse(logs[0]);
    expect(env.meta).toEqual({configured: false, answeredBy: expect.any(Object)});
    expect(env.data).toEqual([]);
  });

  it('toErrorEnvelope produces { apiVersion, error, code } from string or Error', () => {
    expect(toErrorEnvelope('boom')).toEqual({
      apiVersion: API_VERSION,
      error: 'boom',
      code: 'ERR_UNKNOWN',
    });
    expect(toErrorEnvelope(new Error('kaboom'))).toEqual({
      apiVersion: API_VERSION,
      error: 'kaboom',
      code: 'ERR_UNKNOWN',
    });
  });

  it('toErrorEnvelope honors an explicit code argument', () => {
    expect(toErrorEnvelope('boom', undefined, 'ERR_UNKNOWN_COMPONENT')).toEqual(
      {
        apiVersion: API_VERSION,
        error: 'boom',
        code: 'ERR_UNKNOWN_COMPONENT',
      },
    );
  });

  it('toErrorEnvelope reads a code carried on a thrown Error', () => {
    const err = Object.assign(new Error('kaboom'), {code: 'ERR_NO_DOC'});
    expect(toErrorEnvelope(err)).toEqual({
      apiVersion: API_VERSION,
      error: 'kaboom',
      code: 'ERR_NO_DOC',
    });
  });

  it('toErrorEnvelope never emits an unregistered code', () => {
    // A Node system error carries `code: 'EACCES'`; that is not an Astryx code.
    const sysErr = Object.assign(new Error('EACCES: permission denied'), {
      code: 'EACCES',
    });
    expect(toErrorEnvelope(sysErr).code).toBe('ERR_UNKNOWN');
    expect(toErrorEnvelope('boom', undefined, 'ENOENT').code).toBe('ERR_UNKNOWN');
    const docErr = Object.assign(new Error('no doc'), {code: 'ERR_NO_DOC'});
    expect(toErrorEnvelope(docErr, undefined, 'ENOENT').code).toBe('ERR_NO_DOC');
  });

  it('toErrorEnvelope includes suggestions when present', () => {
    const env = toErrorEnvelope('x', [{name: 'Button', reason: 'close match'}]);
    expect(env.suggestions).toEqual([{name: 'Button', reason: 'close match'}]);
  });

  it('toErrorEnvelope omits suggestions for an empty array', () => {
    expect('suggestions' in toErrorEnvelope('x', [])).toBe(false);
  });

  it('toErrorEnvelope drops non-array suggestions (only a real Suggestion[] is attached)', () => {
    // The guard is `Array.isArray(...) && .length`, not a bare `?.length` — a
    // string ("hello".length === 5) or a `{length: n}` object must NOT slip
    // through as `suggestions`, which is contractually a Suggestion[].
    expect(
      'suggestions' in toErrorEnvelope('x', /** @type {any} */ ('hello')),
    ).toBe(false);
    expect(
      'suggestions' in toErrorEnvelope('x', /** @type {any} */ ({length: 3})),
    ).toBe(false);
  });
});

describe('stdout discipline (humanLog / humanWarn)', () => {
  let logs, errs;
  beforeEach(() => {
    logs = [];
    errs = [];
    vi.spyOn(console, 'log').mockImplementation((...a) =>
      logs.push(a.join(' ')),
    );
    vi.spyOn(console, 'error').mockImplementation((...a) =>
      errs.push(a.join(' ')),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setJsonMode(false);
  });

  it('humanLog prints when NOT in json mode', () => {
    setJsonMode(false);
    expect(isJsonMode()).toBe(false);
    humanLog('hello');
    expect(logs).toEqual(['hello']);
  });

  it('humanLog is a no-op in json mode', () => {
    setJsonMode(true);
    expect(isJsonMode()).toBe(true);
    humanLog('should not appear');
    expect(logs).toEqual([]);
  });

  it('humanWarn is a no-op in json mode', () => {
    setJsonMode(true);
    humanWarn('warning');
    expect(errs).toEqual([]);
  });
});

describe('contract: every --json emission is valid JSON with apiVersion', () => {
  it('astryx --version --json', () => {
    const r = runCli(['--version', '--json']);
    const env = JSON.parse(r.stdout);
    expect(env.apiVersion).toBe(API_VERSION);
    expect(env.type).toBe('version');
  });

  it('astryx --json (bare) help envelope', () => {
    const r = runCli(['--json']);
    const env = JSON.parse(r.stdout);
    expect(env.apiVersion).toBe(API_VERSION);
    expect(env.type).toBe('help');
  });

  it('unsupported command error envelope carries apiVersion', () => {
    // `theme` is a command group with no output of its own, so it stays off
    // the --json allowlist. (`init` used to be the example here until it grew
    // a receipt of its own.)
    const r = runCli(['theme', '--json']);
    const env = JSON.parse(r.stdout);
    expect(env.apiVersion).toBe(API_VERSION);
    expect(env.error).toMatch(/theme/);
  });

  it('init emits its install receipt', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-json-contract-'));
    try {
      const r = runCli(['init', '--json'], {cwd});
      const env = JSON.parse(r.stdout);
      expect(env.apiVersion).toBe(API_VERSION);
      expect(env.type).toBe('init.run');
    } finally {
      fs.rmSync(cwd, {recursive: true, force: true});
    }
  });

  it('supported command (discover) emits clean JSON, no human chatter leak', () => {
    const r = runCli(['discover', '--json']);
    // Whole stdout must parse — nothing printed before/after the envelope.
    const env = JSON.parse(r.stdout);
    expect(env.apiVersion).toBe(API_VERSION);
    expect(env.type).toBe('discover.list');
  });
});
