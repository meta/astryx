// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolveMotion.tempo.test.ts
 * @input resolveMotion.ts, the shared UIKit tables, a stubbed computed style
 *   that writes a theme's tempo
 * @output Proof that a role plays its table value at the theme's tempo. A
 *   spring keeps its shape and takes tempo times as long in each of its
 *   forms. A duration scales. A curve, a part that follows a finger and a
 *   busy loop stay as measured. A role resolves to one object per tempo and
 *   is never scaled twice. The animator plays the slowed spring. A CSS part
 *   timed from a spring lasts the resolved spring's settling duration, or
 *   as long as the animator plays one move on it
 * @position Testing for /packages/core/src/motion/resolveMotion.ts (the
 *   browser proof: themeTempo.interaction.browser.spec.ts)
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createMotionEngine, SETTLE_THRESHOLD} from './animator';
import {resolveMotion, resolveSettleMs} from './resolveMotion';
import {
  settlingDuration,
  solveSpring,
  toSpring,
  type SpringDescription,
} from './spring';
import {
  progressBar,
  registerProgressBarTable,
  registerSpringsTable,
  registerTimingTable,
  springs,
  switchControl,
  timing,
} from './uikit';
import {registerSwitchTable} from './uikit/switch';

// Like a touch module: register the tables these motions resolve from.
registerSpringsTable();
registerTimingTable();
registerSwitchTable();
registerProgressBarTable();

const TEMPO_PROPERTY = '--_astryx-motion-tempo';

/** The properties read since the last reset, in order. */
let reads: string[];
/** The tempo the stubbed theme writes; empty where no theme sets one. */
let tempo: string;

beforeEach(() => {
  reads = [];
  tempo = '';
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) => {
          reads.push(name);
          return name === TEMPO_PROPERTY ? tempo : '';
        },
      }) as unknown as CSSStyleDeclaration,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function element(): HTMLElement {
  const child = document.createElement('div');
  document.body.append(child);
  return child;
}

describe("resolveMotion at the theme's tempo (spec:AST-108 FR3)", () => {
  it('stretches a spring role in each of its forms: the same shape, tempo times as long', () => {
    tempo = '1.5';
    const target = element();
    // A duration and bounce, a response and damping ratio, and a mass,
    // stiffness and damping.
    for (const role of [springs.settle, springs.menuOpen, springs.viewChange]) {
      const base = solveSpring(toSpring(role), {from: 0, to: 1});
      const slowed = solveSpring(toSpring(resolveMotion(target, role)), {
        from: 0,
        to: 1,
      });
      expect(slowed.settleTime(0.001)).toBeCloseTo(
        base.settleTime(0.001) * 1.5,
        6,
      );
      for (const seconds of [0.05, 0.15, 0.3]) {
        expect(slowed.value(seconds * 1.5)).toBeCloseTo(base.value(seconds), 6);
      }
    }
    expect(reads.every(name => name === TEMPO_PROPERTY)).toBe(true);
  });

  it('scales a duration role, and plays a curve role as measured without a style read', () => {
    const target = element();
    tempo = '1.5';
    expect(resolveMotion(target, timing, 'stateChangeMs')).toBe(
      timing.stateChangeMs * 1.5,
    );
    tempo = '0.75';
    expect(resolveMotion(target, timing, 'stateChangeMs')).toBe(
      timing.stateChangeMs * 0.75,
    );
    reads = [];
    expect(resolveMotion(target, timing.curves.move)).toBe(timing.curves.move);
    expect(reads).toEqual([]);
  });

  it('leaves the parts that follow a finger and the busy loop as measured (FR4)', () => {
    tempo = '1.5';
    const target = element();
    expect(resolveMotion(target, springs.fingerTracking)).toBe(
      springs.fingerTracking,
    );
    expect(resolveMotion(target, switchControl.tracking)).toBe(
      switchControl.tracking,
    );
    expect(resolveMotion(target, progressBar, 'reducedMotionPulseMs')).toBe(
      progressBar.reducedMotionPulseMs,
    );
    // The same tables' other roles follow the tempo.
    expect(resolveMotion(target, switchControl.settle)).not.toBe(
      switchControl.settle,
    );
    expect(resolveMotion(target, progressBar, 'fillTrackMs')).toBe(
      progressBar.fillTrackMs * 1.5,
    );
  });

  it('is the table value itself at tempo 1, where no theme sets a tempo, and without an element', () => {
    const target = element();
    expect(resolveMotion(target, springs.settle)).toBe(springs.settle);
    tempo = '1';
    expect(resolveMotion(target, springs.settle)).toBe(springs.settle);
    expect(resolveMotion(target, timing, 'stateChangeMs')).toBe(
      timing.stateChangeMs,
    );
    tempo = '1.5';
    expect(resolveMotion(null, springs.settle)).toBe(springs.settle);
  });

  it('gives one object per role and tempo, and does not scale a resolved spring again', () => {
    tempo = '1.5';
    const target = element();
    const once = resolveMotion(target, springs.settle);
    expect(once).not.toBe(springs.settle);
    expect(resolveMotion(target, springs.settle)).toBe(once);
    // A component resolves a spring and hands it to the animator, which
    // resolves it again.
    expect(resolveMotion(target, once)).toBe(once);
  });

  it('leaves values that are not roles alone', () => {
    tempo = '1.5';
    const inline = {response: 0.4, dampingRatio: 0.9};
    expect(resolveMotion(document.body, inline)).toBe(inline);
    expect(resolveMotion(document.body, springs.sheetPresent)).toBe(
      springs.sheetPresent,
    );
    expect(resolveMotion(document.body, timing.press, 'scrollBrakeMs')).toBe(
      timing.press.scrollBrakeMs,
    );
  });
});

describe('a CSS part timed from its spring', () => {
  const settleMs = (spring: SpringDescription) =>
    settlingDuration(toSpring(spring)) * 1000;

  it("lasts the role's settling duration where no theme sets a tempo", () => {
    const target = element();
    expect(resolveSettleMs(target, springs.settle)).toBe(
      settleMs(springs.settle),
    );
    // SwiftUI's smooth spring (0.5 s, no bounce) settles in about 0.6 s.
    expect(resolveSettleMs(target, springs.settle)).toBeGreaterThan(400);
    expect(resolveSettleMs(target, springs.settle)).toBeLessThan(900);
  });

  it('takes tempo times as long with the spring it plays with', () => {
    const target = element();
    const plain = resolveSettleMs(target, springs.settle);
    tempo = '1.5';
    expect(resolveSettleMs(target, springs.settle)).toBeCloseTo(plain * 1.5, 6);
    expect(resolveSettleMs(target, springs.settle)).toBe(
      settleMs(resolveMotion(target, springs.settle)),
    );
  });

  it('stays as measured for a finger-following role, and for a spring that is not a role', () => {
    tempo = '1.5';
    const target = element();
    expect(resolveSettleMs(target, springs.fingerTracking)).toBe(
      settleMs(springs.fingerTracking),
    );
    const inline = {response: 0.4, dampingRatio: 0.9};
    expect(resolveSettleMs(target, inline)).toBe(settleMs(inline));
  });

  it('lasts as long as the animator plays one move on the spring', () => {
    tempo = '1.5';
    const target = element();
    const animator = createMotionEngine(target, {now: () => 0});
    const close = animator.animate(
      {y: 400},
      {spring: springs.sheetDismissSwipe, velocity: {y: 3000}},
      {at: 0},
    );
    const move = {
      from: 0,
      to: 400,
      velocity: 3000,
      epsilon: SETTLE_THRESHOLD.y,
    };
    const curveMs = (close.curve('y')?.duration ?? Number.NaN) * 1000;
    expect(
      resolveSettleMs(target, springs.sheetDismissSwipe, move),
    ).toBeCloseTo(curveMs, 6);
    // A long, fast move settles later than a unit move from rest.
    expect(curveMs).toBeGreaterThan(
      resolveSettleMs(target, springs.sheetDismissSwipe),
    );
    animator.dispose();
  });
});

describe('the animator', () => {
  it("plays a role's spring at the theme's tempo", () => {
    tempo = '1.5';
    const animator = createMotionEngine(element(), {now: () => 0});
    animator.set({y: 300});
    animator.animate({y: 0}, {spring: springs.settle}, {at: 0});
    const table = solveSpring(toSpring(springs.settle), {from: 300, to: 0});
    for (const ms of [75, 225, 600]) {
      expect(animator.get('y', ms)).toBeCloseTo(
        table.value(ms / 1000 / 1.5),
        3,
      );
    }
    animator.dispose();
  });
});
