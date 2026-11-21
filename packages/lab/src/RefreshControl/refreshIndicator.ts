// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file refreshIndicator.ts
 * @output The name of the custom property the touch layer writes and the
 *   app's indicator styles may read
 * @position Internal to useRefreshControl; re-exported for the app's
 *   indicator styles
 */

/** CSS custom property the indicator reads: how much of it is revealed (0–1). */
export const REFRESH_REVEAL_VAR = '--astryx-refresh-reveal';
