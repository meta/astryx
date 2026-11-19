// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file theme/invertedSurfaceSide.ts
 * @input A theme's tokens resolved for each page mode
 * @output The media side each inverted surface (a toast's card) takes in each
 *   page mode, by the rule the painted surface is measured with
 * @position Read by Toast for its first paint and by the theme engine, which
 *   writes a dark-page copy of a side only for a theme whose surfaces take
 *   different sides in the two page modes.
 */

import {pickInvertedSide} from '../hooks/mediaSide';
import {parseColor} from '../utils/color';

/** The inverted surfaces whose fill the theme knows. */
export const INVERTED_SURFACE_TOKENS = [
  '--color-background-inverted',
  '--color-background-error-inverted',
] as const;

export type InvertedSurfaceToken = (typeof INVERTED_SURFACE_TOKENS)[number];

export type MediaSide = 'dark' | 'light';

/**
 * The side a surface's content takes in one page mode: the side whose content
 * color reads better on its fill. Null when the fill is see-through or a
 * color cannot be read.
 */
export function invertedSideIn(
  resolved: Record<string, string>,
  token: InvertedSurfaceToken,
): MediaSide | null {
  const fill = parseColor(resolved[token] ?? '');
  if (fill === null || fill.a < 1) {
    return null;
  }
  const side = pickInvertedSide(
    fill,
    null,
    parseColor(resolved['--color-on-dark'] ?? ''),
    parseColor(resolved['--color-on-light'] ?? ''),
  );
  return side === 'dark' || side === 'light' ? side : null;
}

/**
 * The sides a dark page needs beyond the light page's: for each inverted
 * surface whose dark-page side differs from its light-page side, the
 * dark-page side.
 */
export function darkPageSides(
  resolved: Record<MediaSide, Record<string, string>>,
): Set<MediaSide> {
  const sides = new Set<MediaSide>();
  for (const token of INVERTED_SURFACE_TOKENS) {
    const onLight = invertedSideIn(resolved.light, token);
    const onDark = invertedSideIn(resolved.dark, token);
    if (onLight !== null && onDark !== null && onLight !== onDark) {
      sides.add(onDark);
    }
  }
  return sides;
}
