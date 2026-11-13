// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollType.ts
 * @input A wheel event
 * @output `scrollTypeOf`: whether a mouse wheel or a trackpad scrolled
 * @position Shared by the gesture host and the date and time wheels. It holds
 *   no gesture code, so a wheel that reads it statically does not pull in the
 *   deferred touch runtime
 */

import type {ScrollType} from './types';

/**
 * The web's best reading of what scrolled: a mouse wheel's notches
 * (`discrete`) or a trackpad's scroll (`continuous`). Input it cannot tell
 * apart counts as a mouse wheel's, which a pan that takes only a trackpad's
 * scroll leaves to the page. These read as a mouse wheel's:
 * - a line- or page-mode delta;
 * - a scroll with Shift held (Shift+wheel);
 * - a pixel delta a hair off a whole pixel (a mouse wheel on Windows);
 * - a scroll with no legacy `wheelDelta` (an engine that sends none);
 * - a delta that is not a third of its legacy `wheelDelta`;
 * - a 120 tick over a 40 px delta.
 * A trackpad's precise deltas, a third of their legacy `wheelDelta` in
 * Chromium and WebKit, read as a trackpad's.
 */
export function scrollTypeOf(wheel: WheelEvent): ScrollType {
  if (wheel.deltaMode !== 0 || wheel.shiftKey) {
    return 'discrete';
  }
  const remainder = (value: number) => {
    const fraction = Math.abs(value - Math.round(value));
    return fraction > 0 && fraction < 0.01;
  };
  if (remainder(wheel.deltaX) || remainder(wheel.deltaY)) {
    return 'discrete';
  }
  const legacy = wheel as WheelEvent & {
    wheelDeltaX?: number;
    wheelDeltaY?: number;
  };
  if (
    typeof legacy.wheelDeltaY !== 'number' ||
    typeof legacy.wheelDeltaX !== 'number'
  ) {
    return 'discrete';
  }
  const precise = (delta: number, legacyDelta: number) =>
    delta === 0
      ? legacyDelta === 0
      : Math.abs(Math.abs(legacyDelta) - 3 * Math.abs(delta)) <=
        Math.max(1.5, 0.05 * Math.abs(delta) * 3);
  if (
    !precise(wheel.deltaY, legacy.wheelDeltaY) ||
    !precise(wheel.deltaX, legacy.wheelDeltaX)
  ) {
    return 'discrete';
  }
  const tick = (delta: number, legacyDelta: number) =>
    legacyDelta !== 0 && legacyDelta % 120 === 0 && delta % 40 === 0;
  return tick(wheel.deltaY, legacy.wheelDeltaY) ||
    tick(wheel.deltaX, legacy.wheelDeltaX)
    ? 'discrete'
    : 'continuous';
}
