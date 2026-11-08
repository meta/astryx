// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file types.ts
 * @output Type definitions for Selector
 * @position Type definitions; used by Selector.tsx
 */

import type {ReactNode} from 'react';
import type {IconType} from '../Icon';

/**
 * A selectable option in the selector
 */
export type SelectorOptionData = {
  value: string;
  // Kept a string, not ReactNode: search filtering and type-ahead both
  // lowercase this to match keystrokes.
  label?: string;
  description?: ReactNode;
  disabled?: boolean;
  icon?: ReactNode | IconType;
  /**
   * The option's secondary control — an Edit button beside a saved label —
   * as one node the caller renders and names; the host only places it. In
   * `MultiSelector`, any option carrying one turns the popup into a grid whose
   * rows pair the option with its action, reachable by pointer, touch, the
   * inline-end arrow, and a screen reader (`spec:AST-058`). `Selector` does
   * not render it yet and warns in development when an option carries one.
   * Absent and `null` mean the same: none.
   */
  action?: ReactNode;
};

/**
 * A divider between options
 */
export type SelectorDivider = {
  type: 'divider';
};

/**
 * A section/group of options with optional title
 */
export type SelectorSection = {
  type: 'section';
  title?: string;
  options: SelectorOptionData[];
};

/**
 * Union of all option types passed to the `options` prop.
 * Can be a plain string, option data object, divider, or section.
 */
export type SelectorOptionType =
  string | SelectorOptionData | SelectorDivider | SelectorSection;
