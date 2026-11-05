// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuWidth.ts
 * @input Accepts the public DropdownMenu menuWidth value and a viewport limit
 * @output Resolves whether the value belongs on min-width or inline-size
 * @position Shared width compatibility logic for root menus and submenu flyouts
 */

import {clampInlineSize, isIntrinsicInlineSize} from '../Layer/clampInlineSize';

export type ResolvedMenuWidth =
  | {property: 'inlineSize'; value: string}
  | {property: 'minWidth'; value: string};

/**
 * CSS intrinsic and CSS-wide keywords cannot be arguments to `min()`. Apply
 * those values as the preferred inline size so max-inline-size can still cap
 * the menu. Lengths retain the existing minimum-width growth contract, clamped
 * to the layer runtime's viewport cap (spec:AST-059 FR7).
 */
export function resolveMenuWidth(
  menuWidth: number | string,
  maximum: string,
): ResolvedMenuWidth {
  if (typeof menuWidth === 'string' && isIntrinsicInlineSize(menuWidth)) {
    return {property: 'inlineSize', value: menuWidth.trim()};
  }
  return {property: 'minWidth', value: clampInlineSize(menuWidth, maximum)};
}
