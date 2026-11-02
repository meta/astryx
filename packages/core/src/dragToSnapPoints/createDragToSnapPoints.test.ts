// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createDragToSnapPoints.test.ts
 * @input vitest (jsdom, fake clock), the release rule, the factory driven by
 *   touches through the document's gesture host, a recording stand-in for
 *   Element.animate
 * @output Checks `spec:AST-107` FR2 and FR6 for the factory: the nearest snap
 *   point after a slow release, the next one after a flick past
 *   `flickThreshold` and the default 1008 px/s, the starting one after a
 *   release moving back (`spec:AST-094` FR37) however far the drag went,
 *   `settleTo` from a key, `onSettle` once the element settles and never for
 *   an interrupted settle, bad snap points refused, and no listener left
 *   after `destroy`
 * @position Testing; validates createDragToSnapPoints.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {coarsePrimaryPointer} from '../gestures/__tests__/harness';
import type * as AnimatorModule from '../motion/animator';
import {resolveSnapPoint} from '../motion/resolveSnapPoint';
import {springs} from '../motion/uikit/springs';
import {
  createDragToSnapPoints,
  DEFAULT_FLICK_THRESHOLD,
} from './createDragToSnapPoints';

// Every animate call the factory's animator makes, as the factory made it.
const animates = vi.hoisted(
  () =>
    [] as {target: unknown; options: {spring?: unknown; velocity?: unknown}}[],
);
vi.mock('../motion/animator', async importOriginal => {
  const actual = await importOriginal<typeof AnimatorModule>();
  return {
    ...actual,
    createMotionAnimator: (
      ...args: Parameters<typeof actual.createMotionAnimator>
    ) => {
      const animator = actual.createMotionAnimator(...args);
      const animate = animator.animate.bind(animator);
      animator.animate = (target, options, ...rest) => {
        animates.push({target, options: {...options}});
        return animate(target, options, ...rest);
      };
      return animator;
    },
  };
});

const POINTS = [0, 240, 480];

// The factory settles where Core's one release policy says, called with
// the drag's start: these are FR2's and FR37's cases through that call.
describe('the release policy the factory calls (FR2, AST-094 FR37)', () => {
  const at = (offset: number, velocity: number, startIndex = 0) =>
    resolveSnapPoint({
      points: POINTS,
      position: offset,
      velocity,
      flickThreshold: DEFAULT_FLICK_THRESHOLD,
      start: POINTS[startIndex],
    }).index;

  it('a slow release settles on the nearest snap point', () => {
    expect(at(100, 300)).toBe(0);
    expect(at(130, 300)).toBe(1);
    expect(at(400, 0, 1)).toBe(2);
  });

  it('a release past the default flick speed carries to the next snap point in its direction', () => {
    expect(DEFAULT_FLICK_THRESHOLD).toBe(1008);
    expect(at(30, 1009)).toBe(1);
    expect(at(30, 1007)).toBe(0);
    expect(at(260, -1500, 2)).toBe(1);
  });

  it('flickThreshold changes the speed that carries', () => {
    expect(
      resolveSnapPoint({
        points: POINTS,
        position: 30,
        velocity: 600,
        flickThreshold: 500,
        start: 0,
      }).index,
    ).toBe(1);
  });

  it('a release moving back toward the start returns to the snap point it started from, however far it went', () => {
    expect(at(200, -50)).toBe(0);
    expect(at(470, -3000)).toBe(0);
    expect(at(10, 2000, 2)).toBe(2);
  });

  it('a flick past the last snap point stays on the last', () => {
    expect(at(500, 2000, 1)).toBe(2);
    expect(at(-20, -2000, 1)).toBe(0);
  });
});

interface Recorded {
  startTime: number | null;
  cancelled: boolean;
  readonly playState: string;
  ready: Promise<unknown>;
  finish(): void;
  cancel(): void;
}

let restorePointer: () => void = () => {};
const recorded: Recorded[] = [];

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'performance',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  restorePointer = coarsePrimaryPointer();
  HTMLElement.prototype.animate = function () {
    let start: number | null = null;
    const animation: Recorded = {
      get startTime() {
        return start;
      },
      set startTime(value) {
        start = value;
      },
      cancelled: false,
      get playState() {
        return this.cancelled ? 'idle' : 'running';
      },
      ready: new Promise(() => {}),
      finish() {},
      cancel() {
        this.cancelled = true;
      },
    };
    requestAnimationFrame(() => {
      if (start == null) {
        start = performance.now();
      }
    });
    recorded.push(animation);
    return animation as unknown as Animation;
  };
});

afterEach(() => {
  restorePointer();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  vi.useRealTimers();
  document.body.replaceChildren();
});

function touch(
  type: string,
  target: EventTarget,
  contact: {x: number; y: number},
  time: number,
  isLift = false,
): void {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const entry = {identifier: 1, clientX: contact.x, clientY: contact.y, target};
  Object.defineProperty(event, 'changedTouches', {value: [entry]});
  Object.defineProperty(event, 'touches', {value: isLift ? [] : [entry]});
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
}

// The document's host outlives a test, so event times only move forward.
let clock = 1_000_000;

/** A finger dragging down by `dy` in `steps` steps of `ms`, then lifting. */
function dragY(target: Element, dy: number, steps = 4, ms = 16): void {
  clock += 10_000;
  const start = clock;
  touch('touchstart', target, {x: 10, y: 10}, start);
  for (let step = 1; step <= steps; step++) {
    touch(
      'touchmove',
      target,
      {x: 10, y: 10 + (dy * step) / steps},
      start + step * ms,
    );
  }
  touch('touchend', target, {x: 10, y: 10 + dy}, start + steps * ms + 4, true);
}

function sheet(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe('createDragToSnapPoints', () => {
  it('a slow drag settles on the nearest snap point and reports it once settled', async () => {
    const element = sheet();
    const onSettle = vi.fn();
    const snap = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: POINTS,
      onSettle,
    });
    // 300 px over a second: slow, nearer 240 than 480.
    dragY(element, 300, 20, 50);
    expect(onSettle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith(1);
    snap.destroy();
  });

  it('a quick flick carries to the next snap point', async () => {
    const element = sheet();
    const onSettle = vi.fn();
    const snap = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: POINTS,
      onSettle,
    });
    // 100 px in 64 ms: about 1500 px/s, past 1008, yet nearer 0 than 240.
    dragY(element, 100);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).toHaveBeenCalledWith(1);
    snap.destroy();
  });

  it('flickThreshold sets the speed that carries a drag to the next snap point', async () => {
    // The same quick, short drag down from 0, released under the default
    // flick speed and past 600 px/s.
    const settle = async (flickThreshold?: number) => {
      const element = sheet();
      const onSettle = vi.fn();
      const snap = createDragToSnapPoints(element, {
        axis: 'y',
        snapPoints: POINTS,
        ...(flickThreshold == null ? {} : {flickThreshold}),
        onSettle,
      });
      animates.length = 0;
      dragY(element, 30, 3, 12);
      const release = (animates[0]?.options.velocity as {y: number}).y;
      await vi.advanceTimersByTimeAsync(3000);
      snap.destroy();
      element.remove();
      return {release, settled: onSettle.mock.calls.at(-1)?.[0] as unknown};
    };
    const byDefault = await settle();
    const at600 = await settle(600);
    expect(byDefault.release).toBeGreaterThan(600);
    expect(byDefault.release).toBeLessThan(DEFAULT_FLICK_THRESHOLD);
    expect(at600.release).toBeCloseTo(byDefault.release, 6);
    // Nearer 0 and under 1008 px/s: back to 0. Past 600: on to 240.
    expect(byDefault.settled).toBe(0);
    expect(at600.settled).toBe(1);
  });

  it('the settle starts at the release velocity, a commit and a spring-back alike (spec:AST-094 FR38)', async () => {
    const element = sheet();
    const snap = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: POINTS,
      onSettle: () => {},
    });
    // A flick down commits to the next snap point.
    animates.length = 0;
    dragY(element, 100);
    expect(animates).toHaveLength(1);
    const commit = animates[0];
    expect(commit.target).toEqual({y: 240});
    expect(commit.options.spring).toBe(springs.settle);
    const committed = (commit.options.velocity as {y: number}).y;
    expect(committed).toBeGreaterThan(DEFAULT_FLICK_THRESHOLD);
    await vi.advanceTimersByTimeAsync(3000);
    // From 240, down 120 px and back up 60 quickly: the spring-back to 240
    // starts at that upward speed.
    animates.length = 0;
    clock += 10_000;
    const start = clock;
    touch('touchstart', element, {x: 10, y: 10}, start);
    for (let step = 1; step <= 6; step++) {
      touch(
        'touchmove',
        element,
        {x: 10, y: 10 + 20 * step},
        start + step * 50,
      );
    }
    touch('touchmove', element, {x: 10, y: 90}, start + 316);
    touch('touchmove', element, {x: 10, y: 70}, start + 332);
    touch('touchend', element, {x: 10, y: 70}, start + 336, true);
    expect(animates).toHaveLength(1);
    const back = animates[0];
    expect(back.target).toEqual({y: 240});
    expect(back.options.spring).toBe(springs.settle);
    expect((back.options.velocity as {y: number}).y).toBeLessThan(0);
    snap.destroy();
  });

  it('settleTo settles without a drag, the keyboard path', async () => {
    const element = sheet();
    const onSettle = vi.fn();
    const snap = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: POINTS,
      onSettle,
    });
    snap.settleTo(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).toHaveBeenCalledWith(2);
    snap.destroy();
  });

  it('a settle interrupted by another reports only the last', async () => {
    const element = sheet();
    const onSettle = vi.fn();
    const snap = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: POINTS,
      onSettle,
    });
    snap.settleTo(2);
    await vi.advanceTimersByTimeAsync(50);
    snap.settleTo(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle.mock.calls).toEqual([[1]]);
    snap.destroy();
  });

  it('sorts the snap points before use', async () => {
    const element = sheet();
    const onSettle = vi.fn();
    const snap = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: [480, 0, 240],
      onSettle,
    });
    // 300 px over about a second: slow, nearer 240, the second snap point.
    dragY(element, 300, 20, 50);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).toHaveBeenCalledWith(1);
    snap.destroy();
  });

  it('an empty list does nothing and warns in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const element = sheet();
    const onSettle = vi.fn();
    const snap = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: [],
      onSettle,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    dragY(element, 300, 20, 50);
    snap.settleTo(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).not.toHaveBeenCalled();
    expect(element.style.translate).toBe('');
    snap.destroy();
    warn.mockRestore();
  });

  it('settleTo with an index outside the snap points does nothing and warns in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const element = sheet();
    const onSettle = vi.fn();
    const snap = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: POINTS,
      onSettle,
    });
    snap.settleTo(9);
    snap.settleTo(-1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
    snap.destroy();
    warn.mockRestore();
  });

  it('a drag created again starts where its predecessor left the element (spec:AST-107 FR2)', async () => {
    const element = sheet();
    const first = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: POINTS,
      onSettle: () => {},
    });
    first.settleTo(2);
    await vi.advanceTimersByTimeAsync(3000);
    first.destroy();
    // Re-created with new snap points (the handle has no update): a slow
    // 30 px drag moves on from 480, so it settles back on 480, not on 0.
    const onSettle = vi.fn();
    const again = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: [0, 240, 480, 720],
      onSettle,
    });
    animates.length = 0;
    dragY(element, 30, 10, 60);
    expect(animates.at(-1)?.target).toEqual({y: 480});
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).toHaveBeenCalledWith(2);
    again.destroy();
  });

  it('destroyed during a settle, the element stays where it was, not where the settle began (spec:AST-107 FR6)', async () => {
    const element = sheet();
    const snap = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: POINTS,
      onSettle: () => {},
    });
    snap.settleTo(2);
    await vi.advanceTimersByTimeAsync(150);
    snap.destroy();
    const [, y = '0'] = element.style.translate.split(' ');
    const at = Number.parseFloat(y);
    // Partway to 480, held there: neither back at 0 nor jumped to 480.
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(480);
  });

  it('destroyed mid-drag, the finger moves nothing and nothing reports (spec:AST-107 FR6)', async () => {
    const element = sheet();
    const onSettle = vi.fn();
    const snap = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: POINTS,
      onSettle,
    });
    clock += 10_000;
    const start = clock;
    touch('touchstart', element, {x: 10, y: 10}, start);
    for (let step = 1; step <= 4; step++) {
      touch(
        'touchmove',
        element,
        {x: 10, y: 10 + step * 20},
        start + step * 16,
      );
    }
    const during = element.style.translate;
    snap.destroy();
    for (let step = 5; step <= 8; step++) {
      touch(
        'touchmove',
        element,
        {x: 10, y: 10 + step * 20},
        start + step * 16,
      );
    }
    touch('touchend', element, {x: 10, y: 170}, start + 8 * 16 + 4, true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(element.style.translate).toBe(during);
    expect(onSettle).not.toHaveBeenCalled();
  });

  it('destroy removes every listener it added (spec:AST-107 FR6)', () => {
    const added = new Map<string, number>();
    const key = (target: EventTarget, type: string, capture: boolean) =>
      `${target === document ? 'document' : target === window ? 'window' : 'element'}:${type}:${capture}`;
    const captureOf = (options?: boolean | AddEventListenerOptions) =>
      typeof options === 'boolean' ? options : (options?.capture ?? false);
    const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const remove = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    const element = sheet();
    const snap = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: POINTS,
      onSettle: () => {},
    });
    for (const call of add.mock.calls) {
      const k = key(
        add.mock.contexts.at(add.mock.calls.indexOf(call)) as EventTarget,
        call[0],
        captureOf(call[2]),
      );
      added.set(k, (added.get(k) ?? 0) + 1);
    }
    expect(added.size).toBeGreaterThan(0);
    snap.destroy();
    for (const [index, call] of remove.mock.calls.entries()) {
      const k = key(
        remove.mock.contexts[index] as EventTarget,
        call[0],
        captureOf(call[2]),
      );
      added.set(k, (added.get(k) ?? 0) - 1);
    }
    expect([...added].filter(([, count]) => count !== 0)).toEqual([]);
    add.mockRestore();
    remove.mockRestore();
  });

  it('after destroy no drag moves the element and nothing reports', async () => {
    const element = sheet();
    const onSettle = vi.fn();
    const snap = createDragToSnapPoints(element, {
      axis: 'y',
      snapPoints: POINTS,
      onSettle,
    });
    snap.destroy();
    dragY(element, 300, 20, 50);
    snap.settleTo(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).not.toHaveBeenCalled();
    expect(element.style.translate).toBe('');
  });
});
