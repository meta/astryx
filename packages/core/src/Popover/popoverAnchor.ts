// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file popoverAnchor.ts
 * @input A caller's `anchor` option: a ref, a function, or a rectangle
 * @output PopoverAnchor, PopoverRectAnchor, resolveElementAnchor,
 *   isRectAnchor, and createRectAnchorBox, which places one box for a
 *   rectangle anchor
 * @position Internal to Popover; usePopover binds the element it resolves as
 *   the layer's CSS anchor, apart from the trigger
 */

import type {RefObject} from 'react';
import {isElement} from '../utils/nodeType';
import {markPopoverRectAnchor} from '../privateAttributes/popoverRectAnchor.stylex';

/**
 * A rectangle a popover sits on when the caller holds no element: a point a
 * press landed on, or a range of text. With `contextElement`, the rectangle
 * scrolls with that element's content.
 */
export interface PopoverRectAnchor {
  /** The rectangle, in viewport coordinates, read when it is placed. */
  getBoundingClientRect: () => DOMRect;
  /**
   * The element whose content the rectangle belongs to. The box that stands
   * for the rectangle is placed inside it, so it scrolls with it; give the
   * element `position: relative` (or any non-static position) when it is a
   * scroll container. Omitted: the box is placed on the page and scrolls
   * with the page.
   */
  contextElement?: Element | null;
}

/**
 * The element a popover sits on, apart from the control that opens it: a ref
 * to any element, a function that returns the element (or `null`) and is
 * read again when the page changes, or a rectangle.
 */
export type PopoverAnchor =
  RefObject<Element | null> | (() => Element | null) | PopoverRectAnchor;

/** Whether `anchor` is a rectangle rather than an element. */
export function isRectAnchor(
  anchor: PopoverAnchor,
): anchor is PopoverRectAnchor {
  return (
    typeof anchor === 'object' &&
    !('current' in anchor) &&
    !isElement(anchor) &&
    typeof anchor.getBoundingClientRect === 'function'
  );
}

/**
 * The element a ref or function `anchor` names now, or `null` when it names
 * none in a document. A rectangle anchor names no element.
 */
export function resolveElementAnchor(anchor: PopoverAnchor): Element | null {
  let element: Element | null;
  if (typeof anchor === 'function') {
    element = anchor();
  } else if ('current' in anchor) {
    element = anchor.current;
  } else if (isElement(anchor)) {
    element = anchor;
  } else {
    return null;
  }
  return element != null && element.isConnected ? element : null;
}

export interface RectAnchorBox {
  /**
   * The box for `anchor`, placed over its rectangle. It is placed again only
   * for a new rectangle object, when it left the document, or with
   * `isFresh` (the popover is opening and the rectangle may have moved).
   */
  place: (anchor: PopoverRectAnchor, isFresh: boolean) => HTMLElement;
  /** Removes the box from the document. */
  remove: () => void;
}

/**
 * One box for one popover's rectangle anchors. The box is an empty,
 * absolutely positioned element that takes no pointer input and is hidden
 * from assistive technology; CSS anchor positioning keeps the layer on it, so
 * no script follows the rectangle afterwards.
 */
export function createRectAnchorBox(): RectAnchorBox {
  let box: HTMLElement | null = null;
  let placedFor: PopoverRectAnchor | null = null;

  const place = (anchor: PopoverRectAnchor, isFresh: boolean) => {
    if (!isFresh && placedFor === anchor && box?.isConnected === true) {
      return box;
    }
    const context = anchor.contextElement ?? null;
    const doc = context?.ownerDocument ?? document;
    const host = context ?? doc.body;
    if (box == null || box.ownerDocument !== doc) {
      box?.remove();
      box = doc.createElement('div');
      markPopoverRectAnchor(box);
      box.setAttribute('aria-hidden', 'true');
      box.style.position = 'absolute';
      box.style.margin = '0';
      box.style.padding = '0';
      box.style.pointerEvents = 'none';
    }
    if (box.parentNode !== host) {
      host.append(box);
    }
    // One measurement per placement: the box's origin in its containing
    // block, then the rectangle. Both are viewport coordinates, so their
    // difference is the offset inside the containing block, scroll included.
    box.style.left = '0px';
    box.style.top = '0px';
    const origin = box.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    box.style.left = `${rect.left - origin.left}px`;
    box.style.top = `${rect.top - origin.top}px`;
    // WebKit counts an empty anchor box as clipped and then hides the layer,
    // so the box keeps at least one pixel on each axis.
    box.style.width = `${Math.max(rect.width, 1)}px`;
    box.style.height = `${Math.max(rect.height, 1)}px`;
    placedFor = anchor;
    return box;
  };

  const remove = () => {
    box?.remove();
    placedFor = null;
  };

  return {place, remove};
}
