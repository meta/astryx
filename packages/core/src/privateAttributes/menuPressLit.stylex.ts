// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/menuPressLit.stylex.ts
 * @input The row that a held finger or pen lights in a menu
 * @output markMenuPressLit and clearMenuPressLit, which mark that row,
 *   isMenuPressLit, which reads the mark, and menuPressLitRowStyle, which
 *   paints the marked row
 * @position Owner module of the private menu-press-lit attribute: the only
 *   file that writes its name. The menu press model (hooks/useMenuPress.ts)
 *   marks the row; DropdownMenu's rows compose the styles. No package entry
 *   exports it.
 *
 * SYNC: Each row that composes menuPressLitRowStyle reads
 *   `--_menu-row-focus-paint` in its `:focus` background:
 * - /packages/core/src/DropdownMenu/DropdownMenuItem.tsx
 * - /packages/core/src/DropdownMenu/DropdownMenuCheckboxItem.tsx
 * - /packages/core/src/DropdownMenu/DropdownMenuRadioItem.tsx
 * - /packages/core/src/DropdownMenu/DropdownMenuSubMenu.tsx
 */

import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';

const MENU_PRESS_LIT = 'data-astryx-menu-press-lit';

/** Marks `row` as the row that a held finger or pen lights. */
export function markMenuPressLit(row: Element): void {
  row.setAttribute(MENU_PRESS_LIT, '');
}

/** Removes the mark from `row`. */
export function clearMenuPressLit(row: Element): void {
  row.removeAttribute(MENU_PRESS_LIT);
}

/** Whether a held finger or pen lights `row`. */
export function isMenuPressLit(row: Element): boolean {
  return row.hasAttribute(MENU_PRESS_LIT);
}

/**
 * A value for each attribute state. The index signature gives StyleX the value
 * type, which it cannot read from a literal attribute key.
 */
type ByAttribute<Value> = Readonly<{
  default: null;
  [attribute: string]: Value | null;
}>;

const litRowPaint: Readonly<{'--_menu-row-focus-paint': ByAttribute<string>}> =
  {
    '--_menu-row-focus-paint': {
      default: null,
      '[data-astryx-menu-press-lit]': colorVars['--color-overlay-pressed'],
    },
  };

const styles = stylex.create({
  row: {...litRowPaint},
});

/**
 * Compose on a menu row whose `:focus` background is
 * `var(--_menu-row-focus-paint, <hover overlay>)`. The row paints the hover
 * overlay on focus, and the pressed overlay while a held finger or pen lights
 * it.
 * Under a finger, the hover overlay is too faint to follow. The variable has
 * no default: a layered stylesheet emits a default unlayered, and it would
 * beat the attribute arm. The value resolves on the row, so a theme set on any
 * ancestor applies. The style sets only a custom property, which shares no
 * key with StyleX's CSS property type, so TypeScript needs the wider type.
 */
export const menuPressLitRowStyle = styles.row as StyleXStyles;
