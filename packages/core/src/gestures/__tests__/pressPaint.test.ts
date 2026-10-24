// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressPaint.test.ts
 * @input paintPress on jsdom elements, with fake timers
 * @output The press attribute's states: on, held, fading on its release
 *   clock then removed, none; writes refused unless the current value may be
 *   replaced (a held row survives presses, its owner releases it), foreign
 *   values left alone, a new paint cancelling a pending fade
 * @position Unit tests of packages/core/src/gestures/pressPaint.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PRESS_FADE_MS} from '../../utils/pressGesture';
import {paintPress, readPressPaint} from '../pressPaint';

const ATTRIBUTE = 'data-astryx-press';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('paintPress', () => {
  it('paints on, then fades on the release clock and clears', () => {
    const row = document.createElement('div');
    expect(paintPress(row, 'on')).toBe(true);
    expect(row.getAttribute(ATTRIBUTE)).toBe('on');
    paintPress(row, 'fading', {releaseMs: 250});
    vi.advanceTimersByTime(249);
    expect(row.getAttribute(ATTRIBUTE)).toBe('fading');
    vi.advanceTimersByTime(1);
    expect(row.hasAttribute(ATTRIBUTE)).toBe(false);
    expect(readPressPaint(row)).toBe('none');
  });

  it('uses the press fade by default, and a new paint cancels a pending fade', () => {
    const row = document.createElement('div');
    paintPress(row, 'on');
    paintPress(row, 'fading');
    paintPress(row, 'on');
    vi.advanceTimersByTime(PRESS_FADE_MS);
    expect(row.getAttribute(ATTRIBUTE)).toBe('on');
  });

  it('keeps a held row through presses until its owner releases it', () => {
    const row = document.createElement('div');
    expect(paintPress(row, 'held')).toBe(true);
    expect(paintPress(row, 'on')).toBe(false);
    expect(paintPress(row, 'fading')).toBe(false);
    expect(paintPress(row, 'none')).toBe(false);
    expect(row.getAttribute(ATTRIBUTE)).toBe('held');
    expect(paintPress(row, 'fading', {onlyFrom: ['held']})).toBe(true);
    vi.advanceTimersByTime(PRESS_FADE_MS);
    expect(row.hasAttribute(ATTRIBUTE)).toBe(false);
  });

  it('leaves a value no painter wrote alone', () => {
    const row = document.createElement('div');
    row.setAttribute(ATTRIBUTE, 'custom');
    expect(readPressPaint(row)).toBeNull();
    expect(paintPress(row, 'on')).toBe(false);
    expect(row.getAttribute(ATTRIBUTE)).toBe('custom');
  });

  it('writes another attribute when asked', () => {
    const row = document.createElement('div');
    paintPress(row, 'on', {attribute: 'data-pressed'});
    expect(row.getAttribute('data-pressed')).toBe('on');
    expect(row.hasAttribute(ATTRIBUTE)).toBe(false);
  });
});
