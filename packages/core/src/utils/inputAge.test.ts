// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputAge.test.ts
 * @input inputAge.ts
 * @output Unit tests for msSinceInput: an input's age on its window's clock,
 *   an epoch stamp's age, and zero for no time or a future one
 * @position Testing; validates inputAge.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createLongPressDetector} from '../hooks/longPressDetector';
import {msSinceInput} from './inputAge';

describe('msSinceInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The page has run a while, so an input's time is past zero.
    vi.advanceTimersByTime(1000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is the input's age when its time is on the page's clock", () => {
    expect(msSinceInput(performance.now() - 60)).toBe(60);
    expect(msSinceInput(performance.now())).toBe(0);
  });

  it('is zero for an input with no time, or a time ahead of now', () => {
    expect(msSinceInput(0)).toBe(0);
    expect(msSinceInput(Number.NaN)).toBe(0);
    expect(msSinceInput(performance.now() + 500)).toBe(0);
  });

  it('keeps the age of an epoch stamp, as jsdom stamps an event', () => {
    expect(msSinceInput(Date.now() - 60)).toBe(60);
    expect(msSinceInput(Date.now())).toBe(0);
  });

  it("reads the clock of the window the input landed in, as an iframe's", () => {
    // The iframe's clock reads 5000 while this window's reads about 1000.
    const frame = {performance: {now: () => 5000}};
    const element = {nodeType: 1, ownerDocument: {defaultView: frame}};
    const frameDocument = {nodeType: 9, defaultView: frame};
    const event = {view: frame};
    expect(msSinceInput(4940, element)).toBe(60);
    expect(msSinceInput(4940, frameDocument)).toBe(60);
    expect(msSinceInput(4940, event)).toBe(60);
    // On this window's clock, that time is ahead of now.
    expect(msSinceInput(4940)).toBe(0);
  });

  it('reads a 60 ms-old epoch stamp as 60 ms old for both the press onset and the long-press hold', () => {
    // A window clock that reads 1000 now and moves with the system time.
    const offset = 1000 - Date.now();
    const view = {performance: {now: () => Date.now() + offset}};
    const stamp = Date.now() - 60;
    const event = {touches: [{clientX: 0, clientY: 0}], timeStamp: stamp, view};
    expect(msSinceInput(stamp, event)).toBe(60);
    const onLongPress = vi.fn();
    createLongPressDetector({onLongPress, delayMs: 500}).touchStart(event);
    vi.advanceTimersByTime(500 - 60 - 1);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("reads this window's clock for a target with no window", () => {
    const detached = {nodeType: 1, ownerDocument: {defaultView: null}};
    expect(msSinceInput(performance.now() - 60, detached)).toBe(60);
    expect(msSinceInput(performance.now() - 60, {})).toBe(60);
  });
});
