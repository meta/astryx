// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file popoverAnchor.ts
 * @input A caller's `anchor` option: a ref or a function
 * @output PopoverAnchor and resolvePopoverAnchor
 * @position Internal to Popover; usePopover binds the element it resolves as
 *   the layer's CSS anchor, apart from the trigger
 */

import type {RefObject} from 'react';
import {warnOnce} from '../utils/devWarning';

// Bundlers replace this value at build time. The declaration lets a product
// without Node's types type-check this file.
declare const process: {readonly env: {readonly NODE_ENV?: string}};

/**
 * The element a popover sits on, apart from the control that opens it: a ref
 * to an element with a CSS box, or a function that returns the element (or
 * `null`). A
 * function is read when the popover opens and when the caller passes a new
 * one.
 */
export type PopoverAnchor = RefObject<Element | null> | (() => Element | null);

/** The element `anchor` names now, or `null` when it names none in a document. */
export function resolvePopoverAnchor(anchor: PopoverAnchor): Element | null {
  const element = typeof anchor === 'function' ? anchor() : anchor.current;
  if (element == null || !element.isConnected) {
    return null;
  }
  // An element inside an `<svg>` (a shape, or a nested `<svg>`) has no CSS
  // box, so it cannot carry an anchor name and the popover would sit at the
  // viewport corner. An `<svg>` whose parent is HTML, or `<foreignObject>`,
  // has a box.
  if (process.env.NODE_ENV !== 'production') {
    const svg = 'http://www.w3.org/2000/svg';
    const parent = element.parentElement;
    if (
      element.namespaceURI === svg &&
      parent?.namespaceURI === svg &&
      parent.localName !== 'foreignObject'
    ) {
      warnOnce(
        'usePopover:anchor-svg-shape',
        'usePopover',
        '`anchor` is a shape or a nested <svg> inside an <svg>, which has ' +
          'no CSS box, so the popover cannot sit on it. Anchor to the ' +
          'outermost <svg> element or to an HTML element placed over it.',
      );
    }
  }
  return element;
}
