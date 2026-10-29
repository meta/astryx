// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCarouselPaging.ts
 * @input The carousel's scroller (the pager's viewport) and track elements,
 *   whether the touch presentation is active, the slide count and whether it
 *   loops; the shared pager
 * @output Exports `useCarouselPaging`: a snapping Carousel's touch
 *   presentation (the page on screen, the buttons' and the handle's moves,
 *   the keyboard, focus following)
 * @position Internal to Carousel (`hasSnap`, under a finger, with the
 *   buttons)
 *
 * Under a finger a snapping carousel is a UIKit paging scroll view whose
 * pages are its children: the shared pager (hooks/usePager.ts, `pages:
 * 'children'`) moves the track one child per swipe, each child resting at
 * its start edge where the native snap would place it (the last ones where
 * the content ends). The pager attaches only while the touch presentation is
 * active; otherwise the carousel scrolls natively and snaps.
 *
 * The buttons and the handle keep the step they take natively, about a
 * viewport, landing on a child; with `hasLoop` a step past either end goes to
 * the other one, as it does natively. An arrow key moves one child. The
 * children within a viewport of the content on screen get their own layers,
 * so they are painted before they move in (in Mobile Safari a busy main
 * thread cannot paint them while the track moves).
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Carousel/Carousel.tsx
 * - /packages/core/src/Carousel/CarouselPaging.test.tsx
 */

import {useState, useSyncExternalStore, type RefObject} from 'react';
import {createPager, type Pager} from '../hooks/usePager';
import {isRtlElement} from '../hooks/isRtlElement';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';

export interface CarouselPagingOptions {
  /** The pager runs (a snapping carousel with its buttons, under a finger). */
  isEnabled: boolean;
  scrollElRef: RefObject<HTMLElement | null>;
  trackRef: RefObject<HTMLElement | null>;
  /** How many slides render. */
  count: number;
  /** `hasLoop`: a step past either end goes to the other one. */
  loop: boolean;
  /** The layout props the pages depend on (`gap`, `padding`): a change re-measures them. */
  layout?: unknown;
}

export interface CarouselPaging {
  /** The page on screen or heading there, in [0, pageCount). */
  page: number;
  /** How many pages the children make (the last ones can share one). */
  pageCount: number;
  /** The buttons' and the handle's step toward the end (+1) or the start (−1). */
  goBy(direction: -1 | 1): void;
  /** Bring slide `index` to the start edge, as far as the content allows. */
  goTo(index: number): void;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Arrow keys, Home and End on the scroller. */
  onKeyDown(event: React.KeyboardEvent<HTMLElement>): void;
  /** Focus entering a slide that is not wholly on screen brings it there. */
  onFocus(event: React.FocusEvent<HTMLElement>): void;
}

/** The slide element of `track` that contains `node`. */
function slideIndexOf(track: HTMLElement, node: Node | null): number {
  let child: Node | null = node;
  while (child != null && child.parentNode !== track) {
    child = child.parentNode;
  }
  return child == null
    ? -1
    : Array.prototype.indexOf.call(track.children, child);
}

export function useCarouselPaging({
  isEnabled,
  scrollElRef,
  trackRef,
  count,
  loop,
  layout,
}: CarouselPagingOptions): CarouselPaging {
  // The page and the page count are the pager's: rendered through an
  // external store that its reports (and the take-over below) notify.
  const [pageStore] = useState(() => {
    const listeners = new Set<() => void>();
    return {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      notify: () => {
        for (const listener of listeners) {
          listener();
        }
      },
    };
  });

  const [pager] = useState<Pager>(() =>
    createPager({
      count: Math.max(1, count),
      pages: 'children',
      onIndexChange: () => pageStore.notify(),
      onPagesChange: () => pageStore.notify(),
      onSettle: () => promote(),
      shouldBeginPan: () => {
        promote();
        return true;
      },
    }),
  );

  /**
   * Gives the children within a viewport of the content on screen their own
   * layers, and takes them from the rest. Rects are read in the track's own
   * CSS pixels, as the pager reads them (an ancestor's `zoom` divided out).
   */
  function promote(): void {
    const viewport = scrollElRef.current;
    const track = trackRef.current;
    if (viewport == null || track == null) {
      return;
    }
    const box = track.getBoundingClientRect();
    const used = Number.parseFloat(getComputedStyle(track).width);
    const scale = used > 0 && box.width > 0 ? box.width / used : 1;
    const rtl = isRtlElement(viewport);
    const width = viewport.clientWidth;
    const at = pager.presentation();
    for (const child of Array.from(track.children)) {
      const rect = child.getBoundingClientRect();
      const start =
        (rtl ? box.right - rect.right : rect.left - box.left) / scale;
      const end = start + rect.width / scale;
      const isNear = end > at - width && start < at + 2 * width;
      (child as HTMLElement).style.setProperty(
        'will-change',
        isNear ? 'transform' : '',
      );
    }
  }

  // Synchronizes the pager with the slides and the layout they sit in: it
  // measures the children again. A clamp it makes is not reported; the page
  // shown is derived from the pager during render (`page` below).
  useIsomorphicLayoutEffect(() => {
    pager.setOptions({count: Math.max(1, count)});
    if (isEnabled) {
      promote();
    }
  }, [pager, count, isEnabled, layout]);

  useIsomorphicLayoutEffect(() => {
    const viewport = scrollElRef.current;
    const track = trackRef.current;
    if (!isEnabled || viewport == null || track == null) {
      return undefined;
    }
    // Take over from native scrolling on the child it showed.
    const nativeOffset = Math.abs(viewport.scrollLeft);
    viewport.scrollTo({left: 0, behavior: 'instant'});
    const detach = pager.attach(viewport, track);
    pager.goTo(pager.nearestPage(nativeOffset), {
      animated: false,
      reason: 'controlled',
    });
    promote();
    // The page shown is the pager's: render it.
    pageStore.notify();
    return () => {
      const offset = pager.pageOffset(pager.index);
      detach();
      track.style.removeProperty('translate');
      for (const child of Array.from(track.children)) {
        (child as HTMLElement).style.removeProperty('will-change');
      }
      // Hand the child back to native scrolling.
      viewport.scrollTo({
        left: (isRtlElement(viewport) ? -1 : 1) * offset,
        behavior: 'instant',
      });
    };
  }, [pager, isEnabled, scrollElRef, trackRef]);

  function goTo(index: number): void {
    pager.goTo(index);
  }

  function goBy(direction: -1 | 1): void {
    const last = pager.pageCount - 1;
    const from = pager.index;
    if (loop && last > 0) {
      if (direction === 1 && from >= last) {
        pager.goTo(0);
        return;
      }
      if (direction === -1 && from <= 0) {
        pager.goTo(last);
        return;
      }
    }
    // The native step: a viewport less half a child, at least a child.
    const viewport = scrollElRef.current;
    const first = trackRef.current?.firstElementChild as HTMLElement | null;
    const itemWidth = first?.offsetWidth ?? 0;
    const step = Math.max(
      (viewport?.clientWidth ?? 0) - itemWidth * 0.5,
      itemWidth,
    );
    const near = pager.nearestPage(pager.pageOffset(from) + direction * step);
    pager.goTo(
      direction === 1 ? Math.max(near, from + 1) : Math.min(near, from - 1),
    );
  }

  const page = useSyncExternalStore(
    pageStore.subscribe,
    () => pager.index,
    () => pager.index,
  );
  const pageCount = useSyncExternalStore(
    pageStore.subscribe,
    () => pager.pageCount,
    () => pager.pageCount,
  );
  const canLoop = loop && pageCount > 1;
  const canGoBack = canLoop || page > 0;
  const canGoForward = canLoop || page < pageCount - 1;

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    const rtl = isRtlElement(event.currentTarget);
    switch (event.key) {
      case 'ArrowRight':
        pager.goTo(pager.index + (rtl ? -1 : 1));
        break;
      case 'ArrowLeft':
        pager.goTo(pager.index + (rtl ? 1 : -1));
        break;
      case 'Home':
        pager.goTo(0);
        break;
      case 'End':
        pager.goTo(pager.pageCount - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function onFocus(event: React.FocusEvent<HTMLElement>): void {
    const viewport = scrollElRef.current;
    const track = trackRef.current;
    if (viewport == null || track == null || !track.contains(event.target)) {
      return;
    }
    const index = slideIndexOf(track, event.target);
    if (index < 0) {
      return;
    }
    const slide = track.children[index].getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    if (slide.left >= view.left - 0.5 && slide.right <= view.right + 0.5) {
      return;
    }
    pager.goTo(index);
  }

  return {
    page,
    pageCount,
    goBy,
    goTo,
    canGoBack,
    canGoForward,
    onKeyDown,
    onFocus,
  };
}
