// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useWheelsWarmUp.test.tsx
 * @input useWheelsWarmUp, the motion math and the UIKit constants table
 * @output Unit tests: the hidden wheels warm once the open sheet has settled
 *   (its present spring's settling duration) and the main thread is idle, and
 *   cool when it closes
 * @position Colocated test of useWheelsWarmUp.ts
 */

import {act, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {settlingDuration, toSpring} from '../motion/spring';
import {springs} from '../motion/uikit/springs';
import {SHEET_SETTLE_MS, useWheelsWarmUp} from './useWheelsWarmUp';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useWheelsWarmUp', () => {
  it('waits for the sheet\u2019s present spring to settle', () => {
    expect(SHEET_SETTLE_MS).toBe(
      Math.round(settlingDuration(toSpring(springs.sheetPresent)) * 1000),
    );
    expect(SHEET_SETTLE_MS).toBeGreaterThan(0);
  });

  it('warms once the open sheet has settled and the main thread is idle', () => {
    const idle: (() => void)[] = [];
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      idle.push(callback);
      return idle.length;
    });
    vi.stubGlobal('cancelIdleCallback', () => {});
    const {result, rerender} = renderHook(
      ({isOpen}) => useWheelsWarmUp(isOpen),
      {initialProps: {isOpen: false}},
    );
    expect(result.current).toBe(false);
    rerender({isOpen: true});
    act(() => {
      vi.advanceTimersByTime(SHEET_SETTLE_MS - 1);
    });
    expect(idle).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(idle).toHaveLength(1);
    expect(result.current).toBe(false);
    act(() => {
      idle[0]?.();
    });
    expect(result.current).toBe(true);
    rerender({isOpen: false});
    expect(result.current).toBe(false);
  });

  it('never warms a sheet that closes before it settles', () => {
    const {result, rerender} = renderHook(
      ({isOpen}) => useWheelsWarmUp(isOpen),
      {initialProps: {isOpen: true}},
    );
    rerender({isOpen: false});
    act(() => {
      vi.advanceTimersByTime(SHEET_SETTLE_MS + 1000);
    });
    expect(result.current).toBe(false);
  });
});
