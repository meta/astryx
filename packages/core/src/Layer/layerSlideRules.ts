// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerSlideRules.ts
 * @input A layer's placement and alignment
 * @output The `@position-try` rules for its slide options and their names, and
 *   the beside and fit options of a layer that must never settle over its
 *   anchor
 * @position Layer runtime geometry; the slide of spec:AST-059 FR4
 *
 * Every option places the layer with `anchor()` insets, not a position area.
 * A position area grows to include an anchor that runs past the viewport, so
 * an option can fit there while the layer leaves the screen. Insets resolve
 * against the viewport itself.
 *
 * The slide is a position option whose insets span the whole alignment axis,
 * so a layer wider than the room beside its trigger on both sides still
 * reaches the side of the trigger that has room on the placement axis. Each
 * slide option carries its own declarations: the gutter on both
 * alignment-axis edges with the layer centred on its anchor, and the
 * clearance facing the anchor with the gutter on the far edge of the side it
 * lands on.
 *
 * An above or below layer that must never settle over its anchor
 * (spec:AST-059 FR4, Tooltip) uses one combined fallback list from the start,
 * and no option in it overlaps the anchor. `beside` lands on a
 * side across the alignment axis, spanning the whole block axis, at the
 * content's own inline size, so it fits only where the layer fits without
 * squeezing. `fit` lands above or below sized to the room on that side, so
 * overflow scrolls inside the layer, and is never smaller than half of the room
 * the trigger leaves on the block axis, so it fits only on the side with more
 * room; the list tries both only after the layer's own position, the opposite
 * side at the layer's own size and `beside`, so only content taller than the
 * room on both sides is sized to a room. No option is sized to whatever room
 * is left: a browser keeps a layer on the option it last used for as long as
 * that option still fits, so such an option would hold an open layer on a side
 * shrunk to a sliver after its anchor moved. Inside a scrolling panel, Chromium
 * does not choose an option again while the panel scrolls, and it shifts a box
 * that runs out of room back into the room, onto the anchor. So the layer and
 * every option align `unsafe` toward the anchor on the placement axis: a box
 * that runs out of room overflows away from the anchor instead.
 *
 * The rules are static — the anchor clearance travels through a custom
 * property — so one style sheet per document carries all of them. It is
 * installed from a layout effect, before the layer's first paint, rather than
 * through StyleX, whose `positionTry()` output is malformed in the pinned
 * release. The sheet lives in the document head, not beside or inside the
 * layer: a sibling would change what a parent's last child is, and text
 * inside a role-bearing layer would name it to assistive technology.
 */

import type {LayerPlacement} from './useLayer';
import {layerViewportInset} from './layerViewportInset.stylex';

/** The custom property a layer writes its anchor clearance to. */
export const LAYER_CLEARANCE_PROPERTY = '--_astryx-layer-clearance';

/**
 * The custom property a layer writes its software-keyboard lift to. Every
 * block-start inset subtracts it and every block-end inset adds it, so the
 * lift moves the layer toward the block-start in every declared option. useLayer.tsx
 * names it in its own styles (`LIFT`), because StyleX resolves only constants
 * defined in the same file.
 */
export const LAYER_LIFT_PROPERTY = '--_astryx-layer-lift';

type Side = 'same' | 'opposite';

export function slideRuleName(placement: LayerPlacement, side: Side): string {
  return `--astryx-layer-slide-${placement}-${side}`;
}

const CLEARANCE = `var(${LAYER_CLEARANCE_PROPERTY}, 0px)`;
const LIFT = `var(${LAYER_LIFT_PROPERTY}, 0px)`;

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

/**
 * The placement axis of a layer resting on `placement`'s side: the inset on
 * the anchor side meets the anchor's far edge, the other inset meets the
 * viewport edge, and the box aligns toward the anchor. The anchor clearance
 * is the margin on the anchor side and the gutter the margin on the far side.
 */
function placementGeometry(placement: LayerPlacement): string {
  switch (placement) {
    case 'above':
      return `inset-block-end:calc(anchor(outside) + ${LIFT});inset-block-start:calc(0px - ${LIFT});align-self:self-end;margin-block-end:${CLEARANCE};${blockGutter('margin-block-start')}`;
    case 'below':
      return `inset-block-start:calc(anchor(outside) - ${LIFT});inset-block-end:${LIFT};align-self:self-start;margin-block-start:${CLEARANCE};${blockGutter('margin-block-end')}`;
    case 'start':
      return `inset-inline-end:anchor(outside);inset-inline-start:0;justify-self:self-end;margin-inline-end:${CLEARANCE};${inlineGutter('margin-inline-start')}`;
    case 'end':
      return `inset-inline-start:anchor(outside);inset-inline-end:0;justify-self:self-start;margin-inline-start:${CLEARANCE};${inlineGutter('margin-inline-end')}`;
  }
}

/**
 * The alignment axis spanning the whole viewport: both insets meet the
 * viewport edges, the gutter is the margin on both edges, and the box centres
 * on the anchor. `anchor-center` shifts the box the least distance that keeps
 * its margin box inside the viewport.
 */
function spanGeometry(placement: LayerPlacement): string {
  return placement === 'above' || placement === 'below'
    ? `inset-inline-start:0;inset-inline-end:0;justify-self:anchor-center;${inlineGutter('margin-inline-start')}${inlineGutter('margin-inline-end')}`
    : `inset-block-start:calc(0px - ${LIFT});inset-block-end:${LIFT};align-self:anchor-center;${blockGutter('margin-block-start')}${blockGutter('margin-block-end')}`;
}

function rule(placement: LayerPlacement, side: Side): string {
  const landing = side === 'same' ? placement : OPPOSITE[placement];
  return `@position-try ${slideRuleName(placement, side)}{${placementGeometry(landing)}${spanGeometry(landing)}}`;
}

const PLACEMENTS: ReadonlyArray<LayerPlacement> = [
  'above',
  'below',
  'start',
  'end',
];

/**
 * The placement-axis alignment of a layer that keeps its anchor clear, on
 * `side` of its anchor: `unsafe`, toward the anchor, so a box that runs out of
 * room overflows away from the anchor rather than being shifted onto it.
 * `flip-block` swaps it with the side.
 */
export function anchorClearAlignment(side: LayerPlacement): string {
  return side === 'above' || side === 'start'
    ? 'unsafe self-end'
    : 'unsafe self-start';
}

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
 * of room the trigger leaves and always fit. On the block axis it centres on
 * the trigger and slides into view.
 */
function besideRule(side: 'start' | 'end'): string {
  return `@position-try ${besideRuleName(side)}{${placementGeometry(side)}${spanGeometry(side)}inline-size:max-content;justify-self:${anchorClearAlignment(side)};}`;
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
 * `fit`: the slide's geometry on a block side, stretched to the room on that
 * side; the layer scrolls what does not fit (FR3). Its minimum is half of the
 * room the trigger leaves, so it overflows, and does not fit, on the side
 * with less room.
 */
function fitRule(side: 'above' | 'below'): string {
  const minBlockSize = pair(
    'min-block-size',
    halfRoom('100vh', layerViewportInset.gutterBlockFallback),
    halfRoom('100dvb', layerViewportInset.gutterBlock),
  );
  return `@position-try ${fitRuleName(side)}{${placementGeometry(side)}${spanGeometry(side)}block-size:-webkit-fill-available;block-size:stretch;${minBlockSize}align-self:${anchorClearAlignment(side)};}`;
}

/**
 * The one combined fallback list of an above or below layer that must never
 * settle over its anchor (FR4). After the layer's own position (the preferred
 * block side, at its own size): the opposite block side at its own size, then
 * beside the trigger on the inline end, then the inline start, and only then
 * the preferred block side and the opposite one sized to the room there, each
 * only while it is the roomier side. Every option before the last two keeps
 * the layer at its own size, so a layer whose content fits somewhere is never
 * stretched to a room; the last two are for content taller than the room on
 * both sides. Chromium tries no more than five options, so this replaces the
 * standard list rather than extending it. Side placements already slide along
 * the block axis at full height, so they have none.
 */
export function getAnchorClearFallbacks(placement: LayerPlacement): string {
  if (placement !== 'above' && placement !== 'below') {
    return '';
  }
  const opposite = placement === 'above' ? 'below' : 'above';
  return `flip-block, ${besideRuleName('end')}, ${besideRuleName('start')}, ${fitRuleName(placement)}, ${fitRuleName(opposite)}`;
}

/**
 * Every slide rule, for every placement, and the beside and fit rules.
 */
export function slideRulesCss(): string {
  return [
    ...PLACEMENTS.flatMap(placement => [
      rule(placement, 'same'),
      rule(placement, 'opposite'),
    ]),
    besideRule('end'),
    besideRule('start'),
    fitRule('above'),
    fitRule('below'),
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
