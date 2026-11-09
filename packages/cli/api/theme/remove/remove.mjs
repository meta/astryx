// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file `astryx theme remove` — stop importing one non-default app theme. */

import {removeThemeFromApp} from '../_adapter.mjs';

/**
 * Remove one added non-default theme and regenerate the app module.
 * @param {string} slug
 * @param {{cwd?: string}} [options]
 * @returns {Promise<import('../theme.type.mjs').ThemeAppResponse>}
 */
export function themeRemove(slug, options = {}) {
  return removeThemeFromApp(slug, options);
}
