// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useSheetGestures.test.ts
 * @input Uses vitest, @testing-library/react renderHook, useSheetGestures
 * @output Unit tests for useSheetGestures behavior
 * @position Testing; validates useSheetGestures.ts implementation
 *
 * SYNC: When useSheetGestures.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, renderHook} from '@testing-library/react';
import {useState} from 'react';
import {rubberBand} from '../motion/rubberBand';
import {
  isInsideNestedLayer,
  useSheetGestures,
  type UseSheetGesturesOptions,
} from './useSheetGestures';

const SHEET_HEIGHT = 400;
// A touch device's reserve below the screen, deeper than the whole band over
// the sheet's visible 240 px.
const TOUCH_RESERVE = 160;

// A fake pointer event object good enough for the handlers, which only read
// pointerId, clientY, timeStamp, preventDefault, and currentTarget's capture +
// measure APIs.
function pointerEvent(
  clientY: number,
  timeStamp: number,
  target: HTMLElement,
  pointerId = 1,
  button = 0,
  isPrimary = true,
  pointerType?: string,
) {
  return {
    pointerId,
    button,
    isPrimary,
    pointerType,
    clientY,
    timeStamp,
    currentTarget: target,
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent;
}

function makeTarget(): HTMLElement {
  const el = document.createElement('div');
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
  el.getBoundingClientRect = () => ({height: SHEET_HEIGHT}) as DOMRect;
  return el;
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(options: Partial<UseSheetGesturesOptions> = {}) {
  const onDismiss = vi.fn();
  const hook = renderHook(
    (props: UseSheetGesturesOptions) => useSheetGestures(props),
    {
      initialProps: {
        isOpen: true,
        onDismiss,
        ...options,
      },
    },
  );
  return {hook, onDismiss};
}

type Hook = {
  result: {current: ReturnType<typeof useSheetGestures>};
};

// The live drag position: written per input sample, not rendered.
function liveOffset(hook: Hook): number {
  return hook.result.current.activeOffsetRef.current;
}

function down(hook: Hook, y: number, t: number, target: HTMLElement) {
  // Register the sheet element the way the component does on mount, so the
  // hook can measure its height (it no longer queries the DOM for it).
  act(() => hook.result.current.sheetRef(target));
  act(() =>
    hook.result.current.handleProps.onPointerDown(pointerEvent(y, t, target)),
  );
}
/** A touch press on the handle: the release follows UIKit's sheet. */
function touchDown(hook: Hook, y: number, t: number, target: HTMLElement) {
  act(() => hook.result.current.sheetRef(target));
  act(() =>
    hook.result.current.handleProps.onPointerDown({
      ...pointerEvent(y, t, target),
      pointerType: 'touch',
    } as unknown as React.PointerEvent),
  );
}
// A release velocity needs two moves or more: Core's velocity tracker reads
// none from fewer. So each flick here moves at least twice.
function move(hook: Hook, y: number, t: number, target: HTMLElement) {
  act(() =>
    hook.result.current.handleProps.onPointerMove(pointerEvent(y, t, target)),
  );
}
function up(hook: Hook, y: number, t: number, target: HTMLElement) {
  act(() =>
    hook.result.current.handleProps.onPointerUp(pointerEvent(y, t, target)),
  );
}

// A handle pull of `pull` px up from y 400, held still, then lifted, by a
// pointer of `pointerType`. Returns the stretch at the hold.
function handlePull(
  hook: Hook,
  target: HTMLElement,
  pull: number,
  t0: number,
  pointerType: string,
): number {
  const event = (y: number, t: number) =>
    pointerEvent(y, t, target, 1, 0, true, pointerType);
  act(() => hook.result.current.sheetRef(target));
  act(() => hook.result.current.handleProps.onPointerDown(event(400, t0)));
  act(() =>
    hook.result.current.handleProps.onPointerMove(
      event(400 - pull / 2, t0 + 200),
    ),
  );
  act(() =>
    hook.result.current.handleProps.onPointerMove(event(400 - pull, t0 + 400)),
  );
  const stretch = -liveOffset(hook);
  act(() =>
    hook.result.current.handleProps.onPointerUp(event(400 - pull, t0 + 900)),
  );
  return stretch;
}

describe('isInsideNestedLayer', () => {
  it("is true for a target inside a <dialog> rendered within the body, and false for the body's own content", () => {
    const body = document.createElement('div');
    const own = document.createElement('button');
    body.append(own);
    const nested = document.createElement('dialog');
    const nestedHandle = document.createElement('div');
    nested.append(nestedHandle);
    body.append(nested);
    expect(isInsideNestedLayer(own, body)).toBe(false);
    expect(isInsideNestedLayer(body, body)).toBe(false);
    expect(isInsideNestedLayer(nestedHandle, body)).toBe(true);
    expect(isInsideNestedLayer(nested, body)).toBe(true);
    // A dialog above the body (the sheet's own) does not count.
    const ownDialog = document.createElement('dialog');
    ownDialog.append(body);
    expect(isInsideNestedLayer(own, body)).toBe(false);
    expect(isInsideNestedLayer(null, body)).toBe(false);
  });
});

describe('useSheetGestures', () => {
  it('closes from the tallest detent on a flick that lands nearer closed than any detent', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    touchDown(hook, 0, 0, t);
    // 60px in 20ms = 3,000 px/s. Projected 0.1 s ahead it lands at 360px,
    // nearer closed (400px) than the 200px detent.
    move(hook, 30, 10, t);
    move(hook, 60, 20, t);
    up(hook, 60, 22, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('closes from the tallest detent on a flick whose projection passes the next detent', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    touchDown(hook, 0, 0, t);
    // 60px in 40ms = 1,500 px/s: a flick. Projected 0.1 s ahead it lands at
    // 210px, past the 200px detent, so it goes on to closed.
    move(hook, 30, 20, t);
    move(hook, 60, 40, t);
    up(hook, 60, 42, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('takes a softer flick from the tallest detent to the next detent down when its projection stops short of it', () => {
    const onSnap = vi.fn();
    const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    touchDown(hook, 0, 0, t);
    // 60px in 50ms = 1,200 px/s: a flick. Projected 0.1 s ahead it lands at
    // 180px, short of the 200px detent, so it goes one position down.
    move(hook, 30, 25, t);
    move(hook, 60, 50, t);
    up(hook, 60, 52, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSnap).toHaveBeenLastCalledWith(200);
  });

  it('keeps a long release under the flick speed from closing a sheet above its lowest detent', () => {
    const onSnap = vi.fn();
    const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    touchDown(hook, 0, 0, t);
    // 100px at about 800 px/s: no flick. The sheet stops at the lowest
    // detent.
    move(hook, 40, 50, t);
    move(hook, 80, 100, t);
    move(hook, 100, 125, t);
    up(hook, 100, 127, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSnap).toHaveBeenLastCalledWith(200);
  });

  it('closes on a flick at the lowest of two detents', () => {
    const onSnap = vi.fn();
    const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    // Settle on the 200px detent first.
    touchDown(hook, 0, 0, t);
    move(hook, 90, 300, t);
    move(hook, 180, 700, t);
    up(hook, 180, 1100, t);
    expect(onSnap).toHaveBeenLastCalledWith(200);
    // 60px in 40ms = 1,500 px/s from the lowest detent closes the sheet.
    touchDown(hook, 200, 2000, t);
    move(hook, 230, 2020, t);
    move(hook, 260, 2040, t);
    up(hook, 260, 2042, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('settles instead of dismissing on a downward flick when canDismiss is false', () => {
    const onSnap = vi.fn();
    const onScrimOpacity = vi.fn();
    const {hook, onDismiss} = setup({
      canDismiss: false,
      snapHeights: () => [200],
      onSnap,
      onScrimOpacity,
    });
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 30, 10, t);
    move(hook, 60, 20, t);
    up(hook, 60, 22, t);

    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(200);
    expect(onSnap).toHaveBeenLastCalledWith(200);
    // The 200px stop is half the sheet — a working surface, not a peek — so
    // the backdrop stays full there.
    expect(onScrimOpacity).toHaveBeenLastCalledWith(1);
  });

  it('expands to the tallest detent on a fast upward flick', () => {
    const onSnap = vi.fn();
    const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    // Start rested at a lower detent by first snapping there via a slow drag.
    down(hook, 0, 0, t);
    move(hook, 200, 400, t); // slow drag down toward the 200px detent
    up(hook, 200, 800, t);
    onSnap.mockClear();
    // Now flick up fast: 60px in 20ms = 3px/ms, over the distance floor.
    down(hook, 200, 1000, t);
    move(hook, 170, 1010, t);
    move(hook, 140, 1020, t);
    up(hook, 140, 1022, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSnap).toHaveBeenLastCalledWith(SHEET_HEIGHT); // full height
    expect(hook.result.current.settledOffset).toBe(0);
  });

  describe('release projection', () => {
    // A release is judged where the sheet would coast to at the finger's
    // speed, the way a thrown scroll view is, not where the finger left it.
    it('dismisses on a medium throw released short of the dismiss line', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      // 150px in 150ms = 1px/ms. The finger stops at 150, well short of the
      // 280px line; a surface moving at that speed coasts far past it.
      move(hook, 50, 50, t);
      move(hook, 100, 100, t);
      move(hook, 150, 150, t);
      up(hook, 150, 152, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('lands a gentle throw on the next detent, not back where it started', () => {
      const onSnap = vi.fn();
      const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
      const t = makeTarget();
      down(hook, 0, 0, t);
      // 60px in 200ms = 0.3px/ms: too slow to be a flick, too short to reach
      // the 200px detent by position. The coast carries it there.
      move(hook, 30, 100, t);
      move(hook, 60, 200, t);
      up(hook, 60, 202, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(200);
      expect(onSnap).toHaveBeenLastCalledWith(200);
    });

    it('keeps a throw whose last sample is slow, because the newest interval weighs a fifth', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 60, 20, t); // 3px/ms
      move(hook, 62, 90, t); // the lift's own last, slow sample
      up(hook, 62, 92, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('reads a throw that begins after a hold at its own speed once two of its moves are in', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 0, 250, t); // a still hold on the handle
      // Then 60px in 50ms. The hold weighs on the first move only.
      move(hook, 15, 262, t);
      move(hook, 30, 275, t);
      move(hook, 45, 287, t);
      move(hook, 60, 300, t);
      up(hook, 60, 302, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('weighs a hold into the first move after it, as iOS does', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 0, 250, t); // a still hold on the handle
      // Two moves of 30px in 25ms. The first one counts the hold's time, so
      // the release reads about 330 px/s and the sheet stops at the 200px
      // detent.
      move(hook, 30, 275, t);
      move(hook, 60, 300, t);
      up(hook, 60, 302, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(200);
    });

    it('releases a single move at no speed', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 60, 300, t); // one sample, 300ms after touch-down
      up(hook, 60, 302, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('releases no throw from a finger that rested before lifting', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 60, 20, t); // 3px/ms ...
      up(hook, 60, 400, t); // ... then 380ms of rest, then the lift
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('releases no throw from a finger that rested 50ms before lifting', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 30, 10, t);
      move(hook, 60, 20, t); // 3px/ms ...
      up(hook, 60, 70, t); // ... then 50ms of rest, past the 40ms stillness
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('keeps a throw after a 30ms rest before the lift', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 30, 10, t);
      move(hook, 60, 20, t); // 3px/ms, then 30ms of rest
      up(hook, 60, 50, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('settles a throw that would coast past the line at the shortest detent when canDismiss is false', () => {
      const {hook, onDismiss} = setup({
        canDismiss: false,
        snapHeights: () => [200],
      });
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 50, 50, t);
      move(hook, 100, 100, t);
      up(hook, 100, 102, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(200);
    });
  });

  it('lands a flick on the next detent when one of its early moves arrives late', () => {
    const onSnap = vi.fn();
    const {hook, onDismiss} = setup({snapHeights: () => [100], onSnap});
    const t = makeTarget();
    // 9.6px every 8ms = 1,200 px/s, a flick. The eighth of ten moves comes
    // 70ms late, stamped when it arrives, at its own position. The last two
    // moves keep the 8ms spacing.
    touchDown(hook, 0, 0, t);
    for (let k = 1; k <= 7; k += 1) {
      move(hook, 9.6 * k, 8 * k, t);
    }
    move(hook, 76.8, 134, t);
    move(hook, 86.4, 142, t);
    move(hook, 96, 150, t);
    up(hook, 96, 152, t);
    // A flick from the tallest detent goes one position down: the 100px
    // detent, 300px below.
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSnap).toHaveBeenLastCalledWith(100);
  });

  it('reads a lift at a new position as the last move', () => {
    const onSnap = vi.fn();
    const {hook, onDismiss} = setup({snapHeights: () => [100], onSnap});
    const t = makeTarget();
    // Two moves at 900 px/s, then a lift 30px further on 10ms later. The
    // lift's move makes the release about 1,320 px/s: a flick, so the sheet
    // goes one position down, to the 100px detent.
    touchDown(hook, 0, 0, t);
    move(hook, 9, 10, t);
    move(hook, 18, 20, t);
    up(hook, 48, 30, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSnap).toHaveBeenLastCalledWith(100);
  });

  it('takes a fast short flick from the tallest of two detents to the next one down', () => {
    const onSnap = vi.fn();
    const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    // 20px in 16ms = 1,250 px/s, a flick. Its 0.1 s projection lands at
    // 145px, short of the 200px detent. A flick goes at least one position
    // down: the 200px detent.
    touchDown(hook, 0, 0, t);
    move(hook, 10, 8, t);
    move(hook, 20, 16, t);
    up(hook, 20, 18, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSnap).toHaveBeenLastCalledWith(200);
  });

  it('closes on a fast short flick at the lowest detent', () => {
    const {hook, onDismiss} = setup(); // one detent: fully open
    const t = makeTarget();
    touchDown(hook, 0, 0, t);
    move(hook, 10, 5, t);
    move(hook, 20, 10, t);
    up(hook, 20, 12, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps a short release under the flick speed', () => {
    const {hook, onDismiss} = setup();
    const t = makeTarget();
    // 20px in 25ms = 800 px/s: below the flick speed, so it settles back.
    touchDown(hook, 0, 0, t);
    move(hook, 8, 10, t);
    move(hook, 20, 25, t);
    up(hook, 20, 27, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(0);
  });

  it('expands to the next detent up on a fast short flick', () => {
    const onSnap = vi.fn();
    const {hook} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    // Settle on the 200px detent first.
    touchDown(hook, 0, 0, t);
    move(hook, 90, 300, t);
    move(hook, 180, 700, t);
    up(hook, 180, 1100, t);
    expect(onSnap).toHaveBeenLastCalledWith(200);
    touchDown(hook, 400, 2000, t);
    move(hook, 390, 2005, t);
    move(hook, 380, 2010, t);
    up(hook, 380, 2012, t);
    expect(onSnap).toHaveBeenLastCalledWith(400);
  });

  it('hands the panel the distance left and the release speed after a drag closes it', () => {
    const {hook, onDismiss} = setup();
    const t = makeTarget();
    touchDown(hook, 0, 0, t);
    move(hook, 10, 5, t);
    move(hook, 20, 10, t);
    // The host takes the close in the same update, as a controlled host does.
    act(() => {
      hook.result.current.handleProps.onPointerUp(pointerEvent(20, 12, t));
      hook.rerender({isOpen: false, isOpenRequested: false, onDismiss});
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // 380px left to travel, at the release's 2,000 px/s.
    expect(hook.result.current.dragExit).toEqual({
      distance: 380,
      velocity: 2000,
    });
  });

  it('keeps the stylesheet exit for a close that no drag started', () => {
    const {hook, onDismiss} = setup();
    hook.rerender({isOpen: false, isOpenRequested: false, onDismiss});
    expect(hook.result.current.dragExit).toBeNull();
  });

  it('springs a quick short mouse drag back at the lowest detent', () => {
    const {hook, onDismiss} = setup(); // one detent: fully open
    const t = makeTarget();
    // 40 px in 20 ms = 2,000 px/s with a mouse. The flick is a touch gesture,
    // and 40 px is too short to project.
    down(hook, 0, 0, t);
    move(hook, 20, 10, t);
    move(hook, 40, 20, t);
    up(hook, 40, 22, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(0);
  });

  it('gives a mouse drag that closes the sheet the stylesheet exit', () => {
    const {hook, onDismiss} = setup();
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 100, 50, t);
    move(hook, 200, 100, t);
    act(() => {
      hook.result.current.handleProps.onPointerUp(pointerEvent(200, 102, t));
      hook.rerender({isOpen: false, isOpenRequested: false, onDismiss});
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(hook.result.current.dragExit).toBeNull();
  });

  it('never stops a faster touch release short of a slower one', () => {
    // Detents at 0, 200 and 340 px; closed at 400 px.
    const land = (ms: number) => {
      const {hook} = setup({snapHeights: () => [200, 60]});
      const t = makeTarget();
      touchDown(hook, 0, 0, t);
      move(hook, 30, ms / 2, t);
      move(hook, 60, ms, t);
      up(hook, 60, ms + 2, t);
      return hook.result.current.settledOffset;
    };
    // 60 px at 1,000 px/s and at 1,091 px/s. Both land 0.1 s ahead, nearest
    // the 200 px detent.
    expect(land(60)).toBe(200);
    expect(land(55)).toBe(200);
  });

  it('closes the sheet on a slow touch drag only past halfway from the lowest detent to closed', () => {
    const drag = (to: number) => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      // Settle on the 200 px detent first.
      touchDown(hook, 0, 0, t);
      move(hook, 90, 300, t);
      move(hook, 180, 700, t);
      up(hook, 180, 1100, t);
      // Then a slow drag down at 225 px/s, too slow to project, in ten even
      // steps.
      touchDown(hook, 200, 2000, t);
      const step = (to - 200) / 10;
      for (let i = 1; i <= 10; i += 1) {
        move(hook, 200 + step * i, 2000 + (step / 0.225) * i, t);
      }
      up(hook, to, 2000 + (step / 0.225) * 10 + 2, t);
      return onDismiss.mock.calls.length;
    };
    // Closed is at 400 px, so halfway from the 200 px detent is 300 px.
    expect(drag(290)).toBe(0);
    expect(drag(310)).toBe(1);
  });

  it('cancels a touch release thrown back toward where the drag began', () => {
    const {hook, onDismiss} = setup(); // one detent; closed at 400 px
    const t = makeTarget();
    // Slowly most of the way down, then 30 px back up at 1,000 px/s. Its
    // landing (230 px) is past halfway to closed, but it moves back.
    touchDown(hook, 0, 0, t);
    for (let i = 1; i <= 9; i += 1) {
      move(hook, i * 40, i * 200, t);
    }
    move(hook, 345, 1815, t);
    move(hook, 330, 1830, t);
    up(hook, 330, 1832, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(0);
  });

  it("springs a gentle touch throw back where UIKit's sheet does", () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    // 60 px at 300 px/s lands 0.1 s ahead at 90 px, nearer the 0 px detent
    // than the 200 px one.
    touchDown(hook, 0, 0, t);
    move(hook, 30, 100, t);
    move(hook, 60, 200, t);
    up(hook, 60, 202, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(0);
  });

  it('settles to the nearest detent on a slow drag', () => {
    const onSnap = vi.fn();
    const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    // Detents: full=400 (offset 0) and 200 (offset 200). Drag slowly to ~180
    // offset -> nearest is the 200px detent (offset 200).
    down(hook, 0, 0, t);
    move(hook, 90, 300, t);
    move(hook, 180, 700, t);
    up(hook, 180, 1100, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSnap).toHaveBeenLastCalledWith(200);
    expect(hook.result.current.settledOffset).toBe(200);
  });

  it('excludes the offscreen block-end reserve from visible detent heights', () => {
    const onSnap = vi.fn();
    const {hook} = setup({
      snapHeights: () => [200],
      offscreenBlockEndInset: 48,
      onSnap,
    });
    const t = makeTarget();

    // The 400px border box has 352px visible. A 200px visible detent therefore
    // rests at offset 152, not 200; the 48px reserve remains below the viewport.
    down(hook, 0, 0, t);
    move(hook, 150, 700, t);
    up(hook, 150, 1100, t);

    expect(hook.result.current.settledOffset).toBe(152);
    expect(onSnap).toHaveBeenLastCalledWith(200);
  });

  it('keeps the full layout height at the peek detent', () => {
    // Three detents on the 400px sheet: full (0), mid 240 (offset 160), and
    // the 80px peek (offset 320).
    const {hook} = setup({snapHeights: () => [80, 240]});
    const t = makeTarget();

    // Settle at the mid detent: the scrolling area takes that travel as
    // layout height.
    down(hook, 0, 0, t);
    move(hook, 150, 700, t);
    up(hook, 150, 1100, t);
    expect(hook.result.current.settledOffset).toBe(160);
    expect(hook.result.current.settledLayoutOffset).toBe(160);

    // Settle at the peek: a glance state keeps the sheet's full layout height
    // and slides it below the viewport, so no layout travel is reported.
    down(hook, 150, 2000, t);
    move(hook, 310, 2700, t);
    up(hook, 310, 3100, t);
    expect(hook.result.current.settledOffset).toBe(320);
    expect(hook.result.current.settledLayoutOffset).toBe(0);
  });

  it('re-anchors to the same stop when the snap heights change at rest', () => {
    const onDismiss = vi.fn();
    const hook = renderHook(
      (props: UseSheetGesturesOptions) => useSheetGestures(props),
      {
        initialProps: {
          isOpen: true,
          onDismiss,
          snapHeights: () => [200],
        },
      },
    );
    const t = makeTarget();

    // Settle on the one collapsed stop: 400 - 200 = 200px of travel.
    down(hook, 0, 0, t);
    move(hook, 180, 700, t);
    up(hook, 180, 1100, t);
    act(() => hook.result.current.completeScrollAreaSettle());
    expect(hook.result.current.settledOffset).toBe(200);

    // A new resolver is a new set of stops. The sheet is resting on the one it
    // names, so it follows: a 150px stop is 250px of travel. The resolver is
    // read during render, not from a passive effect — the re-anchor runs in a
    // layout effect, which would otherwise still see the previous one.
    hook.rerender({
      isOpen: true,
      onDismiss,
      snapHeights: () => [150],
    });

    expect(hook.result.current.settledOffset).toBe(250);
    expect(hook.result.current.settledLayoutOffset).toBe(250);
  });

  it('resizes the scrolling area at a collapsed stop that is a working height', () => {
    // A 200px stop on the 400px sheet is half of it: the scrolling area takes
    // that travel as layout height rather than sliding the sheet away.
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 180, 700, t);
    up(hook, 180, 1100, t);
    expect(hook.result.current.settledOffset).toBe(200);
    expect(hook.result.current.settledLayoutOffset).toBe(200);
  });

  it('treats the only collapsed stop as a peek when it is a sliver', () => {
    // 60px of a 400px sheet is inside the quarter that makes a peek, so the
    // sheet keeps its full layout height and slides below the viewport.
    const {hook} = setup({snapHeights: () => [60]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 320, 700, t);
    up(hook, 320, 1100, t);
    expect(hook.result.current.settledOffset).toBe(340);
    expect(hook.result.current.settledLayoutOffset).toBe(0);
  });

  it('uses the visible shortest detent height for the dismiss overshoot', () => {
    const {hook, onDismiss} = setup({
      snapHeights: () => [200],
      offscreenBlockEndInset: 48,
    });
    const t = makeTarget();

    // Visible full height is 352px, so the 200px stop is offset 152. Its 40%
    // dismiss overshoot ends at 232px; the hidden reserve must not extend it.
    down(hook, 0, 0, t);
    move(hook, 235, 1000, t);
    up(hook, 235, 2000, t);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('a downward drag from a middle detent never snaps back up past it', () => {
    // Three detents on a 600px sheet: full (offset 0), mid 360 (offset 240),
    // short 160 (offset 440). Rest at the mid detent, then drag DOWN a modest
    // amount that's still closer to mid than to short. It must not snap back
    // UP to full — only to mid (stay) or further down.
    const onSnap = vi.fn();
    const {hook} = setup({snapHeights: () => [160, 360], onSnap});
    const t = makeTarget();
    t.getBoundingClientRect = () => ({height: 600}) as DOMRect;
    // Drag to the mid detent (offset 240).
    down(hook, 0, 0, t);
    move(hook, 120, 300, t);
    move(hook, 240, 700, t);
    up(hook, 240, 1100, t);
    expect(hook.result.current.settledOffset).toBe(240);
    onSnap.mockClear();
    // Small slow drag DOWN from mid: offset 240 -> ~300.
    down(hook, 300, 2000, t);
    move(hook, 340, 2200, t);
    move(hook, 360, 2600, t);
    up(hook, 360, 3000, t);
    // Must not have jumped back up to full (offset 0).
    expect(hook.result.current.settledOffset).not.toBe(0);
    expect(hook.result.current.settledOffset).toBeGreaterThanOrEqual(240);
  });

  it('dismisses when dragged well below the shortest detent', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    // Shortest detent offset = 200 (height 200). Drag slowly past it by
    // >40% of 200 -> offset ~320 dismisses.
    down(hook, 0, 0, t);
    move(hook, 160, 400, t);
    move(hook, 330, 900, t);
    up(hook, 330, 1400, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('rebounds to the shortest detent when canDismiss is false', () => {
    const onScrimOpacity = vi.fn();
    const {hook, onDismiss} = setup({
      canDismiss: false,
      snapHeights: () => [200],
      onScrimOpacity,
    });
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 160, 400, t);
    move(hook, 330, 900, t);
    up(hook, 330, 1400, t);

    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(200);
    // Rebounding restores the scrim the 200px stop rests under — full, since
    // half a sheet is a working surface rather than a glance.
    expect(onScrimOpacity).toHaveBeenLastCalledWith(1);
  });

  it('fades the scrim from full toward the peek floor as it collapses onto the peek detent', () => {
    const onScrimOpacity = vi.fn();
    // Sheet 400, stops at 300 and a 60px sliver -> offsets [0, 100, 340]. The
    // fade spans the mid detent (offset 100) to the peek (offset 340): full
    // at/above 100, thinned to the peek floor (0.3) at/below 340.
    const {hook} = setup({snapHeights: () => [60, 300], onScrimOpacity});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 60, 200, t); // offset 60, above the mid detent -> full
    move(hook, 220, 600, t); // offset 220, halfway -> between 1 and 0.3 (~0.65)
    move(hook, 360, 1000, t); // offset 360, past the peek -> peek floor
    const values = onScrimOpacity.mock.calls.map(c => Number(c[0]));
    expect(values[0]).toBe(1);
    expect(values[1]).toBeGreaterThan(0.55);
    expect(values[1]).toBeLessThan(0.75);
    expect(values[values.length - 1]).toBeCloseTo(0.3);
  });

  it('thins the scrim to the peek floor when settled at the peek detent (still modal)', () => {
    const onScrimOpacity = vi.fn();
    const {hook} = setup({snapHeights: () => [60, 300], onScrimOpacity});
    const t = makeTarget();
    // Slow drag down to the peek detent (offset 340).
    down(hook, 0, 0, t);
    move(hook, 170, 400, t);
    move(hook, 340, 900, t);
    up(hook, 340, 1400, t);
    expect(hook.result.current.settledOffset).toBe(340);
    // Last reported opacity (on settle) is the peek floor, not fully hidden —
    // the sheet is still modal, so the backdrop keeps a minimum dim.
    const values = onScrimOpacity.mock.calls.map(c => Number(c[0]));
    expect(values[values.length - 1]).toBeCloseTo(0.3);
  });

  it('magnetically settles the live drag onto a nearby detent', () => {
    // Detents for a 400px sheet with snaps 300 and 200 -> visible-height snaps
    // become offsets [0, 100, 200]. Approaching the middle detent (offset 100)
    // from just below (raw ~90) — inside MAGNET_RANGE and BELOW the shortest
    // detent so the between-detents magnet applies — should ease toward 100.
    const {hook} = setup({snapHeights: () => [200, 300]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 90, 100, t); // raw offset 90, 10px from the 100 detent
    const off = liveOffset(hook);
    expect(off).toBeGreaterThan(90); // pulled up toward 100
    expect(off).toBeLessThanOrEqual(100);
  });

  it('translates the surface live during a drag', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 50, 100, t);
    expect(liveOffset(hook)).toBe(50);
    expect(hook.result.current.isDragging).toBe(true);
    // Written to the element, not rendered: the move costs one style write
    // and no commit.
    expect(t.style.transform).toBe('translateY(50px)');
  });

  it('renders nothing for a move that keeps the layout split', () => {
    let renders = 0;
    const onDismiss = vi.fn();
    const hook = renderHook(
      (props: UseSheetGesturesOptions) => {
        renders += 1;
        return useSheetGestures(props);
      },
      {initialProps: {isOpen: true, onDismiss, snapHeights: () => [200]}},
    );
    const t = makeTarget();
    down(hook, 0, 0, t);
    const rendersAtDown = renders;
    move(hook, 30, 50, t);
    move(hook, 60, 100, t);
    move(hook, 90, 150, t);
    expect(t.style.transform).toBe('translateY(90px)');
    // One render announces that the sheet is traveling; the moves after it
    // render nothing.
    expect(renders - rendersAtDown).toBeLessThanOrEqual(1);
  });

  it('restores the full layout height when a drag crosses above its base', () => {
    const onSnap = vi.fn();
    const {hook} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    // Rest at the 200px working detent: the sheet gives 200px up as layout.
    down(hook, 0, 0, t);
    move(hook, 200, 400, t);
    up(hook, 200, 800, t);
    expect(hook.result.current.settledLayoutOffset).toBe(200);
    // Drag back up above the base: the layout split changes, and that one
    // render carries the offset the host pairs with the new height.
    down(hook, 200, 1000, t);
    move(hook, 150, 1100, t);
    expect(liveOffset(hook)).toBe(150);
    expect(liveOffset(hook)).toBe(150);
    expect(t.style.transform).toBe('translateY(150px)');
  });

  it('returns to the settled detent when a context menu interrupts a drag', () => {
    const onScrimOpacity = vi.fn();
    const {hook, onDismiss} = setup({
      snapHeights: () => [200, 300],
      onScrimOpacity,
    });
    const target = makeTarget();
    down(hook, 0, 0, target);
    move(hook, 300, 1000, target);

    const preventDefault = vi.fn();
    act(() =>
      hook.result.current.handleProps.onContextMenu({
        currentTarget: target,
        preventDefault,
      } as unknown as React.MouseEvent),
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isDragging).toBe(false);
    expect(hook.result.current.contentProps.style.transform).toBeUndefined();
    expect(onScrimOpacity).toHaveBeenLastCalledWith(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('returns to the settled detent when pointer capture is lost', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const target = makeTarget();
    down(hook, 0, 0, target);
    move(hook, 300, 1000, target);

    act(() =>
      hook.result.current.handleProps.onLostPointerCapture(
        pointerEvent(300, 1000, target),
      ),
    );

    expect(hook.result.current.isDragging).toBe(false);
    expect(hook.result.current.contentProps.style.transform).toBeUndefined();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  describe('pinch', () => {
    // A second finger is a pinch, and pinch-zoom belongs to the browser.
    it('declares pinch-zoom on the sliding surface and the handle', () => {
      const {hook} = setup();
      expect(hook.result.current.contentProps.style.touchAction).toBe(
        'pinch-zoom',
      );
      expect(hook.result.current.handleProps.style.touchAction).toBe(
        'pinch-zoom',
      );
    });

    it('returns to the settled detent when a second finger lands on the handle', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const target = makeTarget();
      down(hook, 0, 0, target);
      move(hook, 120, 200, target);
      expect(hook.result.current.isDragging).toBe(true);

      act(() =>
        hook.result.current.handleProps.onPointerDown(
          pointerEvent(160, 220, target, 2, 0, false),
        ),
      );

      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.contentProps.style.transform).toBeUndefined();
      // The first finger's later release is not a drag either.
      up(hook, 300, 400, target);
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('returns to the detent when the browser cancels a handle drag to take a pinch', () => {
      const onSnap = vi.fn();
      const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
      const target = makeTarget();
      down(hook, 0, 0, target);
      // Fast enough that settling from here would throw the sheet away.
      move(hook, 60, 20, target);
      act(() =>
        hook.result.current.handleProps.onPointerCancel(
          pointerEvent(60, 22, target),
        ),
      );
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.contentProps.style.transform).toBeUndefined();
      expect(onDismiss).not.toHaveBeenCalled();
      expect(onSnap).not.toHaveBeenCalled();
    });

    it('returns a handle drag to its detent when a second finger lands off the sheet', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const target = makeTarget();
      down(hook, 0, 0, target);
      move(hook, 40, 100, target);
      expect(hook.result.current.isDragging).toBe(true);
      act(() =>
        hook.result.current.handleProps.onTouchMove({
          currentTarget: target,
          touches: [
            {identifier: 1, clientY: 40},
            {identifier: 2, clientY: -60},
          ],
        } as unknown as React.TouchEvent),
      );
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.contentProps.style.transform).toBeUndefined();
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('drops an armed body pull when a second pointer lands on the body', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeTarget();
      act(() => hook.result.current.sheetRef(body));
      act(() =>
        hook.result.current.bodyProps.onPointerDown(pointerEvent(0, 0, body)),
      );
      act(() =>
        hook.result.current.bodyProps.onPointerDown(
          pointerEvent(80, 10, body, 2, 0, false),
        ),
      );
      act(() =>
        hook.result.current.bodyProps.onPointerMove(
          pointerEvent(60, 100, body),
        ),
      );
      expect(hook.result.current.isDragging).toBe(false);
    });
  });

  it('does not start a drag from a secondary pointer button', () => {
    const {hook} = setup();
    const target = makeTarget();
    act(() => hook.result.current.sheetRef(target));

    act(() =>
      hook.result.current.handleProps.onPointerDown(
        pointerEvent(0, 0, target, 1, 2),
      ),
    );

    expect(hook.result.current.isDragging).toBe(false);
  });

  it('rubber-bands an upward drag past the fully-open position', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 100, 0, t);
    move(hook, 20, 100, t); // drag up 80px past the top of a rested-at-top sheet
    // Overscroll is allowed but damped: a resisted fraction of the raw -80,
    // and negative (above the top), not the raw distance and not clamped to 0.
    const off = liveOffset(hook);
    expect(off).toBeLessThan(0);
    expect(off).toBeGreaterThan(-80); // resisted, so smaller in magnitude
  });

  it('stretches a finger pulling up past the top on the rubber band, the same on every pull, with no cap', () => {
    const {hook} = setup({
      snapHeights: () => [200],
      offscreenBlockEndInset: TOUCH_RESERVE,
    });
    const t = makeTarget();
    const stretches = [0, 1, 2].map(i =>
      handlePull(hook, t, 300, i * 2000, 'touch'),
    );
    // The band runs over the sheet's visible height: 400 px less its reserve
    // below the screen.
    const expected = rubberBand(300, SHEET_HEIGHT - TOUCH_RESERVE);
    expect(expected).toBeGreaterThan(48);
    for (const stretch of stretches) {
      expect(stretch).toBeCloseTo(expected, 6);
    }
    expect(hook.result.current.settledOffset).toBe(0);
  });

  it('never stretches a finger past the reserve below the screen', () => {
    // A touch device's reserve covers the whole band. Where the reserve is
    // short, the stretch stops at it, so the page never shows.
    const {hook} = setup({
      snapHeights: () => [200],
      offscreenBlockEndInset: 20,
    });
    const t = makeTarget();
    expect(rubberBand(1000, 380)).toBeGreaterThan(20);
    expect(handlePull(hook, t, 1000, 0, 'touch')).toBe(20);
  });

  it('keeps a mouse or a pen pulling up past the top on its own stretch, capped at 48 px', () => {
    const {hook} = setup({
      snapHeights: () => [200],
      offscreenBlockEndInset: 48,
    });
    const t = makeTarget();
    expect(handlePull(hook, t, 80, 0, 'mouse')).toBeCloseTo(28, 6);
    expect(handlePull(hook, t, 300, 2000, 'mouse')).toBe(48);
    expect(handlePull(hook, t, 80, 4000, 'pen')).toBeCloseTo(28, 6);
    expect(handlePull(hook, t, 300, 6000, 'pen')).toBe(48);
  });

  it('dismisses a single-height sheet on a slow drag past the floor', () => {
    const {hook, onDismiss} = setup(); // no snapHeights
    const t = makeTarget();
    // Only detent is the full 400px height (offset 0). A slow drag past 40%
    // of it (>160px) with no detent to catch it dismisses.
    down(hook, 0, 0, t);
    move(hook, 120, 400, t);
    move(hook, 240, 900, t);
    up(hook, 240, 1400, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  describe('a dismissal the host refuses', () => {
    // The host answers a dismissal through `isOpenRequested`: it stays true
    // when a guarded `onOpenChange` keeps the sheet open (a confirmation
    // asks before a changed draft is discarded). The panel then rests on its
    // detent again, and the scrim the drag thinned toward the dismiss line
    // must rest with it.
    it('restores the full scrim of a sheet resting fully open', () => {
      const onScrimOpacity = vi.fn();
      const {hook, onDismiss} = setup({
        snapHeights: () => [200],
        onScrimOpacity,
      });
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 160, 400, t);
      move(hook, 330, 900, t);
      // The live drag has thinned the scrim past the shortest detent.
      expect(onScrimOpacity.mock.lastCall?.[0]).toBeLessThan(1);
      // The release asks to close; `isOpen` stays true, so the host refused.
      up(hook, 330, 1400, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(hook.result.current.settledOffset).toBe(0);
      expect(hook.result.current.isDismissedByTouchDrag).toBe(false);
      expect(onScrimOpacity).toHaveBeenLastCalledWith(1);
    });

    it('restores the thinned scrim of a sheet resting at its peek', () => {
      const onScrimOpacity = vi.fn();
      // Sheet 400, stops at 300 and a 60px sliver -> offsets [0, 100, 340];
      // the sliver is a peek, which rests under the peek floor (0.3).
      const {hook, onDismiss} = setup({
        snapHeights: () => [60, 300],
        onScrimOpacity,
      });
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 170, 400, t);
      move(hook, 340, 900, t);
      up(hook, 340, 1400, t);
      expect(hook.result.current.settledOffset).toBe(340);
      // From the peek, a slow pull past the dismiss line asks to close.
      down(hook, 340, 2000, t);
      move(hook, 380, 2400, t);
      move(hook, 420, 2900, t);
      up(hook, 420, 3400, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(hook.result.current.settledOffset).toBe(340);
      expect(Number(onScrimOpacity.mock.lastCall?.[0])).toBeCloseTo(0.3);
    });

    it('leaves the thinned scrim alone when the host takes the dismissal', () => {
      const onScrimOpacity = vi.fn();
      const onDismiss = vi.fn();
      // A host that takes the close: its controlled state answers in the
      // same update the release asked in.
      const hook = renderHook(() => {
        const [isOpenRequested, setIsOpenRequested] = useState(true);
        return useSheetGestures({
          isOpen: true,
          isOpenRequested,
          onDismiss: () => {
            onDismiss();
            setIsOpenRequested(false);
          },
          snapHeights: () => [200],
          onScrimOpacity,
        });
      });
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 160, 400, t);
      move(hook, 330, 900, t);
      const thinned = onScrimOpacity.mock.lastCall?.[0];
      expect(thinned).toBeLessThan(1);
      up(hook, 330, 1400, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
      // The host's exit owns the scrim from here, so the hook writes nothing
      // more.
      expect(onScrimOpacity.mock.lastCall?.[0]).toBe(thinned);
    });
  });

  describe('body overscroll', () => {
    // A scrollable body element nested inside the sheet, with a settable
    // scrollTop so we can simulate "at the top" vs "scrolled".
    function makeBody(scrollTop: number) {
      const body = document.createElement('div');
      Object.defineProperty(body, 'scrollTop', {
        value: scrollTop,
        writable: true,
      });
      body.setPointerCapture = vi.fn();
      body.releasePointerCapture = vi.fn();
      body.getBoundingClientRect = () => ({height: SHEET_HEIGHT}) as DOMRect;
      return body;
    }
    function bodyDown(hook: Hook, y: number, t: number, el: HTMLElement) {
      // Register a sheet element so the hook can measure height (it reads the
      // tracked node, not the DOM). The body stands in with the right height.
      act(() => hook.result.current.sheetRef(el));
      act(() =>
        hook.result.current.bodyProps.onPointerDown(pointerEvent(y, t, el)),
      );
    }
    function bodyMove(hook: Hook, y: number, t: number, el: HTMLElement) {
      act(() =>
        hook.result.current.bodyProps.onPointerMove(pointerEvent(y, t, el)),
      );
    }

    it('promotes a top-overscroll pull-down into a sheet drag', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(0); // at the top
      bodyDown(hook, 0, 0, body);
      bodyMove(hook, 40, 100, body); // pull down while at the top
      expect(hook.result.current.isDragging).toBe(true);
      expect(liveOffset(hook)).toBe(40);
    });

    /**
     * A finger is never still. Tapping a control inside the sheet drifts a
     * pixel or two, and with no slop that drift promoted to a sheet drag —
     * which wrote `transition: none` onto the panel across the release, so the
     * close the tap triggered cut instead of animating. That is the "the sheet
     * closes with no animation" report: only on a tap, and only on a tap
     * inside the sheet (the scrim never arms a drag).
     */
    it('treats a few pixels of finger drift as a tap, not a drag', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(0); // at the top, where a pull-down would promote
      bodyDown(hook, 0, 0, body);
      bodyMove(hook, 3, 40, body); // the drift of a finger tapping a button
      expect(hook.result.current.isDragging).toBe(false);
      // and nothing suppressed the panel's transition, so a close that lands
      // now still animates
      expect(hook.result.current.contentProps.style.transition).toBeUndefined();
    });

    it('still promotes once the pull passes the tap slop', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(0);
      bodyDown(hook, 0, 0, body);
      bodyMove(hook, 9, 40, body); // just past the 8px slop
      expect(hook.result.current.isDragging).toBe(true);
    });

    it('does not hijack scrolling when the body is scrolled down', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(120); // scrolled, not at the top
      bodyDown(hook, 0, 0, body);
      bodyMove(hook, 40, 100, body);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('does not start a drag on an upward move from the top', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(0);
      bodyDown(hook, 100, 0, body);
      bodyMove(hook, 60, 100, body); // moving up = scrolling intent
      expect(hook.result.current.isDragging).toBe(false);
    });
  });

  describe('body touch handoff', () => {
    // Attach a real DOM node via the body ref, then dispatch touch events. The
    // hook's non-passive touchmove listener is how the handoff works on touch
    // devices (pointer events get cancelled once native panning starts).
    function makeScroller(opts: {
      scrollTop: number;
      clientHeight: number;
      scrollHeight: number;
    }) {
      const sheet = makeTarget();
      const el = document.createElement('div');
      Object.defineProperty(el, 'scrollTop', {
        value: opts.scrollTop,
        writable: true,
      });
      Object.defineProperty(el, 'clientHeight', {value: opts.clientHeight});
      Object.defineProperty(el, 'scrollHeight', {value: opts.scrollHeight});
      el.getBoundingClientRect = () => ({height: SHEET_HEIGHT}) as DOMRect;
      sheet.appendChild(el);
      document.body.appendChild(sheet);
      return el;
    }
    function touch(
      el: HTMLElement,
      type: string,
      y: number,
      id = 1,
      touchType = 'direct',
      time?: number,
      x = 0,
    ) {
      const ev = new Event(type, {bubbles: true, cancelable: true});
      // jsdom lacks TouchEvent; attach the fields the handler reads.
      Object.defineProperty(ev, 'changedTouches', {
        value: [{identifier: id, clientX: x, clientY: y, touchType}],
      });
      if (time != null) {
        Object.defineProperty(ev, 'timeStamp', {value: time});
      }
      Object.defineProperty(ev, 'touches', {
        value:
          type === 'touchend' || type === 'touchcancel'
            ? []
            : [{identifier: id, clientX: x, clientY: y, touchType}],
      });
      Object.defineProperty(ev, 'currentTarget', {value: el});
      el.dispatchEvent(ev);
      return ev;
    }

    it('promotes a top pull-down (touch) into a sheet drag', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      act(() => {
        touch(el, 'touchstart', 0);
        touch(el, 'touchmove', 50);
      });
      expect(hook.result.current.isDragging).toBe(true);
    });

    it('cancels the native pan of a top pull-down past a tap wobble, before the drag begins', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      let wobble!: Event;
      let pull!: Event;
      let promoted!: Event;
      act(() => {
        touch(el, 'touchstart', 0);
        wobble = touch(el, 'touchmove', 3);
      });
      // A tap's wobble keeps its click: nothing is cancelled yet.
      expect(wobble.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
      act(() => {
        pull = touch(el, 'touchmove', 6);
      });
      // Past the wobble the pan is cancelled while the drag waits for its slop.
      expect(pull.defaultPrevented).toBe(true);
      expect(hook.result.current.isDragging).toBe(false);
      act(() => {
        promoted = touch(el, 'touchmove', 9);
      });
      expect(promoted.defaultPrevented).toBe(true);
      expect(hook.result.current.isDragging).toBe(true);
    });

    it('cancels the native pan of a top pull-down whose first move is exactly the wobble distance', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      let under!: Event;
      act(() => {
        touch(el, 'touchstart', 0);
        under = touch(el, 'touchmove', 4);
      });
      expect(under.defaultPrevented).toBe(false);
      let first!: Event;
      act(() => {
        touch(el, 'touchend', 4);
        touch(el, 'touchstart', 0, 2);
        // iOS Safari commits a kept first move of 5 px to the rows' pan.
        first = touch(el, 'touchmove', 5, 2);
      });
      expect(first.defaultPrevented).toBe(true);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('leaves a mostly sideways move at the top to a horizontal scroll, cancelling nothing', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      let sideways!: Event;
      act(() => {
        touch(el, 'touchstart', 0, 1, 'direct', undefined, 0);
        // A swipe along a row of chips that drifts 7 px down.
        sideways = touch(el, 'touchmove', 7, 1, 'direct', undefined, 30);
      });
      expect(sideways.defaultPrevented).toBe(false);
    });

    it('leaves an upward move from the top to the scroll, cancelling nothing', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      let scroll!: Event;
      act(() => {
        touch(el, 'touchstart', 100);
        scroll = touch(el, 'touchmove', 94);
      });
      expect(scroll.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('cancels the native pan of a bottom pull-up past a tap wobble, before the drag begins', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 600,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      // Settle at the lower detent first, so expanding has somewhere to go.
      down(hook, 0, 0, el);
      move(hook, 180, 700, el);
      up(hook, 180, 1100, el);
      expect(hook.result.current.settledOffset).toBe(200);
      let wobble!: Event;
      let pull!: Event;
      act(() => {
        touch(el, 'touchstart', 300);
        wobble = touch(el, 'touchmove', 297);
      });
      expect(wobble.defaultPrevented).toBe(false);
      act(() => {
        pull = touch(el, 'touchmove', 294);
      });
      expect(pull.defaultPrevented).toBe(true);
      expect(hook.result.current.isDragging).toBe(false);
      act(() => {
        touch(el, 'touchmove', 291);
      });
      expect(hook.result.current.isDragging).toBe(true);
    });

    it('promotes a bottom pull-up (touch) into a sheet drag that travels', () => {
      const {hook} = setup({snapHeights: () => [200]});
      // scrolled to the bottom: scrollTop + clientHeight === scrollHeight
      const el = makeScroller({
        scrollTop: 600,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      // Settle at the lower detent first, so expanding has somewhere to go.
      down(hook, 0, 0, el);
      move(hook, 180, 700, el);
      up(hook, 180, 1100, el);
      expect(hook.result.current.settledOffset).toBe(200);

      act(() => {
        touch(el, 'touchstart', 300);
        touch(el, 'touchmove', 250); // pull up
      });
      expect(hook.result.current.isDragging).toBe(true);
      // The handoff is only worth taking if the sheet follows the finger:
      // 50px of pull expands 50px toward the tallest detent.
      expect(liveOffset(hook)).toBe(150);
    });

    it("lands a content pull-down flick by the touch events' own timestamps", () => {
      const onSnap = vi.fn();
      const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      // 17.6px every 16ms = 1,100 px/s, a flick, dispatched all at once, so
      // only the events' own timestamps carry the speed. Its 0.1 s projection
      // stops at 180px, so the flick goes one position down, to 200px.
      act(() => {
        touch(el, 'touchstart', 0, 1, 'direct', 0);
        for (let k = 1; k <= 4; k += 1) {
          touch(el, 'touchmove', 17.6 * k, 1, 'direct', 16 * k);
        }
        touch(el, 'touchend', 70.4, 1, 'direct', 66);
      });
      expect(onDismiss).not.toHaveBeenCalled();
      expect(onSnap).toHaveBeenLastCalledWith(200);
    });

    it('stretches the sheet with a pull up past a list already at its end, at the tallest detent, without claiming the touch', () => {
      const {hook} = setup({
        snapHeights: () => [200],
        offscreenBlockEndInset: TOUCH_RESERVE,
      });
      const el = makeScroller({
        scrollTop: 600,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      expect(hook.result.current.settledOffset).toBe(0);

      let first: Event | undefined;
      let past: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 300);
        first = touch(el, 'touchmove', 250); // the pull starts at the end
        past = touch(el, 'touchmove', 150);
      });
      // The rest of the pull past the end stretches the sheet. The list keeps
      // its touch, so a reversal can scroll it back.
      expect(hook.result.current.isDragging).toBe(true);
      expect(-liveOffset(hook)).toBeCloseTo(
        rubberBand(100, SHEET_HEIGHT - TOUCH_RESERVE),
        6,
      );
      expect(first?.defaultPrevented).toBe(false);
      expect(past?.defaultPrevented).toBe(false);
    });

    it('does not preventDefault a bottom pull-up at the tallest detent', () => {
      // The captured gesture was the worse half of the bug: once promoted,
      // every later touchmove was preventDefault()ed, so reversing downward to
      // scroll back collapsed the sheet instead of scrolling.
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 600,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));

      let pullUp: Event | undefined;
      let reverseDown: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 300);
        pullUp = touch(el, 'touchmove', 250);
        reverseDown = touch(el, 'touchmove', 400);
      });
      expect(pullUp?.defaultPrevented).toBe(false);
      expect(reverseDown?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('stretches the sheet on every pull up at the tallest detent when its content fits', () => {
      const {hook} = setup({
        snapHeights: () => [200],
        offscreenBlockEndInset: TOUCH_RESERVE,
      });
      // Nothing to scroll: the content fits its box.
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 200,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      expect(hook.result.current.settledOffset).toBe(0);
      for (let i = 0; i < 3; i += 1) {
        let pull: Event | undefined;
        act(() => {
          touch(el, 'touchstart', 300);
          touch(el, 'touchmove', 250);
          pull = touch(el, 'touchmove', 150);
        });
        // The content has no scroll to give the pull, so the sheet takes it.
        expect(pull?.defaultPrevented).toBe(true);
        // 150 px past the top, on the rubber band over the visible height.
        expect(-liveOffset(hook)).toBeCloseTo(
          rubberBand(150, SHEET_HEIGHT - TOUCH_RESERVE),
          6,
        );
        act(() => {
          touch(el, 'touchend', 150);
        });
        expect(hook.result.current.isDragging).toBe(false);
        expect(hook.result.current.settledOffset).toBe(0);
      }
    });

    it("keeps a stylus pulling up on the body at the tallest detent on a pen's stretch, capped at 48 px", () => {
      const {hook} = setup({
        snapHeights: () => [200],
        offscreenBlockEndInset: TOUCH_RESERVE,
      });
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 200,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      // An Apple Pencil raises touch events marked `stylus`.
      act(() => {
        touch(el, 'touchstart', 300, 1, 'stylus');
        touch(el, 'touchmove', 260, 1, 'stylus');
        touch(el, 'touchmove', 220, 1, 'stylus');
      });
      expect(-liveOffset(hook)).toBeCloseTo(28, 6);
      act(() => {
        touch(el, 'touchmove', 0, 1, 'stylus');
      });
      expect(-liveOffset(hook)).toBe(48);
      act(() => {
        touch(el, 'touchend', 0, 1, 'stylus');
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('finishes the active drag when another ended touch is listed first', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      act(() => {
        touch(el, 'touchstart', 0, 2);
        touch(el, 'touchmove', 300, 2);

        const end = new Event('touchend', {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(end, 'changedTouches', {
          value: [
            {identifier: 1, clientY: 100},
            {identifier: 2, clientY: 300},
          ],
        });
        Object.defineProperty(end, 'touches', {value: []});
        el.dispatchEvent(end);
      });

      expect(hook.result.current.isDragging).toBe(false);
    });

    function secondFinger(el: HTMLElement, y: number, firstY: number) {
      const ev = new Event('touchstart', {bubbles: true, cancelable: true});
      Object.defineProperty(ev, 'changedTouches', {
        value: [{identifier: 2, clientY: y}],
      });
      Object.defineProperty(ev, 'touches', {
        value: [
          {identifier: 1, clientY: firstY},
          {identifier: 2, clientY: y},
        ],
      });
      Object.defineProperty(ev, 'currentTarget', {value: el});
      el.dispatchEvent(ev);
    }

    it('leaves a pinch at the top to the browser', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      let pull: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 100);
        secondFinger(el, 140, 100);
        // The spread carries the second finger down past the promotion slop.
        pull = touch(el, 'touchmove', 160, 2);
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('returns a pull in flight to its detent when a second finger lands', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      act(() => {
        touch(el, 'touchstart', 0);
        touch(el, 'touchmove', 50);
      });
      expect(hook.result.current.isDragging).toBe(true);

      let after: Event | undefined;
      act(() => {
        secondFinger(el, 120, 50);
        after = touch(el, 'touchmove', 90);
        touch(el, 'touchend', 90);
      });
      expect(after?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.contentProps.style.transform).toBeUndefined();
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('leaves a pinch to the browser when the body finger lands first and the second lands on the handle', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      const handle = makeTarget();
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      let pull: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 100);
        hook.result.current.handleProps.onPointerDown(
          pointerEvent(20, 10, handle, 2, 0, false),
        );
        // The spread carries the body finger down past the promotion slop.
        pull = touch(el, 'touchmove', 160);
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('leaves a pinch to the browser when the second finger lands off the body', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      let pull: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 100);
        // No listener here saw the second finger arrive; `touches` lists it.
        const ev = new Event('touchmove', {bubbles: true, cancelable: true});
        Object.defineProperty(ev, 'changedTouches', {
          value: [{identifier: 1, clientY: 160}],
        });
        Object.defineProperty(ev, 'touches', {
          value: [
            {identifier: 1, clientY: 160},
            {identifier: 2, clientY: 20},
          ],
        });
        Object.defineProperty(ev, 'currentTarget', {value: el});
        el.dispatchEvent(ev);
        pull = ev;
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('leaves native scrolling alone in the middle of the content', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 300,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      act(() => {
        touch(el, 'touchstart', 300);
        touch(el, 'touchmove', 250);
      });
      expect(hook.result.current.isDragging).toBe(false);
    });
  });

  describe('body touch handoff from a nested scroller', () => {
    // A host that scrolls content in a box of its own inside the body (a
    // pinned header and footer around a scrolling middle, a grid) never moves
    // the body's scrollTop. The edge that decides the handoff is the edge of
    // the box under the finger, not the body's.
    function makeNested(opts: {
      bodyScrollTop: number;
      bodyScrollHeight?: number;
      innerScrollTop: number;
      innerScrollHeight?: number;
    }) {
      const sheet = makeTarget();
      const body = document.createElement('div');
      Object.defineProperty(body, 'scrollTop', {
        value: opts.bodyScrollTop,
        writable: true,
      });
      Object.defineProperty(body, 'clientHeight', {value: 400});
      Object.defineProperty(body, 'scrollHeight', {
        value: opts.bodyScrollHeight ?? 400,
      });
      body.getBoundingClientRect = () => ({height: SHEET_HEIGHT}) as DOMRect;
      const inner = document.createElement('div');
      inner.style.overflowY = 'auto';
      Object.defineProperty(inner, 'scrollTop', {
        value: opts.innerScrollTop,
        writable: true,
      });
      Object.defineProperty(inner, 'clientHeight', {value: 200});
      Object.defineProperty(inner, 'scrollHeight', {
        value: opts.innerScrollHeight ?? 800,
      });
      const tile = document.createElement('button');
      inner.appendChild(tile);
      body.appendChild(inner);
      sheet.appendChild(body);
      document.body.appendChild(sheet);
      return {body, inner, tile};
    }
    function touchOn(
      target: HTMLElement,
      listener: HTMLElement,
      type: string,
      y: number,
      id = 1,
    ) {
      const ev = new Event(type, {bubbles: true, cancelable: true});
      Object.defineProperty(ev, 'changedTouches', {
        value: [{identifier: id, clientX: 0, clientY: y}],
      });
      Object.defineProperty(ev, 'touches', {
        value:
          type === 'touchend' || type === 'touchcancel'
            ? []
            : [{identifier: id, clientX: 0, clientY: y}],
      });
      Object.defineProperty(ev, 'currentTarget', {value: listener});
      target.dispatchEvent(ev);
      return ev;
    }

    it('leaves a pull-down to a nested scroller that is scrolled', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {body, tile} = makeNested({bodyScrollTop: 0, innerScrollTop: 120});
      act(() => hook.result.current.sheetRef(body));
      act(() => hook.result.current.bodyProps.ref(body));
      let pull: Event | undefined;
      act(() => {
        touchOn(tile, body, 'touchstart', 100);
        pull = touchOn(tile, body, 'touchmove', 160);
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('promotes a pull-down from the top of a nested scroller', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {body, tile} = makeNested({bodyScrollTop: 0, innerScrollTop: 0});
      act(() => hook.result.current.sheetRef(body));
      act(() => hook.result.current.bodyProps.ref(body));
      let pull: Event | undefined;
      act(() => {
        touchOn(tile, body, 'touchstart', 100);
        pull = touchOn(tile, body, 'touchmove', 160);
      });
      expect(pull?.defaultPrevented).toBe(true);
      expect(hook.result.current.isDragging).toBe(true);
      expect(liveOffset(hook)).toBe(60);
      expect(body.style.transform).toBe('translateY(60px)');
    });

    it('chains to a scrolled body before the sheet when the nested box is at its top', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {body, tile} = makeNested({
        bodyScrollTop: 80,
        bodyScrollHeight: 900,
        innerScrollTop: 0,
      });
      act(() => hook.result.current.sheetRef(body));
      act(() => hook.result.current.bodyProps.ref(body));
      let pull: Event | undefined;
      act(() => {
        touchOn(tile, body, 'touchstart', 100);
        pull = touchOn(tile, body, 'touchmove', 160);
      });
      // The browser scrolls the body back up; the sheet's turn has not come.
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('reads the body when the nested box has nothing to scroll', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {body, tile} = makeNested({
        bodyScrollTop: 0,
        innerScrollTop: 0,
        innerScrollHeight: 200,
      });
      act(() => hook.result.current.sheetRef(body));
      act(() => hook.result.current.bodyProps.ref(body));
      act(() => {
        touchOn(tile, body, 'touchstart', 100);
        touchOn(tile, body, 'touchmove', 160);
      });
      expect(hook.result.current.isDragging).toBe(true);
    });

    it('leaves a touch that starts inside a nested <dialog> to that layer', () => {
      // A sheet opened from this sheet's content renders its <dialog> inside
      // the body, so its touches bubble here. The same pull-down from the
      // body's own content promotes (see above); from the nested layer it
      // must not.
      const {hook} = setup({snapHeights: () => [200]});
      const {body} = makeNested({
        bodyScrollTop: 0,
        innerScrollTop: 0,
        innerScrollHeight: 200,
      });
      const nested = document.createElement('dialog');
      const nestedHandle = document.createElement('div');
      nested.appendChild(nestedHandle);
      body.appendChild(nested);
      act(() => hook.result.current.sheetRef(body));
      act(() => hook.result.current.bodyProps.ref(body));
      let start: Event | undefined;
      let pull: Event | undefined;
      act(() => {
        start = touchOn(nestedHandle, body, 'touchstart', 100);
        pull = touchOn(nestedHandle, body, 'touchmove', 160);
      });
      expect(start?.defaultPrevented).toBe(false);
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
      expect(liveOffset(hook)).toBe(0);
      expect(body.style.transform).toBe('');
    });

    it('leaves a pull-up to a nested scroller with content below', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {body, tile} = makeNested({bodyScrollTop: 0, innerScrollTop: 100});
      act(() => hook.result.current.sheetRef(body));
      act(() => hook.result.current.bodyProps.ref(body));
      // Rest at the lower detent, so an expanding handoff would have somewhere
      // to go if the body's edge were read.
      down(hook, 0, 0, body);
      move(hook, 180, 700, body);
      up(hook, 180, 1100, body);
      expect(hook.result.current.settledOffset).toBe(200);
      let pull: Event | undefined;
      act(() => {
        touchOn(tile, body, 'touchstart', 300);
        pull = touchOn(tile, body, 'touchmove', 250);
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('arms the pointer path on the nested scroller too', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {body, tile} = makeNested({bodyScrollTop: 0, innerScrollTop: 120});
      act(() => hook.result.current.sheetRef(body));
      const over = (y: number, t: number) => {
        const ev = pointerEvent(y, t, body);
        Object.defineProperty(ev, 'target', {value: tile});
        return ev;
      };
      act(() => hook.result.current.bodyProps.onPointerDown(over(0, 0)));
      act(() => hook.result.current.bodyProps.onPointerMove(over(40, 100)));
      expect(hook.result.current.isDragging).toBe(false);
    });
  });

  describe('body touch handoff mid-gesture', () => {
    // The reported bug: the finger lands mid-content, swipes up, REACHES the
    // end of the content, and keeps pulling in the same continuous gesture.
    // Arming decided at touchstart can never see that, and by the time the
    // scroller is at its end the browser owns the gesture — every remaining
    // touchmove is non-cancelable, so preventDefault() is not available to
    // promote with. These cases pin the anchored, cancel-free handoff instead.
    function makeScroller(opts: {
      scrollTop: number;
      clientHeight: number;
      scrollHeight: number;
    }) {
      const sheet = makeTarget();
      const el = document.createElement('div');
      Object.defineProperty(el, 'scrollTop', {
        value: opts.scrollTop,
        writable: true,
      });
      Object.defineProperty(el, 'clientHeight', {value: opts.clientHeight});
      Object.defineProperty(el, 'scrollHeight', {value: opts.scrollHeight});
      el.getBoundingClientRect = () => ({height: SHEET_HEIGHT}) as DOMRect;
      sheet.appendChild(el);
      document.body.appendChild(sheet);
      return el;
    }
    function touch(el: HTMLElement, type: string, y: number, id = 1) {
      const ev = new Event(type, {bubbles: true, cancelable: true});
      Object.defineProperty(ev, 'changedTouches', {
        value: [{identifier: id, clientX: 0, clientY: y}],
      });
      Object.defineProperty(ev, 'touches', {
        value:
          type === 'touchend' || type === 'touchcancel'
            ? []
            : [{identifier: id, clientX: 0, clientY: y}],
      });
      Object.defineProperty(ev, 'currentTarget', {value: el});
      el.dispatchEvent(ev);
      return ev;
    }
    // A scroller with 600px of scrollable content, resting one detent down so
    // an upward pull has somewhere to expand to.
    function midDetentScroller(hook: Hook, scrollTop: number) {
      const el = makeScroller({
        scrollTop,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      down(hook, 0, 0, el);
      move(hook, 180, 700, el);
      up(hook, 180, 1100, el);
      expect(hook.result.current.settledOffset).toBe(200);
      return el;
    }

    // iOS Safari raises PointerEvents for a finger under the SAME numeric id
    // it puts in `Touch.identifier`, so a drag the touch path starts is keyed
    // to a live pointer. WebKit takes that pointer's capture straight back,
    // and the `lostpointercapture` that follows used to cancel the drag one
    // event after it began — leaving the sheet inert for the rest of the pull
    // while the handle still worked. Every browser that keeps the two id
    // spaces apart hides this, which is why it only showed up on device.
    it('survives a lostpointercapture for the finger driving it', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 600); // parked at the content end
      act(() => {
        touch(el, 'touchstart', 500, 7);
        touch(el, 'touchmove', 450, 7); // promotes at the armed bottom edge
      });
      expect(hook.result.current.isDragging).toBe(true);
      act(() => {
        hook.result.current.bodyProps.onLostPointerCapture(
          pointerEvent(450, 0, el, 7), // same id as the touch: iOS does this
        );
      });
      expect(hook.result.current.isDragging).toBe(true);
      act(() => {
        touch(el, 'touchmove', 400, 7);
      });
      // 100px of pull past the touchstart, from the 200px detent.
      expect(liveOffset(hook)).toBe(100);
    });

    // `pointercancel` for that same finger arrives the moment WebKit claims
    // the gesture. Ending the drag on it settles the sheet mid-pull.
    it('does not end the touch drag on a pointercancel for that finger', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 600);
      act(() => {
        touch(el, 'touchstart', 500, 7);
        touch(el, 'touchmove', 450, 7);
      });
      act(() => {
        hook.result.current.bodyProps.onPointerCancel(
          pointerEvent(450, 0, el, 7),
        );
      });
      expect(hook.result.current.isDragging).toBe(true);
    });

    it('hands off when the content runs out under a moving finger', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 300); // finger lands mid-content
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 450; // the swipe scrolls the content...
        touch(el, 'touchmove', 350);
        el.scrollTop = 600; // ...until it runs out at the bottom
        touch(el, 'touchmove', 200); // the content ended here
        touch(el, 'touchmove', 150); // 50px BEYOND the end
      });
      expect(hook.result.current.isDragging).toBe(true);
      // Anchored where the content ran out, so only the 50px past it moves the
      // sheet. Anchoring at touchstart would have thrown it 350px instead.
      expect(liveOffset(hook)).toBe(150);
    });

    it('does not preventDefault the mid-gesture handoff', () => {
      // By this point in the gesture the events are non-cancelable anyway, and
      // there is nothing to cancel: the scroller is clamped at its end.
      // Claiming the gesture would only strand the content under the finger.
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 300);
      let atEnd: Event | undefined;
      let past: Event | undefined;
      let further: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 600;
        atEnd = touch(el, 'touchmove', 200);
        past = touch(el, 'touchmove', 150);
        further = touch(el, 'touchmove', 100);
      });
      expect(hook.result.current.isDragging).toBe(true);
      expect(atEnd?.defaultPrevented).toBe(false);
      expect(past?.defaultPrevented).toBe(false);
      expect(further?.defaultPrevented).toBe(false);
    });

    it('gives the gesture back when the finger returns to the content end', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 300);
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 600;
        touch(el, 'touchmove', 200); // the content ended here
        touch(el, 'touchmove', 150);
      });
      expect(liveOffset(hook)).toBe(150);

      act(() => {
        touch(el, 'touchmove', 210); // back below the anchor
      });
      // The native scroll was never cancelled, so it resumes from here. Two
      // things moving at once is the failure mode; the sheet yields.
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.settledOffset).toBe(200);

      act(() => {
        el.scrollTop = 600; // scrolled back to the end
        touch(el, 'touchmove', 190); // and pulls past it again
        touch(el, 'touchmove', 140);
      });
      expect(hook.result.current.isDragging).toBe(true);
      expect(liveOffset(hook)).toBe(150);
    });

    it('does not hand off on reaching the end without travelling past it', () => {
      // Landing on the last pixel is not a pull, and the momentum tail after
      // the finger lifts fires no touchmove at all, so it can never promote.
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 300);
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 600;
        touch(el, 'touchmove', 200);
        touch(el, 'touchmove', 199); // jitter, not a pull
        touch(el, 'touchend', 199);
        el.scrollTop = 600; // momentum carries on with no finger down
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.settledOffset).toBe(200);
    });

    it("stretches the sheet with the rest of a pull past a long list's end at the tallest detent", () => {
      // The list scrolls to its end first. The rest of the pull stretches the
      // sheet, and the list keeps its touch.
      const {hook} = setup({
        snapHeights: () => [200],
        offscreenBlockEndInset: TOUCH_RESERVE,
      });
      const el = makeScroller({
        scrollTop: 300,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));
      expect(hook.result.current.settledOffset).toBe(0);

      let past: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 600;
        touch(el, 'touchmove', 200);
        past = touch(el, 'touchmove', 100);
      });
      expect(hook.result.current.isDragging).toBe(true);
      expect(-liveOffset(hook)).toBeCloseTo(
        rubberBand(100, SHEET_HEIGHT - TOUCH_RESERVE),
        6,
      );
      expect(past?.defaultPrevented).toBe(false);
    });

    it('holds a list still at its end while the sheet takes the rest of the pull, and lets it go on lift', () => {
      // iOS rubber-bands a scroller past its end, even under `contain`. The
      // list and the sheet must not both move.
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 300,
        clientHeight: 200,
        scrollHeight: 800,
      });
      act(() => hook.result.current.sheetRef(el));
      act(() => hook.result.current.bodyProps.ref(el));

      act(() => {
        touch(el, 'touchstart', 500);
        touch(el, 'touchmove', 400); // still scrolling
      });
      expect(el.style.overscrollBehaviorY).toBe('');

      act(() => {
        el.scrollTop = 600;
        touch(el, 'touchmove', 200); // the content ended here
        touch(el, 'touchmove', 100);
      });
      expect(hook.result.current.isDragging).toBe(true);
      expect(el.style.overscrollBehaviorY).toBe('none');

      act(() => {
        touch(el, 'touchend', 100);
      });
      expect(el.style.overscrollBehaviorY).toBe('');
    });

    it('lets the list go when the finger comes back to the content end', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 300);
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 600;
        touch(el, 'touchmove', 200); // the content ended here
        touch(el, 'touchmove', 150);
      });
      expect(el.style.overscrollBehaviorY).toBe('none');

      act(() => {
        touch(el, 'touchmove', 210); // back below the anchor
      });
      // The list scrolls again from here, with its own bounce.
      expect(hook.result.current.isDragging).toBe(false);
      expect(el.style.overscrollBehaviorY).toBe('');
    });

    it('does not hand off while the content can still scroll', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = midDetentScroller(hook, 0);
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 200;
        touch(el, 'touchmove', 300);
        el.scrollTop = 400;
        touch(el, 'touchmove', 100); // 400px of pull, all of it scrolling
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.settledOffset).toBe(200);
    });
  });

  describe('viewport resize', () => {
    // The panel pins the sheet's height in px at a resizing detent; everywhere
    // else the height comes from CSS (`92dvh`), which follows the viewport.
    // Model both, so a measurement taken while pinned reads the pin back —
    // that is the trap the hook has to work around.
    const SNAP_FRACTIONS = [0.14, 0.5, 0.92];
    const RESERVED_BELOW_FLOOR = 48;

    function viewportHarness(initialViewport: number) {
      let viewport = initialViewport;
      const el = document.createElement('div');
      el.setPointerCapture = vi.fn();
      el.releasePointerCapture = vi.fn();
      el.getBoundingClientRect = () =>
        ({
          height: el.style.height
            ? Number.parseFloat(el.style.height)
            : 0.92 * viewport + RESERVED_BELOW_FLOOR,
        }) as DOMRect;

      const onSnap = vi.fn();
      const {hook} = setup({
        offscreenBlockEndInset: RESERVED_BELOW_FLOOR,
        snapHeights: () => SNAP_FRACTIONS.map(f => f * viewport),
        onSnap,
      });
      act(() => hook.result.current.sheetRef(el));

      // What BottomSheetPanel renders at rest.
      const paint = () => {
        const {sheetHeight, settledLayoutOffset} = hook.result.current;
        el.style.height =
          settledLayoutOffset > 0
            ? `${sheetHeight - settledLayoutOffset}px`
            : '';
      };
      const dragTo = (offset: number) => {
        // Anchor anywhere; what matters is the delta from where it rests, so
        // this drags in whichever direction the target detent lies.
        const anchor = 1000;
        const delta = offset - hook.result.current.settledOffset;
        act(() =>
          hook.result.current.handleProps.onPointerDown(
            pointerEvent(anchor, 0, el),
          ),
        );
        // Slow: well under the flick threshold, so the release settles.
        act(() =>
          hook.result.current.handleProps.onPointerMove(
            pointerEvent(anchor + delta, 2000, el),
          ),
        );
        act(() =>
          hook.result.current.handleProps.onPointerUp(
            pointerEvent(anchor + delta, 2400, el),
          ),
        );
        // The panel resolves the settle when the transform transition ends.
        act(() => hook.result.current.completeScrollAreaSettle());
        paint();
      };
      const resizeTo = (next: number) => {
        viewport = next;
        act(() => {
          window.dispatchEvent(new Event('resize'));
        });
        paint();
      };
      // What the user sees: the border box, less the part reserved below the
      // viewport floor and the part translated past it.
      const visibleHeight = () =>
        hook.result.current.sheetHeight -
        RESERVED_BELOW_FLOOR -
        hook.result.current.settledOffset;

      return {hook, el, onSnap, dragTo, resizeTo, visibleHeight};
    }

    it('re-resolves the settled detent against the new viewport', () => {
      // 900px viewport: detents at 0 / 378 / 702, so the half-height stop
      // shows 450px of sheet.
      const {hook, dragTo, resizeTo, visibleHeight, onSnap} =
        viewportHarness(900);
      dragTo(378);
      expect(hook.result.current.settledOffset).toBe(378);
      expect(visibleHeight()).toBe(450);

      resizeTo(600);

      // Still the half-height stop, now half of 600 — not the 450px (75% of
      // the window) it was frozen at before.
      expect(visibleHeight()).toBe(300);
      expect(hook.result.current.settledOffset).toBe(252);
      expect(onSnap).toHaveBeenLastCalledWith(300);
    });

    it('keeps the peek detent on screen when the viewport shrinks', () => {
      const {hook, dragTo, resizeTo, visibleHeight} = viewportHarness(900);
      dragTo(702);
      expect(hook.result.current.settledOffset).toBe(702);
      // The peek keeps its full height and slides, so its offset is the whole
      // of its travel — and 702px of travel does not fit in a 600px window.
      expect(hook.result.current.settledLayoutOffset).toBe(0);

      resizeTo(600);

      expect(hook.result.current.settledOffset).toBe(468);
      expect(hook.result.current.settledOffset).toBeLessThan(
        hook.result.current.sheetHeight,
      );
      expect(visibleHeight()).toBe(84);
    });

    it('refreshes the fully open height the next drag measures against', () => {
      const {hook, dragTo, resizeTo} = viewportHarness(900);
      dragTo(378);
      expect(hook.result.current.sheetHeight).toBe(876);

      resizeTo(600);

      // Measured through the pinned height the panel had written for the old
      // viewport, so this is the natural budget and not the stale pin.
      expect(hook.result.current.sheetHeight).toBe(600);

      // Dragging back up lands on fully open rather than overshooting past it
      // toward where fully open used to be.
      dragTo(0);
      expect(hook.result.current.settledOffset).toBe(0);
      expect(hook.result.current.settledLayoutOffset).toBe(0);
    });

    it('leaves a drag in progress alone', () => {
      const {hook, el} = viewportHarness(900);
      act(() =>
        hook.result.current.handleProps.onPointerDown(pointerEvent(0, 0, el)),
      );
      act(() =>
        hook.result.current.handleProps.onPointerMove(
          pointerEvent(200, 2000, el),
        ),
      );

      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      expect(hook.result.current.isDragging).toBe(true);
      expect(hook.result.current.sheetHeight).toBe(876);
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('stops re-resolving once the sheet closes', () => {
      const {hook, dragTo, resizeTo} = viewportHarness(900);
      dragTo(378);
      act(() => hook.rerender({isOpen: false, onDismiss: vi.fn()}));

      resizeTo(600);

      expect(hook.result.current.sheetHeight).toBe(876);
    });
  });
});
