// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animator.test.ts
 * @input vitest (jsdom), the animator, a recording stand-in for
 *   Element.animate (jsdom runs no animations)
 * @output Checks what the animator hands the browser: keyframes that follow
 *   the analytic curves, the clock, the inline end state; and what it reads
 *   back: presentation values and velocities, retarget continuity, stop,
 *   completion, Reduced Motion substitutions, momentum curves (a coast with
 *   edges), late attach
 * @position Testing; what the compositor plays (frames advancing through a
 *   blocked main thread) needs a real browser, which these tests do not
 *   cover
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  animatorFor,
  createAnimator,
  END_HOLD_MS,
  PROMOTION_LINGER_MS,
  type AnimatorOptions,
} from './animator';
import {cubicBezier} from './bezier';
import {coast} from './coast';
import {solveDecay} from './decay';
import {solveSpring, toSpring} from './spring';
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
  /** Frames a resumed (play()) animation still waits for its start. */
  startDelayFrames: number;
  /** Finished from outside (a sampler's `finish()`), keeping its start. */
  finished: boolean;
  readonly playState: 'idle' | 'paused' | 'running' | 'finished';
  ready: Promise<Recorded>;
  commit(at: number): void;
  finish(): void;
  cancel(): void;
}

let clock = 1000;
let recorded: Recorded[] = [];
/** Callbacks waiting for the next animation frame (`requestFrame`). */
let frameQueue: (() => void)[] = [];
const requestFrame = (callback: () => void) => {
  frameQueue.push(callback);
};
/**
 * What the page's stylesheet sets, by property. Computed style reads it
 * under the inline value (jsdom keeps stale computed values for these
 * properties, so the page is modeled here).
 */
let stylesheet: Record<string, string> = {};

beforeEach(() => {
  clock = 1000;
  recorded = [];
  frameQueue = [];
  stylesheet = {};
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    element =>
      ({
        getPropertyValue: (property: string) =>
          (element as HTMLElement).style.getPropertyValue(property) ||
          (stylesheet[property] ?? ''),
      }) as unknown as CSSStyleDeclaration,
  );
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
      finished: false,
      get playState() {
        return this.cancelled
          ? 'idle'
          : this.finished
            ? 'finished'
            : this.paused
              ? 'paused'
              : 'running';
      },
      ready,
      commit(at) {
        // A paused animation's pending pause completes without a start; one
        // resumed with play() gets its start a frame later.
        if (this.startDelayFrames > 0) {
          this.startDelayFrames -= 1;
        } else if (!this.cancelled && start == null && !this.paused) {
          start = at;
        }
        resolveReady(this);
      },
      startDelayFrames: 0,
      finish() {
        this.finished = true;
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
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * The person's settings, through `matchMedia` as the animator reads them: no
 * option overrides them.
 */
function stubMedia(reduced: boolean, coarse: boolean) {
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

function setup({
  reduced = false,
  coarse = false,
  ...options
}: AnimatorOptions & {reduced?: boolean; coarse?: boolean} = {}) {
  stubMedia(reduced, coarse);
  const element = document.createElement('div');
  const animator = createAnimator(element, {
    now: () => clock,
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
    animator.animate({x: 300}, {spring: springs.settle});
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
    const curve = solveSpring(toSpring(springs.settle), {from: 0, to: 300});
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
    animator.animate({x: 300}, {spring: springs.settle});
    expect(live('translate')[0].keyframes.length).toBeLessThan(200);
  });

  it('clears an identity transform at rest, so a fixed child stays fixed', async () => {
    const {animator, element} = setup();
    animator.animate(
      {x: 100, scale: 0.9, rotate: 10},
      {spring: springs.quickChange},
    );
    expect(element.style.translate).toBe('100px 0px');
    await advance(100);
    animator.animate(
      {x: 0, scale: 1, rotate: 0},
      {spring: springs.quickChange},
    );
    // While the motion back runs, the end is never written 0px 0px: none, or
    // nothing where the stylesheet agrees.
    expect(live('translate')).toHaveLength(1);
    for (const channel of ['translate', 'scale', 'rotate'] as const) {
      expect(['', 'none']).toContain(element.style[channel]);
    }
    await advance(5000);
    // At rest the identity leaves the element: translate 0px 0px would make
    // the element a fixed child's containing block, and scale 1 stops a
    // finger scrolling inside it on Mobile Safari.
    expect(element.style.translate).toBe('');
    expect(element.style.scale).toBe('');
    expect(element.style.rotate).toBe('');
    // The keyframes stay numeric, so the curve still interpolates.
    animator.animate({x: 50}, {spring: springs.quickChange});
    expect(live('translate')[0].keyframes[0].translate).toBe('0px 0px');
  });

  it('clears opacity back at 1, and an identity set at rest, and keeps any other value', async () => {
    const {animator, element} = setup();
    animator.set({opacity: 0});
    animator.animate({opacity: 1}, {spring: springs.quickChange});
    await advance(5000);
    expect(element.style.opacity).toBe('');
    animator.set({x: 12});
    animator.set({x: 0});
    expect(element.style.translate).toBe('');
    animator.animate({opacity: 0.5, x: 20}, {spring: springs.quickChange});
    await advance(5000);
    expect(element.style.opacity).toBe('0.5');
    expect(element.style.translate).toBe('20px 0px');
  });

  it('keeps an identity inline where the stylesheet would move the element', async () => {
    const {animator, element} = setup();
    stylesheet.scale = '0.5';
    animator.animate({scale: 0.9}, {spring: springs.quickChange});
    animator.animate({scale: 1}, {spring: springs.quickChange});
    await advance(5000);
    expect(element.style.scale).toBe('none');
  });

  it('writes the end values inline up front, so the last frame needs no main thread', () => {
    const {animator, element} = setup();
    animator.animate(
      {x: 120, y: -40, scale: 1.1, rotate: 12, opacity: 0.25},
      {spring: springs.quickChange},
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
    animator.animate({x: 120}, {spring: springs.quickChange});
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
    animator.animate({x: 120}, {spring: springs.quickChange});
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
    animator.animate({x: 100, opacity: 0.5}, {spring: springs.settle});
    await commitFrame(1000);
    const starts = recorded.map(a => a.startTime);
    expect(starts).toEqual([1000, 1000]);
    animator.animate({rotate: 90}, {spring: springs.settle}, {at: 1234.5});
    expect(live('rotate')[0].startTime).toBe(1234.5);
  });

  it('expands scale onto both axes and reads it back', async () => {
    const {animator} = setup();
    animator.animate({scale: 0.5}, {spring: springs.settle});
    await commitFrame(clock); // the browser starts it
    clock += 5000;
    expect(animator.get('scale')).toBe(0.5);
    expect(animator.get('scaleY')).toBe(0.5);
  });

  it('does nothing for a value already at its target and at rest', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 0}, {spring: springs.settle});
    expect(live('translate')).toHaveLength(0);
    await expect(handle.finished).resolves.toBe(true);
  });
});

describe('a call from rest starts at the commit, as Core Animation does', () => {
  const curve = solveSpring(toSpring(springs.settle), {from: 0, to: 300});

  it('a block before the first frame delays the motion instead of skipping into it', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 300}, {spring: springs.settle});
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

  it('holds its start until the browser starts it', async () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.settle});
    // Nothing has moved on screen yet, whatever the clock says; a time ahead
    // reads the curve from the call's time, and the model is moving: a
    // retarget carries this velocity.
    expect(animator.get('x')).toBe(0);
    expect(animator.get('x', 1100)).toBeCloseTo(curve.value(0.1), 9);
    clock = 1100;
    expect(animator.get('x')).toBe(0);
    expect(animator.getVelocity('x', 1100)).toBeCloseTo(curve.velocity(0.1), 9);
    clock = 1250;
    await commitFrame(1250);
    expect(animator.get('x', 1350)).toBeCloseTo(curve.value(0.1), 9);
    expect(live('translate')[0].startTime).toBe(1250);
  });

  it('a companion sampling a waiting curve ahead follows its shape', async () => {
    // A tab bar's counter-moving copy, sampled from the body's curve.
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.settle});
    const at = clock;
    const samples = [0, 50, 100, 200].map(t => animator.get('x', at + t));
    expect(samples[0]).toBe(0);
    expect(samples.slice(1).map((v, i) => v > samples[i])).toEqual([
      true,
      true,
      true,
    ]);
    expect(samples[2]).toBeCloseTo(curve.value(0.1), 9);
  });

  it('finishes and drops the animation on the committed clock', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 300}, {spring: springs.settle});
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
    const first = animator.animate({x: 300}, {spring: springs.settle});
    await advance(100);
    await expect(first.started).resolves.toBe(1000);
    const second = animator.animate({x: 0}, {spring: springs.settle});
    expect(live('translate')[0].startTime).toBe(1100);
    await expect(second.started).resolves.toBe(1100);
  });

  it('a call stopped before its first frame resolves at its own time', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 300}, {spring: springs.settle});
    animator.stop();
    clock = 1300;
    await commitFrame(1300);
    await expect(handle.started).resolves.toBe(1000);
    await expect(handle.finished).resolves.toBe(false);
  });

  it('a second call before the first frame starts with the same commit', async () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.settle});
    animator.animate({y: 300}, {spring: springs.settle});
    const [animation] = live('translate');
    expect(animation.startTime).toBeNull();
    clock = 1300;
    await commitFrame(1300);
    expect(animator.get('x', 1400)).toBeCloseTo(curve.value(0.1), 9);
    expect(animator.get('y', 1400)).toBeCloseTo(curve.value(0.1), 9);
  });
  it('an explicit clock after a waiting call was finished from outside keeps that clock, with no lead-in', async () => {
    // A sampler holds a call from rest before the browser starts it, then
    // finishes it (the interaction harness's release with finish): the call
    // never gets a start time. A call on an explicit clock that follows plays
    // from that clock instead of waiting on the finished call's start.
    const {animator} = setup();
    animator.animate({opacity: 0}, {spring: springs.settle});
    const [held] = live('opacity');
    expect(held.startTime).toBeNull();
    held.paused = true;
    held.finish();
    clock += 9;
    const at = clock - 4;
    animator.animate({opacity: 1}, {spring: springs.settle}, {at});
    const fade = recorded.filter(a => !a.cancelled && a !== held).at(-1);
    expect(fade?.startTime).toBe(at);
    // The curve moves from its first keyframe: no hold before it.
    expect(fade?.keyframes[1].opacity).not.toBe(fade?.keyframes[0].opacity);
  });
});

describe('review fixes', () => {
  it('a retarget before the first frame starts from what is on screen', async () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.settle});
    // A 150 ms block, then a second call on the same channel, all before the
    // browser started the first.
    clock = 1150;
    animator.animate({x: 100}, {spring: springs.settle});
    expect(animator.get('x')).toBe(0);
    await commitFrame(1150);
    // From where it is drawn, with the velocity the first curve had reached.
    const first = solveSpring(toSpring(springs.settle), {from: 0, to: 300});
    const from0 = solveSpring(toSpring(springs.settle), {
      from: 0,
      to: 100,
      velocity: first.velocity(0.15),
    });
    expect(animator.get('x', 1250)).toBeCloseTo(from0.value(0.1), 9);
  });

  it('retargets the browser has not started keep a flick\u2019s velocity', async () => {
    const {animator} = setup();
    const tracking = {response: 0.08, dampingRatio: 1};
    // Ten moves at 120 Hz retarget the tracking spring, and the browser starts
    // none of them before the finger lifts.
    for (let i = 1; i <= 10; i++) {
      clock = 1000 + (i * 1000) / 120;
      animator.animate({x: -12 * i}, {spring: tracking});
    }
    // Nothing has moved on screen, but the model is moving with the finger.
    expect(animator.get('x')).toBe(0);
    const velocity = animator.getVelocity('x');
    expect(velocity).toBeLessThan(-100);
    // The release springs with that velocity.
    animator.animate({x: -200}, {spring: springs.settle});
    await commitFrame(clock);
    const release = solveSpring(toSpring(springs.settle), {
      from: 0,
      to: -200,
      velocity,
    });
    expect(animator.get('x', clock + 50)).toBeCloseTo(release.value(0.05), 6);
  });

  it('a pager settle after drags the browser has not started is already moving', async () => {
    const {animator} = setup();
    const tracking = {response: 0.08, dampingRatio: 1};
    // A page drag toward the next page, its moves all held.
    for (let i = 1; i <= 6; i++) {
      clock = 1000 + (i * 1000) / 60;
      animator.animate({x: -20 * i}, {spring: tracking});
    }
    const velocity = animator.getVelocity('x');
    expect(velocity).toBeLessThan(0);
    // The settle to the next page starts with the drag's velocity.
    animator.animate({x: -400}, {spring: springs.settle});
    expect(animator.getVelocity('x')).toBeCloseTo(velocity, 6);
    await commitFrame(clock);
    const first = animator.get('x', clock + 16);
    const settle = solveSpring(toSpring(springs.settle), {
      from: 0,
      to: -400,
      velocity,
    });
    expect(first).toBeCloseTo(settle.value(0.016), 6);
    expect(first).toBeLessThan(
      solveSpring(toSpring(springs.settle), {from: 0, to: -400}).value(0.016),
    );
  });

  it('a call adopted by a later same-task call starts with it', async () => {
    const {animator} = setup();
    const a = animator.animate({x: 300}, {spring: springs.settle});
    const b = animator.animate({y: 300}, {spring: springs.settle});
    clock = 1300;
    await commitFrame(1300);
    await expect(b.started).resolves.toBe(1300);
    await expect(a.started).resolves.toBe(1300);
  });

  it('dispose settles every atRest() wait', async () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.settle});
    await commitFrame(1000);
    let rested = false;
    void animator.atRest().then(() => {
      rested = true;
    });
    animator.dispose();
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
    expect(rested).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a rebase and a retarget in the task of a drop from rest start on the browser\u2019s clock', async () => {
    // A list row's drop: it springs home from where the finger left it.
    const {animator} = setup();
    animator.set({y: 30});
    animator.animate({y: 0}, {spring: springs.settle, velocity: {y: 0}});
    // The reorder commits in the same task, on the call's clock: the layout
    // moved the row by 56 px, and the row springs home from there.
    animator.rebase({y: 56}, {at: 1000});
    const home = animator.animate({y: 0}, {spring: springs.settle}, {at: 1000});
    clock = 1004;
    await commitFrame(1004);
    await expect(home.started).resolves.toBe(1004);
    const curve = solveSpring(toSpring(springs.settle), {from: 86, to: 0});
    for (const t of [0, 16, 50, 100, 200]) {
      expect(animator.get('y', 1004 + t)).toBeCloseTo(curve.value(t / 1000), 6);
    }
  });

  it('writing another axis before the first frame keeps the channel on the call\u2019s start', async () => {
    const {animator} = setup();
    animator.animate({opacity: 0.5, x: 100}, {spring: springs.settle});
    animator.set({y: 10});
    const [translate] = live('translate');
    expect(translate.startTime).toBeNull();
    clock = 1300;
    await commitFrame(1300);
    const x = solveSpring(toSpring(springs.settle), {from: 0, to: 100});
    expect(animator.get('x', 1400)).toBeCloseTo(x.value(0.1), 6);
    expect(sampleAt(live('translate')[0], 'translate', 1400)[0]).toBeCloseTo(
      x.value(0.1),
      1,
    );
  });

  it('a same-task write that cancels the call\u2019s first animation still leaves the call on the browser\u2019s start', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 100}, {spring: springs.settle});
    animator.set({y: 10});
    // The cancelled animation's rejection runs before the first frame, as in
    // a browser's task order.
    await Promise.resolve();
    await Promise.resolve();
    clock = 1300;
    await commitFrame(1300);
    await expect(handle.started).resolves.toBe(1300);
    const x = solveSpring(toSpring(springs.settle), {from: 0, to: 100});
    expect(animator.get('x', 1316)).toBeCloseTo(x.value(0.016), 6);
    expect(sampleAt(live('translate')[0], 'translate', 1316)[0]).toBeCloseTo(
      x.value(0.016),
      1,
    );
  });

  it('a write later in the task samples the waiting call\u2019s curve from its start, so the screen and get() share one clock', async () => {
    const {animator} = setup();
    animator.animate({opacity: 0.5, x: 100}, {spring: springs.settle});
    // 100 ms of work in the same task before another axis is written.
    clock = 1100;
    animator.set({y: 10});
    clock = 1300;
    await commitFrame(1300);
    const x = solveSpring(toSpring(springs.settle), {from: 0, to: 100});
    expect(animator.get('x', 1400)).toBeCloseTo(x.value(0.1), 6);
    expect(sampleAt(live('translate')[0], 'translate', 1400)[0]).toBeCloseTo(
      x.value(0.1),
      1,
    );
  });

  it('an earlier {at} on a channel whose other axis waits joins that call, so the screen and get() share its clock', async () => {
    const {animator} = setup();
    clock = 1020;
    animator.animate({x: 100}, {spring: springs.settle});
    // An event timestamp 20 ms before the waiting call's time.
    animator.animate({y: 50}, {spring: springs.settle}, {at: 1000});
    clock = 1300;
    await commitFrame(1300);
    const y = animator.get('y', 1316);
    expect(sampleAt(live('translate')[0], 'translate', 1316)[1]).toBeCloseTo(
      y,
      1,
    );
  });

  it('a later {at} than a call from rest still waiting keeps its own clock, with no hold', async () => {
    const {animator} = setup();
    animator.animate({opacity: 0}, {spring: springs.settle});
    // A frame later the browser has still not started it (a busy compositor),
    // and a tap's call names its own, later clock.
    clock = 1011;
    animator.animate({opacity: 1}, {spring: springs.settle}, {at: 1011});
    const fade = recorded.filter(a => !a.cancelled).at(-1);
    expect(fade?.startTime).toBe(1011);
    // The curve moves from its first keyframe on.
    expect(fade?.keyframes[1].opacity).not.toBe(fade?.keyframes[0].opacity);
  });

  it('a call adopted by a later same-task call starts at the commit, after the work between them', async () => {
    const {animator} = setup();
    const first = animator.animate({x: 100}, {spring: springs.settle});
    // 300 ms of work in the same task, then another axis from rest.
    clock = 1300;
    animator.animate({y: 50}, {spring: springs.settle});
    clock = 1310;
    await commitFrame(1310);
    await expect(first.started).resolves.toBe(1310);
    expect(animator.get('x', 1310)).toBeCloseTo(0, 6);
    expect(sampleAt(live('translate')[0], 'translate', 1310)[0]).toBeCloseTo(
      0,
      1,
    );
  });

  it('under Reduced Motion on a fine pointer, a move leaves a running fade alone', async () => {
    const {animator} = setup({
      reduced: true,
      coarse: false,
    });
    animator.set({opacity: 0});
    animator.animate({opacity: 1}, {spring: springs.settle});
    await advance(10_000);
    animator.animate({x: 40}, {spring: springs.settle});
    expect(animator.get('opacity')).toBe(1);
    expect(animator.get('x')).toBe(40);
  });
});

describe('animatorFor: one animator per element', () => {
  it('gives every caller the same animator for an element', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    expect(animatorFor(a)).toBe(animatorFor(a));
    expect(animatorFor(a)).not.toBe(animatorFor(b));
  });

  it('composes two callers’ axes in one translate track', async () => {
    const row = document.createElement('div');
    const options = {
      now: () => clock,
      requestFrame,
    };
    const swipe = animatorFor(row, options);
    swipe.animate({x: -120}, {spring: springs.settle});
    await advance(50);
    const x = solveSpring(toSpring(springs.settle), {from: 0, to: -120});
    const removal = animatorFor(row, options);
    removal.animate({y: -44}, {spring: springs.settle});
    const tracks = live('translate');
    expect(tracks).toHaveLength(1);
    // x stays on its curve; y starts its own.
    expect(removal.get('x', clock + 30)).toBeCloseTo(x.value(0.08), 9);
    const y = solveSpring(toSpring(springs.settle), {from: 0, to: -44});
    expect(swipe.get('y', clock + 30)).toBeCloseTo(y.value(0.03), 9);
    const [tx, ty] = sampleAt(tracks[0], 'translate', clock + 30);
    expect(tx).toBeCloseTo(x.value(0.08), 1);
    expect(ty).toBeCloseTo(y.value(0.03), 1);
  });
});

describe('rebase: a layout shift under a moving element', () => {
  it('keeps a spring’s spring, velocity and target', async () => {
    const {animator} = setup();
    const handle = animator.animate({y: 100}, {spring: springs.settle});
    await advance(60);
    const value = animator.get('y');
    const velocity = animator.getVelocity('y');
    animator.rebase({y: -40});
    expect(animator.get('y', clock)).toBeCloseTo(value - 40, 9);
    expect(animator.getVelocity('y', clock)).toBeCloseTo(velocity, 6);
    const curve = solveSpring(toSpring(springs.settle), {
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
    animator.animate({x: 120, opacity: 0.5}, {spring: springs.settle});
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
    animator.animate({y: 40}, {spring: springs.quickChange});
    expect(element.style.willChange).toBe('contents, translate');
    await advance(5000 + PROMOTION_LINGER_MS);
    expect(element.style.willChange).toBe('contents');
  });

  it("keeps the stylesheet's will-change reasons while it promotes, and hands them back", async () => {
    const {animator, element} = setup();
    stylesheet = {'will-change': 'transform, opacity'};
    animator.animate({y: 40, opacity: 0.5}, {spring: springs.quickChange});
    expect(element.style.willChange).toBe('transform, translate, opacity');
    await advance(5000 + PROMOTION_LINGER_MS);
    expect(element.style.willChange).toBe('');
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

  it('ends promotion on the element it leaves', () => {
    const {animator, element} = setup();
    animator.animate({x: 50}, {spring: springs.settle});
    expect(element.style.willChange).toBe('translate');
    animator.attach(document.createElement('div'));
    expect(element.style.willChange).toBe('');
  });
});

describe('atRest: waiting out every curve', () => {
  it('resolves when the last curve ends, retargets included', async () => {
    const {animator} = setup();
    animator.animate({y: 100}, {spring: springs.settle});
    let rested = false;
    void animator.atRest(['y']).then(() => {
      rested = true;
    });
    await advance(100);
    // Someone else retargets the row: the wait follows the new curve.
    const second = animator.animate({y: 0}, {spring: springs.settle});
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

describe('presentation values, retargeting, velocity (spec:AST-094 FR6)', () => {
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
    animator.animate({x: 300}, {spring: springs.emphasis, velocity: {x: 800}});
    const first = live('translate')[0];
    await advance(120);
    const value = animator.get('x');
    const velocity = animator.getVelocity('x');
    animator.animate({x: -100}, {spring: springs.emphasis});
    expect(first.cancelled).toBe(true);
    const second = live('translate')[0];
    expect(second.startTime).toBe(clock);
    expect(animator.get('x', clock)).toBeCloseTo(value, 9);
    expect(animator.getVelocity('x', clock)).toBeCloseTo(velocity, 6);
    expect(sampleAt(second, 'translate', clock)[0]).toBeCloseTo(value, 2);
    // And it really goes to the new target with that start.
    const curve = solveSpring(toSpring(springs.emphasis), {
      from: value,
      to: -100,
      velocity,
    });
    expect(animator.get('x', clock + 90)).toBeCloseTo(curve.value(0.09), 9);
  });

  it('velocity is continuous across a retarget (property sweep)', async () => {
    for (const spring of [
      springs.settle,
      springs.quickChange,
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
    animator.animate({x: 300, y: 200}, {spring: springs.settle});
    const yCurve = solveSpring(toSpring(springs.settle), {from: 0, to: 200});
    await advance(100);
    animator.animate({x: 0}, {spring: springs.settle});
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
    animator.animate({x: 300}, {spring: springs.settle});
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
    const handle = animator.animate({x: 100}, {spring: springs.settle});
    await advance(50);
    expect(handle.value('x')).toBe(animator.get('x'));
    expect(handle.velocity('x')).toBe(animator.getVelocity('x'));
    const next = handle.retarget({x: 50});
    await expect(handle.finished).resolves.toBe(false);
    next.stop();
    await expect(next.finished).resolves.toBe(false);
  });
});

describe('set: direct manipulation', () => {
  it('a commit that leaves several channels at identity reads the stylesheet once', () => {
    // Each read after a write forces a style recalculation (a lifted menu
    // that grows back to identity on translate, scale and opacity paid one
    // per channel in its opening commit).
    const {animator} = setup();
    animator.set({x: 10, scale: 2, opacity: 0.5});
    const reads = vi.mocked(window.getComputedStyle).mock.calls.length;
    animator.set({x: 0, scale: 1, opacity: 1});
    expect(vi.mocked(window.getComputedStyle).mock.calls.length - reads).toBe(
      1,
    );
  });

  it('writes one inline style per move and starts no animation', () => {
    const {animator, element} = setup();
    for (let x = 0; x < 30; x += 3) {
      animator.set({x});
      expect(element.style.translate).toBe(x === 0 ? '' : `${x}px 0px`);
    }
    expect(recorded).toHaveLength(0);
  });

  it('a drag on translate leaves a running scale alone', () => {
    const {animator} = setup();
    animator.animate({scale: 0.95}, {spring: springs.settle});
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
    const handle = animator.animate({x: 40}, {spring: springs.quickChange});
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
    const a = animator.animate({x: 40}, {spring: springs.quickChange});
    animator.animate({x: 80}, {spring: springs.quickChange});
    await expect(a.finished).resolves.toBe(false);
    const b = animator.animate({y: 40}, {spring: springs.quickChange});
    animator.set({y: 3});
    await expect(b.finished).resolves.toBe(false);
    const c = animator.animate({rotate: 40}, {spring: springs.quickChange});
    animator.stop(['rotate']);
    await expect(c.finished).resolves.toBe(false);
  });

  it('dispose cancels and settles everything', async () => {
    const {animator} = setup();
    const handle = animator.animate(
      {x: 40, opacity: 0},
      {spring: springs.quickChange},
    );
    animator.dispose();
    await expect(handle.finished).resolves.toBe(false);
    expect(recorded.every(a => a.cancelled)).toBe(true);
    expect(animator.element).toBeNull();
  });
});

describe('Reduced Motion (design:reduced-motion)', () => {
  // A coarse primary pointer, or a touch drag's release on any pointer,
  // cross-fades (DR2); any other call completes at once (DR3).
  const reduced = (coarse = true) => setup({reduced: true, coarse});
  const fade = timing.reducedMotionCrossFadeMs;
  const ease = cubicBezier(timing.curves.move);
  /** Every animation the browser was handed changes opacity only. */
  const opacityOnly = () =>
    recorded.every(animation =>
      animation.keyframes.every(keyframe =>
        Object.keys(keyframe).every(key =>
          ['opacity', 'offset', 'easing', 'composite'].includes(key),
        ),
      ),
    );

  it('an entrance after an outside finish starts from what is on screen', async () => {
    const {animator} = reduced();
    animator.animate(
      {opacity: 0},
      {spring: springs.settle},
      {crossfadeAs: 'exit'},
    );
    await commitFrame(clock);
    await advance(16);
    // A test utility finishes the fade out: opacity 0 on screen, while the
    // curve would still read about 0.93.
    const [exit] = live('opacity');
    exit.finish();
    animator.animate(
      {opacity: 1},
      {spring: springs.settle},
      {crossfadeAs: 'entrance'},
    );
    const fade = live('opacity').at(-1);
    expect(fade?.keyframes[0].opacity).toBe('0');
  });

  it('fades for 200 ms at most', () => {
    expect(fade).toBeGreaterThan(0);
    expect(fade).toBeLessThanOrEqual(200);
  });

  it('never animates a transform, on either pointer', async () => {
    for (const coarse of [true, false]) {
      const {animator} = reduced(coarse);
      animator.animate({x: 100}, {spring: springs.navigationPush});
      animator.animate({y: 400, opacity: 0}, {spring: springs.sheetDismiss});
      animator.animate(
        {scale: 0.9},
        {spring: springs.quickChange},
        {crossfadeAs: 'exit'},
      );
      await advance(1000);
    }
    expect(recorded.length).toBeGreaterThan(0);
    expect(opacityOnly()).toBe(true);
  });

  it("a move with no opacity of its own dips from and back to the stylesheet's opacity, then hands it back", async () => {
    const {animator, element} = reduced();
    stylesheet = {opacity: '0.6'};
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(clock); // the browser starts it
    expect(animator.get('opacity', 1000)).toBeCloseTo(0.6, 9);
    const [out] = live('opacity');
    expect(out.keyframes[0].opacity).toBe('0.6');
    await advance(fade / 2);
    // Landed while transparent, fading back in to the stylesheet's value.
    expect(animator.get('x')).toBe(100);
    expect(animator.get('opacity', clock + fade / 2)).toBeCloseTo(0.6, 9);
    await advance(fade / 2 + END_HOLD_MS + 1);
    // No inline opacity is left behind: the stylesheet owns it again.
    expect(element.style.opacity).toBe('');
    expect(animator.get('opacity')).toBe(1);
  });

  it('overlapping dips on the stylesheet opacity never leave it pinned inline', async () => {
    for (const at of ['fading out', 'fading back in'] as const) {
      const {animator, element} = reduced();
      stylesheet = {opacity: '0.6'};
      animator.animate({x: 100}, {spring: springs.navigationPush});
      await commitFrame(clock);
      await advance(at === 'fading out' ? fade / 4 : fade / 2 + 20);
      animator.animate({x: 200}, {spring: springs.navigationPush});
      await commitFrame(clock);
      await advance(fade * 2 + END_HOLD_MS + 1);
      expect(animator.get('x')).toBe(200);
      // The stylesheet owns opacity again.
      expect(element.style.opacity).toBe('');
      expect(animator.get('opacity')).toBe(1);
    }
  });

  it('detaching and attaching a new node during a dip lands the move on it (React replacement)', async () => {
    const {animator} = reduced();
    const handle = animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(clock);
    await advance(50);
    animator.attach(null);
    const replacement = document.createElement('div');
    animator.attach(replacement);
    // The dip goes on on the new node: the move lands at its bottom.
    await advance(fade);
    expect(animator.get('x')).toBe(100);
    expect(replacement.style.translate).toBe('100px 0px');
    await expect(handle.finished).resolves.toBe(true);
  });

  it('a move that overlaps a running fade lands only once the element is invisible', async () => {
    const {animator} = reduced();
    animator.set({opacity: 0});
    animator.animate({opacity: 1}, {spring: springs.navigationPush});
    await advance(fade / 3);
    const start = clock;
    expect(animator.get('opacity')).toBeGreaterThan(0.1);
    animator.animate({x: 100}, {spring: springs.navigationPush});
    // Still where it was while it shows; it moves at the bottom of the dip.
    await advance(fade / 2 - 2);
    expect(clock - start).toBe(fade / 2 - 2);
    expect(animator.get('x')).toBe(0);
    await advance(4);
    expect(animator.get('x')).toBe(100);
    expect(animator.get('opacity')).toBeLessThan(0.1);
    await advance(fade);
    expect(animator.get('opacity')).toBeCloseTo(1, 9);
  });

  it("a second call's fade re-times the first call's pending jump to its own invisible moment", async () => {
    const {animator} = reduced();
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    const start = clock;
    // x still waits for the first dip's bottom; y starts a new dip now.
    animator.animate({y: 50}, {spring: springs.navigationPush});
    // Neither moves while the element shows: both land at the new dip's
    // bottom.
    await advance(fade / 2 - 2);
    expect(clock - start).toBe(fade / 2 - 2);
    expect(animator.get('x')).toBe(0);
    expect(animator.get('y')).toBe(0);
    await advance(4);
    expect(animator.get('x')).toBe(100);
    expect(animator.get('y')).toBe(50);
    expect(animator.get('opacity')).toBeLessThan(0.1);
  });

  it('a stop during a dip finishes the fade instead of freezing it', async () => {
    const {animator} = reduced();
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 2 - 5);
    expect(animator.get('opacity')).toBeLessThan(0.1);
    animator.stop();
    expect(animator.get('opacity')).toBe(1);
  });

  it("a stop during a dip on the stylesheet's opacity hands it back", async () => {
    const {animator, element} = reduced();
    stylesheet = {opacity: '0.6'};
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    animator.stop();
    expect(element.style.opacity).toBe('');
    expect(animator.get('opacity')).toBe(1);
  });

  it('a call that does not own opacity keeps a running borrowed dip handing it back', async () => {
    // One that moves nothing.
    const still = reduced();
    stylesheet = {opacity: '0.6'};
    still.animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    still.animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade + END_HOLD_MS + 1);
    expect(still.element.style.opacity).toBe('');

    // One that springs after Reduce Motion turned off mid-dip.
    const changed = setup({reduced: true, coarse: true});
    changed.animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    stubMedia(false, true);
    changed.animator.animate({y: 20}, {spring: springs.navigationPush});
    await advance(2000);
    expect(changed.element.style.opacity).toBe('');
  });

  it('a borrowed dip that ends while detached hands the opacity back on the next attach', async () => {
    const {animator, element} = reduced();
    stylesheet = {opacity: '0.6'};
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(25);
    animator.attach(null);
    await advance(fade + END_HOLD_MS + 1);
    animator.attach(element);
    expect(element.style.opacity).toBe('');
    expect(animator.get('opacity')).toBe(1);
  });

  it('an unmount or dispose during a borrowed dip hands the opacity back to that element', async () => {
    for (const end of ['detach', 'dispose'] as const) {
      const {animator, element} = reduced();
      stylesheet = {opacity: '0.6'};
      animator.animate({x: 100}, {spring: springs.navigationPush});
      await advance(25);
      if (end === 'detach') {
        animator.attach(null);
      } else {
        animator.dispose();
      }
      expect(element.style.opacity).toBe('');
    }
  });

  it('a new element taking over mid-dip keeps the dip, so the move lands while invisible', async () => {
    const {animator, element} = reduced();
    stylesheet = {opacity: '0.6'};
    animator.animate({x: 240}, {spring: springs.navigationPush});
    await advance(25);
    const next = document.createElement('div');
    document.body.append(next);
    animator.attach(next);
    // The outgoing element follows its stylesheet again.
    expect(element.style.opacity).toBe('');
    const start = clock - 25;
    for (let t = start; t <= start + fade; t += 2) {
      if (animator.get('x', t) !== 0) {
        expect(animator.get('opacity', t)).toBeCloseTo(0, 6);
        break;
      }
    }
    await advance(fade + END_HOLD_MS + 1);
    expect(next.style.opacity).toBe('');
    next.remove();
  });

  it('an identity held over a differing stylesheet follows a node replacement', () => {
    const {animator, element} = reduced();
    stylesheet = {opacity: '0'};
    animator.set({opacity: 1});
    expect(element.style.opacity).toBe('1');
    animator.attach(null);
    const next = document.createElement('div');
    document.body.append(next);
    animator.attach(next);
    expect(next.style.opacity).toBe('1');
    expect(animator.get('opacity')).toBe(1);
    next.remove();
  });

  it('a running dip survives any re-attach, so the move never passes in view', async () => {
    const halfway = async (
      animator: ReturnType<typeof createAnimator>,
      start: number,
    ): Promise<number> => {
      // The plan lands by timer: step the clock to the landing.
      while (clock <= start + fade) {
        await advance(2);
        if (animator.get('x') !== 0) {
          return animator.get('opacity');
        }
      }
      return Number.NaN;
    };
    // Detached and re-attached to the same element, no stylesheet opacity.
    const same = reduced();
    same.animator.animate({x: 240}, {spring: springs.navigationPush});
    const start = clock;
    await advance(25);
    same.animator.attach(null);
    same.animator.attach(same.element);
    expect(await halfway(same.animator, start)).toBeCloseTo(0, 6);
    // Handed to another element, no stylesheet opacity.
    const other = reduced();
    other.animator.animate({x: 240}, {spring: springs.navigationPush});
    const start2 = clock;
    await advance(25);
    const next = document.createElement('div');
    document.body.append(next);
    other.animator.attach(next);
    expect(await halfway(other.animator, start2)).toBeCloseTo(0, 6);
    await advance(fade + END_HOLD_MS + 1);
    expect(next.style.opacity).toBe('');
    next.remove();
  });

  it('an opacity the animator wrote is owned: a dip returns to it, never to a hiding stylesheet', async () => {
    const {animator, element} = reduced();
    stylesheet = {opacity: '0'};
    animator.set({opacity: 1});
    expect(element.style.opacity).toBe('1');
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade + END_HOLD_MS + 1);
    expect(element.style.opacity).toBe('1');
  });

  it('borrows nothing from a hidden element, so a later move still dips once it shows', async () => {
    const {animator} = reduced();
    stylesheet = {opacity: '0'};
    animator.animate({x: 100}, {spring: springs.navigationPush});
    // Invisible: the move lands at once, with no dip.
    expect(animator.get('x')).toBe(100);
    await advance(fade + END_HOLD_MS + 1);
    stylesheet = {opacity: '1'};
    animator.animate({x: 200}, {spring: springs.navigationPush});
    const start = clock;
    for (let t = start; t <= start + fade; t += 2) {
      if (animator.get('x', t) !== 100) {
        expect(animator.get('opacity', t)).toBeCloseTo(0, 6);
        break;
      }
    }
  });

  it("a stop that finishes a dip's fade lands the move with it, never later in view", async () => {
    const {animator} = reduced();
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    animator.stop(['opacity']);
    expect(animator.get('x')).toBe(100);
    expect(animator.get('opacity')).toBe(1);
  });

  it('a release past an edge springs back as a cross-fade, not momentum (DR2)', async () => {
    const {animator} = reduced();
    animator.set({x: -80});
    const start = clock;
    animator.decay(
      coast(animator, {x: 0}, {bounds: {x: {min: 0, max: 100}}, at: start}),
      {at: start},
    );
    // The plan lands by timer: step the clock; it moves only while invisible.
    let moved = false;
    while (clock <= start + fade) {
      await advance(2);
      if (!moved && animator.get('x') !== -80) {
        moved = true;
        expect(animator.get('opacity')).toBeLessThan(0.1);
      }
    }
    expect(moved).toBe(true);
    expect(animator.get('x')).toBe(0);
  });

  it('a spring back a touch release starts cross-fades on a fine pointer too (DR2)', async () => {
    const {animator} = reduced(false);
    animator.set({x: -80});
    const start = clock;
    animator.decay(
      coast(animator, {x: 0}, {bounds: {x: {min: 0, max: 100}}, at: start}),
      {at: start, touchRelease: true},
    );
    // Not at once: it moves only while invisible.
    expect(animator.get('x')).toBe(-80);
    let moved = false;
    while (clock <= start + fade) {
      await advance(2);
      if (!moved && animator.get('x') !== -80) {
        moved = true;
        expect(animator.get('opacity')).toBeLessThan(0.1);
      }
    }
    expect(moved).toBe(true);
    expect(animator.get('x')).toBe(0);
  });

  it('a release with one axis past an edge is one handle: stop() stops the cross-fade too', async () => {
    const {animator} = reduced();
    animator.set({x: -80, y: 0});
    const start = clock;
    const handle = animator.decay(
      coast(
        animator,
        {x: 0, y: 500},
        {bounds: {x: {min: 0, max: 100}}, at: start},
      ),
      {at: start},
    );
    expect(handle.properties).toEqual(expect.arrayContaining(['x', 'y']));
    await advance(fade / 4);
    handle.stop();
    // A catch freezes the release where it is on screen (AST-094 FR6): x
    // never lands at its edge, and the fade it was waiting in finishes.
    const stopped = {x: animator.get('x'), y: animator.get('y')};
    expect(stopped.x).toBe(-80);
    expect(animator.get('opacity')).toBe(1);
    await advance(fade + END_HOLD_MS + 1);
    expect(animator.get('x')).toBe(-80);
    expect(animator.get('y')).toBe(stopped.y);
  });

  it('a carried move keeps its own call: stopping or setting it settles that call, not the one carrying it', async () => {
    for (const interrupt of ['set', 'stop'] as const) {
      const {animator} = reduced();
      const a = animator.animate({x: 100}, {spring: springs.navigationPush});
      await advance(fade / 4);
      const b = animator.animate({y: 50}, {spring: springs.navigationPush});
      if (interrupt === 'set') {
        animator.set({x: 40});
      } else {
        a.stop();
      }
      await advance(fade * 2 + END_HOLD_MS + 1);
      await expect(a.finished).resolves.toBe(false);
      await expect(b.finished).resolves.toBe(true);
      expect(animator.get('x')).toBe(interrupt === 'set' ? 40 : 0);
      expect(animator.get('y')).toBe(50);
    }
  });

  it("an earlier handle's stop leaves a later call's move on the same property alone", async () => {
    const {animator} = reduced();
    const a = animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    const b = animator.animate({x: 200}, {spring: springs.navigationPush});
    a.stop();
    await advance(fade * 2 + END_HOLD_MS + 1);
    expect(animator.get('x')).toBe(200);
    await expect(a.finished).resolves.toBe(false);
    await expect(b.finished).resolves.toBe(true);
  });

  it('a retargeted call settles interrupted; its retarget lands', async () => {
    const {animator} = reduced();
    const a = animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    const b = a.retarget({x: 150});
    await advance(fade * 2 + END_HOLD_MS + 1);
    expect(animator.get('x')).toBe(150);
    await expect(a.finished).resolves.toBe(false);
    await expect(b.finished).resolves.toBe(true);
  });

  it('a move whose animations are paused before their first frame still lands once released', async () => {
    for (const release of ['resume', 'finish'] as const) {
      const {animator} = reduced();
      const handle = animator.animate(
        {x: 100},
        {spring: springs.navigationPush},
      );
      // Something pauses the call's animations in its own task.
      for (const animation of recorded) {
        animation.paused = true;
      }
      await commitFrame(clock);
      clock += 30;
      await commitFrame(clock);
      for (const animation of recorded) {
        if (release === 'resume') {
          // play(): pending, so the start comes a frame later, after the
          // frame's callbacks.
          animation.paused = false;
          animation.startDelayFrames = 1;
        } else {
          animation.finish();
        }
      }
      // Frames keep coming: step the clock through the landing.
      for (let step = 0; step < 16; step++) {
        await advance(fade / 4);
      }
      expect(animator.get('x')).toBe(100);
      expect(animator.get('opacity')).toBe(1);
      await expect(handle.finished).resolves.toBe(true);
    }
  });

  it('a waiting call whose own opacity a later call retargets settles interrupted', async () => {
    const {animator} = reduced();
    const dismiss = animator.animate(
      {y: 800, opacity: 0},
      {spring: springs.sheetDismiss},
    );
    await advance(fade / 4);
    const show = animator.animate({opacity: 1}, {spring: springs.settle});
    // The plan lands by timer: step the clock through the dip.
    for (let step = 0; step < 12; step++) {
      await advance(fade / 8);
    }
    expect(animator.get('opacity')).toBe(1);
    await expect(dismiss.finished).resolves.toBe(false);
    await expect(show.finished).resolves.toBe(true);
  });

  it('a move taken back mid-dip fades straight back up instead of finishing the dip', async () => {
    const {animator} = reduced();
    const move = animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    const shown = animator.get('opacity');
    expect(shown).toBeLessThan(1);
    const back = animator.animate({x: 0}, {spring: springs.navigationPush});
    let lowest = shown;
    for (let step = 0; step < 12; step++) {
      await advance(fade / 8);
      lowest = Math.min(lowest, animator.get('opacity'));
    }
    expect(lowest).toBeGreaterThanOrEqual(shown - 1e-6);
    expect(animator.get('x')).toBe(0);
    expect(animator.get('opacity')).toBe(1);
    await expect(move.finished).resolves.toBe(false);
    await expect(back.finished).resolves.toBe(true);
  });

  it('an entrance by role caught mid-exit fades in from where the exit has it', async () => {
    const {animator} = reduced();
    animator.animate(
      {y: 40},
      {spring: springs.navigationPush},
      {crossfadeAs: 'exit'},
    );
    await advance(fade / 4);
    const shown = animator.get('opacity');
    expect(shown).toBeLessThan(1);
    animator.animate(
      {y: 0},
      {spring: springs.navigationPush},
      {crossfadeAs: 'entrance'},
    );
    let lowest = shown;
    for (let step = 0; step < 12; step++) {
      await advance(fade / 8);
      lowest = Math.min(lowest, animator.get('opacity'));
    }
    expect(lowest).toBeGreaterThanOrEqual(shown - 1e-6);
    expect(animator.get('y')).toBe(0);
    expect(animator.get('opacity')).toBe(1);
  });

  it('a caught dismissal fades straight back up: a call that sets every waiting value takes it over', async () => {
    const {animator} = reduced();
    const dismiss = animator.animate(
      {y: 800, opacity: 0},
      {spring: springs.sheetDismiss},
    );
    await advance(fade / 4);
    const shown = animator.get('opacity');
    const present = animator.animate(
      {y: 0, opacity: 1},
      {spring: springs.sheetPresent},
    );
    await commitFrame(clock);
    // No dip: the opacity only rises from where it was.
    let lowest = shown;
    const start = clock;
    while (clock <= start + fade * 2) {
      await advance(2);
      lowest = Math.min(lowest, animator.get('opacity'));
    }
    expect(lowest).toBeGreaterThanOrEqual(shown - 1e-6);
    expect(animator.get('y')).toBe(0);
    expect(animator.get('opacity')).toBe(1);
    await expect(dismiss.finished).resolves.toBe(false);
    await expect(present.finished).resolves.toBe(true);
  });

  it("a handle's stop mid-dip freezes its waiting travel where it is, as animator.stop() does (AST-094 FR6)", async () => {
    const {animator} = reduced();
    const handle = animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    handle.stop();
    expect(animator.get('x')).toBe(0);
    expect(animator.get('opacity')).toBe(1);
    await advance(fade + END_HOLD_MS + 1);
    expect(animator.get('x')).toBe(0);
    await expect(handle.finished).resolves.toBe(false);
  });

  it('a second move during a borrowed dip copies no stylesheet opacity inline', async () => {
    const {animator, element} = reduced();
    stylesheet = {opacity: '0.6'};
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    animator.animate({y: 50}, {spring: springs.navigationPush});
    await advance(fade / 2);
    // Landed, and fading back in to the stylesheet's value.
    expect(animator.get('opacity', clock + fade / 2)).toBeCloseTo(0.6, 9);
    await advance(fade + END_HOLD_MS + 1);
    expect(element.style.opacity).toBe('');
    expect(animator.get('opacity')).toBe(1);
  });

  it('a stop during a dip whose opacity a call owns ends where the fade was heading', async () => {
    const {animator} = reduced();
    animator.set({opacity: 0.8});
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(clock);
    await advance(50);
    animator.stop();
    expect(animator.get('opacity')).toBeCloseTo(0.8, 9);
  });

  it('an opacity change mid-dip lands the waiting move only once the element is invisible', async () => {
    const {animator} = reduced();
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(clock);
    await advance(20);
    animator.animate({opacity: 0}, {spring: springs.navigationPush});
    // Still where it was while it shows.
    expect(animator.get('x')).toBe(0);
    await advance(fade - 2);
    expect(animator.get('x')).toBe(0);
    await advance(4);
    expect(animator.get('x')).toBe(100);
    expect(animator.get('opacity')).toBeCloseTo(0, 9);
  });

  it('a second borrowed dip opens at the opacity on screen', async () => {
    const {animator} = reduced();
    stylesheet = {opacity: '0.6'};
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(clock);
    await advance(fade / 4);
    const before = animator.get('opacity');
    expect(before).toBeLessThan(0.6);
    animator.animate({x: 200}, {spring: springs.navigationPush});
    expect(animator.get('opacity')).toBeCloseTo(before, 6);
  });

  it("a fade by role on a stylesheet's opacity ends on it and hands it back", async () => {
    for (const role of ['entrance', 'exit'] as const) {
      const {animator, element} = reduced();
      stylesheet = {opacity: '0.6'};
      animator.animate(
        {x: 100},
        {spring: springs.navigationPush},
        {crossfadeAs: role},
      );
      await commitFrame(clock);
      const [layer] = live('opacity');
      const keyframes = layer.keyframes.map(k => Number(k.opacity));
      expect(Math.max(...keyframes)).toBeCloseTo(0.6, 9);
      await advance(fade * 2 + END_HOLD_MS + 1);
      expect(animator.get('x')).toBe(100);
      expect(element.style.opacity).toBe('');
    }
  });

  it('a move set before its dip lands does not report finished', async () => {
    const {animator} = reduced();
    const handle = animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(clock);
    await advance(20);
    animator.set({x: 40});
    await expect(handle.finished).resolves.toBe(false);
    await advance(fade + END_HOLD_MS + 1);
    expect(animator.get('x')).toBe(40);
  });

  it('dispose settles a move still waiting to land, and the calls it carries, as interrupted', async () => {
    const {animator} = reduced();
    const first = animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(clock);
    await advance(10);
    const second = animator.animate({y: 50}, {spring: springs.navigationPush});
    await advance(10);
    animator.dispose();
    await expect(first.finished).resolves.toBe(false);
    await expect(second.finished).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a caught or replaced exit by role hands the stylesheet's opacity back", async () => {
    // Caught: stop() 50 ms into the exit.
    const caught = reduced();
    stylesheet = {opacity: '0.6'};
    caught.animator.animate(
      {x: 100},
      {spring: springs.navigationPush},
      {crossfadeAs: 'exit'},
    );
    await commitFrame(clock);
    await advance(50);
    caught.animator.stop();
    expect(caught.element.style.opacity).toBe('');
    // Replaced: React swaps the node 50 ms into the exit.
    const replaced = reduced();
    stylesheet = {opacity: '0.6'};
    replaced.animator.animate(
      {x: 100},
      {spring: springs.navigationPush},
      {crossfadeAs: 'exit'},
    );
    await commitFrame(clock);
    await advance(50);
    replaced.animator.attach(null);
    const node = document.createElement('div');
    replaced.animator.attach(node);
    expect(replaced.element.style.opacity).toBe('');
    // The exit goes on on the new node, then hands the opacity back.
    await advance(fade + END_HOLD_MS + 1);
    expect(node.style.opacity).toBe('');
    expect(replaced.animator.get('x')).toBe(100);
  });

  it('dispose mid-dip or mid-exit leaves the element visible where it was going', async () => {
    // A dip on an owned opacity.
    const dip = reduced();
    dip.animator.set({opacity: 0.8});
    dip.animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(clock);
    await advance(50);
    dip.animator.dispose();
    expect(dip.element.style.opacity).toBe('0.8');
    expect(dip.element.style.translate).toBe('100px 0px');
    // An exit by role.
    const exit = reduced();
    exit.animator.animate(
      {x: 100},
      {spring: springs.navigationPush},
      {crossfadeAs: 'exit'},
    );
    await commitFrame(clock);
    await advance(50);
    exit.animator.dispose();
    expect(['', '1']).toContain(exit.element.style.opacity);
    expect(exit.element.style.translate).toBe('100px 0px');
  });

  it('an unmount mid-dip leaves no compositing promotion on the element it leaves', async () => {
    const {animator, element} = reduced();
    animator.decay(coast(animator, {y: 1500}));
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(clock);
    await advance(20);
    animator.attach(null);
    expect(element.style.willChange).toBe('');
  });

  it("a new element taking over an exit by role leaves the stylesheet's opacity on the outgoing one", async () => {
    const {animator, element} = reduced();
    stylesheet = {opacity: '0.6'};
    animator.animate(
      {x: 100},
      {spring: springs.navigationPush},
      {crossfadeAs: 'exit'},
    );
    await commitFrame(clock);
    await advance(50);
    animator.attach(document.createElement('div'));
    expect(element.style.opacity).toBe('');
  });

  it('an unmount mid-dip lands the move where it was going, so a later attach shows it visible there', async () => {
    const {animator, element} = reduced();
    animator.set({opacity: 0.8});
    const handle = animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(clock);
    await advance(50);
    animator.attach(null);
    await Promise.resolve(); // the end of the task: an unmount
    await expect(handle.finished).resolves.toBe(false);
    await advance(fade);
    animator.attach(element);
    expect(animator.get('x')).toBe(100);
    expect(animator.get('opacity')).toBeCloseTo(0.8, 9);
    expect(element.style.opacity).toBe('0.8');
    expect(element.style.translate).toBe('100px 0px');
  });

  it('a move dips: fades out, lands while transparent, fades back in', async () => {
    const {animator, element} = reduced();
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(clock); // the browser starts it
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

  it('a landing a busy main thread runs late still ends the dip on time', async () => {
    const {animator} = reduced();
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(1000);
    // The task that lands it runs 80 ms late (the page's clock is ahead
    // of the timer when it fires).
    clock += fade / 2 + 80;
    await vi.advanceTimersByTimeAsync(fade / 2);
    // Landed while transparent, never shown in the wrong place.
    expect(animator.get('x')).toBe(100);
    expect(animator.get('opacity')).toBeCloseTo(0, 9);
    // The fade back in takes what is left: the dip ends when it was due.
    expect(animator.get('opacity', 1000 + fade)).toBe(1);
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

  it('two calls in one frame both land', async () => {
    // A drag cancel: the position on one spring, the scale on another.
    const {animator, element} = reduced();
    animator.set({x: 6.3, y: 84, scale: 0.969});
    const position = animator.animate(
      {x: 0, y: 0},
      {spring: springs.sheetPresent},
      {touchRelease: true},
    );
    const scale = animator.animate(
      {scale: 1},
      {spring: springs.quickChange},
      {touchRelease: true},
    );
    const settled: boolean[] = [];
    void position.finished.then(value => settled.push(value));
    void scale.finished.then(value => settled.push(value));
    await commitFrame(clock);
    // Both land at the bottom of one dip, then fade back in together.
    await advance(fade / 2);
    expect(animator.get('x')).toBe(0);
    expect(animator.get('scaleX')).toBe(1);
    expect(animator.get('opacity')).toBeCloseTo(0, 9);
    await advance(fade);
    expect(animator.get('x')).toBe(0);
    expect(animator.get('y')).toBe(0);
    expect(animator.get('scaleX')).toBe(1);
    expect(animator.get('opacity')).toBe(1);
    // Back at identity with nothing running: the inline value is gone.
    expect(element.style.translate).toBe('');
    expect(settled).toEqual([true, true]);
    expect(opacityOnly()).toBe(true);
  });

  it('a move during a dip\u2019s fade out dips once more and ends visible', async () => {
    const {animator} = reduced();
    animator.animate({y: 100}, {spring: springs.sheetPresent});
    await commitFrame(clock);
    // Half-way down the first dip's fade out, a frame or more later.
    await advance(fade / 4);
    animator.animate({y: 120}, {spring: springs.sheetPresent});
    await commitFrame(clock);
    await advance(fade / 2);
    await advance(fade);
    expect(animator.get('y')).toBe(120);
    expect(animator.get('opacity')).toBe(1);
  });

  it('a drop, its reorder\u2019s rebase and the move to the new slot in one task dip once', async () => {
    // A list row's drop under Reduce Motion: the drop from where the finger
    // left it, then the reorder's commit (the layout moved the row by 56 px)
    // and the move to its new slot, in one task on one clock.
    const {animator} = reduced();
    animator.set({y: 30});
    const at = clock;
    animator.animate(
      {y: 0},
      {spring: springs.settle, velocity: {y: 0}},
      {at, touchRelease: true},
    );
    // The commit comes a few ms later, once the first fade has begun.
    clock += 8;
    const at2 = clock;
    animator.rebase({y: 56}, {at: at2});
    animator.animate(
      {y: 0},
      {spring: springs.settle},
      {at: at2, touchRelease: true},
    );
    await commitFrame(clock);
    // It never moves while visible, and fades all the way out once.
    let lowest = 1;
    for (let t = 0; t <= fade / 2; t += 10) {
      const opacity = animator.get('opacity', at2 + t);
      lowest = Math.min(lowest, opacity);
      if (opacity > 0.01) {
        expect(animator.get('y', at2 + t)).toBe(86);
      }
    }
    expect(lowest).toBeLessThanOrEqual(0.1);
    await advance(fade / 2);
    expect(animator.get('y')).toBe(0);
    await advance(fade);
    expect(animator.get('y')).toBe(0);
    expect(animator.get('opacity')).toBe(1);
  });

  it('a later opacity change carries a waiting move to its own invisible moment instead of dropping it', async () => {
    const {animator} = reduced();
    const move = animator.animate({x: 100}, {spring: springs.navigationPush});
    await commitFrame(clock);
    animator.animate({opacity: 0.5}, {spring: springs.settle});
    // Not while the element shows: at the bottom of the new call's dip.
    expect(animator.get('x')).toBe(0);
    const start = clock;
    let landedAt: number | null = null;
    while (clock <= start + fade * 2) {
      await advance(2);
      if (landedAt == null && animator.get('x') !== 0) {
        landedAt = animator.get('opacity');
      }
    }
    expect(landedAt).not.toBeNull();
    expect(landedAt as number).toBeLessThan(0.05);
    expect(animator.get('x')).toBe(100);
    expect(animator.get('opacity')).toBeCloseTo(0.5, 9);
    await expect(move.finished).resolves.toBe(true);
  });

  it('a move whose opacity rises from or falls to a visible value lands only while transparent (DR1, DR2)', async () => {
    for (const [from, to] of [
      [0.5, 1],
      [1, 0.5],
    ] as const) {
      const {animator} = reduced();
      animator.set({opacity: from});
      animator.animate({x: 100, opacity: to}, {spring: springs.navigationPush});
      expect(animator.get('x')).toBe(0);
      const start = clock;
      let landedAt: number | null = null;
      while (clock <= start + fade * 2) {
        await advance(2);
        if (landedAt == null && animator.get('x') !== 0) {
          landedAt = animator.get('opacity');
        }
      }
      expect(landedAt).not.toBeNull();
      expect(landedAt as number).toBeLessThan(0.05);
      expect(animator.get('x')).toBe(100);
      expect(animator.get('opacity')).toBeCloseTo(to, 9);
    }
  });

  it('an entrance lands in place and fades in', async () => {
    const {animator} = reduced();
    animator.set({y: 400, opacity: 0});
    animator.animate({y: 0, opacity: 1}, {spring: springs.sheetPresent});
    await commitFrame(clock); // the browser starts it
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
    await commitFrame(clock); // the browser starts it
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

  it('an opacity change on a spring becomes the timed fade, never the spring', async () => {
    const {animator} = reduced();
    animator.animate({opacity: 0}, {spring: springs.alertDismiss});
    await commitFrame(clock); // the browser starts it
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

  it('a slide without opacity takes its direction from crossfadeAs', async () => {
    const entrance = reduced().animator;
    entrance.set({x: 300});
    entrance.animate(
      {x: 0},
      {spring: springs.navigationPush},
      {crossfadeAs: 'entrance'},
    );
    await commitFrame(clock); // the browser starts it
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
    await commitFrame(clock); // the browser starts it
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
    expect(recorded).toHaveLength(0);
    expect(animator.get('x')).toBe(100);
    expect(animator.get('opacity')).toBe(0.5);
  });

  it('fades on a fine pointer when a touch release started the call', async () => {
    const {animator} = reduced(false);
    animator.animate(
      {y: 400, opacity: 0},
      {spring: springs.sheetDismiss},
      {touchRelease: true},
    );
    await commitFrame(clock); // the browser starts it
    expect(animator.get('opacity', 1000 + fade / 2)).toBeCloseTo(
      1 - ease(0.5),
      9,
    );
    await advance(fade);
    expect(animator.get('y')).toBe(400);
  });

  it('no theme lengthens the fade', async () => {
    const {animator, element} = reduced();
    element.style.setProperty(
      '--motion-timing-reduced-motion-cross-fade-ms',
      '900ms',
    );
    document.documentElement.append(element);
    animator.animate({opacity: 0}, {spring: springs.settle});
    await commitFrame(clock); // the browser starts it
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

  it('crossfadeAs changes nothing without Reduced Motion', async () => {
    const {animator} = setup();
    animator.set({y: 800});
    animator.animate(
      {y: 0},
      {spring: springs.sheetPresent},
      {crossfadeAs: 'entrance'},
    );
    await commitFrame(clock); // the browser starts it
    expect(live('opacity')).toHaveLength(0);
    expect(animator.getVelocity('y', 1010)).toBeLessThan(0);
  });
});

describe('decay: momentum curves (a coast)', () => {
  it('plays a coast and comes to rest where it projects', async () => {
    const {animator} = setup();
    animator.decay(coast(animator, {y: -2400}));
    await commitFrame(clock); // the browser starts it
    const glide = solveDecay({from: 0, velocity: -2400});
    for (const t of [0, 16, 100, 400, 1200]) {
      expect(animator.get('y', 1000 + t)).toBeCloseTo(glide.value(t / 1000), 9);
    }
    const [animation] = live('translate');
    for (let t = 0; t < 1500; t += 3) {
      expect(
        Math.abs(
          sampleAt(animation, 'translate', 1000 + t)[1] - glide.value(t / 1000),
        ),
      ).toBeLessThan(0.11);
    }
    expect(animator.get('y', 1e7)).toBeCloseTo(glide.rest, 9);
  });

  it('a coast that reaches an edge hands its velocity to the edge spring', async () => {
    const {animator} = setup();
    animator.set({y: -100});
    animator.decay(
      coast(animator, {y: 3000}, {bounds: {y: {min: -2000, max: 0}}}),
    );
    await commitFrame(clock); // the browser starts it
    const glide = solveDecay({from: -100, velocity: 3000});
    const contact = 1000 + (glide.timeToReach(0) as number) * 1000;
    expect(animator.get('y', contact)).toBeCloseTo(0, 6);
    expect(animator.getVelocity('y', contact - 1e-6)).toBeCloseTo(
      animator.getVelocity('y', contact + 1e-6),
      2,
    );
    // It overshoots past the edge, then comes back to it.
    expect(animator.get('y', contact + 60)).toBeGreaterThan(0);
    expect(animator.get('y', 1e7)).toBe(0);
  });

  it('a release past an edge springs straight back with the release velocity', async () => {
    const {animator} = setup();
    animator.set({x: 60});
    animator.decay(
      coast(animator, {x: 400}, {bounds: {x: {min: -500, max: 0}}}),
    );
    await commitFrame(clock); // the browser starts it
    expect(animator.getVelocity('x')).toBeCloseTo(400, 6);
    const curve = solveSpring(toSpring(scroll.bounce), {
      from: 60,
      to: 0,
      velocity: 400,
    });
    expect(animator.get('x', 1100)).toBeCloseTo(curve.value(0.1), 9);
  });

  it('a coast continues a running spring from its presentation value', async () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.settle});
    await commitFrame(clock); // the browser starts it
    clock += 80;
    const from = animator.get('x');
    expect(from).toBeGreaterThan(0);
    animator.decay(coast(animator, {x: 900}));
    await commitFrame(clock);
    expect(animator.get('x', clock)).toBeCloseTo(from, 9);
    expect(animator.getVelocity('x', clock)).toBeCloseTo(900, 6);
  });

  it('plays any curve as given, and a zero-length one rests at its value', async () => {
    const {animator} = setup();
    const linear = {
      duration: 0.5,
      at: (t: number) => 200 * t,
      velocity: () => 200,
    };
    animator.decay({
      x: linear,
      y: {duration: 0, at: () => 5, velocity: () => 0},
    });
    await commitFrame(clock); // the browser starts it
    expect(animator.get('x', 1250)).toBeCloseTo(50, 9);
    expect(animator.get('x', 1e7)).toBeCloseTo(100, 9);
    expect(animator.get('y')).toBe(5);
  });

  it('keeps moving under Reduced Motion: momentum continues the throw (DEC-2)', async () => {
    const {animator, element} = setup({reduced: true});
    animator.decay(coast(animator, {x: 1000}));
    await commitFrame(clock); // the browser starts it
    expect(animator.getVelocity('x', 1016)).toBeGreaterThan(900);
    // No cross-fade: the coast moves the element and leaves opacity alone.
    expect(live('translate')).toHaveLength(1);
    expect(live('opacity')).toHaveLength(0);
    expect(element.style.opacity).toBe('');
  });

  it('ships the Reduce Motion fade, not the rest of the timing table', () => {
    // Bundled for a page, the animator and reducedMotionFade() read two
    // timing values; the table's other rows stay out
    // (architecture:component-style-authoring INV6).
    // esbuild runs in its own process: it needs a native TextEncoder.
    const script = [
      "import {build} from 'esbuild';",
      'const result = await build({',
      `  entryPoints: ${JSON.stringify(['animator.ts', 'reducedMotion.ts'].map(file => path.resolve(__dirname, file)))},`,
      '  outdir: "out",',
      "  bundle: true, write: false, format: 'esm', logLevel: 'silent',",
      '});',
      'process.stdout.write(result.outputFiles.map(file => file.text).join("\\n"));',
    ].join('\n');
    const bundle = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      {cwd: path.resolve(__dirname, '../../../..'), encoding: 'utf8'},
    );
    expect(bundle).toContain('durationMs');
    for (const row of [
      'stateChangeMs',
      'highlightOutMs',
      'navigationBarHideShowMs',
    ]) {
      expect(bundle).not.toContain(row);
    }
  });

  it('imports neither the coast math nor the scroll table', () => {
    // Only a surface that coasts pays for them (coast.ts).
    const source = fs.readFileSync(
      path.resolve(__dirname, 'animator.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/from '\.\/decay'/);
    expect(source).not.toMatch(/from '\.\/uikit\/scroll'/);
  });
});

describe('attach', () => {
  it('keeps state without an element and resumes the curve on attach', () => {
    const animator = createAnimator(null, {
      now: () => clock,
    });
    animator.animate({x: 300}, {spring: springs.settle});
    expect(recorded).toHaveLength(0);
    clock += 100;
    const element = document.createElement('div');
    animator.attach(element);
    const [animation] = live('translate');
    expect(animation.startTime).toBe(1100);
    const curve = solveSpring(toSpring(springs.settle), {from: 0, to: 300});
    expect(sampleAt(animation, 'translate', 1100)[0]).toBeCloseTo(
      curve.value(0.1),
      1,
    );
    expect(element.style.translate).toBe('300px 0px');
  });

  it('unmounting settles a pending atRest() wait and leaves no poll timer', async () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.settle});
    const rest = animator.atRest();
    animator.attach(null);
    // Resolves without any timer running (none is advanced here).
    await rest;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('unmounting settles every handle as interrupted and leaves no timer', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 300}, {spring: springs.settle});
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    animator.attach(null);
    // At the end of the task, once no node has replaced it.
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
    await expect(handle.finished).resolves.toBe(false);
  });

  it('a node replacement keeps every handle and atRest() wait: the motion goes on on the new node', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 300}, {spring: springs.settle});
    let rested = false;
    void animator.atRest().then(() => {
      rested = true;
    });
    let finished: boolean | null = null;
    void handle.finished.then(value => {
      finished = value;
    });
    // React's replacement order: the old node detaches, the new one attaches.
    animator.attach(null);
    animator.attach(document.createElement('div'));
    for (let tick = 0; tick < 5; tick++) {
      await Promise.resolve();
    }
    expect(finished).toBeNull();
    expect(rested).toBe(false);
    await advance(5000);
    expect(finished).toBe(true);
    expect(rested).toBe(true);
  });

  it('unmounting settles every atRest() wait, as dispose() does', async () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.settle});
    let rested = false;
    void animator.atRest().then(() => {
      rested = true;
    });
    animator.attach(null);
    // Without advancing time: the curve has not ended.
    for (let tick = 0; tick < 5; tick++) {
      await Promise.resolve();
    }
    expect(rested).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('detaching cancels the running animations', async () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.settle});
    await commitFrame(clock); // the browser starts it
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
