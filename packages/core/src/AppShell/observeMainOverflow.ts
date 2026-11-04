// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file observeMainOverflow.ts
 * @input AppShell's main region under `height="fill"`: its own scroll
 *   container, holding its content as direct children with no wrapper
 * @output observeMainOverflow(main, onChange): reports whether main's content
 *   overflows it on either axis, once at the start and on every change, and
 *   returns the function that stops observing
 * @position Internal to AppShell and never exported. AppShell makes main a
 *   keyboard stop only while it overflows (`spec:AST-025` FR12,
 *   `component:AppShell` FR4 and PR1). Main has no inner content box, so its
 *   content grows inside it without resizing it: its direct children's sizes
 *   are watched instead.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/AppShell/AppShell.tsx
 * - /packages/core/src/AppShell/observeMainOverflow.test.ts
 */

import {
  getLogicalAxisMapping,
  measureLogicalScrollAxis,
} from '../hooks/scrollGeometry';
import {observeMutations} from '../utils/sharedMutationObserver';
import {observeResize} from '../utils/sharedResizeObserver';

/**
 * Main's content: layout attributes, text and children, all the way down.
 * One shared observer serves every registration with these options.
 */
const CONTENT_MUTATIONS: MutationObserverInit = {
  attributes: true,
  attributeFilter: ['class', 'dir', 'hidden', 'style'],
  characterData: true,
  childList: true,
  subtree: true,
};

/**
 * Calls `onChange` with whether `main`'s content overflows it on either axis:
 * once with the first measurement, then whenever the answer changes. Signals
 * coalesce into one measurement per frame. A hidden, disconnected or
 * zero-size main is unknown rather than fitting: the last answer stands until
 * a later signal measures it.
 */
export function observeMainOverflow(
  main: HTMLElement,
  onChange: (overflows: boolean) => void,
): () => void {
  let isActive = true;
  let frame: number | null = null;
  let overflows: boolean | null = null;

  const measure = () => {
    frame = null;
    if (!isActive) {
      return;
    }
    const computedStyle = getComputedStyle(main);
    const mapping = getLogicalAxisMapping(
      computedStyle.writingMode,
      computedStyle.direction,
    );
    const inline = measureLogicalScrollAxis(main, 'inline', mapping);
    const block = measureLogicalScrollAxis(main, 'block', mapping);
    if (inline == null || block == null) {
      return;
    }
    const next = inline.isScrollable || block.isScrollable;
    if (next !== overflows) {
      overflows = next;
      onChange(next);
    }
  };

  const scheduleMeasure = () => {
    if (isActive && frame == null) {
      frame = window.requestAnimationFrame(measure);
    }
  };

  // Main keeps its size while its content grows; its children do not. Each
  // direct child's size is watched, following the children as they change.
  const childObservers = new Map<Element, () => void>();
  const syncChildObservers = () => {
    const children = new Set(Array.from(main.children));
    for (const [child, stop] of childObservers) {
      if (!children.has(child)) {
        stop();
        childObservers.delete(child);
      }
    }
    for (const child of children) {
      if (!childObservers.has(child)) {
        childObservers.set(child, observeResize(child, scheduleMeasure));
      }
    }
  };
  const onContentChange = () => {
    syncChildObservers();
    scheduleMeasure();
  };

  measure();
  syncChildObservers();
  const stopObservingMain = observeResize(main, scheduleMeasure);
  const stopObservingContent = observeMutations(
    main,
    CONTENT_MUTATIONS,
    onContentChange,
  );
  window.addEventListener('resize', scheduleMeasure);
  window.visualViewport?.addEventListener('resize', scheduleMeasure);
  main.addEventListener('load', scheduleMeasure, true);
  main.addEventListener('transitionend', scheduleMeasure);
  main.addEventListener('animationend', scheduleMeasure);
  const fonts = document.fonts;
  fonts?.addEventListener?.('loadingdone', scheduleMeasure);
  void fonts?.ready.then(scheduleMeasure);

  return () => {
    isActive = false;
    if (frame != null) {
      window.cancelAnimationFrame(frame);
      frame = null;
    }
    stopObservingMain();
    stopObservingContent();
    for (const stop of childObservers.values()) {
      stop();
    }
    childObservers.clear();
    window.removeEventListener('resize', scheduleMeasure);
    window.visualViewport?.removeEventListener('resize', scheduleMeasure);
    main.removeEventListener('load', scheduleMeasure, true);
    main.removeEventListener('transitionend', scheduleMeasure);
    main.removeEventListener('animationend', scheduleMeasure);
    fonts?.removeEventListener?.('loadingdone', scheduleMeasure);
  };
}
