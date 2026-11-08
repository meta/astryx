// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for term-log.mjs — the CLI's output-only `log` surface
 * for codemods. These lock the documented invariant that keeps the "--json is
 * always valid JSON" contract intact: in --json mode, EVERY `log` helper
 * (message/info/step/success/warn/error) emits ZERO stdout, so a stray codemod
 * log can never corrupt a JSON envelope. A sanity check confirms the helpers DO
 * emit in human mode, so the json-mode silence is meaningful (not a dead spy).
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as p from './term-log.mjs';
import {setJsonMode} from '../../foundation/response/json.mjs';

let logSpy;
let errSpy;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  setJsonMode(false); // never leak json mode into other test files
  logSpy.mockRestore();
  errSpy.mockRestore();
});

/** Exercise every human-facing emitter the `log` surface exposes. */
function callAllLogHelpers() {
  p.log.message('m');
  p.log.info('i');
  p.log.step('s');
  p.log.success('ok');
  p.log.warn('w');
  p.log.error('e');
}

describe('term-log --json silence', () => {
  it('emits ZERO stdout from every log helper in --json mode', () => {
    setJsonMode(true);
    callAllLogHelpers();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });
});

describe('sanity: helpers are live in human mode', () => {
  it('log.success emits to stdout when not in --json mode', () => {
    setJsonMode(false);
    p.log.success('done');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[ok] done');
  });

  it('every log helper emits exactly one stdout line in human mode', () => {
    setJsonMode(false);
    callAllLogHelpers(); // 6 emitters -> 6 console.log calls
    expect(logSpy).toHaveBeenCalledTimes(6);
  });
});

describe('ASCII output', () => {
  it('prints ASCII level prefixes and transliterates glyphs in messages', () => {
    setJsonMode(false);
    p.log.success('src/a.tsx');
    p.log.warn('stale \u2014 refresh');
    p.log.error('    \u2717 src/b.tsx \u2014 rename \u2192 failed');
    p.log.info('  \u2022 name \u2014 title\u2026');
    const lines = logSpy.mock.calls.map(call => call.join(' '));
    expect(lines).toEqual([
      '[ok] src/a.tsx',
      '! stale - refresh',
      '!!     !! src/b.tsx - rename -> failed',
      '  - name - title...',
    ]);
    for (const line of lines) expect(line).not.toMatch(/[\u0080-\uFFFF]/);
  });
});
