// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useScrollOverflow.ts
 * @input React refs, state and effects, and react-dom's flushSync
 * @output useScrollOverflow, which tracks the overflow at the scroll edges,
 *   and the internal useShownScrollOverflow, which can also measure from a
 *   position its caller reports
 * @position Core hook; used by Carousel and TabList for fade-edge and button
 *   state
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 */

import {useState, useCallback, useEffect, useRef} from 'react';
import {flushSync} from 'react-dom';
import {observeResizeAfterLayout} from '../utils/sharedResizeObserver';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';

/**
 * Where the content is shown while something other than scrolling moves it:
 * its offset toward the end, and how far it travels.
 */
export interface ShownPosition {
  readonly offset: number;
  readonly travel: number;
}

export interface ScrollOverflowState {
  /** Content overflows the start (left in LTR, right in RTL) */
  overflowStart: boolean;
  /** Content overflows the end (right in LTR, left in RTL) */
  overflowEnd: boolean;
  /** Whether the container has any overflow at all */
  hasOverflow: boolean;
}

/**
 * The edges, plus whether the first measurement set them. The first
 * measurement sets the edges before any frame shows them, so a caller applies
 * them without a transition.
 */
interface ShownScrollOverflowState extends ScrollOverflowState {
  isFirstMeasurement: boolean;
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

const NO_CLASS_NAMES: ReadonlyArray<string> = [];

function classTokens(value: string | null): Set<string> {
  return new Set(value?.split(/\s+/).filter(Boolean));
}

/**
 * Whether a class write only added or removed classes in `own`.
 */
function isOwnClassWrite(
  before: string | null,
  after: string | null,
  own: ReadonlySet<string>,
): boolean {
  const from = classTokens(before);
  const to = classTokens(after);
  for (const token of from) {
    if (!to.has(token) && !own.has(token)) {
      return false;
    }
  }
  for (const token of to) {
    if (!from.has(token) && !own.has(token)) {
      return false;
    }
  }
  return true;
}

/**
 * Observes what changes `el`'s overflow besides its scroll: its own size,
 * each child's size, the children added or removed, and its class or style.
 * Returns the teardown, which ends every observation, and `settle`, which
 * drops the class writes still waiting to be observed that only add or remove
 * the caller's own classes, given by `getOwnClassNames`.
 *
 * The container attaches in React's commit, where a read forces a style and
 * layout pass before the browser's own. So the first measurement waits for
 * the first resize notification, which comes after the browser lays the
 * container out. Where no ResizeObserver exists, the container is measured
 * at once.
 *
 * `measureFirst` runs in a microtask after that notification's delivery. The
 * microtask still precedes the paint. It follows every callback of the
 * delivery, so it reads the offset that a scroll made there leaves, such as
 * TabList's reveal of its selected tab.
 */
function observeContent(
  el: HTMLElement,
  measure: () => void,
  measureFirst: () => void,
  getOwnClassNames: () => ReadonlySet<string>,
): {readonly stop: () => void; readonly settle: () => void} {
  let isActive = true;
  let isLaidOut = false;
  // While the first measurement waits for its microtask, the other reports
  // of that delivery measure nothing.
  let isFirstPending = false;
  const unobserveContainer = observeResizeAfterLayout(el, () => {
    if (isLaidOut) {
      measure();
      return;
    }
    if (isFirstPending) {
      return;
    }
    isFirstPending = true;
    queueMicrotask(() => {
      isFirstPending = false;
      if (isActive) {
        isLaidOut = true;
        measureFirst();
      }
    });
  });
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
        // A child that another observer already watches sends no first
        // notification; the container's own registration covers that.
        const unobserve = observeResizeAfterLayout(child, entry => {
          if (entry != null && !isFirstPending) {
            measure();
          }
        });
        unobserveChildren.set(child, unobserve ?? (() => {}));
      }
    }
  };
  followChildren();
  if (unobserveContainer == null) {
    isLaidOut = true;
    measure();
  }
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
    attributeOldValue: true,
  });
  const stop = () => {
    isActive = false;
    mutations?.disconnect();
    for (const unobserve of unobserveChildren.values()) {
      unobserve();
    }
    unobserveChildren.clear();
    unobserveContainer?.();
  };
  return {
    stop,
    // Called in a layout effect, after a commit changed the edges. A caller
    // that styles the container from those edges (a fade mask, by class) has
    // written them by now, and measuring that write reads layout again for
    // edges this hook just measured. Only a class write that adds or removes
    // the caller's own classes is dropped. Any other class or style write, and
    // children added or removed, are measured as usual.
    settle: () => {
      const records = mutations?.takeRecords() ?? [];
      if (records.length === 0) {
        return;
      }
      const own = getOwnClassNames();
      let changed = false;
      let childrenChanged = false;
      records.forEach((record, index) => {
        if (record.type === 'childList') {
          childrenChanged = true;
          changed = true;
        } else if (record.attributeName === 'class') {
          // The class after this write is what the next class write found.
          const next = records
            .slice(index + 1)
            .find(r => r.attributeName === 'class');
          const after = next ? next.oldValue : el.getAttribute('class');
          if (!isOwnClassWrite(record.oldValue, after, own)) {
            changed = true;
          }
        } else {
          changed = true;
        }
      });
      if (childrenChanged) {
        followChildren();
      }
      if (changed) {
        measure();
      }
    },
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
  const {scrollRef, overflowStart, overflowEnd, hasOverflow} =
    useShownScrollOverflow();
  return {scrollRef, overflowStart, overflowEnd, hasOverflow};
}

/**
 * `useScrollOverflow`, plus `followShown`: while snap paging holds a row, its
 * scroll offset stays where the hold began and its items move. The caller
 * reports where the row is shown, and the edges follow it. A live report
 * commits an edge change before it returns. A report that the caller's own
 * call into the paging raises passes `isLive` false. That call can run inside
 * React's commit, so the report takes React's scheduling. Null measures the
 * scroll offset again from the next frame, when the handed-back offset is
 * current. `isFirstMeasurement` is true while the edges are the ones the
 * first measurement set. Internal: not exported from the hooks entry.
 */
export function useShownScrollOverflow(
  options: {
    /**
     * The classes the caller sets on the container from the edges this hook
     * reports. A write that only adds or removes them is not measured again.
     */
    readonly ownClassNames?: ReadonlyArray<string>;
  } = {},
) {
  const ownClassNames = options.ownClassNames ?? NO_CLASS_NAMES;
  const ownSetRef = useRef<ReadonlySet<string>>(new Set(ownClassNames));
  useIsomorphicLayoutEffect(() => {
    ownSetRef.current = new Set(ownClassNames);
  }, [ownClassNames]);
  const elRef = useRef<HTMLElement | null>(null);
  const unobserveRef = useRef<(() => void) | null>(null);
  const settleRef = useRef<(() => void) | null>(null);
  const shownRef = useRef<ShownPosition | null>(null);
  const releaseFrameRef = useRef(0);

  const [state, setState] = useState<ShownScrollOverflowState>({
    overflowStart: false,
    overflowEnd: false,
    hasOverflow: false,
    isFirstMeasurement: false,
  });
  // The edges last set, so a measure that changes no edge renders nothing.
  const edgesRef = useRef(state);

  const measureNow = useCallback(
    (el: HTMLElement, isLive = false, isFirst = false) => {
      const tolerance = 1;
      const shown = shownRef.current;
      const offset = shown?.offset ?? Math.abs(el.scrollLeft);
      const maxScroll = shown?.travel ?? el.scrollWidth - el.clientWidth;

      const overflowStart = offset > tolerance;
      const overflowEnd = offset < maxScroll - tolerance;
      const hasOverflow = maxScroll > tolerance;

      const prev = edgesRef.current;
      if (
        prev.overflowStart === overflowStart &&
        prev.overflowEnd === overflowEnd &&
        prev.hasOverflow === hasOverflow
      ) {
        return;
      }
      const next = {
        overflowStart,
        overflowEnd,
        hasOverflow,
        isFirstMeasurement: isFirst,
      };
      edgesRef.current = next;
      if (isLive) {
        // A live report comes from the paging's frame or event, or it is the
        // first measurement. An edge change commits there: before the paging
        // can hand the row back, or before the first frame paints.
        // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- an edge change must show in the frame its report belongs to
        flushSync(() => setState(next));
      } else {
        setState(next);
      }
    },
    [],
  );

  // Only a rendered container is measured on a resize or content change. A
  // layout read on a hidden one makes the browser render its hidden subtree.
  // The resize observation after the reveal measures again.
  const measure = useCallback(() => {
    const el = elRef.current;
    // A held row's edges come from where it is shown, which reads no layout.
    // So the paging's own style writes force no layout here.
    if (el && (shownRef.current != null || isRendered(el))) {
      measureNow(el);
    }
  }, [measureNow]);

  // The first measurement commits at once, so the first frame shows the
  // edges. Only the content observer's own measure, after the edge class
  // changes, reads after that write.
  const measureFirst = useCallback(() => {
    const el = elRef.current;
    if (el && (shownRef.current != null || isRendered(el))) {
      measureNow(el, true, true);
    }
  }, [measureNow]);

  // A scroll is measured hidden or not. Script scrolled the hidden container,
  // so its layout is already current. A reveal at the same size brings no
  // resize observation, so this read keeps the edges right.
  const measureOnScroll = useCallback(() => {
    const el = elRef.current;
    if (el) {
      measureNow(el);
    }
  }, [measureNow]);

  const followShown = useCallback(
    (shown: ShownPosition | null, isLive = true) => {
      cancelAnimationFrame(releaseFrameRef.current);
      const el = elRef.current;
      if (shown != null) {
        shownRef.current = shown;
        if (el) {
          measureNow(el, isLive);
        }
        return;
      }
      if (shownRef.current == null || el == null) {
        shownRef.current = null;
        return;
      }
      // Keep the reported edges until the next frame, when the scroll offset
      // is current. Otherwise an edge flickers.
      releaseFrameRef.current = requestAnimationFrame(() => {
        shownRef.current = null;
        measure();
      });
    },
    [measure, measureNow],
  );

  // A commit that changed the edges is also the commit that restyles the
  // container from them. A class write that only sets the caller's own
  // classes is this hook's own result, so it is not observed as a change to
  // the content.
  useIsomorphicLayoutEffect(() => {
    settleRef.current?.();
  }, [state]);

  const scrollRef = useCallback(
    (el: HTMLElement | null) => {
      if (elRef.current) {
        unobserveRef.current?.();
        unobserveRef.current = null;
        settleRef.current = null;
        elRef.current.removeEventListener('scroll', measureOnScroll);
        cancelAnimationFrame(releaseFrameRef.current);
        shownRef.current = null;
      }

      elRef.current = el;

      if (el) {
        el.addEventListener('scroll', measureOnScroll, {passive: true});
        const observation = observeContent(
          el,
          measure,
          measureFirst,
          () => ownSetRef.current,
        );
        unobserveRef.current = observation.stop;
        settleRef.current = observation.settle;
      }
    },
    [measure, measureFirst, measureOnScroll],
  );

  useEffect(() => {
    return () => {
      cancelAnimationFrame(releaseFrameRef.current);
      if (elRef.current) {
        unobserveRef.current?.();
        unobserveRef.current = null;
        settleRef.current = null;
        elRef.current.removeEventListener('scroll', measureOnScroll);
      }
    };
  }, [measureOnScroll]);

  return {
    scrollRef,
    followShown,
    ...state,
  };
}
