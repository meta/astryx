// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeTempo.test.ts
 * @input themeTempo.ts, jsdom's computed style
 * @output Proof that the tempo is the one the element's theme writes, and 1
 *   without one or for a value that is not a positive number
 * @position Testing for /packages/core/src/motion/themeTempo.ts (the browser
 *   proof, a nested theme included: themeTempo.interaction.browser.spec.ts)
 */

import {afterEach, describe, expect, it} from 'vitest';
import {themeTempo} from './themeTempo';

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

/** An element in a theme scope whose rule writes `value` as its tempo. */
function inTempo(value: string): Element {
  const style = document.createElement('style');
  style.textContent = `[data-tempo-scope] { --_astryx-motion-tempo: ${value}; }`;
  document.head.append(style);
  const element = document.createElement('div');
  element.setAttribute('data-tempo-scope', '');
  document.body.append(element);
  return element;
}

describe('themeTempo', () => {
  it("is the tempo the element's theme writes", () => {
    expect(themeTempo(inTempo('1.5'))).toBe(1.5);
    document.head.innerHTML = '';
    expect(themeTempo(inTempo('0.85'))).toBe(0.85);
  });

  it('is 1 without an element, or where no theme sets a tempo', () => {
    expect(themeTempo(null)).toBe(1);
    expect(themeTempo(undefined)).toBe(1);
    const element = document.createElement('div');
    document.body.append(element);
    expect(themeTempo(element)).toBe(1);
  });

  it('reads a value that is not a positive number as 1', () => {
    for (const value of ['0', '-1', 'fast']) {
      document.head.innerHTML = '';
      expect(themeTempo(inTempo(value))).toBe(1);
    }
  });
});
