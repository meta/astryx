// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useKeyboardHeight.ts
 * @input React and the page's visual viewport or the browser's own keyboard
 *   report (the VirtualKeyboard API)
 * @output useKeyboardHeight: the software keyboard's height as of its last
 *   report, measured as spec:AST-099 FR2 and FR8 define it; also
 *   keyboardCoversPage and keyboardInsetOf
 * @position Lab-internal, not exported from `@astryxdesign/lab`: lab's one
 *   keyboard listener (architecture:react-component-runtime INV11 keeps lab
 *   on its own), shared by
 *   SearchField's bottom placement and the tab bar's search field. A lab
 *   surface lays out from the height, committed at once on each report, and
 *   never rides the keyboard (FR8)
 *
 * SYNC: When modified, update useKeyboardHeight.test.tsx and the surfaces
 * that read it (SearchField/SearchFieldTouch.ts).
 */

import {useEffect, useState, type RefObject} from 'react';

/** The browser's own keyboard report (the VirtualKeyboard API). */
interface VirtualKeyboard extends EventTarget {
  overlaysContent: boolean;
  readonly boundingRect: DOMRectReadOnly;
}

/**
 * The browser's own keyboard report, where it gives one (Chrome on Android,
 * in a secure context: spec:AST-099 FR6, FR8) to a top-level document
 * (FR7).
 */
function virtualKeyboardOf(win: Window): VirtualKeyboard | null {
  if (win !== win.top) {
    return null;
  }
  return (
    (win.navigator as Navigator & {virtualKeyboard?: VirtualKeyboard})
      .virtualKeyboard ?? null
  );
}

/**
 * Whether a software keyboard would cover the page rather than resize it
 * (spec:AST-099 FR2, FR6): a visual viewport, no keyboard report of the
 * browser's own (FR8) and the top-level document (FR7).
 */
export function keyboardCoversPage(win: Window): boolean {
  return (
    win.visualViewport != null &&
    !('virtualKeyboard' in win.navigator) &&
    win === win.top
  );
}

/**
 * The software keyboard's height as spec:AST-099 FR2 defines it:
 * `innerHeight − visualViewport.height × scale` where it covers the page;
 * 0 otherwise.
 */
export function keyboardInsetOf(win: Window): number {
  const viewport = win.visualViewport;
  if (viewport == null || !keyboardCoversPage(win)) {
    return 0;
  }
  return Math.max(0, win.innerHeight - viewport.height * (viewport.scale ?? 1));
}

/** Whether focus on `target` brings up a keyboard. */
function bringsUpKeyboard(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) {
    return true;
  }
  return (
    target instanceof HTMLInputElement &&
    ![
      'button',
      'checkbox',
      'color',
      'file',
      'hidden',
      'image',
      'radio',
      'range',
      'reset',
      'submit',
    ].includes(target.type)
  );
}

/**
 * The software keyboard's height as of its last report, while `enabled`
 * (spec:AST-099 FR1), with no ride and no prediction (FR8). `focusRoot` is
 * the surface whose text controls bring the keyboard up (a field's input,
 * or the host that holds it):
 * - where the keyboard covers the page (Mobile Safari, Firefox for
 *   Android), FR2's measurement on each visual-viewport resize;
 * - where the browser reports the keyboard itself (Chrome on Android, FR8),
 *   its report: while a text control inside `focusRoot` has focus the
 *   keyboard overlays the page (`overlaysContent`) and each
 *   `geometrychange` gives its height. After the blur the overlay goes back
 *   once Chrome reports the keyboard down, so a tap that blurred the field
 *   (a cancel button beside it) still lands where it began; it goes back at
 *   once when focus moves to a text control outside `focusRoot`, so the
 *   app's own viewport setting holds everywhere else.
 */
export function useKeyboardHeight(
  enabled: boolean,
  focusRoot: RefObject<HTMLElement | null>,
): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const root = focusRoot.current;
    const win = root?.ownerDocument.defaultView;
    if (!enabled || root == null || win == null) {
      return;
    }
    const keyboard = virtualKeyboardOf(win);
    if (keyboard != null) {
      // The app's own setting, while the surface holds the overlay.
      let appOverlay: boolean | null = null;
      let current = 0;
      const commit = (next: number) => {
        current = next;
        setHeight(next);
      };
      const holdsTextFocus = () => {
        const active = root.ownerDocument.activeElement;
        return (
          active != null && root.contains(active) && bringsUpKeyboard(active)
        );
      };
      const hold = () => {
        if (appOverlay == null) {
          appOverlay = keyboard.overlaysContent;
          keyboard.overlaysContent = true;
        }
        commit(keyboard.boundingRect.height);
      };
      const giveBack = () => {
        if (appOverlay != null) {
          keyboard.overlaysContent = appOverlay;
          appOverlay = null;
        }
      };
      const onGeometryChange = () => {
        if (appOverlay == null) {
          return;
        }
        const next = keyboard.boundingRect.height;
        if (next <= 0.5 && !holdsTextFocus()) {
          // Down after the surface's blur: the overlay goes back.
          giveBack();
        }
        commit(next);
      };
      const onFocusIn = (event: FocusEvent) => {
        if (bringsUpKeyboard(event.target)) {
          hold();
        }
      };
      const onFocusOut = (event: FocusEvent) => {
        if (!bringsUpKeyboard(event.target)) {
          return;
        }
        const next = event.relatedTarget;
        if (next instanceof Node && root.contains(next)) {
          // Within the surface: another text control keeps the keyboard up.
          if (bringsUpKeyboard(next)) {
            return;
          }
        }
        // The keyboard goes down after the blur, and Chrome reports it down
        // once it is: until then the surface keeps its place. Focus moving to
        // a text control elsewhere keeps the keyboard up under the app's own
        // setting.
        if (current > 0.5 && !bringsUpKeyboard(next)) {
          return;
        }
        giveBack();
        commit(0);
      };
      keyboard.addEventListener('geometrychange', onGeometryChange);
      root.addEventListener('focusin', onFocusIn);
      root.addEventListener('focusout', onFocusOut);
      if (holdsTextFocus()) {
        hold();
      } else {
        commit(0);
      }
      return () => {
        keyboard.removeEventListener('geometrychange', onGeometryChange);
        root.removeEventListener('focusin', onFocusIn);
        root.removeEventListener('focusout', onFocusOut);
        giveBack();
      };
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
