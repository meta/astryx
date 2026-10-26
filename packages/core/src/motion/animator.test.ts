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
 * @position Testing for /packages/core/src/motion/animator.ts (jsdom: the
 *   compositor itself is proven in the browser)
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createAnimator, END_HOLD_MS, type AnimatorOptions} from './animator';
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
  cancelled: boolean;
  /** A sampler holding it (the interaction harness pauses to seek). */
  paused: boolean;
  readonly playState: 'idle' | 'paused' | 'running';
  cancel(): void;
}

let clock = 1000;
let recorded: Recorded[] = [];
/**
 * What the page's stylesheet sets, by property. Computed style reads it
 * under the inline value (jsdom keeps stale computed values for these
 * properties, so the page is modeled here).
 */
let stylesheet: Record<string, string> = {};

beforeEach(() => {
  clock = 1000;
  recorded = [];
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
    const animation: Recorded = {
      element: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      startTime: null,
      cancelled: false,
      paused: false,
      get playState() {
        return this.cancelled ? 'idle' : this.paused ? 'paused' : 'running';
      },
      cancel() {
        this.cancelled = true;
      },
    };
    recorded.push(animation);
    return animation as unknown as Animation;
  };
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(options: AnimatorOptions = {}) {
  const element = document.createElement('div');
  const animator = createAnimator(element, {
    now: () => clock,
    prefersReducedMotion: () => false,
    ...options,
  });
  return {element, animator};
}

/** Advances the injected clock and the timers together. */
async function advance(ms: number) {
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
    Math.max(0, (time - (animation.startTime ?? 0)) / duration),
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
  it('bakes the spring into keyframes within a twentieth of a pixel of the curve', () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.settle});
    const [animation] = live('translate');
    expect(animation).toBeDefined();
    expect(animation.options).toMatchObject({
      fill: 'both',
      easing: 'linear',
    });
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
    const duration = Number(animation.options.duration) - END_HOLD_MS;
    animation.paused = true;
    await advance(duration + 500);
    expect(animation.cancelled).toBe(false);
    // Resumed: it leaves once the main thread looks again.
    animation.paused = false;
    await advance(150);
    expect(animation.cancelled).toBe(true);
  });

  it('puts everything one call starts on one clock', () => {
    const {animator} = setup();
    animator.animate({x: 100, opacity: 0.5}, {spring: springs.settle});
    const starts = recorded.map(a => a.startTime);
    expect(starts).toEqual([1000, 1000]);
    animator.animate({rotate: 90}, {spring: springs.settle}, {at: 1234.5});
    expect(live('rotate')[0].startTime).toBe(1234.5);
  });

  it('expands scale onto both axes and reads it back', () => {
    const {animator} = setup();
    animator.animate({scale: 0.5}, {spring: springs.settle});
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

describe('set: direct manipulation (M4)', () => {
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

describe('Reduced Motion on a coarse pointer (DR2): a cross-fade of 200 ms or less', () => {
  const reduced = () =>
    setup({prefersReducedMotion: () => true, isCoarsePointer: () => true});
  const fade = Math.min(timing.reducedMotionCrossFadeMs, 200);
  const ease = cubicBezier(timing.curves.move);

  it('a move during a running fade keeps that fade\u2019s target', async () => {
    const {animator} = reduced();
    animator.animate({opacity: 0}, {spring: springs.settle});
    await advance(fade / 2);
    expect(animator.get('opacity')).toBeGreaterThan(0.1);
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade + 100);
    expect(animator.get('opacity')).toBeCloseTo(0, 6);
    expect(animator.get('x')).toBe(100);

    const entrance = reduced().animator;
    entrance.set({opacity: 0});
    entrance.animate({opacity: 1}, {spring: springs.settle});
    await advance(fade / 2);
    entrance.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade + 100);
    expect(entrance.get('opacity')).toBeCloseTo(1, 6);
  });

  it("a move dips from and back to the stylesheet's opacity, then hands it back", async () => {
    const {animator, element} = reduced();
    stylesheet = {opacity: '0.6'};
    animator.animate({x: 100}, {spring: springs.navigationPush});
    expect(animator.get('opacity', 1000)).toBeCloseTo(0.6, 9);
    expect(animator.get('opacity', 1000 + fade / 2)).toBeCloseTo(0, 9);
    expect(animator.get('opacity', 1000 + fade)).toBeCloseTo(0.6, 9);
    const [opacity] = live('opacity');
    expect(opacity.keyframes[0].opacity).toBe('0.6');
    expect(opacity.keyframes[opacity.keyframes.length - 1].opacity).toBe('0.6');
    await advance(fade + END_HOLD_MS + 1);
    // No inline opacity is left behind: the stylesheet owns it again.
    expect(element.style.opacity).toBe('');
    expect(animator.get('opacity')).toBe(1);
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
    expect(animator.get('x', start + fade / 2 - 1)).toBe(0);
    expect(animator.get('opacity', start + fade / 2)).toBeCloseTo(0, 9);
    expect(animator.get('x', start + fade / 2)).toBe(100);
    expect(animator.get('opacity', start + fade)).toBeCloseTo(1, 9);
  });

  it("a second call's fade re-times the first call's pending jump to its own invisible moment", async () => {
    const {animator} = reduced();
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    const start = clock;
    // x still waits for the first dip's bottom; y starts a new dip now.
    animator.animate({y: 50}, {spring: springs.navigationPush});
    for (let t = start; t <= start + fade; t += 5) {
      if (animator.get('x', t) !== 0) {
        expect(animator.get('opacity', t)).toBeCloseTo(0, 6);
        break;
      }
    }
    expect(animator.get('x', start + fade / 2)).toBe(100);
    expect(animator.get('y', start + fade / 2)).toBe(50);
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
    let reduce = true;
    const changed = setup({
      prefersReducedMotion: () => reduce,
      isCoarsePointer: () => true,
    });
    changed.animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    reduce = false;
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
    const halfway = (
      animator: ReturnType<typeof createAnimator>,
      start: number,
    ) => {
      for (let t = start; t <= start + fade; t += 2) {
        if (animator.get('x', t) !== 0) {
          return animator.get('opacity', t);
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
    expect(halfway(same.animator, start)).toBeCloseTo(0, 6);
    // Handed to another element, no stylesheet opacity.
    const other = reduced();
    other.animator.animate({x: 240}, {spring: springs.navigationPush});
    const start2 = clock;
    await advance(25);
    const next = document.createElement('div');
    document.body.append(next);
    other.animator.attach(next);
    expect(halfway(other.animator, start2)).toBeCloseTo(0, 6);
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

  it('a release past an edge springs back as a cross-fade, not momentum (DR2)', () => {
    const {animator} = reduced();
    animator.set({x: -80});
    const start = clock;
    animator.decay(
      coast(animator, {x: 0}, {bounds: {x: {min: 0, max: 100}}, at: start}),
      {at: start},
    );
    for (let t = start; t <= start + fade; t += 2) {
      if (animator.get('x', t) !== -80) {
        expect(animator.get('opacity', t)).toBeCloseTo(0, 6);
        break;
      }
    }
    expect(animator.get('x', start + fade)).toBe(0);
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
    await advance(fade + END_HOLD_MS + 1);
    // x never lands at its edge after the stop.
    expect(animator.get('x')).toBe(-80);
  });

  it('a second move during a borrowed dip copies no stylesheet opacity inline', async () => {
    const {animator, element} = reduced();
    stylesheet = {opacity: '0.6'};
    animator.animate({x: 100}, {spring: springs.navigationPush});
    await advance(fade / 4);
    animator.animate({y: 50}, {spring: springs.navigationPush});
    expect(animator.get('opacity', clock + fade)).toBeCloseTo(0.6, 9);
    await advance(fade + END_HOLD_MS + 1);
    expect(element.style.opacity).toBe('');
    expect(animator.get('opacity')).toBe(1);
  });

  it('a move dips: fades out, jumps at the midpoint, fades back in', () => {
    const {animator, element} = reduced();
    animator.animate({x: 100}, {spring: springs.navigationPush});
    expect(animator.get('x', 1000 + fade / 2 - 1)).toBe(0);
    expect(animator.get('x', 1000 + fade / 2)).toBe(100);
    expect(animator.get('opacity', 1000 + fade / 4)).toBeCloseTo(
      1 - ease(0.5),
      9,
    );
    expect(animator.get('opacity', 1000 + fade / 2)).toBeCloseTo(0, 9);
    expect(animator.get('opacity', 1000 + fade)).toBe(1);
    // The move is a hold that ends in a jump: two keyframes at its last
    // offset, the value before and after. The fade runs on the same clock.
    const [translate] = live('translate');
    const [opacity] = live('opacity');
    expect(translate.startTime).toBe(opacity.startTime);
    expect(Number(translate.options.duration)).toBeCloseTo(
      fade / 2 + END_HOLD_MS,
      6,
    );
    const jump = fade / 2 / (fade / 2 + END_HOLD_MS);
    const atJump = translate.keyframes.filter(
      k => Math.abs(Number(k.offset) - jump) < 1e-12,
    );
    expect(atJump.map(k => k.translate)).toEqual(['0px 0px', '100px 0px']);
    expect(translate.keyframes[translate.keyframes.length - 1]).toMatchObject({
      offset: 1,
      translate: '100px 0px',
    });
    expect(sampleAt(translate, 'translate', 1000 + fade / 2 - 2)[0]).toBe(0);
    expect(element.style.translate).toBe('100px 0px');
    expect(element.style.opacity).toBe('');
  });

  it('an entrance lands in place and fades in', () => {
    const {animator, element} = reduced();
    animator.set({y: 400, opacity: 0});
    animator.animate({y: 0, opacity: 1}, {spring: springs.sheetPresent});
    expect(animator.get('y')).toBe(0);
    expect(live('translate')).toHaveLength(0);
    expect(element.style.translate).toBe('');
    expect(animator.get('opacity', 1000 + fade / 2)).toBeCloseTo(ease(0.5), 9);
    expect(Number(live('opacity')[0].options.duration)).toBeCloseTo(
      fade + END_HOLD_MS,
      6,
    );
  });

  it('an exit fades out in place, then moves', () => {
    const {animator} = reduced();
    animator.animate({y: 400, opacity: 0}, {spring: springs.sheetDismiss});
    expect(animator.get('y', 1000 + fade - 1)).toBe(0);
    expect(animator.get('y', 1000 + fade)).toBe(400);
    const [translate] = live('translate');
    expect(sampleAt(translate, 'translate', 1000 + fade - 1)[1]).toBe(0);
    expect(translate.keyframes[translate.keyframes.length - 1].translate).toBe(
      '0px 400px',
    );
  });

  it('an opacity-only change fades within 200 ms, with no spring', () => {
    const {animator} = reduced();
    animator.set({opacity: 0});
    animator.animate({opacity: 1}, {spring: springs.settle});
    const [opacity] = live('opacity');
    expect(Number(opacity.options.duration)).toBeLessThanOrEqual(
      200 + END_HOLD_MS,
    );
    expect(animator.get('opacity', 1000 + 200)).toBe(1);
  });

  it('a move finishes within 200 ms', () => {
    const {animator} = reduced();
    animator.animate({x: 100}, {spring: springs.navigationPush});
    expect(animator.get('x', 1000 + 200)).toBe(100);
    expect(animator.get('opacity', 1000 + 200)).toBe(1);
  });
});

describe('Reduced Motion on a fine pointer (DR3): every change at once', () => {
  const reduced = () =>
    setup({prefersReducedMotion: () => true, isCoarsePointer: () => false});

  it('a move and an opacity change complete in the call, with nothing animated', () => {
    const {animator} = reduced();
    animator.animate({x: 100}, {spring: springs.navigationPush});
    animator.animate({opacity: 0}, {spring: springs.settle});
    expect(animator.get('x')).toBe(100);
    expect(animator.get('opacity')).toBe(0);
    expect(recorded).toHaveLength(0);
  });

  it('a move leaves an opacity it does not name to finish what it was doing', async () => {
    let isCoarse = true;
    const {animator} = setup({
      prefersReducedMotion: () => true,
      isCoarsePointer: () => isCoarse,
    });
    animator.animate({opacity: 0}, {spring: springs.settle});
    await advance(60);
    const midFade = animator.get('opacity');
    expect(midFade).toBeGreaterThan(0);
    isCoarse = false;
    animator.animate({x: 100}, {spring: springs.navigationPush});
    expect(animator.get('x')).toBe(100);
    // The fade is neither overwritten nor restored: it runs to its target.
    expect(animator.get('opacity')).toBeCloseTo(midFade, 6);
    await advance(300);
    expect(animator.get('opacity')).toBeCloseTo(0, 6);
  });
});

describe('decay: momentum curves (a coast)', () => {
  it('plays a coast and comes to rest where it projects', () => {
    const {animator} = setup();
    animator.decay(coast(animator, {y: -2400}));
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

  it('a coast that reaches an edge hands its velocity to the edge spring', () => {
    const {animator} = setup();
    animator.set({y: -100});
    animator.decay(
      coast(animator, {y: 3000}, {bounds: {y: {min: -2000, max: 0}}}),
    );
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

  it('a release past an edge springs straight back with the release velocity', () => {
    const {animator} = setup();
    animator.set({x: 60});
    animator.decay(
      coast(animator, {x: 400}, {bounds: {x: {min: -500, max: 0}}}),
    );
    expect(animator.getVelocity('x')).toBeCloseTo(400, 6);
    const curve = solveSpring(toSpring(scroll.bounce), {
      from: 60,
      to: 0,
      velocity: 400,
    });
    expect(animator.get('x', 1100)).toBeCloseTo(curve.value(0.1), 9);
  });

  it('a coast continues a running spring from its presentation value', () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.settle});
    clock += 80;
    const from = animator.get('x');
    animator.decay(coast(animator, {x: 900}));
    expect(animator.get('x', clock)).toBeCloseTo(from, 9);
    expect(animator.getVelocity('x', clock)).toBeCloseTo(900, 6);
  });

  it('plays any curve as given, and a zero-length one rests at its value', () => {
    const {animator, element} = setup();
    const linear = {
      duration: 0.5,
      at: (t: number) => 200 * t,
      velocity: () => 200,
    };
    animator.decay({
      x: linear,
      opacity: {duration: 0, at: () => 0.5, velocity: () => 0},
    });
    expect(animator.get('x', 1250)).toBeCloseTo(50, 9);
    expect(animator.get('x', 1e7)).toBeCloseTo(100, 9);
    expect(animator.get('opacity')).toBe(0.5);
    expect(element.style.opacity).toBe('0.5');
  });

  it('keeps moving under Reduced Motion: a throw is the finger’s', () => {
    const {animator, element} = setup({prefersReducedMotion: () => true});
    animator.decay(coast(animator, {x: 1000}));
    expect(animator.getVelocity('x', 1016)).toBeGreaterThan(900);
    // No cross-fade: the coast moves the element and leaves opacity alone.
    expect(live('translate')).toHaveLength(1);
    expect(live('opacity')).toHaveLength(0);
    expect(element.style.opacity).toBe('');
  });

  it('ships the Reduce Motion fade, not the rest of the timing table', () => {
    // Bundled for a page, the animator reads two timing values; the table's
    // other rows stay out (architecture:component-style-authoring INV6).
    // esbuild runs in its own process: it needs a native TextEncoder.
    const script = [
      "import {build} from 'esbuild';",
      'const result = await build({',
      `  entryPoints: [${JSON.stringify(path.resolve(__dirname, 'animator.ts'))}],`,
      "  bundle: true, write: false, format: 'esm', logLevel: 'silent',",
      '});',
      'process.stdout.write(result.outputFiles[0].text);',
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
      prefersReducedMotion: () => false,
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

  it('unmounting settles every handle as interrupted and leaves no timer', async () => {
    const {animator} = setup();
    const handle = animator.animate({x: 300}, {spring: springs.settle});
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    animator.attach(null);
    expect(vi.getTimerCount()).toBe(0);
    await expect(handle.finished).resolves.toBe(false);
  });

  it('detaching cancels the running animations', () => {
    const {animator} = setup();
    animator.animate({x: 300}, {spring: springs.settle});
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
