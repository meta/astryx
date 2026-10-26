// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hapticSwitch.ts
 * @input Nothing
 * @output Exports HAPTIC_SWITCH_ATTRIBUTE
 * @position Shared by haptics.ts, which marks its hidden switch with it, and
 *   the gesture host, whose click swallower skips that switch, so the host
 *   never imports the haptics module (a component that plays no haptic pays
 *   nothing for it)
 */

/** Marks the hidden switch, so click handlers can recognize and ignore it. */
export const HAPTIC_SWITCH_ATTRIBUTE = 'data-astryx-haptic-switch';
