// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {checkRegexSafety, safeRegExp} from './regex-safety.mjs';

describe('checkRegexSafety', () => {
  describe('rejects dangerous patterns', () => {
    const dangerous = [
      ['(a+)+$', 'nested quantifier — classic ReDoS'],
      ['(a*)*', 'nested star quantifiers'],
      ['([\\w.]+)+\\.pyc$', 'quantified char class in quantified group'],
      ['(a|aa)+$', 'overlapping alternation arms in quantified group'],
      ['(a+|b)+$', 'quantifier inside alternation arm in quantified group'],
      ['(\\w+\\s?)+$', 'quantifier inside quantified group'],
      ['((a+))+$', 'deeply nested quantified groups'],
      ['(\\d|\\d\\d)+', 'overlapping digit alternation in quantified group'],
    ];

    for (const [pattern, label] of dangerous) {
      it(`rejects: ${pattern} — ${label}`, () => {
        const result = checkRegexSafety(pattern);
        expect(result.safe).toBe(false);
        expect(result.reason).toBeTruthy();
      });
    }
  });

  describe('accepts safe patterns', () => {
    const safe = [
      ['\\.pyc$', 'simple extension match'],
      ['^build(/.*)?$', 'optional (non-repeating) group'],
      ['[a-z0-9]+\\.log$', 'character class with quantifier'],
      ['.*\\.tmp$', 'dot-star with extension'],
      ['(dist|build)/', 'non-overlapping alternation, unquantified group'],
      ['^\\.(hg|git)/', 'anchored non-overlapping alternation'],
      ['\\.(pyc|pyo|class)$', 'non-overlapping extension alternation'],
      ['^vendor/', 'simple anchored prefix'],
      ['node_modules', 'simple literal'],
    ];

    for (const [pattern, label] of safe) {
      it(`accepts: ${pattern} — ${label}`, () => {
        const result = checkRegexSafety(pattern);
        expect(result.safe).toBe(true);
      });
    }
  });
});

describe('safeRegExp', () => {
  it('returns a RegExp for a safe pattern', () => {
    const re = safeRegExp('^build(/.*)?$');
    expect(re).toBeInstanceOf(RegExp);
    expect(re.test('build/output')).toBe(true);
    expect(re.test('rebuild')).toBe(false);
  });

  it('throws on a dangerous pattern', () => {
    expect(() => safeRegExp('(a+)+$')).toThrow(/dangerous regex/i);
  });

  it('throws on syntactically invalid regex', () => {
    expect(() => safeRegExp('[invalid')).toThrow();
  });

  it('passes flags through to the RegExp constructor', () => {
    const re = safeRegExp('^readme$', 'i');
    expect(re.test('README')).toBe(true);
  });
});
