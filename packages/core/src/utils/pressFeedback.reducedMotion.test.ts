// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressFeedback.reducedMotion.test.ts
 * @input pressFeedback.ts, with the Reduce Motion cross-fade's duration
 *   (`timing.reducedMotionCrossFadeMs`, motion/uikit/timing.ts) stubbed
 * @output Proof that under reduced motion the release's clock is capped by
 *   the shared Reduce Motion duration, read from the timing table rather than
 *   a literal of its own (`spec:AST-094` FR4)
 * @position Testing; validates pressFeedback.ts in jsdom
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  PRESSABLE_ATTRIBUTE,
  PRESSED_ATTRIBUTE,
  installPressFeedback,
} from './pressFeedback';
import {PRESS_FADE_MS, PRESS_ONSET_MS} from './pressGesture';
import type * as TimingModule from '../motion/uikit/timing';

/** A Reduce Motion duration no literal in the press code equals. */
const {STUBBED_MS} = vi.hoisted(() => ({STUBBED_MS: 120}));

vi.mock('../motion/uikit/timing', async importOriginal => {
  const actual = await importOriginal<typeof TimingModule>();
  return {
    ...actual,
    timing: {...actual.timing, reducedMotionCrossFadeMs: STUBBED_MS},
  };
});

let release: () => void = () => undefined;
let row: HTMLElement;
const matchMedia = window.matchMedia;

function press(element: Element, type: string): void {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.assign(event, {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
    pointerType: 'touch',
  });
  element.dispatchEvent(event);
}

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = (query: string) => ({
    ...matchMedia(query),
    matches:
      query.includes('prefers-reduced-motion: reduce') ||
      matchMedia(query).matches,
  });
  document.body.innerHTML = '';
  row = document.createElement('div');
  row.setAttribute(PRESSABLE_ATTRIBUTE, '');
  document.body.append(row);
  release = installPressFeedback();
});

afterEach(() => {
  release();
  window.matchMedia = matchMedia;
  vi.useRealTimers();
});

describe('the release under reduced motion', () => {
  it('ends on the shared Reduce Motion duration, read from the timing table (spec:AST-094 FR4)', () => {
    expect(PRESS_FADE_MS).toBeGreaterThan(STUBBED_MS);
    press(row, 'pointerdown');
    vi.advanceTimersByTime(PRESS_ONSET_MS);
    press(row, 'pointerup');
    expect(row.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(STUBBED_MS - 1);
    expect(row.getAttribute(PRESSED_ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(1);
    expect(row.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  });
});
