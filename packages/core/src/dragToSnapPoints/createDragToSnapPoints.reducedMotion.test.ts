// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createDragToSnapPoints.reducedMotion.test.ts
 * @input vitest (jsdom, fake clock), the snap-point drag with its pan
 *   (gestures/createPan.ts) replaced by a stand-in that hands its pan events
 *   to the test, each with the input that drives it, Reduce
 *   Motion on with a fine primary pointer, a recording stand-in for
 *   Element.animate
 * @output Checks `design:reduced-motion` DR2 and DR3 for the snap-point
 *   drag's release (`spec:AST-107` FR2): a touch drag's release cross-fades
 *   into the snap point, a mouse or pen drag's release lands at once, and
 *   `settleTo` lands at once on a fine pointer
 * @position Testing; validates createDragToSnapPoints.ts's release plan
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PanEvent, PanOptions} from '../gestures/createPan';

let onPan: ((event: PanEvent) => void) | null = null;

vi.mock('../gestures/createPan', () => ({
  createPan: (_element: Element, options: PanOptions) => {
    onPan = options.onPan;
    return {destroy: () => {}};
  },
}));

const {createDragToSnapPoints} = await import('./createDragToSnapPoints');

interface Recorded {
  keyframes: Keyframe[];
}

const recorded: Recorded[] = [];
const originalMatchMedia = window.matchMedia;

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
  // Reduce Motion on, with a fine primary pointer.
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  HTMLElement.prototype.animate = function (keyframes: Keyframe[]) {
    let start: number | null = null;
    const animation = {
      get startTime() {
        return start;
      },
      set startTime(value: number | null) {
        start = value;
      },
      playState: 'running',
      ready: new Promise(() => {}),
      finish() {},
      cancel() {},
    };
    requestAnimationFrame(() => {
      start ??= performance.now();
    });
    recorded.push({keyframes: Array.isArray(keyframes) ? keyframes : []});
    return animation as unknown as Animation;
  };
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  vi.useRealTimers();
  recorded.length = 0;
  onPan = null;
  document.body.replaceChildren();
});

function drawer() {
  const element = document.createElement('div');
  document.body.append(element);
  const onSettle = vi.fn();
  const snap = createDragToSnapPoints(element, {
    axis: 'y',
    snapPoints: [0, 240, 480],
    onSettle,
  });
  return {element, onSettle, snap};
}

/**
 * A drag down by `dy` on `element` by `pointerType`, released at `vy` px/s:
 * the pan says which pointer drove it.
 */
function release(
  _element: HTMLElement,
  dy: number,
  vy: number,
  pointerType: 'touch' | 'mouse' | 'pen',
): void {
  const at = (state: PanEvent['state'], y: number, v: number) =>
    onPan?.({
      state,
      translation: {x: 0, y},
      totalTranslation: {x: 0, y},
      velocity: {x: 0, y: v},
      input: pointerType,
    });
  at('began', 0, 0);
  at('changed', dy, 0);
  at('ended', dy, vy);
}

const fades = () =>
  recorded.some(({keyframes}) =>
    keyframes.some(frame => frame.opacity !== undefined),
  );

/** Whether a recorded animation moves the element (FR2: no travel). */
const travels = () =>
  recorded.some(({keyframes}) => {
    const values = keyframes
      .map(frame => frame.translate)
      .filter(value => value !== undefined);
    return new Set(values).size > 1;
  });

describe('the release under Reduce Motion on a fine pointer (DR2, DR3)', () => {
  it('a touch drag\u2019s release cross-fades into the snap point', async () => {
    const {element, onSettle} = drawer();
    release(element, 300, 0, 'touch');
    expect(fades()).toBe(true);
    // It goes to its snap point without travel.
    expect(travels()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onSettle).toHaveBeenCalledWith(1);
  });

  it.each(['mouse', 'pen'] as const)(
    'a %s drag\u2019s release lands at once',
    async pointerType => {
      const {element, onSettle} = drawer();
      release(element, 300, 0, pointerType);
      expect(fades()).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(onSettle).toHaveBeenCalledWith(1);
    },
  );

  it('settleTo lands at once', async () => {
    const {onSettle, snap} = drawer();
    snap.settleTo(2);
    expect(fades()).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(onSettle).toHaveBeenCalledWith(2);
  });
});
