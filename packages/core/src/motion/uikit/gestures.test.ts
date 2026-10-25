// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file gestures.test.ts
 * @input The gesture constants table
 * @output Every value is sourced or is a guess that names its measurement;
 *   the documented UIKit defaults keep their documented values
 * @position Unit test of packages/core/src/motion/uikit/gestures.ts
 */

import {describe, expect, it} from 'vitest';
import {
  HAPTIC_FEEDBACK_KINDS,
  HAPTIC_VIBRATION_PATTERNS,
  isGuess,
  UIKIT_GESTURES,
  type GestureConstant,
} from './gestures';

function entries(): [string, GestureConstant<unknown>][] {
  const result: [string, GestureConstant<unknown>][] = [];
  for (const [group, values] of Object.entries(UIKIT_GESTURES)) {
    for (const [name, constant] of Object.entries(values)) {
      result.push([`${group}.${name}`, constant]);
    }
  }
  for (const [kind, constant] of Object.entries(HAPTIC_VIBRATION_PATTERNS)) {
    result.push([`haptics.${kind}`, constant]);
  }
  return result;
}

describe('UIKIT_GESTURES', () => {
  it.each(entries())(
    '%s carries a source or a measurement task',
    (_, constant) => {
      if (isGuess(constant)) {
        expect(constant.guess.length).toBeGreaterThan(10);
        expect(constant.measure).toMatch(/^M-G\d\d: .{10,}/);
        expect('source' in constant).toBe(false);
      } else {
        expect(constant.source).toMatch(
          /^(apple-docs https:\/\/developer\.apple\.com\/|wwdc \d{4}-\d+ |measured: )/,
        );
      }
    },
  );

  it('keeps the documented and measured UIKit values', () => {
    expect(UIKIT_GESTURES.longPress.minimumPressDuration.value).toBe(500);
    expect(UIKIT_GESTURES.longPress.allowableMovement.value).toBe(10);
    expect(UIKIT_GESTURES.tap.allowableMovement.value).toBe(45);
    expect(UIKIT_GESTURES.tap.maximumIntervalBetweenTaps.value).toBe(350);
    expect(UIKIT_GESTURES.pan.hysteresis.value).toBe(10);
    expect(UIKIT_GESTURES.pinch.hysteresis.value).toBe(8);
    expect(UIKIT_GESTURES.control.trackingExpansion.value).toBe(70);
    expect(UIKIT_GESTURES.velocity.stillSamples.value).toBe(2);
  });

  it('keeps the pan decision within the distance WebKit claims a scroll at', () => {
    // Mobile Safari's last cancelable touchmove of a slow drag is at 10 px; a
    // pan that must cancel the native scroll decides by then.
    expect(UIKIT_GESTURES.pan.hysteresis.value).toBeLessThanOrEqual(10);
  });

  it('has a vibration pattern for every feedback kind', () => {
    for (const kind of HAPTIC_FEEDBACK_KINDS) {
      expect(HAPTIC_VIBRATION_PATTERNS[kind].value.length).toBeGreaterThan(0);
    }
  });
});
