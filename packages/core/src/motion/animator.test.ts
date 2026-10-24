// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animator.test.ts
 * @input vitest (jsdom), the animator, a recording stand-in for
 *   Element.animate (jsdom runs no animations)
 * @output Checks what the animator hands the browser: keyframes that follow
 *   the analytic curves, the clock, the inline end state; and what it reads
 *   back: presentation values and velocities, retarget continuity, stop,
 *   completion, Reduced Motion substitutions, decays with edges, late attach
 * @position Testing; the compositor itself is proven in
 *   __tests__/animator.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  animatorFor,
  createAnimator,
  END_HOLD_MS,
  PROMOTION_LINGER_MS,
  type AnimatorOptions,
} from './animator';
import {cubicBezier} from './bezier';
import {motionRoleIn} from './roles';
import {solveDecay} from './decay';
import {solveSpring, solveSpringTowardRamp, toSpring} from './spring';
import {scroll} from './uikit/scroll';
import {springs} from './uikit/springs';
import {timing} from './uikit/timing';

interface Recorded {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  startTime: number | null;
  /** The fake clock when it was created (a pending start reads from it). */
  createdAt: number;
  cancelled: boolean;
  /** A sampler holding it (the interaction harness pauses to seek). */
  paused: boolean;
  readonly playState: 'idle' | 'paused' | 'running';
  ready: Promise<Recorded>;
  commit(at: number): void;
  cancel(): void;
}

let clock = 1000;
let recorded: Recorded[] = [];
/** Callbacks waiting for the next animation frame (`requestFrame`). */
let frameQueue: (() => void)[] = [];
const requestFrame = (callback: () => void) => {
  frameQueue.push(callback);
};

beforeEach(() => {
  clock = 1000;
  recorded = [];
  frameQueue = [];
  vi.useFakeTimers();
  HTMLElement.prototype.animate = function (keyframes, options) {
    let resolveReady: (a: Recorded) => void = () => {};
    let rejectReady: (e: Error) => void = () => {};
    const ready = new Promise<Recorded>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // Like a browser: a pending animation (no start time) starts at the next
    // committed frame; setting a start time, or a cancel, settles `ready`.
    let start: number | null = null;
    const animation: Recorded = {
      element: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      get startTime() {
        return start;
      },
      set startTime(value) {
        start = value;
        resolveReady(animation);
      },
      createdAt: clock,
      cancelled: false,
      paused: false,
      get playState() {
        return this.cancelled ? 'idle' : this.paused ? 'paused' : 'running';
      },
      ready,
      commit(at) {
        if (!this.cancelled && start == null) {
          start = at;
        }
        resolveReady(this);
      },
      cancel() {
        this.cancelled = true;
        rejectReady(new Error('AbortError'));
      },
    };
    recorded.push(animation);
    return animation as unknown as Animation;
  };
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  vi.useRealTimers();
});

function setup(options: AnimatorOptions = {}) {
  const element = document.createElement('div');
  const animator = createAnimator(element, {
    now: () => clock,
    prefersReducedMotion: () => false,
    requestFrame,
    ...options,
  });
  return {element, animator};
}

/** The browser commits a frame at `at`: pending animations start there. */
async function commitFrame(at: number) {
  for (const animation of recorded) {
    if (animation.startTime == null && !animation.cancelled) {
      animation.commit(at);
    }
  }
  const frames = frameQueue;
  frameQueue = [];
  for (const callback of frames) {
    callback();
  }
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * Advances the injected clock and the timers together. The browser commits
 * pending animations at the next frame, here at once.
 */
async function advance(ms: number) {
  await commitFrame(clock);
  clock += ms;
  await vi.advanceTimersByTimeAsync(ms);
}

function live(channel: string): Recorded[] {
  return recorded.filter(
    a => !a.cancelled && channel in (a.keyframes[0] ?? {}),
  );
}

function parse(value: string | number | null | undefined): number[] {
  return String(value)
    .split(/\s+/)
    .map(part => Number.parseFloat(part));
}

/** What the browser would show: the keyframes interpolated linearly at `time`. */
function sampleAt(
  animation: Recorded,
  channel: string,
  time: number,
): number[] {
  const duration = Number(animation.options.duration);
  const offset = Math.min(
    1,
    Math.max(
      0,
      (time - (animation.startTime ?? animation.createdAt)) / duration,
    ),
  );
  const frames = animation.keyframes;
  for (let i = 0; i + 1 < frames.length; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    const oa = Number(a.offset);
    const ob = Number(b.offset);
    if (
      offset >= oa &&
      offset <= ob &&
      !(
        offset === ob &&
        i + 2 < frames.length &&
        Number(frames[i + 2].offset) === ob
      )
    ) {
      const va = parse(a[channel]);
      const vb = parse(b[channel]);
      const f = ob === oa ? 1 : (offset - oa) / (ob - oa);
      return va.map((v, k) => v + (vb[k] - v) * f);
    }
  }
  return parse(frames[frames.length - 1][channel]);
}

describe('animate: keyframes on the compositor', () => {
  it('bakes the spring into keyframes within a twentieth of a pixel of the curve', async () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.smooth});
    const [animation] = live('translate');
    expect(animation).toBeDefined();
    expect(animation.options).toMatchObject({
      fill: 'both',
      easing: 'linear',
    });
    // From rest, the browser sets the start when it commits the first frame.
    expect(animation.startTime).toBeNull();
    await commitFrame(1000);
    expect(animation.startTime).toBe(1000);
    const curve = solveSpring(toSpring(springs.smooth), {from: 0, to: 300});
    // The curve, then the end state held (END_HOLD_MS).
    const duration = Number(animation.options.duration) - END_HOLD_MS;
    expect(duration).toBeCloseTo(curve.settleTime(0.05) * 1000, 6);
    for (let t = 0; t <= duration; t += 0.5) {
      const [x, y] = sampleAt(animation, 'translate', 1000 + t);
      expect(Math.abs(x - curve.value(t / 1000))).toBeLessThan(0.06);
      expect(y).toBe(0);
      expect(animator.get('x', 1000 + t)).toBeCloseTo(curve.value(t / 1000), 9);
    }
    // Then the end state, held through a main-thread block.
    expect(
      sampleAt(animation, 'translate', 1000 + duration + END_HOLD_MS / 2),
    ).toEqual([300, 0]);
  });

  it('keeps the keyframe count modest (adaptive sampling)', () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.smooth});
    expect(live('translate')[0].keyframes.length).toBeLessThan(200);
  });

  it('writes the end values inline up front, so the last frame needs no main thread', () => {
    const {animator, element} = setup();
    animator.animate(
      {x: 120, y: -40, scale: 1.1, rotate: 12, opacity: 0.25},
      {spring: springs.snappy},
    );
    expect(element.style.translate).toBe('120px -40px');
    expect(element.style.scale).toBe('1.1 1.1');
    expect(element.style.rotate).toBe('12deg');
    expect(element.style.opacity).toBe('0.25');
    for (const channel of ['translate', 'scale', 'rotate', 'opacity']) {
      const [animation] = live(channel);
      expect(animation.keyframes[animation.keyframes.length - 1][channel]).toBe(
        (element.style as unknown as Record<string, string>)[channel],
      );
    }
  });

  it('keeps the end state in effect until the main thread drops the finished animation', async () => {
    const {animator, element} = setup();
    animator.animate({x: 120}, {spring: springs.snappy});
    const [animation] = live('translate');
    expect(animation.options.fill).toBe('both');
    // The animation outlasts its curve by END_HOLD_MS; the main thread drops
    // it as soon as it runs after the curve's end.
    const duration = Number(animation.options.duration) - END_HOLD_MS;
    await advance(duration - 1);
    expect(animation.cancelled).toBe(false);
    await advance(2);
    expect(animation.cancelled).toBe(true);
    expect(element.style.translate).toBe(
      animation.keyframes[animation.keyframes.length - 1].translate,
    );
  });

  it('never retires an animation a sampler has paused', async () => {
    const {animator} = setup();
    animator.animate({x: 120}, {spring: springs.snappy});
    const [animation] = live('translate');
    await commitFrame(1000);
    const duration = Number(animation.options.duration) - END_HOLD_MS;
    animation.paused = true;
    await advance(duration + 500);
    expect(animation.cancelled).toBe(false);
    // Resumed: it leaves once the main thread looks again.
    animation.paused = false;
    await advance(150);
    expect(animation.cancelled).toBe(true);
  });

  it('puts everything one call starts on one clock', async () => {
    const {animator} = setup();
    animator.animate({x: 100, opacity: 0.5}, {spring: springs.smooth});
    await commitFrame(1000);
    const starts = recorded.map(a => a.startTime);
    expect(starts).toEqual([1000, 1000]);
    animator.animate({rotate: 90}, {spring: springs.smooth}, {at: 1234.5});
    expect(live('rotate')[0].startTime).toBe(1234.5);
  });

  it('expands scale onto both axes and reads it back', () => {
    const {animator} = setup();
    animator.animate({scale: 0.5}, {spring: springs.smooth});
    clock += 5000;
    expect(animator.get('scale')).toBe(0.5);
    expect(animator.get('scaleY')).toBe(0.5);
  });

  it('does nothing for a value already at its target and at rest', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 0}, {spring: springs.smooth});
    expect(live('translate')).toHaveLength(0);
    await expect(handle.finished).resolves.toBe(true);
  });
});

describe('a call from rest starts at the commit, as Core Animation does', () => {
  const curve = solveSpring(toSpring(springs.smooth), {from: 0, to: 300});

  it('a block before the first frame delays the motion instead of skipping into it', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 300}, {spring: springs.smooth});
    const [animation] = live('translate');
    expect(animation.startTime).toBeNull();
    // Until the commit the curve reads from the call time.
    expect(animator.get('x', 1000)).toBe(0);
    // The main thread was blocked for 300 ms: the first frame commits at 1300.
    clock = 1300;
    await commitFrame(1300);
    await expect(handle.started).resolves.toBe(1300);
    expect(animator.get('x', 1300)).toBeCloseTo(0, 9);
    expect(animator.get('x', 1400)).toBeCloseTo(curve.value(0.1), 9);
    expect(handle.value('x', 1400)).toBeCloseTo(curve.value(0.1), 9);
    expect(sampleAt(animation, 'translate', 1400)[0]).toBeCloseTo(
      curve.value(0.1),
      1,
    );
  });

  it('reads from the call time until its first frame', async () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.smooth});
    expect(animator.get('x', 1100)).toBeCloseTo(curve.value(0.1), 9);
    clock = 1250;
    await commitFrame(1250);
    expect(animator.get('x', 1350)).toBeCloseTo(curve.value(0.1), 9);
    expect(live('translate')[0].startTime).toBe(1250);
  });

  it('finishes and drops the animation on the committed clock', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 300}, {spring: springs.smooth});
    const [animation] = live('translate');
    const duration = Number(animation.options.duration) - END_HOLD_MS;
    clock = 1300;
    await commitFrame(1300);
    let done = false;
    void handle.finished.then(() => {
      done = true;
    });
    await advance(duration - 1);
    expect(done).toBe(false);
    expect(animation.cancelled).toBe(false);
    await advance(2);
    expect(done).toBe(true);
    expect(animation.cancelled).toBe(true);
  });

  it('a retarget mid-flight keeps an explicit start', async () => {
    const {animator} = setup();
    const first = animator.animate({x: 300}, {spring: springs.smooth});
    await advance(100);
    await expect(first.started).resolves.toBe(1000);
    const second = animator.animate({x: 0}, {spring: springs.smooth});
    expect(live('translate')[0].startTime).toBe(1100);
    await expect(second.started).resolves.toBe(1100);
  });

  it('a call stopped before its first frame resolves at its own time', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 300}, {spring: springs.smooth});
    animator.stop();
    clock = 1300;
    await commitFrame(1300);
    await expect(handle.started).resolves.toBe(1000);
    await expect(handle.finished).resolves.toBe(false);
  });

  it('a second call before the first frame starts with the same commit', async () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.smooth});
    animator.animate({y: 300}, {spring: springs.smooth});
    const [animation] = live('translate');
    expect(animation.startTime).toBeNull();
    clock = 1300;
    await commitFrame(1300);
    expect(animator.get('x', 1400)).toBeCloseTo(curve.value(0.1), 9);
    expect(animator.get('y', 1400)).toBeCloseTo(curve.value(0.1), 9);
  });
});

describe('animatorFor: one animator per element', () => {
  it('gives every caller the same animator for an element', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    expect(animatorFor(a)).toBe(animatorFor(a));
    expect(animatorFor(a)).not.toBe(animatorFor(b));
    expect(animatorFor(a, {pseudoElement: '::backdrop'})).toBe(
      animatorFor(a, {pseudoElement: '::backdrop'}),
    );
    expect(animatorFor(a, {pseudoElement: '::backdrop'})).not.toBe(
      animatorFor(a),
    );
  });

  it('composes two callers’ axes in one translate track', async () => {
    const row = document.createElement('div');
    const options = {
      now: () => clock,
      prefersReducedMotion: () => false,
      requestFrame,
    };
    const swipe = animatorFor(row, options);
    swipe.animate({x: -120}, {spring: springs.smooth});
    await advance(50);
    const x = solveSpring(toSpring(springs.smooth), {from: 0, to: -120});
    const removal = animatorFor(row, options);
    removal.animate({y: -44}, {spring: springs.smooth});
    const tracks = live('translate');
    expect(tracks).toHaveLength(1);
    // x stays on its curve; y starts its own.
    expect(removal.get('x', clock + 30)).toBeCloseTo(x.value(0.08), 9);
    const y = solveSpring(toSpring(springs.smooth), {from: 0, to: -44});
    expect(swipe.get('y', clock + 30)).toBeCloseTo(y.value(0.03), 9);
    const [tx, ty] = sampleAt(tracks[0], 'translate', clock + 30);
    expect(tx).toBeCloseTo(x.value(0.08), 1);
    expect(ty).toBeCloseTo(y.value(0.03), 1);
  });
});

describe('rebase: a layout shift under a moving element', () => {
  it('keeps a spring’s spring, velocity and target', async () => {
    const {animator} = setup();
    const handle = animator.animate({y: 100}, {spring: springs.smooth});
    await advance(60);
    const value = animator.get('y');
    const velocity = animator.getVelocity('y');
    animator.rebase({y: -40});
    expect(animator.get('y', clock)).toBeCloseTo(value - 40, 9);
    expect(animator.getVelocity('y', clock)).toBeCloseTo(velocity, 6);
    const curve = solveSpring(toSpring(springs.smooth), {
      from: value - 40,
      to: 100,
      velocity,
    });
    expect(animator.get('y', clock + 30)).toBeCloseTo(curve.value(0.03), 9);
    expect(live('translate')).toHaveLength(1);
    await advance(5000);
    expect(animator.get('y')).toBe(100);
    await expect(handle.finished).resolves.toBe(true);
  });

  it('offsets a resting value and starts nothing', () => {
    const {animator, element} = setup();
    animator.set({y: 10});
    animator.rebase({y: -20});
    expect(animator.get('y')).toBe(-10);
    expect(live('translate')).toHaveLength(0);
    expect(parse(element.style.translate)[1]).toBe(-10);
  });
});

describe('promotion: a compositing layer while it moves', () => {
  it('promotes the animated channels in the task that starts the motion, and ends it after rest', async () => {
    const {animator, element} = setup();
    animator.animate({x: 120, opacity: 0.5}, {spring: springs.smooth});
    expect(element.style.willChange).toBe('translate, opacity');
    const end = Math.max(
      ...live('translate').map(a => Number(a.options.duration) - END_HOLD_MS),
      ...live('opacity').map(a => Number(a.options.duration) - END_HOLD_MS),
    );
    await advance(end + PROMOTION_LINGER_MS - 5);
    expect(element.style.willChange).toBe('translate, opacity');
    await advance(10);
    expect(element.style.willChange).toBe('');
  });

  it('keeps the element’s own will-change', async () => {
    const {animator, element} = setup();
    element.style.willChange = 'contents';
    animator.animate({y: 40}, {spring: springs.snappy});
    expect(element.style.willChange).toBe('contents, translate');
    await advance(5000 + PROMOTION_LINGER_MS);
    expect(element.style.willChange).toBe('contents');
  });

  it('promotes during direct manipulation, until the writes stop', async () => {
    const {animator, element} = setup();
    animator.set({y: 10});
    expect(element.style.willChange).toBe('translate');
    await advance(PROMOTION_LINGER_MS - 10);
    animator.set({y: 20});
    await advance(PROMOTION_LINGER_MS - 10);
    expect(element.style.willChange).toBe('translate');
    await advance(20);
    expect(element.style.willChange).toBe('');
  });

  it('promotes a pseudo-element through a custom property on its host', async () => {
    const {animator, element} = setup({pseudoElement: '::backdrop'});
    animator.set({opacity: 0});
    // set() promotes a pseudo-element too.
    expect(
      element.style.getPropertyValue('--astryx-motion-will-change-backdrop'),
    ).toBe('opacity');
    animator.animate({opacity: 1}, {spring: springs.alertPresent});
    expect(
      element.style.getPropertyValue('--astryx-motion-will-change-backdrop'),
    ).toBe('opacity');
    expect(element.style.willChange).toBe('');
    await advance(5000 + PROMOTION_LINGER_MS);
    expect(
      element.style.getPropertyValue('--astryx-motion-will-change-backdrop'),
    ).toBe('');
  });

  it('ends promotion on the element it leaves', () => {
    const {animator, element} = setup();
    animator.animate({x: 50}, {spring: springs.smooth});
    expect(element.style.willChange).toBe('translate');
    animator.attach(document.createElement('div'));
    expect(element.style.willChange).toBe('');
  });
});

describe('atRest: waiting out every curve', () => {
  it('resolves when the last curve ends, retargets included', async () => {
    const {animator} = setup();
    animator.animate({y: 100}, {spring: springs.smooth});
    let rested = false;
    void animator.atRest(['y']).then(() => {
      rested = true;
    });
    await advance(100);
    // Someone else retargets the row: the wait follows the new curve.
    const second = animator.animate({y: 0}, {spring: springs.smooth});
    const [track] = live('translate');
    const end = Number(track.options.duration) - END_HOLD_MS;
    await advance(end - 1);
    expect(rested).toBe(false);
    await advance(2);
    expect(rested).toBe(true);
    await expect(second.finished).resolves.toBe(true);
  });

  it('resolves at once at rest', async () => {
    const {animator} = setup();
    await expect(animator.atRest()).resolves.toBeUndefined();
  });
});

describe('presentation values, retargeting, velocity (M2, M3)', () => {
  it('hands a release velocity to the spring', () => {
    const {animator} = setup();
    animator.set({y: 200});
    animator.animate(
      {y: 0},
      {spring: springs.sheetDetent, velocity: {y: 1500}},
    );
    expect(animator.get('y')).toBe(200);
    expect(animator.getVelocity('y')).toBeCloseTo(1500, 6);
  });

  it('a retarget starts from the value and the velocity on screen', async () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.bouncy, velocity: {x: 800}});
    const first = live('translate')[0];
    await advance(120);
    const value = animator.get('x');
    const velocity = animator.getVelocity('x');
    animator.animate({x: -100}, {spring: springs.bouncy});
    expect(first.cancelled).toBe(true);
    const second = live('translate')[0];
    expect(second.startTime).toBe(clock);
    expect(animator.get('x', clock)).toBeCloseTo(value, 9);
    expect(animator.getVelocity('x', clock)).toBeCloseTo(velocity, 6);
    expect(sampleAt(second, 'translate', clock)[0]).toBeCloseTo(value, 2);
    // And it really goes to the new target with that start.
    const curve = solveSpring(toSpring(springs.bouncy), {
      from: value,
      to: -100,
      velocity,
    });
    expect(animator.get('x', clock + 90)).toBeCloseTo(curve.value(0.09), 9);
  });

  it('velocity is continuous across a retarget (property sweep)', async () => {
    for (const spring of [
      springs.smooth,
      springs.snappy,
      springs.switchThumbMove,
      springs.navigationPush,
    ]) {
      const {animator} = setup();
      animator.animate({x: 200}, {spring});
      for (const step of [16, 50, 120]) {
        await advance(step);
        const before = animator.getVelocity('x', clock);
        const value = animator.get('x', clock);
        animator.animate({x: value > 100 ? 0 : 200}, {spring});
        expect(animator.getVelocity('x', clock)).toBeCloseTo(before, 6);
        expect(animator.get('x', clock)).toBeCloseTo(value, 9);
      }
    }
  });

  it('a value that keeps moving through a rebuild stays on its curve', async () => {
    const {animator} = setup();
    animator.animate({x: 300, y: 200}, {spring: springs.smooth});
    const yCurve = solveSpring(toSpring(springs.smooth), {from: 0, to: 200});
    await advance(100);
    animator.animate({x: 0}, {spring: springs.smooth});
    const [animation] = live('translate');
    for (let t = clock; t < clock + 400; t += 7) {
      expect(sampleAt(animation, 'translate', t)[1]).toBeCloseTo(
        yCurve.value((t - 1000) / 1000),
        1,
      );
      expect(animator.get('y', t)).toBeCloseTo(
        yCurve.value((t - 1000) / 1000),
        9,
      );
    }
  });

  it('stop() freezes at the presentation value', async () => {
    const {animator, element} = setup();
    animator.animate({x: 300}, {spring: springs.smooth});
    await advance(80);
    const value = animator.get('x');
    animator.stop();
    expect(live('translate')).toHaveLength(0);
    expect(Number.parseFloat(element.style.translate)).toBeCloseTo(value, 3);
    await advance(500);
    expect(animator.get('x')).toBe(value);
    expect(animator.getVelocity('x')).toBe(0);
  });

  it('a handle reads, retargets and stops its own properties', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 100}, {spring: springs.smooth});
    await advance(50);
    expect(handle.value('x')).toBe(animator.get('x'));
    expect(handle.velocity('x')).toBe(animator.getVelocity('x'));
    const next = handle.retarget({x: 50});
    await expect(handle.finished).resolves.toBe(false);
    next.stop();
    await expect(next.finished).resolves.toBe(false);
  });
});

describe('set: direct manipulation (M4)', () => {
  it('writes one inline style per move and starts no animation', () => {
    const {animator, element} = setup();
    for (let x = 0; x < 30; x += 3) {
      animator.set({x});
      expect(element.style.translate).toBe(`${x}px 0px`);
    }
    expect(recorded).toHaveLength(0);
  });

  it('a drag on translate leaves a running scale alone', () => {
    const {animator} = setup();
    animator.animate({scale: 0.95}, {spring: springs.smooth});
    const scaleAnimation = live('scale')[0];
    animator.set({x: 12});
    animator.set({x: 20});
    expect(scaleAnimation.cancelled).toBe(false);
    expect(live('translate')).toHaveLength(0);
  });
});

describe('finished', () => {
  it('resolves true when the curve ends untouched', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 40}, {spring: springs.snappy});
    let result: boolean | undefined;
    void handle.finished.then(value => {
      result = value;
    });
    await advance(100);
    expect(result).toBeUndefined();
    await advance(5000);
    expect(result).toBe(true);
  });

  it('resolves false as soon as a property is retargeted, set or stopped', async () => {
    const {animator} = setup();
    const a = animator.animate({x: 40}, {spring: springs.snappy});
    animator.animate({x: 80}, {spring: springs.snappy});
    await expect(a.finished).resolves.toBe(false);
    const b = animator.animate({y: 40}, {spring: springs.snappy});
    animator.set({y: 3});
    await expect(b.finished).resolves.toBe(false);
    const c = animator.animate({rotate: 40}, {spring: springs.snappy});
    animator.stop(['rotate']);
    await expect(c.finished).resolves.toBe(false);
  });

  it('dispose cancels and settles everything', async () => {
    const {animator} = setup();
    const handle = animator.animate(
      {x: 40, opacity: 0},
      {spring: springs.snappy},
    );
    animator.dispose();
    await expect(handle.finished).resolves.toBe(false);
    expect(recorded.every(a => a.cancelled)).toBe(true);
    expect(animator.element).toBeNull();
  });
});

describe('Reduced Motion (design:reduced-motion)', () => {
  // A coarse primary pointer cross-fades (DR2); any other completes at once
  // unless a touch release started the call (DR3).
  const reduced = (coarse = true) =>
    setup({prefersReducedMotion: () => true, isCoarsePointer: () => coarse});
  const fade = timing.reducedMotionCrossFadeMs;
  const ease = cubicBezier(timing.curves.easeInOut);
  /** Every animation the browser was handed changes opacity only. */
  const opacityOnly = () =>
    recorded.every(animation =>
      animation.keyframes.every(keyframe =>
        Object.keys(keyframe).every(key =>
          ['opacity', 'offset', 'easing', 'composite'].includes(key),
        ),
      ),
    );

  it('fades for 200 ms at most, and the length is not a theme role', () => {
    expect(fade).toBeGreaterThan(0);
    expect(fade).toBeLessThanOrEqual(200);
    expect(motionRoleIn(timing, 'reducedMotionCrossFadeMs')).toBeUndefined();
  });

  it('never animates a transform, on either pointer', async () => {
    for (const coarse of [true, false]) {
      const {animator} = reduced(coarse);
      animator.animate({x: 100}, {spring: springs.navigationPush});
      animator.animate({y: 400, opacity: 0}, {spring: springs.sheetDismiss});
      animator.animate(
        {scale: 0.9},
        {spring: springs.snappy},
        {crossfadeAs: 'exit'},
      );
      animator.play({
        rotate: {duration: 0.3, at: t => 30 * t, velocity: () => 30},
      });
      await advance(1000);
    }
    expect(recorded.length).toBeGreaterThan(0);
    expect(opacityOnly()).toBe(true);
  });

  it('a move dips: fades out, lands while transparent, fades back in', async () => {
    const {animator, element} = reduced();
    animator.animate({x: 100}, {spring: springs.navigationPush});
    // Fading out in place.
    expect(animator.get('x')).toBe(0);
    expect(animator.get('opacity', 1000 + fade / 4)).toBeCloseTo(
      1 - ease(0.5),
      9,
    );
    expect(live('translate')).toHaveLength(0);
    await advance(fade / 2);
    // Landed with a plain write at the bottom, and fading back in from there.
    expect(animator.get('x')).toBe(100);
    expect(element.style.translate).toBe('100px 0px');
    expect(animator.get('opacity')).toBeCloseTo(0, 9);
    expect(animator.get('opacity', clock + fade / 4)).toBeCloseTo(ease(0.5), 9);
    expect(live('translate')).toHaveLength(0);
    expect(opacityOnly()).toBe(true);
  });

  it('a busy main thread keeps the element transparent longer, never in the wrong place', async () => {
    const {animator} = reduced();
    const handle = animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(1000);
    // The task that would land it runs 300 ms late.
    clock += fade / 2 + 300;
    expect(animator.get('x')).toBe(0);
    expect(animator.get('opacity')).toBe(0);
    await vi.advanceTimersByTimeAsync(fade / 2 + 300);
    expect(animator.get('x')).toBe(100);
    let finished: boolean | null = null;
    void handle.finished.then(value => {
      finished = value;
    });
    await advance(fade);
    expect(animator.get('opacity')).toBe(1);
    expect(finished).toBe(true);
  });

  it('an entrance lands in place and fades in', () => {
    const {animator} = reduced();
    animator.set({y: 400, opacity: 0});
    animator.animate({y: 0, opacity: 1}, {spring: springs.sheetPresent});
    expect(animator.get('y')).toBe(0);
    expect(live('translate')).toHaveLength(0);
    expect(animator.get('opacity', 1000 + fade / 2)).toBeCloseTo(ease(0.5), 9);
    expect(Number(live('opacity')[0].options.duration)).toBeCloseTo(
      fade + END_HOLD_MS,
      6,
    );
  });

  it('an exit fades out in place, then lands', async () => {
    const {animator} = reduced();
    animator.animate({y: 400, opacity: 0}, {spring: springs.sheetDismiss});
    expect(animator.get('opacity', 1000 + fade / 2)).toBeCloseTo(
      1 - ease(0.5),
      9,
    );
    await advance(fade - 1);
    expect(animator.get('y')).toBe(0);
    await advance(1);
    expect(animator.get('y')).toBe(400);
    expect(animator.get('opacity')).toBe(0);
    expect(opacityOnly()).toBe(true);
  });

  it('an opacity change on a spring becomes the timed fade, never the spring', () => {
    const {animator} = reduced();
    animator.animate({opacity: 0}, {spring: springs.alertDismiss});
    expect(animator.get('opacity', 1000 + fade / 2)).toBeCloseTo(
      1 - ease(0.5),
      9,
    );
    expect(animator.get('opacity', 1000 + fade)).toBe(0);
    expect(Number(live('opacity')[0].options.duration)).toBeCloseTo(
      fade + END_HOLD_MS,
      6,
    );
  });

  it('a played curve, opacity alone included, becomes the timed fade', () => {
    const {animator} = reduced();
    // A long dim that would follow a sheet's spring.
    animator.play({
      opacity: {duration: 0.6, at: t => 1 - t / 0.6, velocity: () => -1 / 0.6},
    });
    expect(animator.get('opacity', 1000 + fade)).toBe(0);
    expect(Number(live('opacity')[0].options.duration)).toBeCloseTo(
      fade + END_HOLD_MS,
      6,
    );
  });

  it('a slide without opacity takes its direction from crossfadeAs', async () => {
    const entrance = reduced().animator;
    entrance.set({x: 300});
    entrance.animate(
      {x: 0},
      {spring: springs.navigationPush},
      {crossfadeAs: 'entrance'},
    );
    expect(entrance.get('x', 1000)).toBe(0);
    expect(entrance.get('opacity', 1000)).toBe(0);
    expect(entrance.get('opacity', 1000 + fade / 2)).toBeCloseTo(ease(0.5), 9);
    expect(entrance.get('opacity', 1000 + fade)).toBe(1);

    const exit = reduced().animator;
    exit.animate(
      {y: 800},
      {spring: springs.sheetDismiss},
      {crossfadeAs: 'exit'},
    );
    expect(exit.get('opacity', clock + fade / 2)).toBeCloseTo(1 - ease(0.5), 9);
    await advance(fade);
    // Lands, and the opacity returns to its value, in one plain write.
    expect(exit.get('y')).toBe(800);
    expect(exit.get('opacity')).toBe(1);
  });

  it('a later call before the landing takes the property over', async () => {
    const {animator} = reduced();
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    animator.set({x: 40});
    await advance(fade);
    expect(animator.get('x')).toBe(40);
  });

  it('completes at once on a fine pointer, opacity included', () => {
    const {animator} = reduced(false);
    animator.animate({x: 100, opacity: 0.5}, {spring: springs.navigationPush});
    animator.play({
      y: {duration: 0.4, at: t => 100 * t, velocity: () => 100},
    });
    expect(recorded).toHaveLength(0);
    expect(animator.get('x')).toBe(100);
    expect(animator.get('opacity')).toBe(0.5);
    expect(animator.get('y')).toBeCloseTo(40, 9);
  });

  it('fades on a fine pointer when a touch release started the call', async () => {
    const {animator} = reduced(false);
    animator.animate(
      {y: 400, opacity: 0},
      {spring: springs.sheetDismiss},
      {touchRelease: true},
    );
    expect(animator.get('opacity', 1000 + fade / 2)).toBeCloseTo(
      1 - ease(0.5),
      9,
    );
    await advance(fade);
    expect(animator.get('y')).toBe(400);
  });

  it('no theme lengthens the fade', () => {
    const {animator, element} = reduced();
    element.style.setProperty(
      '--motion-timing-reduced-motion-cross-fade-ms',
      '900ms',
    );
    document.documentElement.append(element);
    animator.animate({opacity: 0}, {spring: springs.smooth});
    expect(animator.get('opacity', 1000 + fade)).toBe(0);
    element.remove();
  });

  it('says what it makes of a call, for feedback with no fade of its own', () => {
    expect(setup().animator.reducedMotion()).toBe('off');
    expect(reduced().animator.reducedMotion()).toBe('crossfade');
    expect(reduced(false).animator.reducedMotion()).toBe('instant');
    expect(reduced(false).animator.reducedMotion({touchRelease: true})).toBe(
      'crossfade',
    );
  });

  it('crossfadeAs changes nothing without Reduced Motion', () => {
    const {animator} = setup();
    animator.set({y: 800});
    animator.animate(
      {y: 0},
      {spring: springs.sheetPresent},
      {crossfadeAs: 'entrance'},
    );
    expect(live('opacity')).toHaveLength(0);
    expect(animator.getVelocity('y', 1010)).toBeLessThan(0);
  });
});

describe('play: any closed-form curve', () => {
  // A press that keeps deepening: the scale's target falls at 0.16 per
  // second and the presentation follows it on a spring.
  const pressSpring = toSpring(springs.contextMenuLift);
  const press = solveSpringTowardRamp(pressSpring, {
    from: 1,
    target: 1,
    slope: -0.16,
  });
  const pressCurve = {
    duration: 0.266,
    at: (t: number) => press.value(t),
    velocity: (t: number) => press.velocity(t),
  };

  it('bakes the curve into keyframes and reads it back', async () => {
    const {animator, element} = setup();
    animator.play({scale: pressCurve});
    const [animation] = live('scale');
    await commitFrame(1000);
    expect(animation.startTime).toBe(1000);
    expect(Number(animation.options.duration)).toBeCloseTo(
      266 + END_HOLD_MS,
      6,
    );
    // Up to the end: from then on the value rests where the curve ended.
    for (let t = 0; t < 266; t += 0.5) {
      const [sx, sy] = sampleAt(animation, 'scale', 1000 + t);
      expect(Math.abs(sx - press.value(t / 1000))).toBeLessThan(0.001);
      expect(sy).toBe(sx);
      expect(animator.get('scale', 1000 + t)).toBeCloseTo(
        press.value(t / 1000),
        12,
      );
      expect(animator.getVelocity('scaleY', 1000 + t)).toBeCloseTo(
        press.velocity(t / 1000),
        12,
      );
    }
    const end = press.value(0.266);
    expect(animator.get('scale', 1266)).toBeCloseTo(end, 12);
    expect(animator.getVelocity('scale', 1266)).toBe(0);
    for (const axis of parse(element.style.scale)) {
      expect(axis).toBeCloseTo(end, 4);
    }
  });

  it('finishes true at its end, false when interrupted', async () => {
    const {animator} = setup();
    const done = animator.play({
      x: {duration: 0.2, at: t => 100 * t, velocity: () => 100},
    });
    await advance(250);
    await expect(done.finished).resolves.toBe(true);
    const cut = animator.play({
      x: {duration: 0.2, at: t => 20 + 100 * t, velocity: () => 100},
    });
    await advance(50);
    animator.set({x: 0});
    await expect(cut.finished).resolves.toBe(false);
  });

  it('a later animate starts from the played value and velocity', async () => {
    const {animator} = setup();
    animator.play({scale: pressCurve});
    await advance(120);
    const value = animator.get('scale');
    const velocity = animator.getVelocity('scale');
    expect(value).toBeCloseTo(press.value(0.12), 12);
    animator.animate({scale: 1.06}, {spring: springs.contextMenuLift});
    expect(animator.get('scale')).toBeCloseTo(value, 9);
    expect(animator.getVelocity('scale')).toBeCloseTo(velocity, 9);
  });

  it('a zero-length curve puts the value in place', () => {
    const {animator, element} = setup();
    animator.play({opacity: {duration: 0, at: () => 0.4, velocity: () => 0}});
    expect(live('opacity')).toHaveLength(0);
    expect(animator.get('opacity')).toBe(0.4);
    expect(element.style.opacity).toBe('0.4');
  });

  it('under Reduced Motion a played travel cross-fades to its end', async () => {
    const reduced = setup({
      prefersReducedMotion: () => true,
      isCoarsePointer: () => true,
    });
    reduced.animator.play({
      x: {duration: 0.3, at: t => 300 * t, velocity: () => 300},
    });
    const [opacity] = live('opacity');
    expect(opacity).toBeDefined();
    expect(live('translate')).toHaveLength(0);
    await advance(timing.reducedMotionCrossFadeMs);
    expect(reduced.animator.get('x')).toBeCloseTo(90, 9);
  });

  it('its handle retargets only with a spring', () => {
    const {animator} = setup();
    const handle = animator.play({
      x: {duration: 0.3, at: t => 300 * t, velocity: () => 300},
    });
    expect(() => handle.retarget({x: 0})).toThrow(/spring/);
    handle.retarget({x: 0}, {spring: springs.smooth});
    expect(animator.getVelocity('x')).toBeCloseTo(300, 9);
  });

  it('rejects a curve without a finite duration', () => {
    const {animator} = setup();
    expect(() =>
      animator.play({
        x: {duration: Number.POSITIVE_INFINITY, at: () => 0, velocity: () => 0},
      }),
    ).toThrow(RangeError);
  });
});

describe('decay: UIScrollView coasts', () => {
  it('follows the coast and comes to rest where it projects', () => {
    const {animator} = setup();
    animator.decay({y: -2400});
    const coast = solveDecay({from: 0, velocity: -2400});
    for (const t of [0, 16, 100, 400, 1200]) {
      expect(animator.get('y', 1000 + t)).toBeCloseTo(coast.value(t / 1000), 9);
    }
    const [animation] = live('translate');
    for (let t = 0; t < 1500; t += 3) {
      expect(
        Math.abs(
          sampleAt(animation, 'translate', 1000 + t)[1] - coast.value(t / 1000),
        ),
      ).toBeLessThan(0.11);
    }
    expect(animator.get('y', 1e7)).toBeCloseTo(coast.rest, 9);
  });

  it('a coast that reaches an edge hands its velocity to the edge spring', () => {
    const {animator} = setup();
    animator.set({y: -100});
    animator.decay({y: 3000}, {bounds: {y: {min: -2000, max: 0}}});
    const coast = solveDecay({from: -100, velocity: 3000});
    const contact = 1000 + (coast.timeToReach(0) as number) * 1000;
    expect(animator.get('y', contact)).toBeCloseTo(0, 6);
    expect(animator.getVelocity('y', contact - 1e-6)).toBeCloseTo(
      animator.getVelocity('y', contact + 1e-6),
      2,
    );
    // It overshoots past the edge, then comes back to it.
    expect(animator.get('y', contact + 60)).toBeGreaterThan(0);
    expect(animator.get('y', 1e7)).toBe(0);
  });

  it('a release past an edge springs straight back with the release velocity', () => {
    const {animator} = setup();
    animator.set({x: 60});
    animator.decay({x: 400}, {bounds: {x: {min: -500, max: 0}}});
    expect(animator.getVelocity('x')).toBeCloseTo(400, 6);
    const curve = solveSpring(toSpring(scroll.bounce), {
      from: 60,
      to: 0,
      velocity: 400,
    });
    expect(animator.get('x', 1100)).toBeCloseTo(curve.value(0.1), 9);
  });

  it('keeps moving under Reduced Motion: a throw is the finger\u2019s', () => {
    const {animator} = setup({prefersReducedMotion: () => true});
    animator.decay({x: 1000});
    expect(animator.getVelocity('x', 1016)).toBeGreaterThan(900);
  });
});

describe('pseudoElement: a dialog\u2019s ::backdrop', () => {
  it('targets the pseudo-element, writes no inline style and holds the end state', async () => {
    const {animator, element} = setup({pseudoElement: '::backdrop'});
    animator.set({opacity: 0});
    const [held] = live('opacity');
    expect(held.options).toMatchObject({
      fill: 'both',
      pseudoElement: '::backdrop',
    });
    expect(held.keyframes.map(k => k.opacity)).toEqual(['0', '0']);
    expect(element.style.opacity).toBe('');

    animator.animate({opacity: 1}, {spring: springs.alertPresent});
    // The new animation exists before the hold goes: no frame in between.
    expect(held.cancelled).toBe(true);
    const [fade] = live('opacity');
    expect(fade.options).toMatchObject({
      fill: 'both',
      pseudoElement: '::backdrop',
    });
    expect(fade.keyframes[fade.keyframes.length - 1].opacity).toBe('1');
    expect(element.style.opacity).toBe('');
    await advance(Number(fade.options.duration) + 1000);
    // Past the curve's end, a static animation holds the end value.
    expect(fade.cancelled).toBe(true);
    const [rest] = live('opacity');
    expect(rest.options).toMatchObject({
      fill: 'both',
      pseudoElement: '::backdrop',
    });
    expect(rest.keyframes.map(k => k.opacity)).toEqual(['1', '1']);
    expect(animator.get('opacity')).toBe(1);
  });

  it('an exit holds 0 until the next animation replaces it', async () => {
    const {animator} = setup({
      pseudoElement: '::backdrop',
      initial: {opacity: 1},
    });
    animator.animate({opacity: 0}, {spring: springs.alertDismiss});
    const [fade] = live('opacity');
    await advance(Number(fade.options.duration) + 1000);
    const [rest] = live('opacity');
    expect(rest.keyframes.map(k => k.opacity)).toEqual(['0', '0']);
    animator.animate({opacity: 1}, {spring: springs.alertPresent});
    expect(rest.cancelled).toBe(true);
    expect(live('opacity')).toHaveLength(1);
  });
});

describe('attach', () => {
  it('keeps state without an element and resumes the curve on attach', () => {
    const animator = createAnimator(null, {
      now: () => clock,
      prefersReducedMotion: () => false,
    });
    animator.animate({x: 300}, {spring: springs.smooth});
    expect(recorded).toHaveLength(0);
    clock += 100;
    const element = document.createElement('div');
    animator.attach(element);
    const [animation] = live('translate');
    expect(animation.startTime).toBe(1100);
    const curve = solveSpring(toSpring(springs.smooth), {from: 0, to: 300});
    expect(sampleAt(animation, 'translate', 1100)[0]).toBeCloseTo(
      curve.value(0.1),
      1,
    );
    expect(element.style.translate).toBe('300px 0px');
  });

  it('detaching cancels the running animations', () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.smooth});
    animator.attach(null);
    expect(recorded.every(a => a.cancelled)).toBe(true);
    expect(animator.get('x', 1050)).toBeGreaterThan(0);
  });

  it('writes nothing for channels at identity', () => {
    const element = document.createElement('div');
    createAnimator(element);
    expect(element.getAttribute('style')).toBeNull();
  });
});
