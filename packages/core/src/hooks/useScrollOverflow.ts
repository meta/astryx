// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useScrollOverflow.ts
 * @input Uses React useRef, useState, useCallback, useEffect
 * @output Exports useScrollOverflow hook for tracking scroll position edges
 * @position Core hook; used by Carousel and TabList for fade-edge and button
 *   state
 *
 * Observes a scroll container and reports whether content overflows at the
 * start, end, or both edges. Updates on every scroll, and while the container
 * is rendered on what else changes the overflow with or without the
 * container resizing: its own size, a child's size (a slide's content
 * growing), a child added or removed, and its class or style (a new gap or
 * padding). A layout read on an element the browser is not
 * rendering (an ancestor with `display: none`, or a `content-visibility:
 * hidden` subtree) either answers zeros or makes the browser lay out that
 * whole hidden subtree for the answer, so an observation delivered for a
 * hidden container, and the measurement at registration inside one, are
 * skipped; the hook keeps its last state until the resize observation that
 * follows the reveal (one frame after it paints). A scroll is measured
 * whether or not the container is rendered: a scroll of a hidden container
 * is script's (a selected tab revealed under a hidden panel), its layout is
 * already the scroll's, and a reveal at the same size brings no resize to
 * measure it with.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 */

import {useState, useCallback, useEffect, useRef} from 'react';
import {observeResize} from '../utils/sharedResizeObserver';

export interface ScrollOverflowState {
  /** Content overflows the start (left in LTR, right in RTL) */
  overflowStart: boolean;
  /** Content overflows the end (right in LTR, left in RTL) */
  overflowEnd: boolean;
  /** Whether the container has any overflow at all */
  hasOverflow: boolean;
}

/**
 * Whether the browser is rendering `el`, so a layout read on it answers for a
 * real box. `checkVisibility()` is false under a `display: none` ancestor and
 * inside a `content-visibility: hidden` subtree, and it answers without
 * rendering that subtree. Not `contentVisibilityAuto`: a freshly inserted,
 * on-screen `content-visibility: auto` section counts as skipped until the
 * next rendering update, and a strip mounted into one would paint its first
 * frame unmeasured. A browser without `checkVisibility` measures as before.
 */
function isRendered(el: HTMLElement): boolean {
  return typeof el.checkVisibility !== 'function' || el.checkVisibility();
}

/**
 * Observes what changes `el`'s overflow besides its scroll: its own size,
 * each child's size, the children added or removed, and its class or style.
 * Returns the teardown, which ends every observation.
 */
function observeContent(el: HTMLElement, measure: () => void): () => void {
  const unobserveContainer = observeResize(el, measure);
  const unobserveChildren = new Map<Element, () => void>();
  const followChildren = () => {
    const children = new Set(el.children);
    for (const [child, unobserve] of unobserveChildren) {
      if (!children.has(child)) {
        unobserve();
        unobserveChildren.delete(child);
      }
    }
    for (const child of children) {
      if (!unobserveChildren.has(child)) {
        unobserveChildren.set(child, observeResize(child, measure));
      }
    }
  };
  followChildren();
  const mutations =
    typeof MutationObserver === 'function'
      ? new MutationObserver(() => {
          followChildren();
          measure();
        })
      : null;
  mutations?.observe(el, {
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
  return () => {
    mutations?.disconnect();
    for (const unobserve of unobserveChildren.values()) {
      unobserve();
    }
    unobserveChildren.clear();
    unobserveContainer();
  };
}

/**
 * Tracks scroll overflow state for a horizontally scrollable container.
 *
 * Returns a ref callback to attach to the scroll container and a state
 * object that updates as the user scrolls, the container resizes, or its
 * content changes.
 *
 * @example
 * ```
 * const { scrollRef, overflowStart, overflowEnd } = useScrollOverflow();
 * <div ref={scrollRef} style={{ overflowX: 'auto' }}>...</div>
 * ```
 */
export function useScrollOverflow() {
  const elRef = useRef<HTMLElement | null>(null);
  const unobserveRef = useRef<(() => void) | null>(null);

  const [state, setState] = useState<ScrollOverflowState>({
    overflowStart: false,
    overflowEnd: false,
    hasOverflow: false,
  });

  const measureNow = useCallback((el: HTMLElement) => {
    const tolerance = 1;
    const {scrollLeft, scrollWidth, clientWidth} = el;
    const maxScroll = scrollWidth - clientWidth;

    const overflowStart = Math.abs(scrollLeft) > tolerance;
    const overflowEnd = Math.abs(scrollLeft) < maxScroll - tolerance;
    const hasOverflow = scrollWidth > clientWidth + tolerance;

    setState(prev => {
      if (
        prev.overflowStart === overflowStart &&
        prev.overflowEnd === overflowEnd &&
        prev.hasOverflow === hasOverflow
      ) {
        return prev;
      }
      return {overflowStart, overflowEnd, hasOverflow};
    });
  }, []);

  // Registration, resize and content changes: only a rendered container. A
  // hidden one has no edges to report, and reading its layout would make the
  // browser render the hidden subtree it sits in; the resize observation that
  // follows the reveal measures again.
  const measure = useCallback(() => {
    const el = elRef.current;
    if (el && isRendered(el)) {
      measureNow(el);
    }
  }, [measureNow]);

  // A scroll: measured hidden or not. Script scrolled the hidden container
  // (its layout is already the scroll's), and a reveal at the same size
  // brings no resize observation, so this is the read that keeps the edges
  // right for it.
  const measureOnScroll = useCallback(() => {
    const el = elRef.current;
    if (el) {
      measureNow(el);
    }
  }, [measureNow]);

  const scrollRef = useCallback(
    (el: HTMLElement | null) => {
      if (elRef.current) {
        unobserveRef.current?.();
        unobserveRef.current = null;
        elRef.current.removeEventListener('scroll', measureOnScroll);
      }

      elRef.current = el;

      if (el) {
        el.addEventListener('scroll', measureOnScroll, {passive: true});
        unobserveRef.current = observeContent(el, measure);
      }
    },
    [measure, measureOnScroll],
  );

  useEffect(() => {
    return () => {
      if (elRef.current) {
        unobserveRef.current?.();
        unobserveRef.current = null;
        elRef.current.removeEventListener('scroll', measureOnScroll);
      }
    };
  }, [measureOnScroll]);

  return {
    scrollRef,
    ...state,
  };
}
