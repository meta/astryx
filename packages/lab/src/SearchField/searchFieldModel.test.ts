// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file searchFieldModel.test.ts
 * @input vitest, searchFieldModel.ts and the UIKit timing table
 * @output The model's geometry and clock: the active width on an iPhone 17
 *   Pro, every part's pose at rest and active (both directions), the eased
 *   curve's ends, symmetry and velocities, and the bottom placement: its edges, the measured
 *   frames played as curves, its poses and its lift above the keyboard
 * @position Testing; validates searchFieldModel.ts without a DOM
 */

import {describe, expect, it} from 'vitest';
import {
  ACTIVATION_S,
  activationEase,
  activeFieldWidth,
  easedCurve,
  heldCurve,
  poseFor,
  bottomEdges,
  bottomMotion,
  bottomPoseFor,
  bottomLift,
  framesCurve,
} from './searchFieldModel';
import {timing} from '@astryxdesign/core/internal/motion';

const IPHONE = {restWidth: 370, height: 44, lift: 99, isRtl: false};

describe('searchFieldModel', () => {
  it('runs on the UIKit activation clock and curve', () => {
    expect(ACTIVATION_S).toBeCloseTo(0.3833, 4);
    // UIKit's ease-in-ease-out (the `timing.curves.move` role): symmetric,
    // slow at the start.
    expect(timing.curves.move).toEqual([0.42, 0, 0.58, 1]);
    expect(activationEase(0.5)).toBeCloseTo(0.5, 6);
    expect(activationEase(0.25)).toBeLessThan(0.2);
  });

  it('narrows the field to 315 px beside the close button on a 402 px screen', () => {
    expect(activeFieldWidth(370)).toBe(315);
  });

  it('poses every part at rest and active', () => {
    expect(poseFor(false, IPHONE)).toEqual({
      y: 0,
      middleScale: 1,
      endX: 0,
      closeX: 44,
      closeOpacity: 0,
    });
    const active = poseFor(true, IPHONE);
    expect(active.y).toBe(-99);
    expect(active.endX).toBe(-55);
    expect(active.middleScale).toBeCloseTo(271 / 326, 9);
    expect(active.closeX).toBe(0);
    expect(active.closeOpacity).toBe(1);
  });

  it('mirrors the trailing end and the close button right to left', () => {
    const rtl = {...IPHONE, isRtl: true};
    expect(poseFor(false, rtl).closeX).toBe(-44);
    expect(poseFor(true, rtl).endX).toBe(55);
  });

  it('eases from rest to rest, symmetric, through its middle at half the clock', () => {
    const curve = easedCurve(0, -55, ACTIVATION_S);
    expect(curve.duration).toBeCloseTo(0.3833, 4);
    expect(curve.at(0)).toBe(0);
    expect(curve.at(ACTIVATION_S)).toBeCloseTo(-55, 9);
    expect(curve.at(ACTIVATION_S / 2)).toBeCloseTo(-27.5, 6);
    expect(Math.abs(curve.velocity(0))).toBeLessThan(1);
    expect(Math.abs(curve.velocity(ACTIVATION_S))).toBeLessThan(1);
    // Fastest in the middle: 55 px over 0.383 s at the curve's peak slope.
    expect(curve.velocity(ACTIVATION_S / 2)).toBeLessThan(-200);
    expect(easedCurve(3, 9, 0).at(0)).toBe(9);
  });

  it('holds a value to the end of the clock, then lands on its target', () => {
    const curve = heldCurve(0.6, 0, ACTIVATION_S);
    expect(curve.at(0)).toBe(0.6);
    expect(curve.at(ACTIVATION_S - 0.001)).toBe(0.6);
    expect(curve.at(ACTIVATION_S)).toBe(0);
    expect(curve.velocity(0.1)).toBe(0);
  });

  describe('bottom placement', () => {
    it('puts the edges where iOS does on a 402 px screen', () => {
      expect(bottomEdges(402)).toEqual({
        restLeading: 33,
        restTrailing: 369,
        activeLeading: 17,
        activeTrailing: 325,
      });
    });

    it('plays a frame table linearly between rows and holds its ends', () => {
      const curve = framesCurve(
        [
          [0, 0],
          [100, 10],
          [200, 30],
        ],
        row => row[1],
      );
      expect(curve.duration).toBeCloseTo(0.2, 6);
      expect(curve.at(0)).toBe(0);
      expect(curve.at(0.05)).toBeCloseTo(5, 6);
      expect(curve.at(0.15)).toBeCloseTo(20, 6);
      expect(curve.at(0.5)).toBe(30);
      expect(curve.velocity(0.15)).toBeCloseTo(200, 0);
    });

    it('activates from rest to the active field, swelling past both places on the way', () => {
      const motion = bottomMotion(true, 402);
      const end = motion.leading.duration;
      expect(motion.leading.at(0)).toBeCloseTo(33, 6);
      expect(motion.trailing.at(0)).toBeCloseTo(369, 6);
      expect(motion.leading.at(end)).toBeCloseTo(17, 6);
      expect(motion.trailing.at(motion.trailing.duration)).toBeCloseTo(325, 6);
      // The swell: the trailing edge goes out past rest before it narrows,
      // the leading edge past its active place.
      const samples = Array.from({length: 28}, (_, i) => i / 60);
      expect(
        Math.max(...samples.map(t => motion.trailing.at(t))),
      ).toBeGreaterThan(380);
      expect(Math.min(...samples.map(t => motion.leading.at(t)))).toBeLessThan(
        14,
      );
      expect(motion.closeOpacity.at(0)).toBe(0);
      expect(motion.closeOpacity.at(motion.closeOpacity.duration)).toBe(1);
      expect(motion.closeScale.at(motion.closeScale.duration)).toBe(1);
    });

    it('cancels from 16 px inside the active field at each side back to rest', () => {
      const motion = bottomMotion(false, 402);
      expect(motion.leading.at(0)).toBeCloseTo(33, 6);
      expect(motion.trailing.at(0)).toBeCloseTo(309, 0);
      expect(motion.trailing.at(motion.trailing.duration)).toBeCloseTo(369, 6);
      expect(motion.closeX.at(0)).toBe(-16);
      expect(motion.closeOpacity.at(motion.closeOpacity.duration)).toBe(0);
    });

    it('settles to the same poses the frames end at', () => {
      expect(bottomPoseFor(true, 402)).toEqual({
        leading: 17,
        trailing: 325,
        heightScale: 1,
        closeX: 0,
        closeScale: 1,
        closeOpacity: 1,
      });
      expect(bottomPoseFor(false, 402)).toMatchObject({
        leading: 33,
        trailing: 369,
        heightScale: 1,
        closeOpacity: 0,
      });
    });

    it('lifts the field above the keyboard: its centre 36 px above it while active, the resting gap otherwise', () => {
      // The resting field's centre 52 px above the viewport's bottom edge.
      expect(bottomLift(true, 335, 52)).toBe(319);
      expect(bottomLift(false, 335, 52)).toBe(335);
      // With the keyboard down the field rests, active or not.
      expect(bottomLift(true, 0, 52)).toBe(0);
      expect(bottomLift(false, 0, 52)).toBe(0);
    });
  });
});
