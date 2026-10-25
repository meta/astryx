// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file gestures.test.ts
 * @input The gesture constants table
 * @output Every constant ships only its value and unit (its sources are
 *   JSDoc, checked by uikit.test.ts); the documented UIKit defaults keep
 *   their documented values
 * @position Unit test of packages/core/src/motion/uikit/gestures.ts
 */

import {describe, expect, it} from 'vitest';
import {PRESS_GESTURE_MEMORY_MS} from '../../utils/pressFeedback';
import {PRESS_SLOP_PX} from '../../utils/pressGesture';
import {
  HAPTIC_FEEDBACK_KINDS,
  HAPTIC_VIBRATION_PATTERNS,
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
  it.each(entries())('%s ships only its value and unit', (_, constant) => {
    // Its sources are JSDoc (uikit.test.ts): a source in the value would ship
    // in every bundle that reads it.
    expect(Object.keys(constant).sort()).toEqual(['unit', 'value']);
    const values = Array.isArray(constant.value)
      ? constant.value
      : [constant.value];
    for (const value of values) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('keeps the documented and measured UIKit values', () => {
    expect(UIKIT_GESTURES.longPress.minimumPressDuration.value).toBe(500);
    expect(UIKIT_GESTURES.longPress.allowableMovement.value).toBe(10);
    expect(UIKIT_GESTURES.tap.allowableMovement.value).toBe(45);
    expect(UIKIT_GESTURES.tap.maximumIntervalBetweenTaps.value).toBe(350);
    expect(UIKIT_GESTURES.pan.hysteresis.value).toBe(10);
    expect(UIKIT_GESTURES.pinch.hysteresis.value).toBe(8);
    expect(UIKIT_GESTURES.control.trackingExpansion.value).toBe(70);
    expect(UIKIT_GESTURES.velocity.currentWeight.value).toBe(0.2);
  });

  it('holds the press entries to the press model, one value per use', () => {
    // The touch press model (utils/pressGesture.ts, utils/pressFeedback.ts)
    // and the table name the same clocks: they cannot drift apart.
    expect(UIKIT_GESTURES.press.slop.value).toBe(PRESS_SLOP_PX);
    expect(UIKIT_GESTURES.press.momentumMemory.value).toBe(
      PRESS_GESTURE_MEMORY_MS,
    );
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
