// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createSnapDrag.test.ts
 * @input vitest (jsdom, fake clock), the internal snap-point drag with its
 *   pan (gestures/createPan.ts) replaced by a stand-in that hands its pan
 *   events to the test
 * @output Checks the options only Core passes (`spec:AST-107` FR4): a model
 *   draws a drag one for one or on a spring, leaves the element as it is
 *   inside a dead zone (a settle under it carries on until the model's
 *   first target catches it), lands a release or a cancel where it says, and
 *   the drag draws into a custom property instead of `translate`
 * @position Testing; validates createSnapDrag.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PanEvent, PanInput, PanOptions} from '../gestures/createPan';

let onPan: ((event: PanEvent) => void) | null = null;
let recognizer: PanOptions['recognizer'];

vi.mock('../gestures/createPan', () => ({
  createPan: (_element: Element, options: PanOptions) => {
    onPan = options.onPan;
    recognizer = options.recognizer;
    return {destroy: () => {}};
  },
}));

const {createSnapDrag} = await import('./createSnapDrag');

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

  it('starts a settle asked for in an input event’s own task at the next frame', () => {
    const node = element();
    const snap = createSnapDrag(node, {
      axis: 'x',
      snapPoints: [-100, 0],
      onSettle: () => {},
      customProperty: PROPERTY,
    });
    const animate = vi.spyOn(snap.animator, 'animate');
    snap.settleTo(0, {start: 'next-frame'});
    expect(animate).toHaveBeenLastCalledWith(
      {x: -100},
      expect.anything(),
      expect.objectContaining({start: 'next-frame'}),
    );
    snap.settleTo(1);
    expect(animate.mock.lastCall?.[2]).not.toHaveProperty('start');
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
