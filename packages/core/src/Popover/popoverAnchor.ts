// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file popoverAnchor.ts
 * @input A caller's `anchorRef`
 * @output resolvePopoverAnchor
 * @position Internal to Popover; usePopover binds the element it resolves as
 *   the layer's CSS anchor, apart from the trigger
 */

import type {RefObject} from 'react';
import {warnOnce} from '../utils/devWarning';

// Bundlers replace this value at build time. The declaration lets a product
// without Node's types type-check this file.
declare const process: {readonly env: {readonly NODE_ENV?: string}};

/** The element `anchorRef` holds now, or `null` when it holds none in a document. */
export function resolvePopoverAnchor(
  anchorRef: RefObject<Element | null>,
): Element | null {
  const element = anchorRef.current;
  if (element == null || !element.isConnected) {
    return null;
  }
  // A shape or a nested `<svg>` inside an `<svg>` has no CSS box. It cannot
  // be an anchor, so the popover sits at the viewport corner. An `<svg>`
  // whose parent is HTML or `<foreignObject>` has a box.
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
        '`anchorRef` holds a shape or a nested <svg> inside an <svg>, which has ' +
          'no CSS box, so the popover cannot sit on it. Anchor to the ' +
          'outermost <svg> element or to an HTML element placed over it.',
      );
    }
  }
  return element;
}
