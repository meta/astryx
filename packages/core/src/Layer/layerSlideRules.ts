// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerSlideRules.ts
 * @input A layer's placement and alignment
 * @output The `@position-try` rules for its slide options and their names, and
 *   the beside and fit options of a layer that must never settle over its
 *   anchor
 * @position Layer runtime geometry; the slide of spec:AST-059 FR4
 *
 * The slide is a position option whose area spans the whole alignment axis,
 * so a layer wider than the room beside its trigger on both sides still
 * reaches the side of the trigger that has room on the placement axis. A
 * plain `<position-area>` fallback would keep the base margins and insets,
 * which belong to an edge-aligned layer: the alignment-axis gutter on one
 * edge only, and the clearance/gutter pair of the base side on the placement
 * axis. Each slide option therefore carries its own declarations — the
 * gutter on both alignment-axis edges, and the clearance facing the anchor
 * with the gutter on the far edge of the side it lands on.
 *
 * A layer that must never settle over its anchor (spec:AST-059 FR4, Tooltip)
 * has a second fallback list, for when its settled box covers its anchor:
 * content taller than the room above and below its trigger. `beside` lands on a
 * side across the alignment axis, spanning the whole block axis, at the
 * content's own inline size, so it fits only where the layer fits without
 * squeezing. `fit` lands above or below sized to the room on that side, so
 * overflow scrolls inside the layer, and is never smaller than half of the room
 * the trigger leaves on the block axis, so it fits only on the side with more
 * room; the list tries both only after the layer's own position, `beside` and
 * the opposite side at the layer's own size, so only content taller than the
 * room on both sides is sized to a room. No option is sized to whatever room
 * is left: a browser keeps a layer on the option it last used for as long as
 * that option still fits, so such an option would hold an open layer on a side
 * shrunk to a sliver after its anchor moved. Chromium applies a position
 * option's width and height properties but not their min/max forms, so the
 * sizes are `inline-size` and `block-size`.
 *
 * The rules are static — the anchor clearance travels through a custom
 * property — so one style sheet per document carries all of them. It is
 * installed from a layout effect, before the layer's first paint, rather than
 * through StyleX, whose `positionTry()` output is malformed in the pinned
 * release. The sheet lives in the document head, not beside or inside the
 * layer: a sibling would change what a parent's last child is, and text
 * inside a role-bearing layer would name it to assistive technology.
 */

import type {LayerAlignment, LayerPlacement} from './useLayer';
import {layerViewportInset} from './layerViewportInset.stylex';

/** The custom property a layer writes its anchor clearance to. */
export const LAYER_CLEARANCE_PROPERTY = '--_astryx-layer-clearance';

type Side = 'same' | 'opposite';

export function slideRuleName(
  placement: LayerPlacement,
  alignment: LayerAlignment,
  side: Side,
): string {
  return `--astryx-layer-slide-${placement}-${alignment}-${side}`;
}

const CLEARANCE = `var(${LAYER_CLEARANCE_PROPERTY}, 0px)`;

/** Two declarations: the `env()`-less fallback first, then the full value. */
function pair(property: string, fallback: string, value: string): string {
  return `${property}:${fallback};${property}:${value};`;
}

function blockGutter(property: string): string {
  return pair(
    property,
    layerViewportInset.gutterBlockFallback,
    layerViewportInset.gutterBlock,
  );
}

function inlineGutter(property: string): string {
  return pair(
    property,
    layerViewportInset.gutterInlineFallback,
    layerViewportInset.gutterInline,
  );
}

const OPPOSITE: Record<LayerPlacement, LayerPlacement> = {
  above: 'below',
  below: 'above',
  start: 'end',
  end: 'start',
};

function areaFor(placement: LayerPlacement): string {
  switch (placement) {
    case 'above':
      return 'self-block-start span-all';
    case 'below':
      return 'self-block-end span-all';
    case 'start':
      return 'self-inline-start span-all';
    case 'end':
      return 'self-inline-end span-all';
  }
}

/** The placement-axis margins for a layer resting on `placement`'s side. */
function placementMargins(placement: LayerPlacement): string {
  switch (placement) {
    case 'above':
      return `margin-block-end:${CLEARANCE};${blockGutter('margin-block-start')}`;
    case 'below':
      return `margin-block-start:${CLEARANCE};${blockGutter('margin-block-end')}`;
    case 'start':
      return `margin-inline-end:${CLEARANCE};${inlineGutter('margin-inline-start')}`;
    case 'end':
      return `margin-inline-start:${CLEARANCE};${inlineGutter('margin-inline-end')}`;
  }
}

/** The alignment-axis gutter on both edges, with the base inset reset. */
function alignmentMargins(placement: LayerPlacement): string {
  return placement === 'above' || placement === 'below'
    ? `${inlineGutter('margin-inline-start')}${inlineGutter('margin-inline-end')}inset-inline-start:0;inset-inline-end:0;`
    : `${blockGutter('margin-block-start')}${blockGutter('margin-block-end')}inset-block-start:0;inset-block-end:0;`;
}

function rule(
  placement: LayerPlacement,
  alignment: LayerAlignment,
  side: Side,
): string {
  const landing = side === 'same' ? placement : OPPOSITE[placement];
  return `@position-try ${slideRuleName(placement, alignment, side)}{position-area:${areaFor(landing)};${placementMargins(landing)}${alignmentMargins(landing)}}`;
}

const PLACEMENTS: ReadonlyArray<LayerPlacement> = [
  'above',
  'below',
  'start',
  'end',
];
const ALIGNMENTS: ReadonlyArray<LayerAlignment> = ['start', 'center', 'end'];

/** The name of the `beside` option that lands on `side`, across the block axis. */
export function besideRuleName(side: 'start' | 'end'): string {
  return `--astryx-layer-beside-${side}`;
}

/**
 * The name of the `fit` option that lands on `side` sized to the room there,
 * which fits only while that side holds at least half of the room the trigger
 * leaves on the block axis.
 */
export function fitRuleName(side: 'above' | 'below'): string {
  return `--astryx-layer-fit-${side}`;
}

/**
 * `beside`: the slide's geometry on an inline side, at the content's own
 * inline size. A content-sized layer would otherwise wrap to whatever sliver
 * of room the trigger leaves and always fit.
 */
function besideRule(side: 'start' | 'end'): string {
  return `@position-try ${besideRuleName(side)}{position-area:${areaFor(side)};${placementMargins(side)}${alignmentMargins(side)}inline-size:max-content;}`;
}

/** The block size of the room on one block side: the area minus its margins. */
function roomCap(gutter: string): string {
  return `calc(100% - ${CLEARANCE} - ${gutter})`;
}

/**
 * Half of the room the trigger leaves on the block axis, minus one side's
 * margins and one pixel: a side whose room is at least this much is the
 * roomier side. The pixel lets both sides fit when the trigger sits at the
 * viewport's middle, where rounding could otherwise fail both.
 */
function halfRoom(viewport: string, gutter: string): string {
  return `calc((${viewport} - anchor-size(block)) / 2 - ${CLEARANCE} - ${gutter} - 1px)`;
}

/**
 * `fit`: the slide's geometry on a block side, sized to the room on that
 * side; the layer scrolls what does not fit (FR3). It is at least half of the
 * room the trigger leaves, so it overflows, and does not fit, on the side
 * with less room.
 */
function fitRule(side: 'above' | 'below'): string {
  const size = (viewport: string, gutter: string) =>
    `max(${roomCap(gutter)}, ${halfRoom(viewport, gutter)})`;
  const blockSize = pair(
    'block-size',
    size('100vh', layerViewportInset.gutterBlockFallback),
    size('100dvb', layerViewportInset.gutterBlock),
  );
  return `@position-try ${fitRuleName(side)}{position-area:${areaFor(side)};${placementMargins(side)}${alignmentMargins(side)}${blockSize}}`;
}

/**
 * The fallback list of a layer that must never settle over its anchor, once
 * the standard list has failed it (FR4). After the layer's own position (the
 * preferred block side, at its own size): beside the trigger on the inline
 * end, then the inline start, then the opposite block side at its own size,
 * and only then the preferred block side and the opposite one sized to the
 * room there, each only while it is the roomier side. Every option before the
 * last two keeps the layer at its own size, so a layer whose content fits
 * somewhere is never stretched to a room; the last two are for content taller
 * than the room on both sides. Chromium tries no more than five options, so
 * this replaces the standard list rather than extending it. Side placements
 * already slide along the block axis at full height, so they have none.
 */
export function getAnchorClearFallbacks(placement: LayerPlacement): string {
  if (placement !== 'above' && placement !== 'below') {
    return '';
  }
  const opposite = placement === 'above' ? 'below' : 'above';
  return `${besideRuleName('end')}, ${besideRuleName('start')}, flip-block, ${fitRuleName(placement)}, ${fitRuleName(opposite)}`;
}

/** The custom property a layer writes its anchor-clear fallback list to. */
export const LAYER_CLEAR_FALLBACKS_PROPERTY = '--_astryx-layer-clear-fallbacks';

/** The custom property its `position-try-fallbacks` reads first. */
export const LAYER_TRY_FALLBACKS_PROPERTY = '--_astryx-layer-try-fallbacks';

/**
 * The attribute the runtime sets on a layer whose settled box covered its
 * anchor; it switches the layer to its anchor-clear list.
 */
export const LAYER_CLEARS_ANCHOR_ATTRIBUTE = 'data-astryx-clears-anchor';

/**
 * The attribute the runtime sets on a layer that keeps its anchor clear while
 * its content overflows the box it was given; only then does it scroll, so a
 * layer that fits stays a plain box and a wheel over it still scrolls the
 * page.
 */
export const LAYER_SCROLLS_ATTRIBUTE = 'data-astryx-layer-scrolls';

/**
 * Switches a layer that set the attribute to its anchor-clear list, and lets
 * a layer whose content overflows scroll it.
 */
function clearSwitchCss(): string {
  return `[${LAYER_CLEARS_ANCHOR_ATTRIBUTE}]{${LAYER_TRY_FALLBACKS_PROPERTY}:var(${LAYER_CLEAR_FALLBACKS_PROPERTY});}[${LAYER_SCROLLS_ATTRIBUTE}]{overflow-y:auto;overscroll-behavior-block:contain;}`;
}

/**
 * Every slide rule, for every placement and alignment, and the beside and fit
 * rules.
 */
export function slideRulesCss(): string {
  return [
    ...PLACEMENTS.flatMap(placement =>
      ALIGNMENTS.flatMap(alignment => [
        rule(placement, alignment, 'same'),
        rule(placement, alignment, 'opposite'),
      ]),
    ),
    besideRule('end'),
    besideRule('start'),
    fitRule('above'),
    fitRule('below'),
    clearSwitchCss(),
  ].join('');
}

export const SLIDE_RULES_ID = 'astryx-layer-slide-rules';

/**
 * Install the slide rules in a document once. Idempotent; a second layer, or
 * a layer in another document (an iframe), finds or adds its own sheet.
 */
export function ensureSlideRules(doc: Document): void {
  if (doc.getElementById(SLIDE_RULES_ID)) {
    return;
  }
  const style = doc.createElement('style');
  style.id = SLIDE_RULES_ID;
  style.textContent = slideRulesCss();
  doc.head.appendChild(style);
}
