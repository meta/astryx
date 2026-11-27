// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file breakpoints.ts
 * @input None
 * @output The fixed viewport-width breakpoint names and defaults, the media
 *   features and StyleX key that spell them, and the compact definition
 * @position The breakpoint vocabulary of the theme adaptations, which
 *   themeAdaptations.ts re-exports. It imports nothing, so a component that
 *   reads the compact definition loads none of the adaptation writer.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/theme/themeAdaptations.ts (its re-exports)
 * - /packages/core/src/AppShell/AppShell.tsx (named breakpoint consumption)
 * - /packages/cli/api/theme/build/build.mjs (its DEFAULT_WIDTH_BREAKPOINTS copy)
 */

/** Fixed names for viewport-width tier start points. */
export const WIDTH_BREAKPOINT_NAMES = ['sm', 'md', 'lg', 'xl', '2xl'] as const;

/** One fixed viewport-width breakpoint name. */
export type WidthBreakpointName = (typeof WIDTH_BREAKPOINT_NAMES)[number];

/** A complete, validated map of viewport-width tier start points in CSS px. */
export type WidthBreakpoints = Record<WidthBreakpointName, number>;

/** The default Astryx viewport-width tier start points in CSS px. */
export const DEFAULT_WIDTH_BREAKPOINTS: Readonly<WidthBreakpoints> =
  Object.freeze({
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
  });

// StyleX lowers a range feature such as `(width < 768px)` to
// `(max-width: 767.99px)`. Chromium rounds that length up to 768px, so the
// rule also matches at exactly 768px wide, where the wider side must apply.
// A StyleX key therefore says "below" as the negation of the inclusive lower
// edges. The negation is one parenthesized condition, so StyleX can combine it
// with another media key on the same property and the result stays valid.
// Script and plain CSS keep the range features, which the browser reads
// directly.

/** A width strictly below `px`, as a media feature for script or plain CSS. */
export function widthBelowFeature(px: number): string {
  return `(width < ${px}px)`;
}

/** A height strictly below `px`, as a media feature for script or plain CSS. */
export function heightBelowFeature(px: number): string {
  return `(height < ${px}px)`;
}

/** A width at or above `px`, as a media feature for script or plain CSS. */
export function widthFromFeature(px: number): string {
  return `(width >= ${px}px)`;
}

/** The edges of a "below" condition: true below the width, or below the height. */
export interface BelowEdges {
  /** Matches below this width. */
  readonly width: number;
  /** Also matches below this height. */
  readonly height?: number;
}

/**
 * The StyleX media key for "narrower than `width`, or shorter than `height`".
 * Write the returned string as a literal key: a computed key gets a different
 * StyleX priority. Put it after every other width or height key on the same
 * property. StyleX rewrites an earlier key to exclude the later keys, and
 * lowers the edges it negates. themeAdaptations.edges.test.ts enforces this
 * for the compact key.
 */
export function belowStyleKey({width, height}: BelowEdges): string {
  const widthEdge = `(min-width: ${width}px)`;
  return height === undefined
    ? `@media (not ${widthEdge})`
    : `@media (not (${widthEdge} and (min-height: ${height}px)))`;
}

/**
 * When a screen is compact, for a component that chooses a presentation by
 * screen size: width below the theme's effective `md` point, or height below
 * 500. The numbers are the same on every platform (CSS pixels on the web,
 * points on iOS, density-independent pixels on Android).
 */
export interface CompactDefinition {
  /** Compact below this viewport width: the effective `md` point. */
  readonly widthBelow: number;
  /** Compact below this viewport height. */
  readonly heightBelow: number;
  /** The definition as a media query list, without the `@media` keyword. */
  readonly query: string;
  /** Compact and a coarse primary pointer, without the `@media` keyword. */
  readonly coarsePointerQuery: string;
}

/** The viewport height below which a screen is compact. */
const COMPACT_HEIGHT_BELOW = 500;

/**
 * The compact definition for a theme's width points.
 * Pass a theme's effective width breakpoints; omit them for the defaults.
 */
export function compactDefinition(
  points: Readonly<Pick<WidthBreakpoints, 'md'>> = DEFAULT_WIDTH_BREAKPOINTS,
): CompactDefinition {
  const width = widthBelowFeature(points.md);
  const height = heightBelowFeature(COMPACT_HEIGHT_BELOW);
  return Object.freeze({
    widthBelow: points.md,
    heightBelow: COMPACT_HEIGHT_BELOW,
    query: `${width}, ${height}`,
    coarsePointerQuery: `${width} and (pointer: coarse), ${height} and (pointer: coarse)`,
  });
}

/** The compact definition at the default width points. */
export const DEFAULT_COMPACT_DEFINITION: CompactDefinition =
  compactDefinition();
