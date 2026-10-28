// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionPlan.test.ts
 * @input planReducedMotion and a stand-in view of the animator
 * @output Tests of the Reduce Motion planner on its own (the animator's
 *   behavior under the plan is in animator.test.ts)
 * @position Testing for /packages/core/src/motion/reducedMotionPlan.ts
 */

import {describe, expect, it} from 'vitest';
import type {MotionProperty} from './animator';
import {planReducedMotion, type ReducedMotionView} from './reducedMotionPlan';
import {reducedMotionCrossFade} from './uikit/timing';

const MS = reducedMotionCrossFade.durationMs;

function view(overrides: Partial<ReducedMotionView> = {}): ReducedMotionView {
  const values: Partial<Record<MotionProperty, number>> = {opacity: 1};
  return {
    valueAt: property => values[property] ?? 0,
    opacityHeading: () => 1,
    ownOpacity: () => 1,
    writesOwnOpacity: () => false,
    borrowedOpacity: null,
    hasOpacityCurve: false,
    restingOpacity: 1,
    hasPendingLanding: false,
    ...overrides,
  };
}

describe('planReducedMotion', () => {
  it('without a fade (a fine primary pointer), writes everything at once (DR3)', () => {
    const plan = planReducedMotion(
      view(),
      0,
      {x: 100, opacity: 0},
      ['x', 'opacity'],
      false,
    );
    expect(plan.atOnce).toEqual(['x', 'opacity']);
    expect(plan.opacityFade).toBeNull();
    expect(plan.landing).toBeNull();
  });

  it('an entrance lands at once and fades in over the cross-fade (DR2)', () => {
    const plan = planReducedMotion(
      view({valueAt: p => (p === 'opacity' ? 0 : 0)}),
      0,
      {x: 100, opacity: 1},
      ['x', 'opacity'],
      true,
    );
    expect(plan.atOnce).toEqual(['x']);
    expect(plan.opacityFade).toEqual([
      {at: 0, value: 0},
      {at: MS, value: 1},
    ]);
    expect(plan.landing).toBeNull();
  });

  it('an exit fades out in place, then lands its travel', () => {
    const plan = planReducedMotion(
      view(),
      0,
      {x: 100, opacity: 0},
      ['x', 'opacity'],
      true,
    );
    expect(plan.opacityFade).toEqual([
      {at: 0, value: 1},
      {at: MS, value: 0},
    ]);
    expect(plan.landing?.at).toBe(MS);
    expect([...(plan.landing?.values ?? [])]).toEqual([['x', 100]]);
    expect(plan.holds).toEqual({x: 0});
  });

  it('a move whose opacity rises from a visible value dips rather than landing in view', () => {
    const plan = planReducedMotion(
      view({valueAt: p => (p === 'opacity' ? 0.5 : 0)}),
      0,
      {x: 100, opacity: 1},
      ['x', 'opacity'],
      true,
    );
    expect(plan.opacityFade).toEqual([
      {at: 0, value: 0.5},
      {at: MS / 2, value: 0},
    ]);
    expect(plan.landing?.at).toBe(MS / 2);
    expect(plan.landing?.fadeIn).toEqual({
      to: 1,
      ms: MS / 2,
      isBorrowed: false,
    });
  });

  it('a move whose opacity falls to a visible value dips rather than landing in view', () => {
    const plan = planReducedMotion(
      view(),
      0,
      {x: 100, opacity: 0.5},
      ['x', 'opacity'],
      true,
    );
    expect(plan.landing?.at).toBe(MS / 2);
    expect(plan.landing?.fadeIn).toEqual({
      to: 0.5,
      ms: MS / 2,
      isBorrowed: false,
    });
  });

  it('a move alone dips on the stylesheet opacity it borrows, and lands at the bottom', () => {
    const plan = planReducedMotion(
      view({ownOpacity: () => 0.6}),
      0,
      {x: 100},
      ['x'],
      true,
    );
    expect(plan.borrowed).toBe(0.6);
    expect(plan.opacityFade).toEqual([
      {at: 0, value: 0.6},
      {at: MS / 2, value: 0},
    ]);
    expect(plan.landing?.at).toBe(MS / 2);
    expect(plan.landing?.fadeIn).toEqual({
      to: 0.6,
      ms: MS / 2,
      isBorrowed: true,
    });
  });

  it('a stylesheet that hides the element lends nothing: the move lands at once, with no dip', () => {
    const plan = planReducedMotion(
      view({ownOpacity: () => 0}),
      0,
      {x: 100},
      ['x'],
      true,
    );
    expect(plan.atOnce).toEqual(['x']);
    expect(plan.opacityFade).toBeNull();
    expect(plan.landing).toBeNull();
  });

  it('an opacity the animator writes is owned: a dip returns to it, borrowing nothing', () => {
    const plan = planReducedMotion(
      view({ownOpacity: () => 0, writesOwnOpacity: () => true}),
      0,
      {x: 100},
      ['x'],
      true,
    );
    expect(plan.borrowed).toBeNull();
    expect(plan.landing?.fadeIn).toEqual({
      to: 1,
      ms: MS / 2,
      isBorrowed: false,
    });
  });

  it('an exit by role on a surface no call owns opacity on restores the stylesheet opacity', () => {
    const plan = planReducedMotion(
      view({ownOpacity: () => 0.6}),
      0,
      {y: 40},
      ['y'],
      true,
      'exit',
    );
    expect(plan.opacityFade).toEqual([
      {at: 0, value: 0.6},
      {at: MS, value: 0},
    ]);
    expect(plan.landing?.restore).toBe(0.6);
    expect(plan.landing?.restoreIsBorrowed).toBe(true);
  });
});
