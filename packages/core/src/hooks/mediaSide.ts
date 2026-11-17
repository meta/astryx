// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file mediaSide.ts
 * @input A painted surface color, the page's text color and the theme's
 *   on-colors
 * @output The media side text takes on the surface, or 'off'
 * @position Internal; the rules useAutoMediaMode and Toast measure with.
 *   Pure color math with no React or StyleX, so contrast checks import it.
 */

import type {RGBA} from '../utils/color';
import {contrastRatio} from '../theme/contrast';

/** A surface luminance context, or `"off"` when no media context is wanted. */
export type DetectedMediaMode = 'dark' | 'light' | 'off';

/**
 * Contrast at which a surface's own text reads well enough that no media
 * context is wanted. This is WCAG's large-text line. It is low on purpose: it
 * decides if a surface is effectively inverted, not if its text meets a
 * standard. A media context on a 3:1 pairing changes accent, overlays and
 * borders with no legibility gain.
 */
const AMBIENT_READS_AT = 3;

/**
 * Which media context a surface wants: `'off'` when its ambient text already
 * reads on the surface, otherwise whichever on-color reads better. Pure — the
 * DOM read is the caller's. Ties between the two sides go to dark, matching
 * the convention that an inverted surface is usually the dark one.
 *
 * The `'off'` answer is the point of measuring at all. A surface that a theme
 * calls inverted but paints pale does not want an inverted context; its own
 * text is already correct for it, and forcing one is how white-on-pale-grey
 * happens.
 */
export function pickMediaMode(
  background: RGBA,
  ambient: RGBA | null,
  onDark: RGBA | null,
  onLight: RGBA | null,
): DetectedMediaMode | null {
  if (onDark === null || onLight === null) {
    return null;
  }

  if (
    ambient !== null &&
    contrastRatio(ambient, background) >= AMBIENT_READS_AT
  ) {
    return 'off';
  }

  return contrastRatio(onDark, background) >= contrastRatio(onLight, background)
    ? 'dark'
    : 'light';
}

/**
 * Pick the side for a surface that a component paints as inverted, such as a
 * toast. Its text takes the on-color that reads best on the surface. It keeps
 * the surface's own text only when that reads at least as well as both
 * on-colors, as on a pale surface a theme calls inverted.
 */
export function pickInvertedSide(
  background: RGBA,
  ambient: RGBA | null,
  onDark: RGBA | null,
  onLight: RGBA | null,
): DetectedMediaMode | null {
  if (onDark === null || onLight === null) {
    return null;
  }
  const dark = contrastRatio(onDark, background);
  const light = contrastRatio(onLight, background);
  if (ambient !== null) {
    const own = contrastRatio(ambient, background);
    if (own >= dark && own >= light) {
      return 'off';
    }
  }
  return dark >= light ? 'dark' : 'light';
}

/** A rule that picks a media side from the painted colors. */
export type MediaSidePicker = typeof pickMediaMode;
