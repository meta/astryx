// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file `astryx theme use` — choose the app's default added theme. */

import {useThemeInApp} from '../_adapter.mjs';

/**
 * Set one added theme as the default and regenerate the app module.
 * @param {string} slug
 * @param {{cwd?: string}} [options]
 * @returns {Promise<import('../theme.type.mjs').ThemeAppResponse>}
 */
export function themeUse(slug, options = {}) {
  return useThemeInApp(slug, options);
}
