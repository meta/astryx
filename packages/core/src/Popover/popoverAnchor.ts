// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file popoverAnchor.ts
 * @input A caller's `anchor` option: a ref or a function
 * @output PopoverAnchor and resolvePopoverAnchor
 * @position Internal to Popover; usePopover binds the element it resolves as
 *   the layer's CSS anchor, apart from the trigger
 */

import type {RefObject} from 'react';

/**
 * The element a popover sits on, apart from the control that opens it: a ref
 * to any element, or a function that returns the element (or `null`) and is
 * read again when the page changes.
 */
export type PopoverAnchor = RefObject<Element | null> | (() => Element | null);

/** The element `anchor` names now, or `null` when it names none in a document. */
export function resolvePopoverAnchor(anchor: PopoverAnchor): Element | null {
  const element = typeof anchor === 'function' ? anchor() : anchor.current;
  return element != null && element.isConnected ? element : null;
}
