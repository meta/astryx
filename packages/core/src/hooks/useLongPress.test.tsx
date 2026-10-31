// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useLongPress} from './useLongPress';

// Minimal React.TouchEvent stand-in carrying only what the hook reads.
function touchEvent(touches: {clientX: number; clientY: number}[]) {
  return {touches} as unknown as React.TouchEvent;
}

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onLongPress with the start point after the delay', () => {
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));

    act(() => {
      result.current.onTouchStart(touchEvent([{clientX: 10, clientY: 20}]));
    });
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith({x: 10, y: 20});
  });

  it('respects a custom delayMs', () => {
    const onLongPress = vi.fn();
    const {result} = renderHook(() =>
      useLongPress({onLongPress, delayMs: 1000}),
    );

    act(() => {
      result.current.onTouchStart(touchEvent([{clientX: 1, clientY: 2}]));
      vi.advanceTimersByTime(999);
    });
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    const onLongPress = vi.fn();
    const {result} = renderHook(() =>
      useLongPress({onLongPress, disabled: true}),
    );

    act(() => {
      result.current.onTouchStart(touchEvent([{clientX: 0, clientY: 0}]));
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('ignores multi-touch starts', () => {
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));

    act(() => {
      result.current.onTouchStart(
        touchEvent([
          {clientX: 0, clientY: 0},
          {clientX: 5, clientY: 5},
        ]),
      );
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels when a second finger touches down mid-press', () => {
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));

    act(() => {
      result.current.onTouchStart(touchEvent([{clientX: 0, clientY: 0}]));
      // A second finger joins before the press fires (e.g. pinch-to-zoom).
      result.current.onTouchStart(
        touchEvent([
          {clientX: 0, clientY: 0},
          {clientX: 50, clientY: 50},
        ]),
      );
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels when the finger moves past the threshold', () => {
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));

    act(() => {
      result.current.onTouchStart(touchEvent([{clientX: 0, clientY: 0}]));
      // Move past the default 10px threshold.
      result.current.onTouchMove(touchEvent([{clientX: 15, clientY: 0}]));
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not cancel for movement within the threshold', () => {
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));

    act(() => {
      result.current.onTouchStart(touchEvent([{clientX: 0, clientY: 0}]));
      result.current.onTouchMove(touchEvent([{clientX: 5, clientY: 5}]));
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('measures the travel on each axis, as its documentation says: a (9, 9) drift keeps the press, 11 px on one axis ends it', () => {
    const kept = vi.fn();
    const {result: keeps} = renderHook(() => useLongPress({onLongPress: kept}));
    act(() => {
      keeps.current.onTouchStart(touchEvent([{clientX: 100, clientY: 100}]));
      keeps.current.onTouchMove(touchEvent([{clientX: 109, clientY: 109}]));
      vi.advanceTimersByTime(500);
    });
    expect(kept).toHaveBeenCalledTimes(1);

    const ended = vi.fn();
    const {result: ends} = renderHook(() => useLongPress({onLongPress: ended}));
    act(() => {
      ends.current.onTouchStart(touchEvent([{clientX: 100, clientY: 100}]));
      ends.current.onTouchMove(touchEvent([{clientX: 100, clientY: 111}]));
      vi.advanceTimersByTime(500);
    });
    expect(ended).not.toHaveBeenCalled();
  });

  it('cancels on touch end', () => {
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));

    act(() => {
      result.current.onTouchStart(touchEvent([{clientX: 0, clientY: 0}]));
      result.current.onTouchEnd();
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels the pending timer on unmount', () => {
    const onLongPress = vi.fn();
    const {result, unmount} = renderHook(() => useLongPress({onLongPress}));

    act(() => {
      result.current.onTouchStart(touchEvent([{clientX: 0, clientY: 0}]));
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });
  it('takes only the point in its public start: a second argument changes no tolerance (architecture:public-component-api INV12)', () => {
    const onLongPress = vi.fn();
    const {result} = renderHook(() =>
      useLongPress({onLongPress, moveCancelPx: 10}),
    );
    // A caller passing a tolerance anyway, which the handlers do not declare.
    const start: (
      point: {x: number; y: number},
      tolerance?: {moveCancelPx?: number},
    ) => void = result.current.start;
    act(() => {
      start({x: 0, y: 0}, {moveCancelPx: 100});
      result.current.moveTo({x: 20, y: 0});
      vi.advanceTimersByTime(600);
    });
    // The public moveCancelPx (10 px) stands: the press was cancelled.
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
