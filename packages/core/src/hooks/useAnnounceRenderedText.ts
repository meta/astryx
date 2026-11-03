// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAnnounceRenderedText.ts
 * @input A ref to a rendered element, whether it shows, and a token for each
 *   new occasion to speak
 * @output Announces the element's rendered text through the polite live
 *   region, or through the owner's announcer
 * @position Core a11y hook. It is not in hooks/index.ts, because that barrel
 *   is public and a new public hook needs admission (AST-002). Import it by
 *   path.
 */

// Some content reaches assistive technology only through a live region. For
// example, a listbox permits only `option` and `group` children, so a panel
// message in it has `role="presentation"`. When that content is a caller's
// `ReactNode`, announce what was rendered, not a built-in default (AST-056,
// AST-086).
//
// The text comes from the DOM after render, not from React children, so text
// that a child component generates is included. A live region that mounts
// with its content is not reliably announced, so the persistent `useAnnounce`
// region speaks it. Content with `aria-hidden` or `hidden` is left out. An
// `aria-label` on a descendant is not used.

import {useEffect, useRef, useState, type RefObject} from 'react';
import {
  useAnnounce,
  type AnnounceFn,
  type AnnouncePoliteness,
} from './useAnnounce';
import {useIsHydrating} from './useIsHydrating';

const LIVE_CONTAINER =
  '[role="log"], [role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]';
const HIDDEN = '[aria-hidden="true"], [hidden]';
const BLOCKS = 'p, div, li, br, h1, h2, h3, h4, h5, h6';

/**
 * Each child element's rendered text as its own block, joined by spaces. Text
 * placed directly in the element, beside its child elements, counts as a block
 * too (a status bar is an icon followed by its bare message).
 */
function blockText(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .map(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        return (child.textContent ?? '').replace(/\s+/g, ' ').trim();
      }
      // By node type, not `instanceof`: an element from another document's
      // window (a portal into a same-origin iframe) fails this window's
      // constructor checks.
      if (child.nodeType === Node.ELEMENT_NODE) {
        const part = child as HTMLElement;
        return part.matches(HIDDEN) ? '' : renderedText(part);
      }
      return '';
    })
    .filter(part => part !== '')
    .join(' ');
}

export interface AnnounceRenderedTextOptions {
  /**
   * Text that is present or changes while the document loads or hydrates is
   * silent. Text that appears or changes later is announced once. A mounted
   * live container speaks its own content, and each child is a block. A
   * reveal without a re-render is read on the next render.
   */
  skipFirstRender?: boolean;
  /**
   * The urgency: assertive for errors and time-critical failures, else
   * polite. Defaults to polite.
   */
  politeness?: AnnouncePoliteness;
  /**
   * The owner's announcer, when the rendered text states the next value of
   * that announcer's state. For example, a picker's empty-panel message goes
   * through its search's `hasReplace` instance, so the two replace each other
   * while not yet exposed. Defaults to this hook's own instance.
   */
  announce?: AnnounceFn;
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
  {
    skipFirstRender = false,
    politeness = 'polite',
    announce: ownerAnnounce,
  }: AnnounceRenderedTextOptions = {},
): void {
  const ownAnnounce = useAnnounce();
  const announce = ownerAnnounce ?? ownAnnounce;
  const spokenRef = useRef<string | null>(null);
  const isHydrating = useIsHydrating();
  // Captured once: an owner rendered before the document finished loading, or
  // hydrated from server HTML, is part of the page the person arrived at.
  const [renderedWithPage] = useState(
    () => isHydrating || document.readyState !== 'complete',
  );
  const isFirstRunRef = useRef(true);

  // No dependency array: the text lives in the DOM, and a caller can change it
  // without a prop that this hook sees. One text read per render is cheap, and
  // the dedupe below makes later renders no-ops.
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
    announce(text, politeness);
  });
}
