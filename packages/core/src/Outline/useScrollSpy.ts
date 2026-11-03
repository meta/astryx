// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useScrollSpy.ts
 * @input Uses React, scroll position of heading elements, OutlineItem type
 * @output Exports internal useScrollSpy hook
 * @position Internal behavior hook; consumed by Outline.tsx
 *
 * Drives the active outline item from scroll position. On each scroll
 * (rAF-throttled) it reads live heading positions and marks the last heading
 * whose top has passed its activation line. This is stable — it never compares
 * stale cached positions — so the indicator moves monotonically instead of
 * jumping. Defaults to the first item at the top and the last item at the
 * bottom so short final sections still activate.
 *
 * The activation line and the scroll landing are the same number, computed once
 * in `getRestingTop`: scroll-root top + `offset` (a fixed header overlaying the
 * root) + the heading's own `scroll-margin-top`. A heading therefore activates
 * exactly where navigating to it puts it. `offset` and `scroll-margin-top`
 * compose — the header, then the breathing room below it — they do not
 * duplicate each other.
 *
 * It also owns the single navigation path (`scrollTo`), shared by click and
 * keyboard activation: it announces the jump, suppresses scroll-spy for the
 * duration of the programmatic scroll (so the indicator doesn't chase it), and
 * resolves when the scroll settles — via `scrollend` where supported, or a
 * timeout fallback where it is not.
 *
 * The scroll root is the `scrollContainerRef` element when provided, otherwise
 * the nearest scrollable ancestor of the outline, otherwise the viewport.
 *
 * SYNC: When modified, update /packages/core/src/Outline/Outline.tsx
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import type {OutlineItem} from './types';

/**
 * How long to wait for a programmatic smooth scroll to settle when the
 * `scrollend` event never arrives — either because the browser does not
 * support it (Safari at time of writing) or because the target was already in
 * position, so no scroll happened at all and no events were emitted.
 */
const SCROLL_SETTLE_TIMEOUT_MS = 1200;

/** Keys that scroll the viewport — used to detect a manual scroll intent. */
const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
  'Spacebar',
]);

function getScrollableAncestor(
  element: HTMLElement | null,
): HTMLElement | null {
  let current = element?.parentElement ?? null;

  while (current != null) {
    const computedStyle = window.getComputedStyle(current);
    const overflowY = computedStyle.overflowY;
    const isScrollable =
      (overflowY === 'auto' ||
        overflowY === 'scroll' ||
        overflowY === 'overlay') &&
      current.scrollHeight > current.clientHeight;

    if (isScrollable) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

/** The element's own `scroll-margin-top` in px (0 when unset). */
function getScrollMarginTop(element: HTMLElement): number {
  return (
    Number.parseFloat(window.getComputedStyle(element).scrollMarginTop) || 0
  );
}

/** The top of the scroll root in viewport coordinates (0 for the viewport). */
function getRootTop(scrollRoot: HTMLElement | null): number {
  return scrollRoot != null ? scrollRoot.getBoundingClientRect().top : 0;
}

/**
 * Where a heading comes to rest, in viewport coordinates: below the fixed
 * header (`offset`) and below its own `scroll-margin-top` breathing room.
 *
 * This is the single source of truth shared by the activation line and the
 * scroll landing — the two must agree, or a heading activates somewhere other
 * than where navigating to it puts it.
 */
function getRestingTop(
  target: HTMLElement,
  scrollRoot: HTMLElement | null,
  offset: number,
): number {
  return getRootTop(scrollRoot) + offset + getScrollMarginTop(target);
}

/**
 * Bring `target` to rest at the top of the scroll root, below any fixed header.
 *
 * With no `offset`, this is the CSS-native path: `scrollIntoView` already
 * honors the heading's `scroll-margin-top`, and it walks *every* scrollable
 * ancestor, so the browser does it better than we can.
 *
 * An `offset` describes a fixed header overlaying the top of the scroll root —
 * which the browser cannot know about, so `scrollIntoView` would park the
 * heading underneath it, hidden. Compute the landing explicitly instead, from
 * the same {@link getRestingTop} the activation line uses.
 */
function scrollToTarget(
  target: HTMLElement,
  scrollRoot: HTMLElement | null,
  scrollTarget: HTMLElement | Window,
  offset: number,
): void {
  if (offset === 0) {
    target.scrollIntoView({behavior: 'smooth', block: 'start'});
    return;
  }

  const delta =
    target.getBoundingClientRect().top -
    getRestingTop(target, scrollRoot, offset);
  scrollTarget.scrollBy({top: delta, behavior: 'smooth'});
}

/**
 * Resolve the active heading id from current scroll position.
 *
 * A heading is "passed" once its top reaches its activation line — exactly
 * where navigating to it would land it ({@link getRestingTop}): the scroll
 * root's top, plus `offset` (a fixed header overlaying the scroll root), plus
 * the heading's own scroll-margin-top. The active heading is the last passed
 * one (headings are in document order). When none have passed (scrolled above
 * the first), the first item is active; at the bottom, the last item is active.
 */
function resolveActiveId(
  items: OutlineItem[],
  scrollRoot: HTMLElement | null,
  offset: number,
): string | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const atBottom =
    scrollRoot != null
      ? scrollRoot.scrollTop + scrollRoot.clientHeight >=
        scrollRoot.scrollHeight - 2
      : window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
  if (atBottom) {
    return items[items.length - 1].id;
  }

  let activeId = items[0].id;
  for (const item of items) {
    const element = document.getElementById(item.id);
    if (element == null) {
      continue;
    }

    // 1px of tolerance absorbs sub-pixel rounding after a scroll lands.
    const top = element.getBoundingClientRect().top;
    if (top <= getRestingTop(element, scrollRoot, offset) + 1) {
      activeId = item.id;
    } else {
      break;
    }
  }
  return activeId;
}

interface UseScrollSpyOptions {
  activeId?: string;
  items: OutlineItem[];
  onActiveIdChange?: (id: string) => void;
  rootRef: React.RefObject<HTMLElement | null>;
  /**
   * Height in px of a fixed header overlaying the top of the scroll root.
   * Shifts both the activation line and the scroll landing by the same amount,
   * on top of each heading's own `scroll-margin-top`.
   */
  offset?: number;
  /** Scroll container to track, instead of the nearest scrollable ancestor. */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  /** Whether {@link UseScrollSpyResult.scrollTo} performs the smooth scroll. */
  hasScrollOnClick?: boolean;
  /** Called when a navigation begins, before the scroll starts. */
  onNavigateStart?: (id: string) => void;
  /** Called once per navigation, when the scroll settles or is interrupted. */
  onNavigateEnd?: (id: string) => void;
}

interface UseScrollSpyResult {
  activeId: string | undefined;
  /** Set the active id (notifies onActiveIdChange). For controlled consumers. */
  setActiveId: (id: string) => void;
  /**
   * Navigate to the item with id `id` — the single path shared by click and
   * keyboard activation.
   *
   * Fires `onNavigateStart(id)`, scrolls (unless `hasScrollOnClick` is false),
   * and fires `onNavigateEnd(id)` exactly once when the scroll settles or the
   * user interrupts it. While uncontrolled, scroll-spy is suppressed for the
   * duration so the indicator doesn't chase the scroll through intervening
   * sections; it lands on the target once the scroll settles, or resumes
   * position tracking if the user scrolls away mid-flight.
   *
   * Returns false (and does nothing) when no element with `id` exists.
   */
  scrollTo: (id: string) => boolean;
}

export function useScrollSpy({
  activeId,
  items,
  onActiveIdChange,
  rootRef,
  offset = 0,
  scrollContainerRef,
  hasScrollOnClick = true,
  onNavigateStart,
  onNavigateEnd,
}: UseScrollSpyOptions): UseScrollSpyResult {
  const isControlled = activeId !== undefined;
  const [uncontrolledActiveId, setUncontrolledActiveId] = useState<
    string | undefined
  >(items[0]?.id);
  const activeIdRef = useRef<string | undefined>(activeId);
  // While true, scroll-spy ignores scroll updates because a navigation is
  // driving a programmatic scroll. Released when it settles or the user scrolls.
  const suppressRef = useRef(false);
  // The navigation currently in flight, if any.
  const navigationRef = useRef<{
    /** End it (without resuming tracking) because a new one is starting. */
    supersede: () => void;
    /** Drop its listeners without firing onNavigateEnd (unmount). */
    teardown: () => void;
  } | null>(null);
  // Latest scroll-position resolver, so a navigation can resume tracking when
  // the user scrolls during the programmatic scroll.
  const syncRef = useRef<(() => void) | null>(null);
  // Keep latest items/callback in refs so the scroll listener effect doesn't
  // re-subscribe on every render (items is a fresh array each render).
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onActiveIdChangeRef = useRef(onActiveIdChange);
  onActiveIdChangeRef.current = onActiveIdChange;
  const itemIds = items.map(item => item.id).join('\n');
  activeIdRef.current = isControlled ? activeId : uncontrolledActiveId;

  /**
   * The element whose scroll position drives the outline: the explicit
   * container when scoped, else the nearest scrollable ancestor, else null
   * (meaning the viewport).
   */
  const getScrollRoot = useCallback((): HTMLElement | null => {
    return (
      scrollContainerRef?.current ?? getScrollableAncestor(rootRef.current)
    );
  }, [rootRef, scrollContainerRef]);

  useEffect(() => {
    if (isControlled || typeof window === 'undefined') {
      return;
    }

    const scrollRoot = getScrollRoot();
    const scrollTarget: HTMLElement | Window = scrollRoot ?? window;

    let frame = 0;
    const update = () => {
      frame = 0;
      if (suppressRef.current) {
        return;
      }
      const nextActiveId = resolveActiveId(
        itemsRef.current,
        scrollRoot,
        offset,
      );
      if (nextActiveId != null && nextActiveId !== activeIdRef.current) {
        activeIdRef.current = nextActiveId;
        setUncontrolledActiveId(nextActiveId);
        onActiveIdChangeRef.current?.(nextActiveId);
      }
    };
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(update);
      }
    };

    syncRef.current = update;
    update();
    scrollTarget.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('resize', onScroll, {passive: true});

    return () => {
      syncRef.current = null;
      scrollTarget.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, [isControlled, itemIds, offset, getScrollRoot]);

  // Tear down any in-flight navigation's listeners when the Outline unmounts.
  useEffect(() => {
    return () => {
      navigationRef.current?.teardown();
    };
  }, []);

  const setActiveId = (nextActiveId: string) => {
    if (!isControlled) {
      setUncontrolledActiveId(nextActiveId);
    }
    onActiveIdChange?.(nextActiveId);
  };

  // Defined in render (not memoized) so it always closes over the current props
  // — it only ever runs from an event handler, never during render.
  const scrollTo = (id: string): boolean => {
    const target =
      typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (target == null) {
      return false;
    }

    // A second navigation replaces the first: end the old one (balancing its
    // onNavigateStart) without resuming tracking, since we are about to
    // suppress it again anyway.
    navigationRef.current?.supersede();

    onNavigateStart?.(id);

    if (isControlled) {
      // The consumer owns the active state — notify only.
      setActiveId(id);
    } else {
      // Freeze the indicator during the programmatic scroll instead of moving
      // it immediately: it lands on the target once the scroll settles, so it
      // doesn't chase the scroll through intervening sections.
      suppressRef.current = true;
    }

    const scrollRoot = getScrollRoot();
    const scrollTarget: HTMLElement | Window = scrollRoot ?? window;

    let settleTimer = 0;
    let isSettled = false;

    const cleanup = () => {
      scrollTarget.removeEventListener('scrollend', onSettle);
      scrollTarget.removeEventListener('wheel', onManual);
      scrollTarget.removeEventListener('touchmove', onManual);
      window.removeEventListener('keydown', onKeyDown);
      if (settleTimer !== 0) {
        clearTimeout(settleTimer);
        settleTimer = 0;
      }
      navigationRef.current = null;
    };

    /**
     * End the navigation exactly once. `didArrive` is false when the user took
     * over with a manual scroll mid-flight. `onNavigateEnd` fires either way,
     * so every `onNavigateStart` is balanced and a consumer's "navigating"
     * state can never leak.
     */
    const finish = (didArrive: boolean, shouldResume = true) => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      cleanup();

      if (!isControlled) {
        suppressRef.current = false;
        if (didArrive) {
          setUncontrolledActiveId(id);
          activeIdRef.current = id;
          onActiveIdChangeRef.current?.(id);
        } else if (shouldResume) {
          // Hand control back to scroll-position tracking.
          syncRef.current?.();
        }
      }

      onNavigateEnd?.(id);
    };

    const onSettle = () => finish(true);
    const onManual = () => finish(false);
    const onKeyDown = (event: KeyboardEvent) => {
      // The outline prevents the Space key that activates a link. The
      // browser then does not scroll. So this key is not a manual scroll, and
      // it does not end the navigation.
      if (!event.defaultPrevented && SCROLL_KEYS.has(event.key)) {
        finish(false);
      }
    };

    if (hasScrollOnClick) {
      // Arm settle detection *before* scrolling so an instant jump (a target
      // already in position, or prefers-reduced-motion collapsing the smooth
      // scroll) cannot land before anyone is listening.
      scrollTarget.addEventListener('scrollend', onSettle, {once: true});
      scrollTarget.addEventListener('wheel', onManual, {passive: true});
      scrollTarget.addEventListener('touchmove', onManual, {passive: true});
      window.addEventListener('keydown', onKeyDown);
      settleTimer = window.setTimeout(onSettle, SCROLL_SETTLE_TIMEOUT_MS);
      navigationRef.current = {
        supersede: () => finish(false, false),
        teardown: cleanup,
      };
      scrollToTarget(target, scrollRoot, scrollTarget, offset);
    } else {
      // The consumer owns scrolling — there is no scroll to wait for, so the
      // navigation is already at rest. Resolving immediately (instead of
      // waiting on the settle timeout) keeps onNavigateEnd usable for arrival
      // effects even when hasScrollOnClick is false.
      finish(true);
    }

    return true;
  };

  return {
    activeId: isControlled ? activeId : uncontrolledActiveId,
    setActiveId,
    scrollTo,
  };
}
