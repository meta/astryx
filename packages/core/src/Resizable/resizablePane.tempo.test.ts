// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resizablePane.tempo.test.ts
 * @input resizablePane.ts, the shared springs table, a stubbed computed style
 *   that writes a theme's tempo
 * @output Proof that a release slide plays the settle spring at the theme's
 *   tempo
 * @position Testing for /packages/core/src/Resizable/resizablePane.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {settlingDuration, toSpring} from '../motion/spring';
import {registerSpringsTable, springs} from '../motion/uikit';
import {slideNextOnRelease} from './resizablePane';

registerSpringsTable();

const TEMPO_PROPERTY = '--_astryx-motion-tempo';

/** The tempo the stubbed theme writes; empty where no theme sets one. */
let tempo: string;

beforeEach(() => {
  tempo = '';
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) =>
          name === TEMPO_PROPERTY ? tempo : '',
      }) as unknown as CSSStyleDeclaration,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function row(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe("a release slide at the theme's tempo", () => {
  it('plays the settle spring tempo times as long', () => {
    const settleMs = settlingDuration(toSpring(springs.settle)) * 1000;
    const atOne = slideNextOnRelease(row(), 0, 100);
    tempo = '1.5';
    const atSlow = slideNextOnRelease(row(), 0, 100);

    expect(atOne?.(settleMs * 1.2)).toBe(0);
    expect(atSlow?.(settleMs * 1.2)).toBeGreaterThan(0);
    expect(atSlow?.(settleMs * 1.6)).toBe(0);
  });
});
