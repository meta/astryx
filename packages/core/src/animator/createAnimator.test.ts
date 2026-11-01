// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createAnimator.test.ts
 * @input vitest (jsdom, fake clock and frames), the public animator, a
 *   recording stand-in for Element.animate (jsdom runs no animations), the
 *   spring and decay math to check the curves against
 * @output Checks `spec:AST-107` FR3 and FR6 for the factory: every method and
 *   channel, `animate` on the `springs.stateChange` role with a given or
 *   on-screen velocity, `decay` on the normal deceleration, `set`, `get`,
 *   `getVelocity`, `stop`, `destroy`, the promises, Reduce Motion on a coarse
 *   and a fine pointer, and nothing internal on the handle
 * @position Testing; the compositor run is proven in
 *   __tests__/createAnimator.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {solveDecay} from '../motion/decay';
import {solveSpring, toSpring} from '../motion/spring';
import {springs} from '../motion/uikit/springs';
import {
  createAnimator,
  type AnimatorChannel,
  type AnimatorValues,
} from './createAnimator';

interface Recorded {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  startTime: number | null;
  cancelled: boolean;
  readonly playState: string;
  ready: Promise<unknown>;
  finish(): void;
  cancel(): void;
}

let recorded: Recorded[] = [];
const FRAME_MS = 16;

/** The person's settings, through matchMedia as the animator reads them. */
function stubMedia({reduced = false, coarse = false} = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion')
      ? reduced
      : query.includes('pointer: coarse')
        ? coarse
        : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  recorded = [];
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'performance',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  stubMedia();
  // Like a browser: a new animation starts at the next frame.
  HTMLElement.prototype.animate = function (keyframes, options) {
    let start: number | null = null;
    let resolveReady: () => void = () => {};
    const animation: Recorded = {
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      get startTime() {
        return start;
      },
      set startTime(value) {
        start = value;
        resolveReady();
      },
      cancelled: false,
      get playState() {
        return this.cancelled ? 'idle' : 'running';
      },
      ready: new Promise<void>(resolve => {
        resolveReady = resolve;
      }),
      finish() {},
      cancel() {
        this.cancelled = true;
      },
    };
    requestAnimationFrame(() => {
      if (start == null && !animation.cancelled) {
        start = performance.now();
        resolveReady();
      }
    });
    recorded.push(animation);
    return animation as unknown as Animation;
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  vi.useRealTimers();
});

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

/** The time the browser started the latest animation, after its frame. */
async function started(): Promise<number> {
  await advance(FRAME_MS);
  const start = recorded.at(-1)?.startTime;
  if (start == null) {
    throw new Error('no animation started');
  }
  return start;
}

const STATE_CHANGE = toSpring(springs.stateChange);

function element(): HTMLElement {
  const box = document.createElement('div');
  document.body.append(box);
  return box;
}

describe('createAnimator', () => {
  it('hands out the six methods and destroy, and nothing of the motion module beneath', () => {
    const animator = createAnimator(element());
    expect(Object.keys(animator).sort()).toEqual(
      [
        'animate',
        'decay',
        'destroy',
        'get',
        'getVelocity',
        'set',
        'stop',
      ].sort(),
    );
    for (const method of Object.values(animator)) {
      expect(typeof method).toBe('function');
    }
    animator.destroy();
  });

  it('reads every channel at rest: identity', () => {
    const animator = createAnimator(element());
    expect(animator.get()).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      rotate: 0,
      opacity: 1,
    });
    expect(animator.getVelocity()).toEqual({
      x: 0,
      y: 0,
      scale: 0,
      rotate: 0,
      opacity: 0,
    });
  });

  it('animate plays the springs.stateChange role on each channel', async () => {
    const box = element();
    const animator = createAnimator(box);
    const target: Record<AnimatorChannel, number> = {
      x: 120,
      y: -80,
      scale: 1.5,
      rotate: 45,
      opacity: 0.25,
    };
    const from: Record<AnimatorChannel, number> = {
      x: 0,
      y: 0,
      scale: 1,
      rotate: 0,
      opacity: 1,
    };
    void animator.animate(target);
    const start = await started();
    await advance(150);
    const t = (performance.now() - start) / 1000;
    const now = animator.get();
    for (const channel of Object.keys(target) as AnimatorChannel[]) {
      const curve = solveSpring(STATE_CHANGE, {
        from: from[channel],
        to: target[channel],
      });
      expect(now[channel]).toBeCloseTo(curve.value(t), 6);
      expect(animator.getVelocity()[channel]).toBeCloseTo(curve.velocity(t), 4);
      // Moving, not there yet.
      expect(now[channel]).not.toBeCloseTo(target[channel], 2);
    }
  });

  it('animate starts from a given velocity, and otherwise from the one on screen', async () => {
    const animator = createAnimator(element());
    void animator.animate({x: 100}, {velocity: {x: 900}});
    const start = await started();
    await advance(100);
    const t = (performance.now() - start) / 1000;
    const withVelocity = solveSpring(STATE_CHANGE, {
      from: 0,
      to: 100,
      velocity: 900,
    });
    expect(animator.get().x).toBeCloseTo(withVelocity.value(t), 6);

    // Interrupted: the new spring keeps the velocity on screen.
    const before = animator.getVelocity().x;
    expect(before).not.toBe(0);
    void animator.animate({x: 0});
    expect(animator.getVelocity().x).toBeCloseTo(before, 4);
  });

  it('animate resolves once the channels arrive, with the values at the target', async () => {
    const animator = createAnimator(element());
    let done = false;
    void animator.animate({x: 60, opacity: 0.5}).then(() => {
      done = true;
    });
    await started();
    await advance(200);
    expect(done).toBe(false);
    await advance(3000);
    expect(done).toBe(true);
    expect(animator.get().x).toBeCloseTo(60, 3);
    expect(animator.get().opacity).toBeCloseTo(0.5, 3);
  });

  it('animate resolves early when a later call takes its channels over', async () => {
    const animator = createAnimator(element());
    let done = false;
    void animator.animate({x: 300}).then(() => {
      done = true;
    });
    await started();
    await advance(50);
    animator.set({x: 10});
    await advance(0);
    expect(done).toBe(true);
    expect(animator.get().x).toBe(10);
  });

  it('a later animate or decay on a channel resolves its earlier promise where it stopped', async () => {
    const animator = createAnimator(element());
    const settled: string[] = [];
    void animator.animate({x: 300}).then(() => settled.push('first animate'));
    await started();
    await advance(60);
    const before = animator.get().x;
    void animator.animate({x: -100}).then(() => settled.push('second animate'));
    await advance(0);
    expect(settled).toEqual(['first animate']);
    // The second picks up where the first stopped on screen.
    expect(animator.get().x).toBeCloseTo(before, 0);
    await advance(40);
    void animator.decay({x: 800}).then(() => settled.push('decay'));
    await advance(0);
    expect(settled).toEqual(['first animate', 'second animate']);
    await advance(40);
    void animator.animate({x: 0});
    await advance(0);
    expect(settled).toEqual(['first animate', 'second animate', 'decay']);
  });

  it('decay coasts x and y on the normal deceleration from the velocity', async () => {
    const animator = createAnimator(element());
    let done = false;
    void animator.decay({x: 1500, y: -600}).then(() => {
      done = true;
    });
    const start = await started();
    await advance(250);
    const t = (performance.now() - start) / 1000;
    const x = solveDecay({from: 0, velocity: 1500});
    const y = solveDecay({from: 0, velocity: -600});
    expect(animator.get().x).toBeCloseTo(x.value(t), 4);
    expect(animator.get().y).toBeCloseTo(y.value(t), 4);
    expect(animator.getVelocity().x).toBeCloseTo(x.velocity(t), 2);
    await advance(10_000);
    expect(done).toBe(true);
    // The rest is where the velocity alone carries it: no bounds.
    expect(animator.get().x).toBeCloseTo(x.rest, 0);
    expect(animator.get().y).toBeCloseTo(y.rest, 0);
  });

  it('decay coasts every channel it is given on the same momentum decay', async () => {
    const animator = createAnimator(element());
    let done = false;
    void animator.decay({scale: 0.8, rotate: 90}).then(() => {
      done = true;
    });
    const start = await started();
    await advance(250);
    const t = (performance.now() - start) / 1000;
    const scale = solveDecay({from: 1, velocity: 0.8});
    const rotate = solveDecay({from: 0, velocity: 90});
    expect(animator.get().scale).toBeCloseTo(scale.value(t), 4);
    expect(animator.get().rotate).toBeCloseTo(rotate.value(t), 3);
    await advance(10_000);
    expect(done).toBe(true);
    expect(animator.get().scale).toBeCloseTo(scale.rest, 3);
    expect(animator.get().rotate).toBeCloseTo(rotate.rest, 1);
  });

  it('a decay that coasts x with rotate resolves as soon as a later call takes x over, as animate does (spec:AST-107 FR3)', async () => {
    const animator = createAnimator(element());
    let done = false;
    void animator.decay({x: 1200, rotate: 90}).then(() => {
      done = true;
    });
    await started();
    await advance(50);
    // The rotate coast runs for seconds more; taking x over still ends the
    // call where it stopped.
    animator.set({x: 0});
    await advance(0);
    expect(done).toBe(true);
    expect(animator.get().x).toBe(0);
  });

  it('a decay that coasts x with rotate, left alone, resolves once both channels stop', async () => {
    const animator = createAnimator(element());
    let done = false;
    void animator.decay({x: 1200, rotate: 90}).then(() => {
      done = true;
    });
    await started();
    await advance(500);
    expect(done).toBe(false);
    await advance(10_000);
    expect(done).toBe(true);
  });

  it('an opacity coast stops at 0 or 1', async () => {
    const animator = createAnimator(element());
    animator.set({opacity: 0.5});
    void animator.decay({opacity: -5});
    await started();
    await advance(10_000);
    expect(animator.get().opacity).toBe(0);
  });

  it('set puts values in place at once and writes them to the element', () => {
    const box = element();
    const animator = createAnimator(box);
    animator.set({x: 40, y: 8, scale: 0.5, rotate: 90, opacity: 0.3});
    expect(animator.get()).toEqual({
      x: 40,
      y: 8,
      scale: 0.5,
      rotate: 90,
      opacity: 0.3,
    });
    expect(box.style.translate).toBe('40px 8px');
    expect(box.style.scale).toBe('0.5 0.5');
    expect(box.style.rotate).toBe('90deg');
    expect(box.style.opacity).toBe('0.3');
  });

  it('a call leaves the channels it is not given where they are', async () => {
    const animator = createAnimator(element());
    animator.set({y: 30, opacity: 0.5});
    void animator.animate({x: 100});
    await started();
    await advance(5000);
    expect(animator.get()).toMatchObject({x: 100, y: 30, opacity: 0.5});
  });

  it('stop halts every channel where it is on screen', async () => {
    const animator = createAnimator(element());
    let done = false;
    void animator.animate({x: 200, rotate: 30}).then(() => {
      done = true;
    });
    await started();
    await advance(120);
    animator.stop();
    const held = animator.get();
    await advance(2000);
    expect(animator.get()).toEqual(held);
    expect(held.x).toBeGreaterThan(0);
    expect(held.x).toBeLessThan(200);
    expect(animator.getVelocity().x).toBe(0);
    expect(done).toBe(true);
  });

  it('destroy stops everything; the animator does nothing after it', async () => {
    const box = element();
    const animator = createAnimator(box);
    void animator.animate({x: 200});
    await started();
    await advance(100);
    animator.destroy();
    expect(recorded.every(animation => animation.cancelled)).toBe(true);
    const count = recorded.length;
    await expect(animator.animate({x: 0})).resolves.toBeUndefined();
    await expect(animator.decay({x: 500})).resolves.toBeUndefined();
    await expect(animator.decay({scale: 1})).resolves.toBeUndefined();
    animator.set({y: 50});
    expect(() => animator.stop()).not.toThrow();
    expect(() => animator.destroy()).not.toThrow();
    expect(recorded.length).toBe(count);
    expect(animator.get().y).toBe(0);
    expect(animator.getVelocity().x).toBe(0);
  });

  it('destroy removes every listener it added (spec:AST-107 FR6)', async () => {
    const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const removed = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    try {
      const animator = createAnimator(element());
      void animator.animate({x: 200, opacity: 0.5});
      await started();
      await advance(100);
      animator.destroy();
      await advance(1000);
      expect(removed.mock.calls.length).toBe(added.mock.calls.length);
    } finally {
      added.mockRestore();
      removed.mockRestore();
    }
  });

  it('a channel it does not know is ignored: no throw, and a call with nothing it knows resolves at once', async () => {
    const box = element();
    const animator = createAnimator(box);
    const unknown = {width: 200, x: 30} as unknown as AnimatorValues;
    expect(() => animator.set(unknown)).not.toThrow();
    expect(animator.get()).toEqual({
      x: 30,
      y: 0,
      scale: 1,
      rotate: 0,
      opacity: 1,
    });
    expect(box.style.width).toBe('');
    await expect(
      animator.animate({height: 10} as unknown as AnimatorValues),
    ).resolves.toBeUndefined();
    await expect(
      animator.decay({height: 10} as unknown as AnimatorValues),
    ).resolves.toBeUndefined();
    expect(recorded).toEqual([]);
  });

  it('an empty call resolves at once and moves nothing', async () => {
    const animator = createAnimator(element());
    await expect(animator.animate({})).resolves.toBeUndefined();
    await expect(animator.decay({})).resolves.toBeUndefined();
    expect(recorded).toEqual([]);
  });

  describe('Reduce Motion (design:reduced-motion)', () => {
    it('on a coarse pointer, a move becomes a cross-fade: the travel lands while transparent', async () => {
      stubMedia({reduced: true, coarse: true});
      const animator = createAnimator(element());
      let done = false;
      void animator.animate({x: 200}).then(() => {
        done = true;
      });
      await started();
      const samples: {x: number; opacity: number}[] = [];
      for (let i = 0; i < 40; i++) {
        await advance(FRAME_MS);
        const {x, opacity} = animator.get();
        samples.push({x, opacity});
      }
      // Never a value between the ends: the move is substituted, not slowed.
      expect(samples.every(s => s.x === 0 || s.x === 200)).toBe(true);
      // It fades: opacity dips below 1, and the jump happens out of sight.
      expect(Math.min(...samples.map(s => s.opacity))).toBeLessThan(0.05);
      const jump = samples.findIndex(s => s.x === 200);
      expect(jump).toBeGreaterThan(0);
      expect(samples[jump].opacity).toBeLessThan(0.05);
      await advance(1000);
      expect(done).toBe(true);
      expect(animator.get()).toMatchObject({x: 200, opacity: 1});
    });

    it('on a fine pointer, a move lands at once', async () => {
      stubMedia({reduced: true, coarse: false});
      const animator = createAnimator(element());
      const finished = animator.animate({x: 200, scale: 2});
      expect(animator.get()).toMatchObject({x: 200, scale: 2});
      await advance(FRAME_MS);
      await expect(finished).resolves.toBeUndefined();
    });

    it('a release coast keeps its momentum: it continues the throw', async () => {
      stubMedia({reduced: true, coarse: true});
      const animator = createAnimator(element());
      void animator.decay({x: 1200});
      const start = await started();
      await advance(200);
      const t = (performance.now() - start) / 1000;
      expect(animator.get().x).toBeCloseTo(
        solveDecay({from: 0, velocity: 1200}).value(t),
        4,
      );
    });
  });
});
