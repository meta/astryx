// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for the central CLI error helper (`cli-error.mjs`).
 *
 * What we lock in here:
 *   - cliError prints "Error: <msg>" to stderr in human mode and never
 *     touches stdout (preserves stdout discipline).
 *   - cliError emits the JSON envelope shape from json.mjs in JSON mode.
 *   - assertOrExit short-circuits on falsy conditions and returns silently
 *     on truthy ones (no side effects).
 *   - The exit code is 1 in both modes, matching the policy.
 *
 * E2E exit codes for actual subcommand invocations are tested in
 * cli-exit-codes.test.mjs.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {cliError, assertOrExit, cliExit} from './cli-error.mjs';
import {setJsonMode, API_VERSION} from '../../../foundation/response/json.mjs';

describe('cliError — human mode', () => {
  let stderr;
  let stdout;
  let exitCode;
  let exitSpy;

  beforeEach(() => {
    setJsonMode(false);
    stderr = [];
    stdout = [];
    exitCode = null;
    vi.spyOn(console, 'error').mockImplementation((...a) => stderr.push(a.join(' ')));
    vi.spyOn(console, 'log').mockImplementation((...a) => stdout.push(a.join(' ')));
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code ?? 0;
      throw new Error(`__exit_${exitCode}__`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints "Error: <msg>" to stderr and exits 1', () => {
    expect(() => cliError('something broke')).toThrow('__exit_1__');
    expect(stderr).toContain('Error: something broke');
    expect(stdout).toEqual([]);
    expect(exitCode).toBe(1);
  });

  it('prints suggestions on subsequent stderr lines', () => {
    expect(() =>
      cliError('No component named "Buton"', {
        suggestions: [
          {name: 'Button', reason: 'closest match'},
          {name: 'ButtonGroup', reason: 'related'},
        ],
      }),
    ).toThrow('__exit_1__');
    expect(stderr[0]).toBe('Error: No component named "Buton"');
    expect(stderr).toContain('  Button  (closest match)');
    expect(stderr).toContain('  ButtonGroup  (related)');
  });

  it('omits "(reason)" when suggestion has no reason field', () => {
    expect(() =>
      cliError('Unknown topic', {suggestions: [{name: 'color'}, {name: 'spacing'}]}),
    ).toThrow('__exit_1__');
    expect(stderr).toContain('  color');
    expect(stderr).toContain('  spacing');
  });

  it('respects custom exitCode', () => {
    expect(() => cliError('msg', {exitCode: 2})).toThrow('__exit_2__');
    expect(exitCode).toBe(2);
  });

  it('uses process.exitCode when hard:false', () => {
    const original = process.exitCode;
    try {
      // Should NOT throw — sets process.exitCode and returns.
      cliError('soft', {hard: false});
      expect(process.exitCode).toBe(1);
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      process.exitCode = original;
    }
  });
});

describe('cliError — JSON mode', () => {
  let stderr;
  let stdout;
  let exitCode;

  beforeEach(() => {
    setJsonMode(true);
    stderr = [];
    stdout = [];
    exitCode = null;
    vi.spyOn(console, 'error').mockImplementation((...a) => stderr.push(a.join(' ')));
    vi.spyOn(console, 'log').mockImplementation((...a) => stdout.push(a.join(' ')));
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code ?? 0;
      throw new Error(`__exit_${exitCode}__`);
    });
  });

  afterEach(() => {
    setJsonMode(false);
    vi.restoreAllMocks();
  });

  it('emits a JSON envelope on stdout, nothing on stderr, and exits 1', () => {
    expect(() => cliError('json mode error')).toThrow('__exit_1__');
    expect(stderr).toEqual([]);
    expect(stdout.length).toBe(1);
    const env = JSON.parse(stdout[0]);
    expect(env.apiVersion).toBe(API_VERSION);
    expect(env.error).toBe('json mode error');
    expect(env.suggestions).toBeUndefined();
    expect(exitCode).toBe(1);
  });

  it('serializes suggestions in the envelope', () => {
    expect(() =>
      cliError('No component named "Buton"', {
        suggestions: [{name: 'Button', reason: 'closest match'}],
      }),
    ).toThrow('__exit_1__');
    const env = JSON.parse(stdout[0]);
    expect(env.suggestions).toEqual([{name: 'Button', reason: 'closest match'}]);
  });

  it('replaces an unregistered code with ERR_UNKNOWN', () => {
    expect(() =>
      cliError('EACCES: permission denied', {code: 'EACCES'}),
    ).toThrow('__exit_1__');
    expect(JSON.parse(stdout[0]).code).toBe('ERR_UNKNOWN');
  });

  it('always exits 1 in JSON mode (custom exitCode is ignored — contract)', () => {
    expect(() => cliError('msg', {exitCode: 2})).toThrow('__exit_1__');
    expect(exitCode).toBe(1);
  });
});

describe('assertOrExit', () => {
  let exitCalled;

  beforeEach(() => {
    setJsonMode(false);
    exitCalled = false;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      exitCalled = true;
      throw new Error('__exit__');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a no-op for truthy conditions', () => {
    expect(() => assertOrExit(true, 'should not fire')).not.toThrow();
    expect(() => assertOrExit('non-empty', 'should not fire')).not.toThrow();
    expect(() => assertOrExit(1, 'should not fire')).not.toThrow();
    expect(exitCalled).toBe(false);
  });

  it('triggers cliError for falsy conditions', () => {
    expect(() => assertOrExit(false, 'must be true')).toThrow('__exit__');
    expect(exitCalled).toBe(true);
  });

  it('triggers cliError for null/undefined', () => {
    expect(() => assertOrExit(null, 'nope')).toThrow('__exit__');
    expect(exitCalled).toBe(true);
  });
});

describe('cliExit', () => {
  it('calls process.exit with given code', () => {
    let called = null;
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      called = code;
      throw new Error('__exit__');
    });
    expect(() => cliExit(0)).toThrow('__exit__');
    expect(called).toBe(0);
    vi.restoreAllMocks();
  });

  it('defaults to exit code 0', () => {
    let called = null;
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      called = code;
      throw new Error('__exit__');
    });
    expect(() => cliExit()).toThrow('__exit__');
    expect(called).toBe(0);
    vi.restoreAllMocks();
  });
});
