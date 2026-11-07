// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file keyboardSurface.ts
 * @input React context, the touch query, where the keyboard is measured
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

import {createContext} from 'react';
import {isKeyboardMeasurable} from '../keyboard/keyboardHeight';
import {TOUCH_QUERY} from '../utils/touchPresentation';

export const KeyboardSurfaceContext = createContext(false);
KeyboardSurfaceContext.displayName = 'KeyboardSurfaceContext';

/** Focuses `element` the way its surface wants (see the file header). */
export function focusInKeyboardSurface(
  element: HTMLElement,
  isKeyboardSurface: boolean,
): void {
  if (isKeyboardSurface && isMeasuredTouchScreen(element)) {
    element.focus({preventScroll: true});
  } else {
    element.focus();
  }
}

function isMeasuredTouchScreen(element: HTMLElement): boolean {
  const win = element.ownerDocument.defaultView;
  return (
    win != null &&
    isKeyboardMeasurable(win) &&
    typeof win.matchMedia === 'function' &&
    win.matchMedia(TOUCH_QUERY).matches
  );
}
