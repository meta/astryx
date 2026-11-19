// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file menuItemHover.ts
 * @output Exports focusMenuItemOnHover
 * @position Shared helper for DropdownMenu/ContextMenu item components
 *
 * Menus keep a single highlighted item by using DOM focus as the sole
 * highlight source. Mouse hover moves focus onto the pointed-at item so the
 * one focus highlight follows the pointer — instead of a separate `:hover`
 * background leaving the keyboard-focused item highlighted at the same time.
 * That focus follows the last input (`architecture:interaction-modality` INV1):
 * after a pointer press it does not match `:focus-visible`, so a keyboard-only
 * focus style does not paint on the row under the mouse.
 *
 * SYNC: When modified, update the item components that use it:
 * - /packages/core/src/DropdownMenu/DropdownMenuItem.tsx
 * - /packages/core/src/DropdownMenu/DropdownMenuCheckboxItem.tsx
 * - /packages/core/src/DropdownMenu/DropdownMenuRadioItem.tsx
 * - /packages/core/src/DropdownMenu/DropdownMenuSubMenu.tsx
 */

import type {PointerEvent} from 'react';
import {focusForLastInput} from '../utils/focusReturn';

/**
 * Move focus to a menu item as the pointer moves over it, so hover and
 * keyboard navigation share a single focus-driven highlight. Only reacts to a
 * real mouse (not touch/pen, which have no hover), and skips disabled items.
 */
export function focusMenuItemOnHover(
  e: PointerEvent<HTMLElement>,
  isDisabled?: boolean,
): void {
  if (isDisabled || e.pointerType !== 'mouse') {
    return;
  }
  const el = e.currentTarget;
  if (el !== el.ownerDocument.activeElement) {
    // preventScroll: focusing an off-screen item scrolls it under the
    // stationary pointer, whose next pointerenter focuses it again — a
    // runaway auto-scroll loop. Keyboard navigation scrolls via its own
    // highlight handling; hover must never scroll.
    // A plain focus() inherits :focus-visible from the element focused before
    // it (the menu after a pointer open), so after a pointer press it is moved
    // with the browser's focusVisible option instead. After a key press the
    // keyboard is the last input and the indicator stays. A browser without
    // the option (Chrome and Edge before 145, Safari before 18.4) ignores it,
    // and the row may then match :focus-visible as it did before.
    // The menu activates the modality tracking this reads (its press model,
    // or the Breadcrumbs menu trigger).
    focusForLastInput(el, {preventScroll: true});
  }
}
