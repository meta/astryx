// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file separatorAttributes.ts
 * @input A window splitter's axis and disabled state, and its region's size,
 *   bounds, collapse state and collapsed text
 * @output separatorAttributes: the separator's ARIA attributes and tab stop,
 *   which ResizeHandle renders and createResizable writes on a plain element
 * @position Internal to the Resizable family. No React, and no DOM work on
 *   import
 */

import type {ResizableDirection} from './resizableModel';

/** The region a separator resizes, as it announces it. */
export interface SeparatorValue {
  /** The region's size in px, 0 while it is collapsed. */
  readonly size: number;
  readonly minPx: number;
  /** The maximum to announce, or undefined when the region has none. */
  readonly maxPx: number | undefined;
  readonly isCollapsed: boolean;
  /** The value text a collapsed separator announces. */
  readonly collapsedText: string;
}

export interface SeparatorState {
  readonly direction: ResizableDirection;
  readonly isDisabled: boolean;
  /** The region's value; a separator with no region has none. */
  readonly value?: SeparatorValue;
}

export interface SeparatorAttributes {
  readonly 'aria-orientation': 'horizontal' | 'vertical';
  readonly 'aria-valuenow': number | undefined;
  readonly 'aria-valuemin': number | undefined;
  readonly 'aria-valuemax': number | undefined;
  readonly 'aria-valuetext': string | undefined;
  readonly 'aria-disabled': true | undefined;
  readonly tabIndex: 0;
}

/**
 * The separator's ARIA attributes and tab stop. A collapsed region's real
 * size, 0, sits below aria-valuemin, which is invalid. So a collapsed
 * separator announces its minimum, and its value text says it is collapsed.
 * A disabled separator keeps its tab stop, so keyboard users can reach it and
 * hear that it is disabled.
 */
export function separatorAttributes(
  state: SeparatorState,
): SeparatorAttributes {
  const {value} = state;
  return {
    'aria-orientation':
      state.direction === 'horizontal' ? 'vertical' : 'horizontal',
    // The value stays within aria-valuemin and aria-valuemax.
    'aria-valuenow':
      value == null
        ? undefined
        : Math.min(Math.max(value.size, value.minPx), value.maxPx ?? Infinity),
    'aria-valuemin': value?.minPx,
    'aria-valuemax':
      value?.maxPx != null && Number.isFinite(value.maxPx)
        ? value.maxPx
        : undefined,
    'aria-valuetext': value?.isCollapsed ? value.collapsedText : undefined,
    'aria-disabled': state.isDisabled || undefined,
    tabIndex: 0,
  };
}
