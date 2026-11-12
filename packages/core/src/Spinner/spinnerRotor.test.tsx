// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file spinnerRotor.test.tsx
 * @input Uses vitest, @testing-library/react, StyleX, spinnerRotor
 * @output Pins the shared rotor's timing: turns per iteration and both
 *   durations, the reduced-motion one included
 * @position Testing; validates spinnerRotor.ts, which Spinner and Lab's
 *   indeterminate CircularProgress share
 *
 * SYNC: When spinnerRotor.ts changes, update tests to match new behavior
 */

import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {spinnerRotorStyles} from './spinnerRotor';
import {getAllInjectedCss} from '../__tests__/forcedColors';
import {declaredValue} from '../__tests__/stylexDeclarations';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * The value the element's StyleX classes declare for `property` inside
 * `@media <query>`. `declaredValue` reads only the unconditional rules.
 */
function declaredInMedia(
  el: Element,
  query: string,
  property: string,
): string | null {
  const classes = new Set(Array.from(el.classList));
  let value: string | null = null;
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSMediaRule) || rule.media.mediaText !== query) {
        continue;
      }
      for (const inner of Array.from(rule.cssRules)) {
        if (!(inner instanceof CSSStyleRule)) {
          continue;
        }
        const owner = /^\.([\w-]+)/.exec(inner.selectorText)?.[1];
        if (owner == null || !classes.has(owner)) {
          continue;
        }
        const declared = inner.style.getPropertyValue(property);
        if (declared !== '') {
          value = declared;
        }
      }
    }
  }
  return value;
}

/**
 * Seconds in a declared duration. StyleX folds `calc(3s * 100)` into
 * `calc(300s)`, so both forms are read.
 */
function seconds(value: string | null): number {
  const product = /^calc\(([\d.]+)s \* ([\d.]+)\)$/.exec(value ?? '');
  if (product != null) {
    return Number(product[1]) * Number(product[2]);
  }
  const plain = /^(?:calc\()?([\d.]+)s\)?$/.exec(value ?? '');
  return plain == null ? Number.NaN : Number(plain[1]);
}

describe('spinnerRotor', () => {
  // Chromium wakes the main thread at each iteration boundary while React
  // listens for `animationiteration`. So one iteration holds 100 turns. Each
  // duration is 100 periods, so one turn still takes one period.
  it('turns 100 times in one iteration, over 100 periods, with reduced motion too', () => {
    render(
      <span data-testid="rotor" {...stylex.props(spinnerRotorStyles.turn)} />,
    );
    const rotor = screen.getByTestId('rotor');
    const name = declaredValue(rotor, 'animation-name');
    expect(name).toBeTruthy();
    // jsdom's CSSOM lowercases the name in the rule but not in the at-rule.
    const keyframes =
      new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?\\})\\s*\\}`, 'i').exec(
        getAllInjectedCss(),
      )?.[1] ?? '';
    expect(keyframes).toMatch(/rotate\(0deg\)/);
    expect(keyframes).toMatch(/rotate\(36000deg\)/);
    expect(declaredValue(rotor, 'animation-duration')).toMatch(
      /^calc\(var\(--_astryx-pre-tempo-duration-slow-min,.*\) \* 100\)$/,
    );
    expect(
      seconds(declaredInMedia(rotor, REDUCED_MOTION, 'animation-duration')),
    ).toBe(3 * 100);
  });
});
