// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerInset.ts
 * @input A LayerProvider inset declaration
 * @output The inline custom properties that carry it to a layer or the toast
 *   viewport, where the gutter reads them
 * @position Layer runtime; the mechanism behind `LayerProvider.inset`
 *   (spec:AST-059 FR6). The property names are implementation; the provider
 *   prop is the public surface.
 */

import type {CSSProperties} from 'react';
import type {LayerInset} from './LayerContext';

const INSET_PROPERTIES: ReadonlyArray<[keyof LayerInset, string]> = [
  ['blockStart', '--astryx-layer-inset-block-start'],
  ['blockEnd', '--astryx-layer-inset-block-end'],
  ['inlineStart', '--astryx-layer-inset-inline-start'],
  ['inlineEnd', '--astryx-layer-inset-inline-end'],
];

function toCssLength(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value;
}

/**
 * The inline custom properties that carry a declared inset to the element
 * whose gutter reads them — the layer, or the toast viewport. One property
 * per declared edge; an undeclared edge sets nothing, so it reads `0px`
 * through the gutter's fallback exactly as it does with no provider at all.
 */
export function layerInsetProperties(
  inset: LayerInset | undefined,
): CSSProperties {
  const style: Record<string, string> = {};
  if (inset) {
    for (const [edge, property] of INSET_PROPERTIES) {
      const value = inset[edge];
      if (value != null && value !== '') {
        style[property] = toCssLength(value);
      }
    }
  }
  return style;
}
