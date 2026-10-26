// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {createLongPressDetector, useLongPress} from './useLongPress';

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
});

describe('useLongPress stages and clocks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires a later stage of the same hold, at its time from the start', () => {
    const onLongPress = vi.fn();
    const onStage = vi.fn();
    const {result} = renderHook(() =>
      useLongPress({
        onLongPress,
        delayMs: 400,
        stages: [{delayMs: 735, onStage}],
      }),
    );
    act(() => {
      result.current.start({x: 10, y: 20});
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onStage).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(334);
    });
    expect(onStage).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onStage).toHaveBeenCalledWith({x: 10, y: 20});
  });

  it('drops the later stages when the finger moves past the tolerance after the long press', () => {
    const onStage = vi.fn();
    const {result} = renderHook(() =>
      useLongPress({
        onLongPress: vi.fn(),
        delayMs: 400,
        moveCancelPx: 11.5,
        stages: [{delayMs: 735, onStage}],
      }),
    );
    act(() => {
      result.current.start({x: 0, y: 0});
      vi.advanceTimersByTime(500);
    });
    expect(result.current.moveTo({x: 11.5, y: 0})).toBe(true);
    expect(result.current.moveTo({x: 0, y: 12})).toBe(false);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onStage).not.toHaveBeenCalled();
  });

  it('counts the deadlines from the time it is given, on the clock it is given', () => {
    let clock = 1000;
    const timers: {deadline: number; callback: () => void}[] = [];
    const fired: string[] = [];
    const detector = createLongPressDetector(() => ({
      delayMs: 400,
      stages: [{delayMs: 735, onStage: () => fired.push(`stage@${clock}`)}],
      onLongPress: () => fired.push(`press@${clock}`),
      scheduler: {
        now: () => clock,
        setTimer: (deadline, callback) => {
          const timer = {deadline, callback};
          timers.push(timer);
          return () => timers.splice(timers.indexOf(timer), 1);
        },
      },
    }));
    // The press started at 900 on that clock, before `now`.
    detector.start({x: 0, y: 0}, 900);
    expect(timers.map(timer => timer.deadline)).toEqual([1300]);
    clock = 1300;
    timers.shift()?.callback();
    expect(timers.map(timer => timer.deadline)).toEqual([1635]);
    clock = 1635;
    timers.shift()?.callback();
    expect(fired).toEqual(['press@1300', 'stage@1635']);
  });
});
