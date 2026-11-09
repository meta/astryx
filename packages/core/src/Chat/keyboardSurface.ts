// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file keyboardSurface.ts
 * @input createSharedContext, the keyboard module's touch gate
 *   (followsKeyboard)
 * @output Exports KeyboardSurfaceContext and focusInKeyboardSurface: whether a
 *   composer sits in ChatLayout's composer region, and the focus it delivers
 * @position Internal to Chat: ChatLayout provides it; ChatComposer and
 *   ChatComposerInput read it
 *
 * Under a finger in a top-level page, focus skips the browser's reveal, which
 * on iOS scrolls the whole page. Elsewhere the browser's own focus applies.
 *
 * SYNC: update ChatLayout.tsx, ChatComposer.tsx and ChatComposerInput.tsx
 */

import {followsKeyboard} from '../keyboard/keyboardTarget';
import {createSharedContext} from '../utils/sharedContext';

export const KeyboardSurfaceContext = createSharedContext(
  'KeyboardSurfaceContext',
  1,
  false,
);

/** Focuses `element` the way its surface wants (see the file header). */
export function focusInKeyboardSurface(
  element: HTMLElement,
  isKeyboardSurface: boolean,
): void {
  if (isKeyboardSurface && followsKeyboard(element.ownerDocument.defaultView)) {
    element.focus({preventScroll: true});
  } else {
    element.focus();
  }
}
