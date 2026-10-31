// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hapticSwitch.ts
 * @input Nothing
 * @output Exports HAPTIC_SWITCH_ATTRIBUTE
 * @position Internal util shared by gestures/haptics.ts, which marks its
 *   hidden switch with it, and by the click guard (utils/clickGuard.ts) and
 *   the gesture host, which skip that switch: neither imports the haptics
 *   module, and Core's public entries carry no gesture code for it
 *   (architecture:react-component-runtime INV13)
 *
 * Deliberately absent from utils/index.ts: packages/core/src/index.ts does
 * `export * from './utils'`, so naming it there would publish it as API.
 */

/** Marks the hidden switch, so click handlers can recognize and ignore it. */
export const HAPTIC_SWITCH_ATTRIBUTE = 'data-astryx-haptic-switch';
