// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useLongPress} from './useLongPress';

// Minimal React.TouchEvent stand-in carrying only what the hook reads.
function touchEvent(touches: {clientX: number; clientY: number}[]) {
  return {touches} as unknown as React.TouchEvent;
}

// A window's clock (`performance`): `now()` reads `at` now and moves with
// the fake timers. A same-origin iframe or Picture-in-Picture window has a
// time origin of its own.
const EPOCH_ORIGIN = 1_700_000_000_000;
function windowClock(at: number, timeOrigin = EPOCH_ORIGIN) {
  const offset = at - Date.now();
  return {performance: {now: () => Date.now() + offset, timeOrigin}};
}

// The same stand-in, dispatched in `view` and stamped on its clock
// (`event.timeStamp`).
function stamped(
  view: ReturnType<typeof windowClock>,
  timeStamp: number,
  touches: {clientX: number; clientY: number}[] = [],
) {
  return {touches, timeStamp, view} as unknown as React.TouchEvent;
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

describe('useLongPress on the events\u2019 clock (spec:AST-094 FR16)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reports the press first when the lift is stamped past the deadline, though the page timer has not run (a blocked main thread)', () => {
    const page = windowClock(1000);
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));
    act(() => {
      result.current.onTouchStart(
        stamped(page, 1000, [{clientX: 10, clientY: 20}]),
      );
      result.current.onTouchEnd(stamped(page, 1800));
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith({x: 10, y: 20});
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('reports the press first when a move within the allowance is stamped past the deadline', () => {
    const page = windowClock(1000);
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));
    act(() => {
      result.current.onTouchStart(
        stamped(page, 1000, [{clientX: 10, clientY: 20}]),
      );
      result.current.onTouchMove(
        stamped(page, 1600, [{clientX: 12, clientY: 21}]),
      );
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith({x: 10, y: 20});
  });

  it('reports the press first when a second finger lands after the deadline, then ends it', () => {
    const page = windowClock(1000);
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));
    act(() => {
      result.current.onTouchStart(
        stamped(page, 1000, [{clientX: 10, clientY: 20}]),
      );
      result.current.onTouchStart(
        stamped(page, 1700, [
          {clientX: 10, clientY: 20},
          {clientX: 90, clientY: 20},
        ]),
      );
      vi.advanceTimersByTime(1000);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('reports the press when a cancel is stamped past the deadline, and drops it when stamped before', () => {
    const page = windowClock(1000);
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));
    act(() => {
      result.current.onTouchStart(
        stamped(page, 1000, [{clientX: 0, clientY: 0}]),
      );
      result.current.onTouchCancel(stamped(page, 1300));
      vi.advanceTimersByTime(1000);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    const later = windowClock(5000);
    act(() => {
      result.current.onTouchStart(
        stamped(later, 5000, [{clientX: 0, clientY: 0}]),
      );
      result.current.onTouchCancel(stamped(later, 5600));
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('does not lengthen the hold of a touch the page handled late: the timer waits only for the rest', () => {
    const page = windowClock(1300);
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));
    act(() => {
      result.current.onTouchStart(
        stamped(page, 1000, [{clientX: 0, clientY: 0}]),
      );
      vi.advanceTimersByTime(199);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('lets a lift stamped before the deadline cancel the press, though its timer ran late', () => {
    const page = windowClock(2000);
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));
    act(() => {
      // Handled 1,000 ms late: the press was due 500 ms ago, so its timer
      // runs at once, finds itself late, and yields to queued input once.
      result.current.onTouchStart(
        stamped(page, 1000, [{clientX: 0, clientY: 0}]),
      );
      vi.advanceTimersByTime(0);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => {
      // The lift queued behind the long task: 300 ms after the touch.
      result.current.onTouchEnd(stamped(page, 1300));
      vi.advanceTimersByTime(100);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('reads a touch in a same-origin iframe or Picture-in-Picture window on that window\u2019s clock, whose origin is later than the page\u2019s', () => {
    // The page's own clock reads far ahead of the iframe's.
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now() + 5000);
    const frame = windowClock(100);
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));
    // A tap of 120 ms in the iframe opens nothing.
    act(() => {
      result.current.onTouchStart(
        stamped(frame, 100, [{clientX: 0, clientY: 0}]),
      );
      vi.advanceTimersByTime(120);
      result.current.onTouchEnd(stamped(frame, 220));
      vi.advanceTimersByTime(1000);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    // A finger held there for the delay opens it at the delay, not before.
    const held = windowClock(2000);
    act(() => {
      result.current.onTouchStart(
        stamped(held, 2000, [{clientX: 4, clientY: 6}]),
      );
      vi.advanceTimersByTime(499);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledWith({x: 4, y: 6});
  });

  it('reads an event stamped in epoch milliseconds (jsdom) by its age on Date.now()', () => {
    // Handled 300 ms after it was stamped: the press is due in 200 ms, not
    // the full delay.
    const page = windowClock(1300);
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));
    act(() => {
      result.current.onTouchStart(
        stamped(page, Date.now() - 300, [{clientX: 0, clientY: 0}]),
      );
      vi.advanceTimersByTime(199);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('keeps a tap a tap in a test that freezes the system time at an earlier date', () => {
    vi.setSystemTime(new Date(2026, 2, 15));
    // The window's time origin stays the real one, months after the frozen
    // date; jsdom stamps events with the frozen Date.now().
    const page = windowClock(1000, Date.UTC(2026, 10, 2));
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));
    act(() => {
      result.current.onTouchStart(
        stamped(page, Date.now(), [{clientX: 0, clientY: 0}]),
      );
      vi.advanceTimersByTime(100);
      result.current.onTouchEnd(stamped(page, Date.now()));
      vi.advanceTimersByTime(1000);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('keeps a tap a tap in a test that freezes the date at 0 and leaves the window clock real', () => {
    vi.setSystemTime(0);
    // The window's clock is not faked: it reads a few seconds into the run
    // and does not move with the fake timers.
    const page = {performance: {now: () => 5000}};
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));
    act(() => {
      result.current.onTouchStart(
        stamped(page as unknown as ReturnType<typeof windowClock>, Date.now(), [
          {clientX: 0, clientY: 0},
        ]),
      );
      vi.advanceTimersByTime(100);
      result.current.onTouchEnd(
        stamped(page as unknown as ReturnType<typeof windowClock>, Date.now()),
      );
      vi.advanceTimersByTime(1000);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('waits the full delay for a touch that carries no time (a stamp of 0)', () => {
    const page = windowClock(10_000);
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));
    act(() => {
      result.current.onTouchStart(stamped(page, 0, [{clientX: 0, clientY: 0}]));
      vi.advanceTimersByTime(100);
      result.current.onTouchEnd(stamped(page, 0));
      vi.advanceTimersByTime(1000);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => {
      result.current.onTouchStart(stamped(page, 0, [{clientX: 0, clientY: 0}]));
      vi.advanceTimersByTime(499);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('never waits longer than the delay when a touch is stamped ahead of its clock', () => {
    const page = windowClock(1000);
    const onLongPress = vi.fn();
    const {result} = renderHook(() => useLongPress({onLongPress}));
    act(() => {
      result.current.onTouchStart(
        stamped(page, 1400, [{clientX: 0, clientY: 0}]),
      );
      vi.advanceTimersByTime(499);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
