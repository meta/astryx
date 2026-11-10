// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tapWobble.ts
 * @input Nothing
 * @output `TAP_WOBBLE`, how far a tap's finger drifts, px
 * @position A leaf module of packages/core/src/gestures. The shared
 *   scroll-edge pan and BottomSheet's pull both leave a touch's moves to the
 *   browser until they reach it.
 */

/**
 * A tap's wobble, px. WebKit ends a touch's click when one of its moves is
 * cancelled. So a pan or a pull leaves moves inside this distance to the
 * browser. Mobile Safari commits its native pan on a kept move this long, so
 * the hold starts at it.
 * @source measured: Mobile Safari, iOS 26.2 simulator (iPhone 17 Pro), HID
 *   swipes down a BottomSheet's list at its top, Nov 9 2026. A kept first
 *   move of 4 px, its later moves cancelled, commits no native pan (3 of 3).
 *   A kept first move of 5 px commits it (4 of 5).
 */
export const TAP_WOBBLE = 5;
