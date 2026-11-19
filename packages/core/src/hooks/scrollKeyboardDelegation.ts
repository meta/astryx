// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollKeyboardDelegation.ts
 * @input A named, overflowing viewport and its real content box (the viewport
 *   itself when it has no separate content box)
 * @output Focus-time delegation with native forward and reverse Tab traversal
 * @position Private keyboard behavior of useScrollableArea and of AppShell's main
 *   region; no DOM observers or scrolling
 */

import {FOCUSABLE_SELECTOR} from './focusableSelector';
import {getRegisteredScrollOwnerState} from './scrollOwnerRegistry';

// Structural roles may contain ordinary links/buttons. Unknown or interactive
// roles are deliberately excluded until their navigation contract is proven.
const PASSIVE_ROLES = new Set([
  'article',
  'banner',
  'complementary',
  'contentinfo',
  'definition',
  'directory',
  'document',
  'figure',
  'form',
  'generic',
  'group',
  'heading',
  'list',
  'listitem',
  'main',
  'navigation',
  'none',
  'note',
  'paragraph',
  'presentation',
  'region',
  'section',
  'status',
  'table',
  'term',
]);

function isSequential(element: HTMLElement): boolean {
  if (
    element.tabIndex < 0 ||
    element.matches(':disabled') ||
    element.closest('[inert], [hidden]') != null ||
    element.getClientRects().length === 0
  ) {
    return false;
  }
  const visibility = getComputedStyle(element).visibility;
  return visibility !== 'hidden' && visibility !== 'collapse';
}

function firstDelegationTarget(
  viewport: HTMLElement,
  content: HTMLElement,
): HTMLElement | null {
  const candidates = content.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  // A viewport that is its own content box is the stop being entered, never
  // the target it delegates to.
  let first =
    content !== viewport &&
    content.matches(FOCUSABLE_SELECTOR) &&
    isSequential(content)
      ? content
      : null;
  for (const candidate of candidates) {
    // After finding the first target, only positive tabindex can precede it.
    // Ordinary trailing controls need no visibility or layout reads.
    if (first != null && candidate.tabIndex <= 0) {
      continue;
    }
    if (!isSequential(candidate)) {
      continue;
    }
    // Positive tabindex participates before the zero-index viewport. Do not
    // revisit it or skip its ordering by delegating to a later zero-index child.
    if (candidate.tabIndex > 0) {
      return null;
    }
    first ??= candidate;
  }
  if (
    first == null ||
    first.tabIndex !== 0 ||
    !first.matches('a[href], button') ||
    first.closest('[aria-hidden="true"]') != null ||
    first.matches(
      '[aria-disabled="true"], [aria-haspopup]:not([aria-haspopup="false"])',
    )
  ) {
    return null;
  }

  let ancestor: HTMLElement | null = first;
  while (ancestor != null && ancestor !== viewport) {
    const role: string | undefined = ancestor
      .getAttribute('role')
      ?.trim()
      .toLowerCase();
    const nativeRole: boolean =
      ancestor === first &&
      ((role === 'button' && first.localName === 'button') ||
        (role === 'link' && first.localName === 'a'));
    if (
      (role != null &&
        role !== '' &&
        !nativeRole &&
        !PASSIVE_ROLES.has(role)) ||
      (ancestor === first && role != null && role !== '' && !nativeRole) ||
      ancestor.hasAttribute('aria-activedescendant') ||
      ancestor.isContentEditable ||
      ancestor.matches('[contenteditable]:not([contenteditable="false"])') ||
      getRegisteredScrollOwnerState(ancestor) != null
    ) {
      return null;
    }
    // Also respect native scroll owners that have not adopted the shared hook.
    const style = getComputedStyle(ancestor);
    if (
      (/^(auto|scroll|overlay)$/.test(style.overflowX) &&
        ancestor.scrollWidth > ancestor.clientWidth + 1) ||
      (/^(auto|scroll|overlay)$/.test(style.overflowY) &&
        ancestor.scrollHeight > ancestor.clientHeight + 1)
    ) {
      return null;
    }
    ancestor = ancestor.parentElement;
  }
  return ancestor === viewport ? first : null;
}

/** Attach only while automatic ownership has an effective scroll axis. */
export function attachScrollKeyboardDelegation(
  viewport: HTMLElement,
  content: HTMLElement,
): () => void {
  const document = viewport.ownerDocument;
  const window = document.defaultView;
  if (window == null) {
    return () => {};
  }
  let entry: KeyboardEvent | null = null;
  let origin: EventTarget | null = null;
  let delegated: HTMLElement | null = null;
  let timer: number | undefined;
  let restoreTabStop: (() => void) | undefined;

  const reset = () => {
    entry = null;
    origin = null;
    window.clearTimeout(timer);
    restoreTabStop?.();
    restoreTabStop = undefined;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    reset();
    if (event.key !== 'Tab' || event.ctrlKey || event.metaKey) {
      return;
    }
    // Keep the actual event: focus() during keydown is programmatic (nonzero
    // eventPhase), whereas native Tab focus follows completed event dispatch.
    entry = event;
    origin = event.target;
    if (
      event.shiftKey &&
      delegated != null &&
      document.activeElement === delegated &&
      viewport.contains(delegated)
    ) {
      const tabIndex = viewport.getAttribute('tabindex');
      viewport.tabIndex = -1;
      restoreTabStop = () => {
        if (viewport.getAttribute('tabindex') === '-1') {
          if (tabIndex == null) {
            viewport.removeAttribute('tabindex');
          } else {
            viewport.setAttribute('tabindex', tabIndex);
          }
        }
      };
    }
    // A canceled Tab, focus leaving the document, or a held key must not leave
    // stale keyboard intent for a later pointer/programmatic focus operation.
    timer = window.setTimeout(reset, 0);
  };

  const onFocusIn = (event: FocusEvent) => {
    const keyboardEntry = entry;
    const previous = origin;
    reset();
    if (event.target !== viewport) {
      if (!viewport.contains(event.target as Node | null)) {
        delegated = null;
      }
      return;
    }
    delegated = null;
    if (
      keyboardEntry == null ||
      keyboardEntry.shiftKey ||
      keyboardEntry.defaultPrevented ||
      keyboardEntry.eventPhase !== 0 ||
      (event.relatedTarget != null && event.relatedTarget !== previous)
    ) {
      return;
    }
    const target = firstDelegationTarget(viewport, content);
    if (target == null) {
      return;
    }
    delegated = target;
    // Let native focus reveal the action. Arrow/Page scrolling remains entirely
    // browser-owned, including scroll chaining and the full viewport range.
    target.focus();
    if (document.activeElement !== target) {
      delegated = null;
    }
  };

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', reset, true);
  document.addEventListener('pointerdown', reset, true);
  document.addEventListener('focusin', onFocusIn, true);
  window.addEventListener('blur', reset);
  return () => {
    reset();
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', reset, true);
    document.removeEventListener('pointerdown', reset, true);
    document.removeEventListener('focusin', onFocusIn, true);
    window.removeEventListener('blur', reset);
  };
}
