// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file coast.test.ts
 * @input vitest, coast.ts, and the decay and spring math it composes
 * @output Checks each momentum curve `coast` builds against the closed-form
 *   coast and edge spring: inside the bounds, through an edge, released past
 *   an edge, at rest, from the presentation value at the release time
 * @position Testing; pure, with a stand-in for the animator's `get`
 */

import {describe, expect, it} from 'vitest';
import type {Animator, MotionProperty} from './animator';
import {coast} from './coast';
import {solveDecay} from './decay';
import {solveSpring, toSpring} from './spring';
import {scroll} from './uikit/scroll';

/** An animator whose presentation values are fixed, recording `get` times. */
function at(values: Partial<Record<MotionProperty, number>>) {
  const reads: (number | undefined)[] = [];
  const animator = {
    get(property: MotionProperty, time?: number) {
      reads.push(time);
      return values[property] ?? 0;
    },
  } as unknown as Animator;
  return {animator, reads};
}

describe('coast', () => {
  it('follows the coast from the presentation value and ends where it projects', () => {
    const {animator} = at({y: 40});
    const {y} = coast(animator, {y: -2400});
    const glide = solveDecay({from: 40, velocity: -2400});
    expect(y).toBeDefined();
    for (const t of [0, 0.016, 0.1, 0.4, 1.2]) {
      expect(y!.at(t)).toBeCloseTo(glide.value(t), 9);
      expect(y!.velocity(t)).toBeCloseTo(glide.velocity(t), 9);
    }
    expect(y!.at(y!.duration)).toBe(glide.rest);
  });

  it('hands the coast\u2019s velocity to the edge spring where it reaches an edge', () => {
    const {animator} = at({y: -100});
    const {y} = coast(animator, {y: 3000}, {bounds: {y: {min: -2000, max: 0}}});
    const glide = solveDecay({from: -100, velocity: 3000});
    const hit = glide.timeToReach(0) as number;
    expect(y!.at(hit)).toBeCloseTo(0, 6);
    expect(y!.velocity(hit - 1e-9)).toBeCloseTo(y!.velocity(hit + 1e-9), 2);
    // It overshoots past the edge, then comes back to it.
    expect(y!.at(hit + 0.06)).toBeGreaterThan(0);
    expect(y!.at(y!.duration)).toBe(0);
  });

  it('springs straight back with the release velocity when released past an edge', () => {
    const {animator} = at({x: 60});
    const {x} = coast(animator, {x: 400}, {bounds: {x: {min: -500, max: 0}}});
    const back = solveSpring(toSpring(scroll.bounce), {
      from: 60,
      to: 0,
      velocity: 400,
    });
    expect(x!.velocity(0)).toBeCloseTo(400, 6);
    expect(x!.at(0.1)).toBeCloseTo(back.value(0.1), 9);
    expect(x!.at(x!.duration)).toBe(0);
  });

  it('rests where it is at zero velocity inside its bounds', () => {
    const {animator} = at({x: -30});
    const {x} = coast(animator, {x: 0}, {bounds: {x: {min: -100, max: 0}}});
    expect(x!.duration).toBe(0);
    expect(x!.at(0)).toBe(-30);
  });

  it('reads the presentation value at the release time, on the translate axes only', () => {
    const {animator, reads} = at({x: 0, y: 0});
    const curves = coast(animator, {x: 500, y: 200}, {at: 1234});
    expect(Object.keys(curves).sort()).toEqual(['x', 'y']);
    expect(curves.x!.velocity(0)).toBeCloseTo(500, 9);
    expect(curves.y!.velocity(0)).toBeCloseTo(200, 9);
    expect(reads).toEqual([1234, 1234]);
  });

  it('coasts at the given rate', () => {
    const {animator} = at({x: 0});
    const {x} = coast(
      animator,
      {x: 1000},
      {rate: scroll.decelerationRate.fast},
    );
    const glide = solveDecay({
      from: 0,
      velocity: 1000,
      rate: scroll.decelerationRate.fast,
    });
    expect(x!.at(x!.duration)).toBe(glide.rest);
  });
});
