// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The icon set that draws the built-in icons of the app's themes: the
 * project's main icon set, in the project's look.
 *
 * Icon sets are experimental. With no `experimental.iconSet` in
 * astryx.config there is no such set, and the generated theme module
 * carries each theme as built.
 *
 * @input A project directory
 * @output The set's name, the module that exports its theme map, and that
 *   map's export name; or null
 * @position packages/cli/foundation/config — read by the theme commands,
 *   `astryx experimental icon use`, and Doctor's generated-module check
 */

import {Project} from './project.mjs';
import {iconSetKey} from '../discovery/icon-set-discovery.mjs';
import {lookThemeMap} from '../discovery/icon-set-theme-maps.mjs';

/**
 * The project's main icon set and the theme map that draws its look, or its
 * default look when it has no map for that look. Null when astryx.config
 * names no set, when the main set does not resolve, or when the set names
 * no theme map.
 * @param {string} projectDir
 * @param {{fresh?: boolean}} [options] `fresh`: read astryx.config again,
 *   for a caller that changed it in this process
 * @returns {Promise<import('./theme-state.mjs').ThemeIconSet | null>}
 */
export async function themeIconSet(projectDir, {fresh = false} = {}) {
  let choice;
  try {
    const project = await Project.load(projectDir, {fresh});
    ({choice} = await project.iconSets());
  } catch {
    // A config or integration that does not load names no usable set. The
    // command that reads it reports the problem in its own words.
    return null;
  }
  if (choice.status !== 'selected' || !choice.set) return null;
  // A look the set has no map for draws the set's default look, as a copied
  // template does, rather than the theme's own icons.
  const exportName =
    lookThemeMap(choice.set.data, choice.variant) ?? choice.set.data.themeMap;
  if (!exportName) return null;
  return {
    set: iconSetKey(choice.set),
    module: choice.set.data.module,
    exportName,
  };
}
