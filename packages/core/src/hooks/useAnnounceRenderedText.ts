// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAnnounceRenderedText.ts
 * @input A ref to a rendered element, whether it is showing, and a token that
 *   marks a new occasion to speak
 * @output Announces that element's own rendered text through the persistent
 *   polite live region
 * @position Core a11y hook; mirrors on-screen content into the shared live
 *   region by reading the DOM
 *
 * Some content reaches assistive technology only through a live region: a
 * panel message marked `role="presentation"`, for instance, because
 * `role="listbox"` permits only `option` and `group` children. When that
 * content is a caller-supplied `ReactNode`, the component must announce what
 * it actually rendered — announcing a built-in default over a caller's
 * element tells the screen-reader user something the sighted user is not
 * reading (`spec:AST-056` AR1, FR3).
 *
 * The text is read from the DOM after render, never by inspecting React
 * children. That is the whole point: by the time this runs the browser has
 * rendered the subtree, so text a child component generates inside its own
 * render announces correctly, and there is no tree walk, no depth limit, and
 * no "could not read it" fallback to get wrong.
 *
 * Announcing through the persistent `useAnnounce` region rather than putting
 * `role="status"` on the rendered element is both required here — the element
 * is a listbox child, which may only be `option` or `group` — and the
 * repository's established convention for conditionally rendered messages
 * (see `FieldStatus` and `TimeInput`): a live region that mounts together
 * with its content is not reliably announced.
 *
 * Content hidden with `aria-hidden` or `hidden` is excluded,
 * so a decorative icon stays out of the announcement exactly as it stays out
 * of what a screen reader reads. An `aria-label` renaming a descendant is NOT
 * substituted — the region speaks the rendered text.
 *
 * SYNC: deliberately NOT exported from /packages/core/src/hooks/index.ts —
 * that barrel is re-exported wholesale from the package entry point, so
 * adding it there would ship a new public hook without `spec:AST-002`
 * admission. Import it by path from inside the package.
 */

import {useEffect, useRef, useState, type RefObject} from 'react';
import {useAnnounce} from './useAnnounce';
import {useIsHydrating} from './useIsHydrating';

const LIVE_CONTAINER =
  '[role="log"], [role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]';
const HIDDEN = '[aria-hidden="true"], [hidden]';
const BLOCKS = 'p, div, li, br, h1, h2, h3, h4, h5, h6';

/** Each child element's rendered text as its own block, joined by spaces. */
function blockText(element: HTMLElement): string {
  return Array.from(element.children)
    .filter(child => !child.matches(HIDDEN))
    .map(child => renderedText(child as HTMLElement))
    .filter(part => part !== '')
    .join(' ');
}

export interface AnnounceRenderedTextOptions {
  /**
   * Text present or changed while the document loads or hydrates is silent;
   * text that appears or changes later is announced once (`spec:AST-086`
   * FR11). A mounted live container speaks its own content (FR4); each child is
   * a block; a reveal without a re-render is read on the next render (FR13).
   */
  skipFirstRender?: boolean;
}

/** The rendered text an assistive technology would read from `element`. */
export function renderedText(element: HTMLElement): string {
  // Clone so removing the hidden parts cannot disturb what is on screen. The
  // clone is never attached to the document.
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(HIDDEN).forEach(node => node.remove());
  copy.querySelectorAll(BLOCKS).forEach(node => node.after(' ')); // blocks apart
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Announce the text of a rendered element through the shared polite live
 * region, once per occasion.
 *
 * Announces when the element appears and whenever its rendered text changes.
 * Pass `isShown: false` for every state where the element is not on screen —
 * including while loading — and the hook stays silent and re-arms.
 *
 * @param ref - The element whose rendered text to speak
 * @param isShown - Whether that element is currently on screen
 * @param occasion - Marks a new reason to speak the same words again; for a
 *   search dead end this is the query, so each new query that matches nothing
 *   is announced rather than only the first
 *
 * @example
 * ```
 * const emptyStateRef = useRef<HTMLDivElement>(null);
 * useAnnounceRenderedText(emptyStateRef, isPanelEmpty, searchQuery);
 * ```
 */
export function useAnnounceRenderedText(
  ref: RefObject<HTMLElement | null>,
  isShown: boolean,
  occasion: string,
  {skipFirstRender = false}: AnnounceRenderedTextOptions = {},
): void {
  const announce = useAnnounce();
  const spokenRef = useRef<string | null>(null);
  const isHydrating = useIsHydrating();
  // Captured once: an owner rendered before the document finished loading, or
  // hydrated from server HTML, is part of the page the person arrived at.
  const [renderedWithPage] = useState(
    () => isHydrating || document.readyState !== 'complete',
  );
  const isFirstRunRef = useRef(true);

  // Deliberately no dependency array. The text lives in the DOM, so there is
  // no React value to depend on that changes when it does — a caller can
  // change the rendered message without any prop this hook can see. Reading
  // one element's text per render is cheap, and the dedupe below makes every
  // render after the first a no-op.
  useEffect(() => {
    const isFirstRun = isFirstRunRef.current;
    isFirstRunRef.current = false;
    const element = ref.current;
    if (
      !isShown ||
      element?.closest(HIDDEN) ||
      element?.checkVisibility?.() === false
    ) {
      spokenRef.current = null;
      return;
    }
    if (!element) {
      return;
    }
    if (skipFirstRender && element.parentElement?.closest(LIVE_CONTAINER)) {
      return;
    }
    const text = skipFirstRender ? blockText(element) : renderedText(element);
    if (text === '') {
      // Nothing readable on screen either, so there is no announcement that
      // would match what the sighted user is seeing.
      return;
    }
    const spoken = `${occasion}\u0000${text}`;
    if (spokenRef.current === spoken) {
      return;
    }
    spokenRef.current = spoken;
    const isPageLoad =
      (isFirstRun && renderedWithPage) || document.readyState !== 'complete';
    if (skipFirstRender && isPageLoad) {
      // Part of the page the person arrived at: remember it, say nothing.
      return;
    }
    announce(text);
  });
}
