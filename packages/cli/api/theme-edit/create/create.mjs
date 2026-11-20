// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `themeEditCreate` leaf: `astryx experimental theme create <name>
 * --traits '<json>'`. This is the public function; its work and all
 * environment access are in the adapter.
 *
 * @position api/theme-edit/create — re-exported by theme-edit.mjs
 */

import * as adapter from '../_adapter.mjs';

/**
 * Write a complete theme file from a few typed traits, build it, add it to
 * the app and make it the app's theme, then check and repair it.
 * @experimental
 * @param {string} name The new theme's name.
 * @param {string | Record<string, unknown>} traits The traits: JSON text, a .json file path, or the object.
 * @param {import('../theme-edit.type.mjs').ThemeEditCreateOptions} [options]
 * @returns {Promise<import('../theme-edit.type.mjs').ThemeEditCreateResponse>}
 */
export async function themeEditCreate(name, traits, options = {}) {
  return adapter.themeEditCreate(name, traits, options);
}
