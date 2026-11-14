// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression tests for ReDoS protection in regex-safety.mjs
 *
 * Validates that the safeRegExp() guard rejects patterns known to cause
 * catastrophic backtracking while accepting legitimate .hgignore patterns.
 *
 * Run: node packages/cli/foundation/fs/__tests__/regex-safety.test.mjs
 */

import {checkRegexSafety, safeRegExp} from '../regex-safety.mjs';
import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';

// ─────────────────────────────────────────────────────────────────────────────
// Dangerous patterns that MUST be rejected
// ─────────────────────────────────────────────────────────────────────────────

describe('checkRegexSafety — rejects ReDoS patterns', () => {
  const dangerous = [
    {name: 'classic nested quantifier (a+)+', pattern: '(a+)+$'},
    {name: 'nested star (a*)*', pattern: '(a*)*$'},
    {name: 'mixed nested (a+)*', pattern: '(a+)*$'},
    {name: 'char-class nested ([\\w.]+)+', pattern: '([\\w.]+)+\\.pyc$'},
    {name: 'char-class nested ([a-z.]+)+', pattern: '([a-z.]+)+\\.tmp$'},
    {name: 'wildcard in quantified group (.*X)+', pattern: '(.*\\.[a-z]+)+\\.tmp$'},
    {name: 'dot-plus in quantified group (.+X)+', pattern: '(.+\\.)+com$'},
    {name: 'nested with braces (a+){2,}', pattern: '(a+){2,}'},
    {name: 'dot-star in quantified group (.*a)+', pattern: '(.*a)+$'},
  ];

  for (const {name, pattern} of dangerous) {
    it(`rejects: ${name}`, () => {
      const result = checkRegexSafety(pattern);
      assert.equal(result.safe, false, `Pattern "${pattern}" should be rejected`);
      assert.ok(result.reason, 'Should provide a reason');
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Safe patterns that MUST be accepted
// ─────────────────────────────────────────────────────────────────────────────

describe('checkRegexSafety — accepts safe patterns', () => {
  const safe = [
    {name: 'simple literal', pattern: '\\.pyc$'},
    {name: 'simple alternation', pattern: '__pycache__|node_modules'},
    {name: 'character class (no nesting)', pattern: '[a-z0-9]+\\.log$'},
    {name: 'non-nested quantifier', pattern: '.*\\.tmp$'},
    {name: 'anchored path', pattern: '^build/output/'},
    {name: 'escaped dot', pattern: 'src/.*\\.test\\.tsx?$'},
    {name: 'simple group no outer quantifier', pattern: '(dist|build)/'},
    {name: 'typical hgignore glob-like', pattern: '.*\\.o$'},
    {name: 'simple character class', pattern: '[._]generated\\.'},
  ];

  for (const {name, pattern} of safe) {
    it(`accepts: ${name}`, () => {
      const result = checkRegexSafety(pattern);
      assert.equal(result.safe, true, `Pattern "${pattern}" should be accepted`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// safeRegExp — integration tests
// ─────────────────────────────────────────────────────────────────────────────

describe('safeRegExp', () => {
  it('compiles safe patterns', () => {
    const re = safeRegExp('\\.pyc$');
    assert.ok(re instanceof RegExp);
    assert.equal(re.test('module.pyc'), true);
    assert.equal(re.test('module.py'), false);
  });

  it('throws on dangerous patterns', () => {
    assert.throws(
      () => safeRegExp('(a+)+$'),
      /ReDoS|backtracking|unsafe/i,
    );
  });

  it('throws on invalid regex syntax', () => {
    assert.throws(
      () => safeRegExp('[invalid'),
      /Invalid regular expression/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Performance regression: ensure accepted patterns don't hang
// ─────────────────────────────────────────────────────────────────────────────

describe('performance regression — safe patterns execute in bounded time', () => {
  it('simple pattern matches quickly against adversarial input', () => {
    const re = safeRegExp('.*\\.tmp$');
    const adversarial = 'a'.repeat(10000) + '!';
    const start = performance.now();
    re.test(adversarial);
    const elapsed = performance.now() - start;
    // Must complete in under 100ms even on slow CI
    assert.ok(elapsed < 100, `Took ${elapsed.toFixed(1)}ms — expected <100ms`);
  });

  it('[a-z0-9]+\\.log$ matches quickly', () => {
    const re = safeRegExp('[a-z0-9]+\\.log$');
    const adversarial = 'a1b2c3d4e5f6g7h8'.repeat(100) + '!';
    const start = performance.now();
    re.test(adversarial);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 100, `Took ${elapsed.toFixed(1)}ms — expected <100ms`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Prove the vulnerability: rejected patterns WOULD cause catastrophic time
// ─────────────────────────────────────────────────────────────────────────────

describe('proof — rejected patterns cause exponential backtracking', () => {
  it('(a+)+$ hangs on adversarial input without the guard', () => {
    // Compile WITHOUT the guard to prove the danger
    const unguarded = new RegExp('(a+)+$');
    const input = 'a'.repeat(25) + '!';
    const start = performance.now();
    unguarded.test(input);
    const elapsed = performance.now() - start;
    // This should take >100ms (exponential), proving the ReDoS
    assert.ok(
      elapsed > 50,
      `Expected exponential time (>50ms) but got ${elapsed.toFixed(1)}ms — ` +
        'the pattern may not be dangerous on this engine',
    );
    console.log(`    ✓ Unguarded (a+)+$ took ${elapsed.toFixed(0)}ms on 25-char adversarial input (proves ReDoS)`);
  });
});

