// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useKeyboardHeight.ts
 * @input React and the page's visual viewport
 * @output useKeyboardHeight, keyboardCoversPage and keyboardInsetOf: the
 *   software keyboard's height from the visual viewport, in every browser
 * @position Lab's one keyboard listener. Lab's entry point does not export
 *   it. SearchField's bottom placement and the tab bar's search field read it.
 *
 * SYNC: When modified, update useKeyboardHeight.test.tsx and
 * SearchField/SearchFieldTouch.ts.
 */

import {useEffect, useState, type RefObject} from 'react';

/**
 * Whether a software keyboard would cover the page rather than resize it.
 * That needs a visual viewport in the top-level document, because an
 * iframe's visual viewport does not change for the keyboard. Chrome on
 * Android counts too: its visual viewport shrinks for the keyboard as Mobile
 * Safari's does. The browser's own keyboard report is not read. It needs
 * `overlaysContent`, which overrides the app's viewport setting.
 */
export function keyboardCoversPage(win: Window): boolean {
  return win.visualViewport != null && win === win.top;
}

/**
 * The software keyboard's height: `innerHeight − visualViewport.height ×
 * scale` where it covers the page, so a pan or a zoom cannot shrink it; 0
 * otherwise.
 */
export function keyboardInsetOf(win: Window): number {
  const viewport = win.visualViewport;
  if (viewport == null || !keyboardCoversPage(win)) {
    return 0;
  }
  return Math.max(0, win.innerHeight - viewport.height * (viewport.scale ?? 1));
}

/**
 * The software keyboard's height as of its last report, while `enabled`,
 * with no ride and no prediction: keyboardInsetOf on each visual-viewport
 * resize, in every browser. `focusRoot` names the document whose window is
 * measured.
 */
export function useKeyboardHeight(
  enabled: boolean,
  focusRoot: RefObject<HTMLElement | null>,
): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const win = focusRoot.current?.ownerDocument.defaultView;
    if (!enabled || win == null) {
      return;
    }
    const viewport = win.visualViewport;
    const onResize = () => setHeight(keyboardInsetOf(win));
    onResize();
    viewport?.addEventListener('resize', onResize);
    win.addEventListener('resize', onResize);
    return () => {
      viewport?.removeEventListener('resize', onResize);
      win.removeEventListener('resize', onResize);
    };
  }, [enabled, focusRoot]);
  return enabled ? height : 0;
}
