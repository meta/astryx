// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeExplorerData.ts
 * @input Generated package and template registries
 * @output The theme picker list and the theme showcase source
 * @position Server-side projection that the /themes page passes to
 *   ThemePackagePage
 *
 * SYNC: When ThemePackagePage reads another registry field, add it here.
 */

import {packages, type PackageMeta} from '../generated/packageRegistry';
import {templates} from '../generated/templateRegistry';

export type ThemeExplorerPackage = Pick<PackageMeta, 'name' | 'displayName'>;

// Gallery order, from most restrained to most expressive. A theme that is
// not in this list goes to the end, in alphabetical order.
const THEME_ORDER: ReadonlyArray<string> = [
  '@astryxdesign/theme-neutral',
  '@astryxdesign/theme-stone',
  '@astryxdesign/theme-gothic',
  '@astryxdesign/theme-matcha',
  '@astryxdesign/theme-y2k',
  '@astryxdesign/theme-butter',
];

function compareThemeOrder(a: ThemeExplorerPackage, b: ThemeExplorerPackage) {
  const ai = THEME_ORDER.indexOf(a.name);
  const bi = THEME_ORDER.indexOf(b.name);
  if (ai === -1 && bi === -1) {
    return a.name.localeCompare(b.name);
  }
  if (ai === -1) {
    return 1;
  }
  if (bi === -1) {
    return -1;
  }
  return ai - bi;
}

/**
 * React serializes the props of a client component into the page, and the
 * modules it imports ship to the browser. The package and template registries
 * are megabytes, so the theme explorer gets only the fields it reads.
 */
export function getThemeExplorerPackages(): ThemeExplorerPackage[] {
  return packages
    .filter(p => p.name.startsWith('@astryxdesign/theme-'))
    .map(({name, displayName}) => ({name, displayName}))
    .sort(compareThemeOrder);
}

/** The theme-showcase template source that seeds Open in Playground. */
export function getThemeShowcaseSource(): string {
  return templates.find(t => t.slug === 'theme-showcase')?.source ?? '';
}
