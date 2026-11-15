// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file `astryx theme remove` — stop importing one app theme. */

import {removeThemeFromApp} from '../_adapter.mjs';

/**
 * Remove one added theme and regenerate the app module, or remove the module
 * file when it was the only added theme.
 * @param {string} slug
 * @param {{cwd?: string}} [options]
 * @returns {Promise<import('../theme.type.mjs').ThemeAppResponse>}
 */
export function themeRemove(slug, options = {}) {
  return removeThemeFromApp(slug, options);
}
