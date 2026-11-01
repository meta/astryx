// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useClickableContainer.ts
 * @input Container ref, interactive element ref, click/href handlers
 * @output onClick and onMouseUp handlers for the container; INTERACTIVE_SELECTORS list;
 *   hasInteractiveAncestor and the shared innermostInteractive walk
 * @position Core hook for clickable containers that safely handle nested interactive elements
 *
 * Solves the "nested interactive elements" problem: when a card is clickable
 * but contains buttons/links, clicking those should NOT trigger the card's action.
 *
 * Every navigation exit here (window.open, location.href, and the delegated
 * click on the interactive ref) runs after the shared navigation-destination
 * rule in utils/safeUrl.ts; a blocked href does not navigate by any
 * activation method.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts (export)
 */

import {useCallback, useEffect, type RefObject, type MouseEvent} from 'react';
import {isLayerSurface} from '../Layer/layerSurfacePress';
import {isSafeUrl} from '../utils/safeUrl';
import {isPressPinClick} from '../Layer/usePressPin';

/**
 * The attribute this hook sets on the container it makes clickable. A click
 * inside a nested marked container belongs to that container (see
 * INTERACTIVE_SELECTORS).
 */
export const PRESSABLE_CONTAINER_ATTRIBUTE = 'data-pressable-container';

/**
 * Canonical list of interactive element selectors — native controls plus
 * role-based interactive elements. Clicks on these (or their descendants)
 * should NOT bubble to a clickable container's click handler.
 *
 * Exported so other focus/interaction utilities can share one comprehensive
 * definition of "interactive target" rather than hand-rolling divergent lists.
 * Note: this list is about "don't bubble clicks", not focus-eligibility —
 * consumers that need focusable elements must additionally exclude
 * unfocusable/disabled targets (e.g. `[tabindex="-1"]`, `:disabled`).
 */
export const INTERACTIVE_SELECTORS = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  `[${PRESSABLE_CONTAINER_ATTRIBUTE}]`,
].join(',');

const NON_INTERACTIVE_SELECTORS = '[aria-readonly="true"]';

/**
 * Whether this element is interactive by INTERACTIVE_SELECTORS: a control,
 * link, editor, or nested clickable container, and not marked read-only.
 */
export function matchesInteractiveSelectors(element: Element): boolean {
  return (
    element.matches(INTERACTIVE_SELECTORS) &&
    !element.matches(NON_INTERACTIVE_SELECTORS)
  );
}

/**
 * The innermost element, from `el` up to (not including) `rootEl` or the
 * document body, that `isInteractive` accepts: by default the
 * INTERACTIVE_SELECTORS match. The one walk every "does this event belong
 * to a control" check shares; a hover layer's tap passes its own test
 * (useTouchTrigger's `tapLandsOnDisabledControl`).
 */
export function innermostInteractive(
  el: Element,
  rootEl: Element | null,
  isInteractive: (element: Element) => boolean = matchesInteractiveSelectors,
): Element | null {
  let current: Element | null = el;
  while (current != null && current !== rootEl && current !== document.body) {
    if (isInteractive(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Check whether an element has an interactive ancestor between it and the
 * root (the element itself included). If the click target is inside a nested
 * button/link/etc., we should NOT handle it at the container level.
 *
 * Exported for containers that cannot use the hook itself — a `<tr>` whose
 * props are assembled inside a Table plugin's `transformBodyRow`, for
 * instance, has no ref to hand the hook but needs the identical rule. Sharing
 * the walk keeps one definition of "this click belongs to something else"
 * instead of a short hand-rolled selector list per caller.
 *
 * A press inside an open Tooltip or HoverCard surface also answers true: it
 * belongs to that surface, not the container around its trigger.
 */
export function hasInteractiveAncestor(el: Element, rootEl: Element): boolean {
  return innermostInteractive(el, rootEl, belongsToSomethingElse) != null;
}

// A press inside an open Tooltip or HoverCard surface belongs to that surface
// (component:Tooltip FR11, component:HoverCard FR11).
function belongsToSomethingElse(element: Element): boolean {
  return matchesInteractiveSelectors(element) || isLayerSurface(element);
}

/**
 * Check if there's a text selection inside the node (don't navigate on text select)
 *
 * Exported alongside {@link hasInteractiveAncestor} for the same reason: a
 * click that ends a text drag is not a click on the container, and every
 * clickable surface needs that rule, hook or no hook. Scoped to the node, so a
 * selection somewhere else on the page does not make the surface inert.
 */
export function hasTextSelection(node: Element): boolean {
  if (typeof document === 'undefined' || !('getSelection' in document)) {
    return false;
  }
  const selection = document.getSelection();
  if (selection == null || selection.isCollapsed) {
    return false;
  }
  return node.contains(selection.anchorNode);
}

export interface UseClickableContainerOptions {
  /** Ref to the outer container element */
  containerRef: RefObject<HTMLElement | null>;
  /** Ref to the primary interactive element inside (link, button) */
  interactiveRef?: RefObject<HTMLElement | null>;
  /** Click handler */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /**
   * Navigation URL — when provided, clicking the container navigates. Checked
   * with the shared navigation rule (utils/safeUrl.ts) before any activation
   * method (plain, new-tab, Cmd/Ctrl-click, middle-click, delegated click).
   */
  href?: string;
  /** Link target */
  target?: string;
  /** Whether the container is disabled */
  disabled?: boolean;
}

export interface ClickableContainerResult {
  onClick: (event: MouseEvent<HTMLElement>) => void;
  onMouseUp: (event: MouseEvent<HTMLElement>) => void;
}

/**
 * Hook that makes a container element clickable while preserving
 * nested interactive element behavior.
 *
 * When the user clicks the container surface (not on a nested button/link),
 * the hook fires the onClick handler or navigates to href.
 * When the user clicks a nested interactive element, it does nothing —
 * the nested element handles its own event.
 *
 * @compositionHint Use inside ClickableCard or SelectableCard.
 * For custom interactive containers, pair with a ref to the outer div.
 *
 * @example
 * ```
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { onClick, onMouseUp } = useClickableContainer({
 *   containerRef,
 *   onClick: () => console.log('card clicked'),
 * });
 * return (
 *   <div ref={containerRef} onClick={onClick} onMouseUp={onMouseUp}>
 *     <p>Click anywhere on this card</p>
 *     <button onClick={() => alert('button')}>Nested button</button>
 *   </div>
 * );
 * ```
 */
export function useClickableContainer({
  containerRef,
  interactiveRef,
  onClick: onClickProp,
  href,
  target,
  disabled = false,
}: UseClickableContainerOptions): ClickableContainerResult {
  // Mark container as pressable for the interactive selector check
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.setAttribute(PRESSABLE_CONTAINER_ATTRIBUTE, 'true');
    }
  }, [containerRef]);

  const onClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      // A press that pinned or closed a hover layer stops at its trigger: the
      // container does not act on it (component:Tooltip FR9).
      if (disabled || isPressPinClick(event.nativeEvent)) {
        return;
      }

      const containerEl = containerRef.current;
      if (!containerEl) {
        return;
      }

      // Don't trigger on text selection
      if (hasTextSelection(containerEl)) {
        return;
      }

      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) {
        return;
      }

      // If the click landed on or inside a nested interactive element, bail
      if (
        eventTarget !== event.currentTarget &&
        hasInteractiveAncestor(eventTarget, containerEl)
      ) {
        return;
      }

      // Fire the click handler
      onClickProp?.(event);
      if (event.defaultPrevented) {
        return;
      }

      // Navigate if href is provided. React DOM vets the hrefs it writes as
      // attributes; nothing below passes through React, so the shared
      // navigation rule decides once, before target, modifier key, or the
      // delegated anchor can select a sink. A blocked href simply does not
      // navigate — the click handler above still ran.
      if (href != null && isSafeUrl(href)) {
        const shouldOpenNewTab =
          target === '_blank' || event.ctrlKey || event.metaKey;
        if (shouldOpenNewTab) {
          window.open(href, '_blank', 'noopener');
        } else if (interactiveRef?.current) {
          // Proxy click to the sr-only link so the framework link component
          // handles navigation (client-side transitions in Next.js, etc.).
          interactiveRef.current.click();
        } else {
          // eslint-disable-next-line react-compiler/react-compiler -- browser navigation API
          window.location.href = href;
        }
      }

      // Proxy click to the interactive ref if no explicit handler
      if (href == null && onClickProp == null && interactiveRef?.current) {
        const clickEvent = new MouseEvent('click', {
          bubbles: event.bubbles,
          cancelable: event.cancelable,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          button: event.button,
        });
        interactiveRef.current.dispatchEvent(clickEvent);
        event.stopPropagation();
      }
    },
    [containerRef, interactiveRef, onClickProp, href, target, disabled],
  );

  const onMouseUp = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (disabled) {
        return;
      }

      const containerEl = containerRef.current;
      if (!containerEl) {
        return;
      }

      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) {
        return;
      }

      // Middle-click on href opens in new tab (same scheme rule as onClick —
      // this navigation never passes through React either).
      const isMiddleClick = event.button === 1;
      if (
        isMiddleClick &&
        href != null &&
        isSafeUrl(href) &&
        (eventTarget === event.currentTarget ||
          !hasInteractiveAncestor(eventTarget, containerEl))
      ) {
        window.open(href, '_blank', 'noopener');
      }
    },
    [containerRef, href, disabled],
  );

  return {onClick, onMouseUp};
}
