// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createSnapDrag.test.ts
 * @input vitest (jsdom, fake clock), the internal snap-point drag with its
 *   pan (createPan, gestures/createPanGesture.ts) replaced by a stand-in that hands its pan
 *   events to the test
 * @output Checks the options only Core passes. A model draws a drag one for
 *   one or on a spring, or leaves the element as it is inside a dead zone.
 *   A settle under the dead zone carries on until the model's first target
 *   catches it. A release or a cancel lands where the model says. After the
 *   snap points change, a cancel lands on the new list, mid-drag too, on the
 *   point the drag started on. A settle in flight re-aims at the new list,
 *   even under a drag that has not caught it, and never calls `onPass`
 *   twice. An empty list stops a settle where it is and ends a drag in
 *   progress. After `destroy`, new snap points change nothing. An x drag can
 *   draw into a custom property instead of `translate`, and a y drag that
 *   asks for one warns.
 * @position Testing; validates createSnapDrag (createDragToSnapPoints.ts)
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {
  PanEvent,
  PanInput,
  PanOptions,
} from '../gestures/createPanGesture';

let onPan: ((event: PanEvent) => void) | null = null;
let recognizer: PanOptions['recognizer'];

vi.mock('../gestures/createPanGesture', () => ({
  createPan: (_element: Element, options: PanOptions) => {
    onPan = options.onPan;
    recognizer = options.recognizer;
    return {destroy: () => {}};
  },
}));

const {createSnapDrag} = await import('./createDragToSnapPoints');

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
});

afterEach(() => {
  vi.useRealTimers();
  onPan = null;
  document.body.innerHTML = '';
});

function pan(
  state: PanEvent['state'],
  x: number,
  {velocity = 0, input = 'touch'}: {velocity?: number; input?: PanInput} = {},
) {
  onPan?.({
    state,
    translation: {x, y: 0},
    totalTranslation: {x: x + Math.sign(x) * 8, y: 0},
    velocity: {x: velocity, y: 0},
    input,
  });
}

function element() {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
}

const PROPERTY = {name: '--test-travel', syntax: '<length>'} as const;
const travel = (node: HTMLElement) =>
  node.style.getPropertyValue(PROPERTY.name);

describe('createSnapDrag (the options only Core passes)', () => {
  it('hands the pan its own options', () => {
    const node = element();
    createSnapDrag(node, {
      axis: 'x',
      snapPoints: [0, 100],
      onSettle: () => {},
      pan: {allowedPointerTypes: ['touch', 'pen'], hysteresis: 8},
    });
    expect(recognizer).toEqual({
      allowedPointerTypes: ['touch', 'pen'],
      hysteresis: 8,
    });
  });

  it('draws the drag into a custom property, one for one, instead of translate', () => {
    const node = element();
    createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-100, 0],
      onSettle: () => {},
      customProperty: PROPERTY,
    });
    pan('began', 0);
    pan('changed', -40);
    expect(travel(node)).toBe('-40px');
    expect(node.style.getPropertyValue('translate')).toBe('');
  });

  it('warns that a y drag draws nothing into a custom property', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      createSnapDrag(element(), {
        axis: 'y',
        snapPoints: [0, 100],
        onSettle: () => {},
        customProperty: PROPERTY,
      });
      expect(warn).toHaveBeenCalledWith(
        'createSnapDrag: customProperty draws the x axis only, so this y drag draws nothing.',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('leaves the element as it is while the model says so, then follows its targets', () => {
    const node = element();
    const move = vi.fn((drag: {translation: number}) =>
      Math.abs(drag.translation) < 20 ? null : {offset: drag.translation / 2},
    );
    createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-100, 0],
      onSettle: () => {},
      customProperty: PROPERTY,
      model: {move},
    });
    pan('began', 0);
    pan('changed', -10);
    expect(travel(node)).toBe('');
    pan('changed', -60);
    expect(travel(node)).toBe('-30px');
    expect(move).toHaveBeenCalledTimes(3);
  });

  it('starts a drag’s spring target on the drag’s clock, never waiting for the browser’s start', () => {
    // A call from rest waits for the browser's start; the next move would
    // replace it before WebKit starts it, each restarting from rest.
    const node = element();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-100, 0],
      onSettle: () => {},
      customProperty: PROPERTY,
      model: {
        move: drag => ({
          offset: drag.translation,
          spring: {mass: 1, stiffness: 300, damping: 35},
        }),
      },
    });
    const animate = vi.spyOn(snap.animator, 'animate');
    pan('began', 0);
    pan('changed', -30);
    expect(animate).toHaveBeenLastCalledWith(
      {x: -30},
      {spring: {mass: 1, stiffness: 300, damping: 35}},
      {at: performance.now()},
    );
  });

  it('lands a release where the model says, with the drag’s input', async () => {
    const node = element();
    const onSettle = vi.fn();
    const release = vi.fn(() => ({index: 0}));
    createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-100, 0],
      onSettle,
      customProperty: PROPERTY,
      model: {release},
    });
    pan('began', 0, {input: 'scroll'});
    pan('changed', -30, {input: 'scroll'});
    pan('ended', -30, {input: 'scroll', velocity: -400});
    expect(release).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'scroll',
        translation: -30,
        velocity: -400,
      }),
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(onSettle).toHaveBeenCalledWith(0);
    expect(travel(node)).toBe('-100px');
  });

  it('lets the model land a cancelled drag, or nothing', async () => {
    const node = element();
    const onSettle = vi.fn();
    const cancel = vi.fn(() => null);
    createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-100, 0],
      onSettle,
      customProperty: PROPERTY,
      model: {cancel},
    });
    pan('began', 0);
    pan('changed', -30);
    pan('cancelled', -30);
    expect(cancel).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onSettle).not.toHaveBeenCalled();
    expect(travel(node)).toBe('-30px');
  });

  it('lands a cancelled drag on the new snap points after they change', async () => {
    const node = element();
    const onSettle = vi.fn();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, -100, 0],
      onSettle,
      customProperty: PROPERTY,
    });
    snap.setSnapPoints([-80, 0]);
    pan('began', 0);
    pan('changed', -30);
    pan('cancelled', -30);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).toHaveBeenLastCalledWith(1);
    expect(snap.animator.get('x')).toBe(0);
  });

  it('lands a cancelled drag on the new snap points when they change mid-drag', async () => {
    const node = element();
    const onSettle = vi.fn();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, -100, 0],
      onSettle,
      customProperty: PROPERTY,
    });
    pan('began', 0);
    pan('changed', -30);
    snap.setSnapPoints([-80, 0]);
    pan('cancelled', -30);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).toHaveBeenLastCalledWith(1);
    expect(snap.animator.get('x')).toBe(0);
  });

  it('re-aims a settle in flight at the new snap point nearest where it was heading', async () => {
    const node = element();
    const onSettle = vi.fn();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, -100, 0],
      onSettle,
      customProperty: PROPERTY,
    });
    snap.settleTo(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(snap.animator.get('x')).toBeLessThan(0);
    expect(snap.animator.get('x')).toBeGreaterThan(-100);
    // -100 is gone: the nearest new point to it is -120.
    snap.setSnapPoints([-120, 0]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenLastCalledWith(0);
    expect(snap.animator.get('x')).toBeCloseTo(-120, 1);
  });

  it('calls a re-aimed settle\u2019s onPass once when it had already called back', async () => {
    const node = element();
    const onSettle = vi.fn();
    const call = vi.fn();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, -100, 0],
      onSettle,
      customProperty: PROPERTY,
    });
    snap.settleTo(0, {onPass: {offset: -20, direction: -1, call}});
    await vi.advanceTimersByTimeAsync(150);
    expect(call).toHaveBeenCalledTimes(1);
    expect(snap.animator.get('x')).toBeGreaterThan(-150);
    // -200 is gone: the settle re-aims at -150, still past the offset.
    snap.setSnapPoints([-150, 0]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(call).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenLastCalledWith(0);
    expect(snap.animator.get('x')).toBeCloseTo(-150, 1);
  });

  it('re-aims a settle that a drag inside its dead zone has not caught', async () => {
    const node = element();
    const onSettle = vi.fn();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, -100, 0],
      onSettle,
      customProperty: PROPERTY,
      model: {
        move: drag =>
          Math.abs(drag.translation) < 20
            ? null
            : {offset: drag.start + drag.translation},
      },
    });
    snap.settleTo(0);
    await vi.advanceTimersByTimeAsync(50);
    // A finger held 5 px into the 20 px dead zone: the settle runs on.
    pan('began', 0);
    pan('changed', -5);
    snap.setSnapPoints([-80, 0]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).toHaveBeenLastCalledWith(0);
    expect(snap.animator.get('x')).toBeCloseTo(-80, 1);
  });

  it('lands a cancelled drag that caught a settle on its target after the snap points change', async () => {
    const node = element();
    const onSettle = vi.fn();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, -100, 0],
      onSettle,
      customProperty: PROPERTY,
    });
    snap.settleTo(0);
    await vi.advanceTimersByTimeAsync(3000);
    snap.settleTo(2);
    await vi.advanceTimersByTimeAsync(30);
    // The drag catches the settle short of -100, on its way to 0.
    pan('began', 0);
    pan('changed', -1);
    expect(snap.animator.get('x')).toBeLessThan(-100);
    snap.setSnapPoints([-200, -100, 0]);
    pan('cancelled', -1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).toHaveBeenLastCalledWith(2);
    expect(snap.animator.get('x')).toBeCloseTo(0, 1);
  });

  it('stops a settle where it is when the snap points empty, and reports nothing', async () => {
    const node = element();
    const onSettle = vi.fn();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, 0],
      onSettle,
      customProperty: PROPERTY,
    });
    snap.settleTo(0);
    await vi.advanceTimersByTimeAsync(50);
    const at = snap.animator.get('x');
    expect(at).toBeLessThan(0);
    expect(at).toBeGreaterThan(-200);
    snap.setSnapPoints([]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).not.toHaveBeenCalled();
    expect(snap.animator.get('x')).toBeCloseTo(at, 1);
  });

  it('ignores new snap points after destroy', async () => {
    const node = element();
    const onSettle = vi.fn();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, 0],
      onSettle,
      customProperty: PROPERTY,
    });
    snap.settleTo(0);
    await vi.advanceTimersByTimeAsync(50);
    const at = snap.animator.get('x');
    snap.destroy();
    expect(() => snap.setSnapPoints([-80, 0])).not.toThrow();
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).not.toHaveBeenCalled();
    expect(snap.animator.get('x')).toBeCloseTo(at, 1);
  });

  it('ends a drag in progress when the snap points empty', async () => {
    const node = element();
    const onSettle = vi.fn();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-100, 0],
      onSettle,
      customProperty: PROPERTY,
    });
    pan('began', 0);
    pan('changed', -30);
    snap.setSnapPoints([]);
    snap.setSnapPoints([-100, 0]);
    // The same touch moves on and lifts: the ended drag draws and lands
    // nothing.
    pan('changed', -60);
    pan('ended', -60, {velocity: -500});
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).not.toHaveBeenCalled();
    expect(snap.animator.get('x')).toBeCloseTo(-30, 1);
  });

  it('lands a cancel on the re-aimed point after a dead-zone drag', async () => {
    const node = element();
    const onSettle = vi.fn();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, -100, 0],
      onSettle,
      customProperty: PROPERTY,
      model: {
        move: drag =>
          Math.abs(drag.translation) < 20
            ? null
            : {offset: drag.start + drag.translation},
      },
    });
    snap.settleTo(0);
    await vi.advanceTimersByTimeAsync(50);
    pan('began', 0);
    pan('changed', -5);
    snap.setSnapPoints([-80, 0]);
    pan('cancelled', -5);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSettle).toHaveBeenLastCalledWith(0);
    expect(snap.animator.get('x')).toBeCloseTo(-80, 1);
  });

  it('does nothing for settleTo after the snap points empty, with a dev warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const onSettle = vi.fn();
      const snap = createSnapDrag(element(), {
        axis: 'x',
        snapPoints: [-100, 0],
        onSettle,
        customProperty: PROPERTY,
      });
      snap.setSnapPoints([]);
      expect(snap.settleTo(0)).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(onSettle).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('settles on a snap point with the spring and velocity it is given, and returns its motion', async () => {
    const node = element();
    const onSettle = vi.fn();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [0, -100],
      onSettle,
      customProperty: PROPERTY,
    });
    expect(snap.snapPoints()).toEqual([-100, 0]);
    const handle = snap.settleTo(0, {
      spring: {mass: 1, stiffness: 600, damping: 49},
      velocity: -300,
    });
    expect(handle).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(onSettle).toHaveBeenCalledWith(0);
    snap.setSnapPoints([0, -50]);
    expect(snap.snapPoints()).toEqual([-50, 0]);
  });
});

describe('createSnapDrag: a settle that passes an offset calls back (internal)', () => {
  /** Runs animation frames on the fake clock. */
  const frames = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  it('calls back once, on the first frame whose presented value has passed the offset', async () => {
    const node = element();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, 0],
      onSettle: () => {},
      customProperty: PROPERTY,
    });
    const call = vi.fn();
    const handle = snap.settleTo(0, {
      onPass: {offset: -150, direction: -1, call},
    });
    expect(handle).not.toBeNull();
    // Not before the curve gets there.
    await frames(16);
    const passedAt = (() => {
      for (let t = 0; t <= 3000; t += 1) {
        if ((handle?.value('x', performance.now() + t) ?? 0) <= -150) {
          return t;
        }
      }
      return Number.NaN;
    })();
    expect(passedAt).toBeGreaterThan(16);
    expect(call).not.toHaveBeenCalled();
    await frames(3000);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('calls back on the next frame when the element is past the offset already', async () => {
    const node = element();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, 0],
      onSettle: () => {},
      customProperty: PROPERTY,
    });
    snap.settleTo(0);
    await frames(3000);
    const call = vi.fn();
    snap.settleTo(0, {onPass: {offset: -150, direction: -1, call}});
    expect(call).not.toHaveBeenCalled();
    await frames(20);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('calls back once for a settle that starts past the offset and lands short', async () => {
    const node = element();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, -100, 0],
      onSettle: () => {},
      customProperty: PROPERTY,
    });
    snap.settleTo(0);
    await frames(3000);
    const call = vi.fn();
    // From -200, past -150, back to -100: the first frame is past it.
    snap.settleTo(1, {onPass: {offset: -150, direction: -1, call}});
    await frames(3000);
    expect(call).toHaveBeenCalledTimes(1);
    expect(travel(node)).toBe('-100px');
  });

  it('never calls back for a settle that lands short, one another settle replaces, or one a destroy ends', async () => {
    const node = element();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, -100, 0],
      onSettle: () => {},
      customProperty: PROPERTY,
    });
    const short = vi.fn();
    snap.settleTo(1, {onPass: {offset: -150, direction: -1, call: short}});
    await frames(3000);
    expect(short).not.toHaveBeenCalled();
    const replaced = vi.fn();
    snap.settleTo(0, {onPass: {offset: -190, direction: -1, call: replaced}});
    await frames(16);
    snap.settleTo(2);
    await frames(3000);
    expect(replaced).not.toHaveBeenCalled();
    const destroyed = vi.fn();
    snap.settleTo(0, {onPass: {offset: -50, direction: -1, call: destroyed}});
    snap.destroy();
    await frames(3000);
    expect(destroyed).not.toHaveBeenCalled();
  });

  it('never calls back for a settle a drag catches', async () => {
    const node = element();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, 0],
      onSettle: () => {},
      customProperty: PROPERTY,
    });
    const call = vi.fn();
    snap.settleTo(0, {onPass: {offset: -190, direction: -1, call}});
    await frames(16);
    pan('began', 0);
    pan('changed', 10);
    await frames(3000);
    expect(call).not.toHaveBeenCalled();
  });
});

describe('createSnapDrag: a companion drawn from the travel (internal)', () => {
  const COMPANION = {
    name: '--test-companion',
    syntax: '<number>' as const,
    map: (x: number) => Math.min(1, Math.max(0, -x / 100)),
  };

  it('writes the companion with the travel, one for one', () => {
    const node = element();
    createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-200, 0],
      onSettle: () => {},
      customProperty: {...PROPERTY, companion: COMPANION},
    });
    pan('began', 0);
    pan('changed', -40);
    expect(travel(node)).toBe('-40px');
    expect(node.style.getPropertyValue(COMPANION.name)).toBe('0.4');
    pan('changed', -150);
    expect(node.style.getPropertyValue(COMPANION.name)).toBe('1');
  });

  it('settles the companion with the travel in the same animation keyframes', async () => {
    const recorded: Keyframe[][] = [];
    const original = Element.prototype.animate as unknown;
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value(this: Element, keyframes: Keyframe[]) {
        recorded.push(keyframes);
        return {
          cancel() {},
          finished: Promise.resolve(),
          ready: Promise.resolve(),
          startTime: null,
          playState: 'running',
          effect: {getTiming: () => ({duration: 0})},
          addEventListener() {},
          removeEventListener() {},
        };
      },
    });
    try {
      const node = element();
      const snap = createSnapDrag(node, {
        axis: 'x',
        snapPoints: [-200, 0],
        onSettle: () => {},
        customProperty: {...PROPERTY, companion: COMPANION},
      });
      snap.settleTo(0);
      const travelKeyframes = recorded.find(frames =>
        frames.some(frame => frame[PROPERTY.name as keyof Keyframe] != null),
      );
      expect(travelKeyframes).toBeDefined();
      // Every keyframe carries both, the companion drawn from that
      // keyframe's travel.
      for (const frame of travelKeyframes ?? []) {
        const x = parseFloat(String(frame[PROPERTY.name as keyof Keyframe]));
        expect(Number(frame[COMPANION.name as keyof Keyframe])).toBeCloseTo(
          COMPANION.map(x),
          4,
        );
      }
    } finally {
      if (original == null) {
        delete (Element.prototype as {animate?: unknown}).animate;
      } else {
        Object.defineProperty(Element.prototype, 'animate', {
          configurable: true,
          value: original,
        });
      }
    }
  });
});
