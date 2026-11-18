// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file switchTouch.test.ts
 * @input vitest, switchTouch.ts, the UIKit switch constants and the spring math
 * @output Unit tests for Switch's touch model: geometry, the drag's thumb
 *   target, the flip rule, the release commit and the settle time, held to
 *   UISwitch on iOS 26.2; and the switch springs held to UIKit's own frames
 * @position Testing; the pure half of Switch's touch presentation
 *
 * The UIKit points below were read from a UISwitch on the iOS 26.2
 * simulator, in switch-local pt. The switch springs were fitted to them, so
 * a change that leaves UIKit's curve fails here.
 */

import {describe, expect, it} from 'vitest';
import {listMotionRoles, motionRoleOf} from '../motion/roles';
import {solveSpring, toSpring} from '../motion/spring';
import {registerSwitchTable, switchControl} from '../motion/uikit/switch';
import {
  commitOnRelease,
  dragTarget,
  settleTime,
  startFlip,
  stepFlip,
  switchTouchGeometry,
  type SwitchFlip,
} from './switchTouch';

const UIKIT = switchTouchGeometry(63, 28);

/** Feed a drag's events (finger travel since it landed) through the rule. */
function drag(
  isOn: boolean,
  travels: number[],
  geometry = UIKIT,
): SwitchFlip[] {
  const states: SwitchFlip[] = [];
  let flip = startFlip(isOn);
  for (const travel of travels) {
    flip = stepFlip(flip, travel, geometry);
    states.push(flip);
  }
  return states;
}

describe('switchTouchGeometry', () => {
  it('is UIKit itself at UIKit size', () => {
    expect(UIKIT.thumbWidth).toBeCloseTo(37, 9);
    expect(UIKIT.thumbHeight).toBeCloseTo(24, 9);
    expect(UIKIT.inset).toBeCloseTo(2, 9);
    expect(UIKIT.travel).toBeCloseTo(22, 9);
    expect(UIKIT.flipDistance).toBeCloseTo(26, 9);
    // The lift fills half the 2 pt gap on each side, and the band the other
    // half. UIKit's own lens grows to 58 × 38.3, past the track.
    expect(UIKIT.liftScaleX).toBeCloseTo(1 + 2 / 37, 9);
    expect(UIKIT.liftScaleY).toBeCloseTo(UIKIT.liftScaleX, 9);
    expect(UIKIT.rubberBandDimension).toBeCloseTo(1, 9);
  });

  it('keeps UIKit proportions in a smaller track (md 40 × 24, sm 32 × 20)', () => {
    for (const [width, height] of [
      [40, 24],
      [32, 20],
    ] as const) {
      const geometry = switchTouchGeometry(width, height);
      expect(geometry.thumbWidth / width).toBeCloseTo(37 / 63, 9);
      expect(geometry.thumbHeight / height).toBeCloseTo(24 / 28, 9);
      // Inset equally on three sides; the thumb reaches the far inset.
      expect(geometry.inset * 2 + geometry.thumbHeight).toBeCloseTo(height, 9);
      expect(
        geometry.inset * 2 + geometry.thumbWidth + geometry.travel,
      ).toBeCloseTo(width, 9);
      // The finger flips the switch after the track minus the thumb.
      expect(geometry.flipDistance).toBeCloseTo(width - geometry.thumbWidth, 9);
    }
  });
});

describe('dragTarget', () => {
  it('moves 1:1 with the finger between the ends', () => {
    expect(dragTarget(0, 5, UIKIT)).toBeCloseTo(5, 9);
    expect(dragTarget(22, -7, UIKIT)).toBeCloseTo(15, 9);
  });

  it("rubber-bands past either end with UIScrollView's curve (c 0.55), reaching no further than the lift leaves", () => {
    const past = 46;
    const d = UIKIT.rubberBandDimension;
    const expected = (1 - 1 / ((past * 0.55) / d + 1)) * d;
    expect(dragTarget(0, 22 + past, UIKIT)).toBeCloseTo(22 + expected, 9);
    expect(dragTarget(22, -22 - past, UIKIT)).toBeCloseTo(-expected, 9);
  });

  it('keeps a lifted thumb inside the track at any overdrag, at every size and thumb shape', () => {
    for (const [width, height, thumb] of [
      [63, 28, undefined],
      [40, 24, undefined],
      [32, 20, undefined],
      // A theme's circle (aspect ratio 1) in the md and sm tracks.
      [40, 24, {width: (24 * 24) / 28, height: (24 * 24) / 28}],
      [32, 20, {width: (20 * 24) / 28, height: (20 * 24) / 28}],
    ] as const) {
      const geometry = switchTouchGeometry(width, height, thumb);
      const grownX = (geometry.thumbWidth * (geometry.liftScaleX - 1)) / 2;
      const grownY = (geometry.thumbHeight * (geometry.liftScaleY - 1)) / 2;
      expect(geometry.inset - grownY).toBeGreaterThanOrEqual(0);
      for (const finger of [1e3, 1e6]) {
        const end = dragTarget(0, finger, geometry);
        const start = dragTarget(geometry.travel, -finger, geometry);
        // Lifted edges from the track's start: inset + offset ∓ growth.
        expect(
          geometry.inset + end + geometry.thumbWidth + grownX,
        ).toBeLessThanOrEqual(width + 1e-9);
        expect(geometry.inset + start - grownX).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('measures the thumb a theme shapes: a circle travels further and flips at the track minus its width', () => {
    const circle = switchTouchGeometry(40, 24, {width: 20, height: 20});
    expect(circle.inset).toBeCloseTo(2, 9);
    expect(circle.travel).toBeCloseTo(16, 9);
    expect(circle.flipDistance).toBeCloseTo(20, 9);
  });

  it('starts from a banded thumb without a jump (grab mid-flight)', () => {
    const banded = dragTarget(0, 40, UIKIT);
    // A new finger lands on the thumb where it is: no movement, no jump.
    expect(dragTarget(banded, 0, UIKIT)).toBeCloseTo(banded, 9);
  });
});

describe('stepFlip (UIKit, 1 pt steps)', () => {
  it('flips on the event after the finger reaches 26 pt toward on, from any press point', () => {
    // UIKit: armed at +26, flipped at +27, for presses at x 8, 20.5 and 45.
    const states = drag(false, [24, 25, 26, 27, 28]);
    expect(states.map(s => s.isVisuallyOn)).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(states[2].isArmed).toBe(true);
    expect(states[3].didFlip).toBe(true);
  });

  it('flips back when the finger returns past where it landed, not before', () => {
    // UIKit: still on at +0.67, back off at −0.33.
    const states = drag(false, [26, 27, 40, 10, 0.67, -0.33]);
    expect(states.map(s => s.isVisuallyOn)).toEqual([
      false,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(states[5].didFlip).toBe(true);
  });

  it('mirrors on an on switch: off 27 pt to the left, back on past the press', () => {
    const states = drag(true, [-26, -27, -0.33, 0.67]);
    expect(states.map(s => s.isVisuallyOn)).toEqual([true, false, false, true]);
  });

  it('never flips toward the side the switch is already on', () => {
    // UIKit: a quick 40 pt swipe left on an off switch flips nothing (the
    // lift then toggles it, like a tap).
    expect(drag(false, [-10, -30, -40]).some(s => s.didFlip)).toBe(false);
  });

  it('arms on the last move of a fast swipe and flips on the lift', () => {
    // UIKit: +4, +20, +32 then the lift at +40: the flip came with the lift.
    const states = drag(false, [4, 20, 32]);
    expect(states[2]).toMatchObject({isVisuallyOn: false, isArmed: true});
    expect(stepFlip(states[2], 40, UIKIT).isVisuallyOn).toBe(true);
  });

  it('disarms when the finger falls back short of the line before the next event', () => {
    const states = drag(false, [26, 20, 27]);
    expect(states.map(s => s.isVisuallyOn)).toEqual([false, false, false]);
    expect(states[2].isArmed).toBe(true);
  });

  it('uses the track minus the thumb as the distance in a smaller track', () => {
    const md = switchTouchGeometry(40, 24);
    const states = drag(
      false,
      [md.flipDistance - 0.01, md.flipDistance, md.flipDistance + 1],
      md,
    );
    expect(states.map(s => s.isVisuallyOn)).toEqual([false, false, true]);
  });
});

describe('commitOnRelease (UIKit)', () => {
  it('toggles when nothing flipped, wherever the finger lifts: a tap, a hold, a 15 pt drag, a slide off (UISwitch)', () => {
    expect(commitOnRelease(null, false)).toBe(true);
    expect(commitOnRelease(null, true)).toBe(false);
    expect(commitOnRelease(drag(false, [15]).at(-1)!, false)).toBe(true);
    // Slid 160 pt toward the off end, which never flips an off switch.
    expect(commitOnRelease(drag(false, [-40, -160]).at(-1)!, false)).toBe(true);
  });

  it('commits the side a flipped drag shows, wherever the finger lifts (UISwitch)', () => {
    // Flipped on, then slid back past where it landed and off the far end. It
    // shows the side it started on, so it commits that side.
    expect(
      commitOnRelease(drag(false, [26, 27, 30, 0, -160]).at(-1)!, false),
    ).toBe(false);
  });

  it('commits the side a drag shows once it flipped: a 30 pt drag stays on', () => {
    expect(commitOnRelease(drag(false, [26, 27, 30]).at(-1)!, false)).toBe(
      true,
    );
  });

  it('commits nothing new for a drag on and back off', () => {
    expect(commitOnRelease(drag(false, [26, 27, -1]).at(-1)!, false)).toBe(
      false,
    );
  });
});

describe('settleTime', () => {
  it('settles at the release, but no sooner than the minimum lift', () => {
    expect(settleTime(1000, 0)).toBe(1000);
    expect(settleTime(50, 30)).toBe(30 + switchControl.minimumLiftMs);
    // A caller's minimum, when it passes one, replaces it.
    expect(settleTime(50, 30, 400)).toBe(430);
  });
});

describe('the switch springs against UIKit frames (iOS 26.2)', () => {
  // [ms after the spring's start, value] read per frame from UIKit.
  const cases = [
    {
      name: 'lift: lens width 37 → 58 during a hold',
      spring: switchControl.lift,
      from: 37,
      to: 58,
      // Started 30.5 ms after the finger landed.
      frames: [
        [49.8, 48.5],
        [82.5, 56.34],
        [116.9, 59.92],
        [151.5, 60.58],
        [186.8, 59.88],
        [282.8, 58.0],
      ],
      // The fit's rms is 0.29 pt; UIKit writes the lens once per frame.
      tolerance: 0.7,
    },
    {
      name: 'settle: lens width 58 → 37 after a hold',
      spring: switchControl.settle,
      from: 58,
      to: 37,
      // Started 23 ms after the finger lifted.
      frames: [
        [42.7, 55.6],
        [76.0, 51.72],
        [109.4, 47.64],
        [176.4, 41.03],
        [277.9, 36.55],
        [410.6, 36.23],
      ],
      // UIKit's own settings (0.5 s, 0.7) against frames whose start time is
      // read to a frame. The best one-spring fit is 0.49 s (rms 0.065 pt).
      tolerance: 0.45,
    },
    {
      name: 'travel: lens center 20.33 → 42.5 after a hold',
      spring: switchControl.travel,
      from: 20.333,
      to: 42.5,
      // Started 34.5 ms after the finger lifted.
      frames: [
        [31.2, 23.17],
        [64.5, 28.73],
        [97.9, 33.55],
        [133.4, 36.94],
        [198.7, 40.42],
        [300.8, 42.1],
      ],
      // UIKit's own settings (0.3 s, 1); the best one-spring fit is 0.31 s.
      tolerance: 0.45,
    },
  ] as const;

  for (const {name, spring, from, to, frames, tolerance} of cases) {
    it(name, () => {
      const curve = solveSpring(toSpring(spring), {from, to});
      for (const [ms, value] of frames) {
        expect(Math.abs(curve.value(ms / 1000) - value)).toBeLessThan(
          tolerance,
        );
      }
    });
  }

  it('the track color springs are the CASpringAnimations UIKit attached', () => {
    // Read exactly: response 0.68 s and 0.40 s, critically damped.
    for (const [spring, response] of [
      [switchControl.wellOn, 0.68],
      [switchControl.wellOff, 0.4],
    ] as const) {
      const physics = toSpring(spring);
      expect(
        (2 * Math.PI) / Math.sqrt(physics.stiffness / physics.mass),
      ).toBeCloseTo(response, 6);
      expect(
        physics.damping / (2 * Math.sqrt(physics.stiffness * physics.mass)),
      ).toBeCloseTo(1, 6);
    }
  });
});

describe('switch values', () => {
  it("are the motion roles Switch's record names, registered internally", () => {
    // spec:AST-094 FR4, DEC-5: the springs and the minimum lift time are
    // roles; DEC-11: internal, so nothing public writes them.
    registerSwitchTable();
    expect(
      listMotionRoles()
        .filter(role => role.id.startsWith('switchControl.'))
        .map(role => [role.id, role.kind]),
    ).toEqual([
      ['switchControl.lift', 'spring'],
      ['switchControl.minimumLiftMs', 'duration'],
      ['switchControl.settle', 'spring'],
      ['switchControl.tracking', 'spring'],
      ['switchControl.travel', 'spring'],
      ['switchControl.wellOff', 'spring'],
      ['switchControl.wellOn', 'spring'],
    ]);
    expect(motionRoleOf(switchControl.lift)?.id).toBe('switchControl.lift');
    expect(motionRoleOf(switchControl.travel)?.id).toBe('switchControl.travel');
    // The geometry and the rubber band are not motion.
    expect(motionRoleOf(switchControl.rubberBand)).toBeUndefined();
    expect(settleTime(0, 0)).toBe(switchControl.minimumLiftMs);
  });
});
