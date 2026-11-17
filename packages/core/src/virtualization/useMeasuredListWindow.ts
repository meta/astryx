// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMeasuredListWindow.ts
 * @input Item keys, a size estimate, the scroll container, the element that
 *   holds the rows, a position writer and a reader for end anchoring
 * @output The mounted rows and gaps, the row measurement hook-up, a reveal
 *   call, the focus island, and whether a commit mounts history
 * @position The measured block-axis hook of the private list-windowing
 *   module. Rows measure their own size. The hook keeps one anchor item in
 *   place as sizes and keys change, and moves the scroll position only
 *   through the consumer's writer.
 */
import {useMemo, useState, useSyncExternalStore, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {setScrollAnchoringOff} from '../privateAttributes/scrollAnchoring.stylex';
import {subscribeInput} from '../utils/inputStream';
import {
  scrollEventTarget,
  scrollportTop,
  scrollsPage,
} from '../utils/pageScroller';
import {observeResizeAfterLayout} from '../utils/sharedResizeObserver';
import type {ListWindowSegment} from './listWindow';
import {
  buildItemOffsets,
  calculateMeasuredRange,
  createMeasuredSegments,
  findSurvivingIndex,
  itemAtOffset,
  revealOffset,
  type MeasuredRevealAlign,
} from './measuredListWindow';
import {useListFocusIsland, type ListWindowKey} from './useListFocusIsland';

export type {MeasuredRevealAlign} from './measuredListWindow';

/** The scrollport height the first window plans for, before it measures. */
const SEED_VIEWPORT = 800;
/** The least overscan on each side, in CSS px. */
const MIN_OVERSCAN = 200;
/** A position change smaller than this is subpixel noise, in CSS px. */
const EPSILON = 0.5;
/** A scroll ends this long after its last event where no `scrollend` fires. */
const SCROLL_END_FALLBACK_MS = 150;

/** How the hook moves the scroll position. The consumer owns the writes. */
export interface MeasuredListWindowWriter {
  /** Moves the position by `delta` CSS px now, to keep content in place. */
  shiftBy: (delta: number) => void;
  /** Moves the position to `top` now, for a reveal the reader asked for. */
  jumpTo: (top: number) => void;
}

export interface UseMeasuredListWindowOptions {
  /** One stable key per item, in order. */
  keys: ReadonlyArray<ListWindowKey>;
  /** The size in CSS px of an item that has not rendered yet. */
  estimateSize: (index: number) => number;
  /** The scroll container. */
  scroller: RefObject<HTMLElement | null>;
  /** The element that holds the rows and gaps, in the scroller's content. */
  content: RefObject<HTMLElement | null>;
  writer: MeasuredListWindowWriter;
  /** Whether the end stays in place now, as while new items are followed. */
  isEndAnchored: () => boolean;
  /**
   * Keeps the last item mounted wherever the window is, so its size and its
   * identity always reach the consumer.
   */
  isLastRetained?: boolean;
}

export interface MeasuredListWindow {
  /** Mounted rows and the gaps that stand for the other items, in order. */
  segments: ReadonlyArray<ListWindowSegment>;
  /** Whether this commit mounts items that are not new at the end. */
  isMountingHistory: boolean;
  /** Measures a mounted row. Call it at commit; it returns the release. */
  observeItem: (key: ListWindowKey, element: HTMLElement) => () => void;
  /** Places an item at `align`, mounted or not. False for an unknown key. */
  reveal: (key: ListWindowKey, align?: MeasuredRevealAlign) => boolean;
  onItemFocus: (key: ListWindowKey, focusTarget?: HTMLElement) => void;
  /** The consumer calls this only when focus genuinely leaves the item. */
  onItemBlur: () => void;
}

interface Plan {
  start: number;
  end: number;
  segments: ListWindowSegment[];
  isMountingHistory: boolean;
}

/** An item to keep at `top` CSS px below the scrollport's top. */
interface Hold {
  key: ListWindowKey;
  top: number;
  /** The scrollport height when `top` was read. An end hold follows it. */
  viewport: number;
  isEnd: boolean;
}

function hasSameKeys(
  a: ReadonlyArray<ListWindowKey>,
  b: ReadonlyArray<ListWindowKey>,
): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

/** Whether `next` keeps every key of `previous` in place and adds keys after them. */
function isAppendOnly(
  previous: ReadonlyArray<ListWindowKey>,
  next: ReadonlyArray<ListWindowKey>,
): boolean {
  if (previous.length === 0 || next.length <= previous.length) {
    return false;
  }
  for (let index = 0; index < previous.length; index++) {
    if (previous[index] !== next[index]) {
      return false;
    }
  }
  return true;
}

function overscanOf(viewport: number, share = 1) {
  return {
    overscanBefore: Math.max(MIN_OVERSCAN, viewport) * share,
    overscanAfter: Math.max(MIN_OVERSCAN, viewport / 2) * share,
  };
}

function createMeasuredListEngine() {
  const listeners = new Set<() => void>();
  let version = 0;
  let latest: UseMeasuredListWindowOptions | undefined;
  let commitCount = 0;

  // The committed model: what the rendered rows and gaps show.
  const sizes = new Map<ListWindowKey, number>();
  let keys: ReadonlyArray<ListWindowKey> = [];
  let indices: ReadonlyMap<ListWindowKey, number> = new Map();
  let offsets: number[] = [0];
  let range = {start: 0, end: 0};
  // The end of the gap that starts at the first item, or 0 with no gap.
  let topGapEnd = 0;

  // Geometry, read in one batch per change.
  let isMeasured = false;
  let scrollTop = 0;
  let viewportSize = 0;
  let listTop = 0;
  let maxScroll = 0;

  // The position the hook keeps.
  let debt = 0;
  let anchor: {key: ListWindowKey; top: number} | undefined;
  let isOpening = true;
  let hasOpened = false;
  let reveal: {key: ListWindowKey; align: MeasuredRevealAlign} | undefined;
  let isRevealWritten = true;
  let busyFrame = 0;
  let isBusy = false;
  // Another writer moves the position: the reader's scroll and its momentum,
  // or the follow. A write now would stop or fight that motion.
  let isMoving = false;
  let motionTimer: ReturnType<typeof setTimeout> | undefined;
  // The position to keep when the gap gives back the correction it held.
  let pendingHold: Hold | undefined;

  // Row measurement.
  const elements = new Map<ListWindowKey, HTMLElement>();
  const fresh = new Set<ListWindowKey>();
  const queued = new Map<ListWindowKey, number>();
  let isFlushQueued = false;

  let connected: HTMLElement | undefined;
  let anchoringOff: HTMLElement | undefined;
  let stops: (() => void)[] = [];

  function emit() {
    version++;
    for (const listener of [...listeners]) {
      listener();
    }
  }

  function sizeOf(index: number): number {
    return sizes.get(keys[index]) ?? latest?.estimateSize(index) ?? 0;
  }

  function isEnd(): boolean {
    return (
      reveal === undefined && (isOpening || latest?.isEndAnchored() === true)
    );
  }

  function topInView(index: number): number {
    return listTop + offsets[index] - debt - scrollTop;
  }

  /** The first item at the scrollport's top, as the reader sees it. */
  function updateAnchor() {
    if (keys.length === 0 || reveal !== undefined) {
      return;
    }
    const index = itemAtOffset(offsets, scrollTop - listTop + debt);
    anchor = {key: keys[index], top: topInView(index)};
  }

  function captureHold(): Hold | undefined {
    if (keys.length === 0) {
      return undefined;
    }
    if (reveal !== undefined) {
      return {key: reveal.key, top: 0, viewport: viewportSize, isEnd: false};
    }
    if (isEnd()) {
      const last = keys.length - 1;
      return {
        key: keys[last],
        top: topInView(last),
        viewport: viewportSize,
        isEnd: true,
      };
    }
    return anchor === undefined
      ? undefined
      : {...anchor, viewport: viewportSize, isEnd: false};
  }

  /** The hold item's index in `nextIndices`, or the index of its survivor. */
  function resolve(
    hold: Hold,
    nextIndices: ReadonlyMap<ListWindowKey, number>,
  ): number | undefined {
    const own = nextIndices.get(hold.key);
    if (own !== undefined) {
      return own;
    }
    const previous = indices.get(hold.key);
    return previous === undefined
      ? undefined
      : findSurvivingIndex(keys, previous, nextIndices);
  }

  /** Where the hold item's top rests below the scrollport's top. */
  function holdTop(hold: Hold, itemSize: number, viewport: number): number {
    if (reveal !== undefined && reveal.key === hold.key) {
      return revealOffset(reveal.align, itemSize, viewport);
    }
    return hold.isEnd ? hold.top + viewport - hold.viewport : hold.top;
  }

  function readGeometry(scroller: HTMLElement, content: HTMLElement) {
    // One batch of layout reads per change, before any write.
    scrollTop = scroller.scrollTop;
    viewportSize = scroller.clientHeight;
    listTop =
      content.getBoundingClientRect().top -
      scrollportTop(scroller) +
      scrollTop -
      (scrollsPage(scroller) ? 0 : scroller.clientTop);
    maxScroll = Math.max(0, scroller.scrollHeight - viewportSize);
    isMeasured = viewportSize > 0;
  }

  /**
   * Moves the scroll position to `target`. While another writer moves it, a
   * write would stop a finger's momentum or fight a smooth scroll, so the
   * gap above the rows takes the change instead.
   */
  function moveTo(target: number, canAbsorb: boolean) {
    const scroller = connected;
    if (scroller == null || latest == null) {
      return;
    }
    const clamped = Math.min(maxScroll, Math.max(0, target));
    if (reveal !== undefined && !isRevealWritten) {
      // A reveal the reader asked for stops the follow, even in place.
      isRevealWritten = true;
      latest.writer.jumpTo(clamped);
      scrollTop = scroller.scrollTop;
      return;
    }
    const delta = clamped - scrollTop;
    if (Math.abs(delta) <= EPSILON) {
      return;
    }
    if (
      canAbsorb &&
      topGapEnd > 0 &&
      debt + delta <= offsets[topGapEnd] &&
      isMoving
    ) {
      debt += delta;
      emit();
      return;
    }
    latest.writer.shiftBy(delta);
    scrollTop = scroller.scrollTop;
  }

  function holdPosition(hold: Hold | undefined, canAbsorb: boolean) {
    if (hold === undefined) {
      return;
    }
    const index = indices.get(hold.key);
    if (index === undefined) {
      return;
    }
    const top = holdTop(hold, sizeOf(index), viewportSize);
    moveTo(listTop + offsets[index] - debt - top, canAbsorb);
  }

  function open() {
    if (isMeasured && keys.length > 0) {
      hasOpened = true;
      moveTo(maxScroll, false);
    }
  }

  /**
   * Takes the position another writer set since the last read: the reader,
   * or a follow that moved before its scroll event.
   */
  function takePosition(scroller: HTMLElement) {
    const top = scroller.scrollTop;
    if (Math.abs(top - scrollTop) >= 1) {
      isOpening = false;
      reveal = undefined;
      isMoving = true;
      clearTimeout(motionTimer);
      motionTimer = setTimeout(endMotion, SCROLL_END_FALLBACK_MS);
    }
    scrollTop = top;
    updateAnchor();
  }

  /** Writes the correction the gap held while the position moved. */
  function endMotion() {
    clearTimeout(motionTimer);
    isMoving = false;
    if (debt !== 0) {
      pendingHold = captureHold();
      debt = 0;
      emit();
    }
  }

  function onScroll() {
    const scroller = connected;
    if (scroller == null) {
      return;
    }
    // The one read per scroll event. It writes nothing.
    takePosition(scroller);
    if (!isMeasured) {
      return;
    }
    // A move inside half the overscan keeps the mounted rows.
    const needed = calculateMeasuredRange({
      offsets,
      scrollOffset: scrollTop - listTop + debt,
      viewportSize,
      ...overscanOf(viewportSize, 0.5),
    });
    if (needed.start < range.start || needed.end > range.end) {
      emit();
    }
  }

  function onResize() {
    const scroller = connected;
    const content = latest?.content.current;
    if (scroller == null || content == null) {
      return;
    }
    const hold = captureHold();
    readGeometry(scroller, content);
    if (hasOpened) {
      holdPosition(hold, false);
    } else {
      open();
    }
    emit();
  }

  function flush() {
    isFlushQueued = false;
    const scroller = connected;
    const content = latest?.content.current;
    if (scroller == null || content == null || queued.size === 0) {
      queued.clear();
      return;
    }
    takePosition(scroller);
    const hold = captureHold();
    let hasChange = false;
    for (const [key, size] of queued) {
      if (indices.has(key) && sizes.get(key) !== size) {
        sizes.set(key, size);
        hasChange = true;
      }
    }
    queued.clear();
    if (!hasChange) {
      return;
    }
    offsets = buildItemOffsets(keys.length, sizeOf);
    readGeometry(scroller, content);
    if (hasOpened) {
      holdPosition(hold, true);
    }
    updateAnchor();
    emit();
  }

  function queueMeasure(
    key: ListWindowKey,
    element: HTMLElement,
    entry: ResizeObserverEntry | null,
  ) {
    const size =
      entry?.borderBoxSize?.[0]?.blockSize ??
      element.getBoundingClientRect().height;
    queued.set(key, size);
    if (!isFlushQueued) {
      isFlushQueued = true;
      // One correction pass per observer delivery, before the frame paints.
      queueMicrotask(flush);
    }
  }

  function disconnect() {
    for (const stop of stops) {
      stop();
    }
    stops = [];
    connected = undefined;
  }

  function connect(scroller: HTMLElement, content: HTMLElement) {
    if (anchoringOff !== content) {
      if (anchoringOff != null) {
        setScrollAnchoringOff(anchoringOff, false);
      }
      // The hook keeps the rows in place itself, so the browser must not.
      setScrollAnchoringOff(content, true);
      anchoringOff = content;
    }
    if (connected === scroller) {
      return;
    }
    disconnect();
    connected = scroller;
    const doc = scroller.ownerDocument;
    const view = doc.defaultView;
    if (scrollEventTarget(scroller) === doc) {
      if (view != null) {
        // The page's scroll fires at the document, its resize at the window.
        stops.push(
          subscribeInput(view, 'scroll', event => {
            if (event.target === doc) {
              onScroll();
            }
          }),
          subscribeInput(view, 'scrollend', event => {
            if (event.target === doc) {
              endMotion();
            }
          }),
          subscribeInput(view, 'resize', event => {
            if (event.target === view) {
              onResize();
            }
          }),
        );
      }
      return;
    }
    scroller.addEventListener('scroll', onScroll, {passive: true});
    scroller.addEventListener('scrollend', endMotion);
    stops.push(() => {
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('scrollend', endMotion);
    });
    const stopResize = observeResizeAfterLayout(scroller, onResize);
    if (stopResize != null) {
      stops.push(stopResize);
    }
  }

  function plan(
    nextKeys: ReadonlyArray<ListWindowKey>,
    nextIndices: ReadonlyMap<ListWindowKey, number>,
    estimateSize: (index: number) => number,
    focusIndex: number | undefined,
    isLastRetained: boolean,
  ): Plan {
    const nextOffsets = buildItemOffsets(
      nextKeys.length,
      index => sizes.get(nextKeys[index]) ?? estimateSize(index),
    );
    const total = nextOffsets[nextKeys.length];
    const hasKeyChange = !hasSameKeys(keys, nextKeys);
    const viewport = isMeasured ? viewportSize : SEED_VIEWPORT;
    // The scrollport's top in the list's coordinates. Before it measures,
    // the window covers the end at a seed height, on the server too.
    let position = total - viewport;
    if (isMeasured && hasOpened) {
      position = scrollTop - listTop + debt;
      const hold =
        hasKeyChange || (reveal !== undefined && !isRevealWritten)
          ? captureHold()
          : undefined;
      if (hold !== undefined) {
        const index = resolve(hold, nextIndices);
        position =
          index === undefined
            ? total - viewport
            : nextOffsets[index] -
              holdTop(
                hold,
                nextOffsets[index + 1] - nextOffsets[index],
                viewport,
              );
      }
    }
    const {start, end} = calculateMeasuredRange({
      offsets: nextOffsets,
      scrollOffset: position,
      viewportSize: viewport,
      ...overscanOf(viewport),
    });
    const isMountingHistory =
      isBusy ||
      (hasOpened &&
        (hasKeyChange
          ? !isAppendOnly(keys, nextKeys)
          : start < range.start || end > range.end));
    return {
      start,
      end,
      segments: createMeasuredSegments(
        nextOffsets,
        start,
        end,
        focusIndex,
        debt,
        isLastRetained,
      ),
      isMountingHistory,
    };
  }

  function commit(
    options: UseMeasuredListWindowOptions,
    nextIndices: ReadonlyMap<ListWindowKey, number>,
    rendered: Plan,
  ) {
    latest = options;
    const commitId = ++commitCount;
    const scroller = options.scroller.current;
    const content = options.content.current;
    if (scroller == null || content == null) {
      // On the first commit an ancestor's ref attaches after this Effect.
      // The microtask still runs before the frame paints.
      queueMicrotask(() => {
        if (commitId === commitCount) {
          commit(options, nextIndices, rendered);
        }
      });
      return;
    }
    connect(scroller, content);
    if (rendered.isMountingHistory) {
      isBusy = true;
      cancelAnimationFrame(busyFrame);
      // History stays marked until the frame after its rows mount.
      busyFrame = requestAnimationFrame(() => {
        isBusy = false;
        emit();
      });
    }
    const hasKeyChange = !hasSameKeys(keys, options.keys);
    range = {start: rendered.start, end: rendered.end};
    const first = rendered.segments[0];
    topGapEnd = first?.type === 'gap' ? first.end : 0;
    // A parent render with the same rows reads and writes nothing.
    if (
      hasOpened &&
      !hasKeyChange &&
      fresh.size === 0 &&
      isRevealWritten &&
      debt === 0 &&
      pendingHold === undefined
    ) {
      return;
    }
    if (hasOpened && pendingHold === undefined) {
      takePosition(scroller);
    }
    const hold = pendingHold ?? (hasOpened ? captureHold() : undefined);
    pendingHold = undefined;
    const holdIndex =
      hold === undefined ? undefined : resolve(hold, nextIndices);

    // Reads: the geometry, then every row that mounted in this commit.
    readGeometry(scroller, content);
    const measured: [ListWindowKey, number][] = [];
    for (const key of fresh) {
      const element = elements.get(key);
      if (element != null) {
        measured.push([key, element.getBoundingClientRect().height]);
      }
    }
    fresh.clear();

    // The model the rendered rows show, with the sizes they measured.
    if (hasKeyChange) {
      keys = options.keys;
      indices = nextIndices;
    }
    for (const [key, size] of measured) {
      sizes.set(key, size);
    }
    offsets = buildItemOffsets(keys.length, sizeOf);
    // A gap is never shorter than zero, so the debt fits in the gap above.
    debt = topGapEnd > 0 ? Math.min(debt, offsets[topGapEnd]) : 0;

    // Writes.
    if (!hasOpened) {
      open();
    } else if (hold !== undefined) {
      if (holdIndex === undefined) {
        // No old item survives: the list opens again at its end.
        moveTo(maxScroll, false);
      } else {
        const top = holdTop(hold, sizeOf(holdIndex), viewportSize);
        moveTo(listTop + offsets[holdIndex] - debt - top, true);
      }
    }
    isRevealWritten = true;
    updateAnchor();
    if (isMeasured) {
      const next = calculateMeasuredRange({
        offsets,
        scrollOffset: scrollTop - listTop + debt,
        viewportSize,
        ...overscanOf(viewportSize),
      });
      if (next.start !== range.start || next.end !== range.end) {
        emit();
      }
    }
  }

  function observeItem(key: ListWindowKey, element: HTMLElement) {
    elements.set(key, element);
    fresh.add(key);
    const stop = observeResizeAfterLayout(element, entry =>
      queueMeasure(key, element, entry),
    );
    return () => {
      stop?.();
      fresh.delete(key);
      if (elements.get(key) === element) {
        elements.delete(key);
      }
    };
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getVersion: () => version,
    plan,
    commit,
    observeItem,
    reveal(key: ListWindowKey, align: MeasuredRevealAlign = 'start') {
      if (!indices.has(key)) {
        return false;
      }
      reveal = {key, align};
      isRevealWritten = false;
      isOpening = false;
      emit();
      return true;
    },
    release() {
      // A commit still queued for the scroller's ref must not reconnect.
      commitCount++;
      disconnect();
      if (anchoringOff != null) {
        setScrollAnchoringOff(anchoringOff, false);
        anchoringOff = undefined;
      }
      cancelAnimationFrame(busyFrame);
      clearTimeout(motionTimer);
      isBusy = false;
      isMoving = false;
      queued.clear();
    },
  };
}

/**
 * Windows a block-axis list whose items report their own size. The first
 * window covers the end of the list.
 */
export function useMeasuredListWindow(
  options: UseMeasuredListWindowOptions,
): MeasuredListWindow {
  const [engine] = useState(createMeasuredListEngine);
  // The version changes with each size or position the engine records.
  useSyncExternalStore(engine.subscribe, engine.getVersion, engine.getVersion);
  const {keys, estimateSize, content} = options;
  const keyIndices = useMemo(
    () => new Map(keys.map((key, index) => [key, index])),
    [keys],
  );
  const {focusIndex, onItemFocus, onItemBlur} = useListFocusIsland({
    keyIndices,
    isActive: true,
    viewport: content,
    focusContainer: content,
  });
  const plan = engine.plan(
    keys,
    keyIndices,
    estimateSize,
    focusIndex,
    options.isLastRetained === true,
  );

  // Syncs the scroll position, the row measurements and the scroll and
  // resize listeners with the committed rows.
  useIsomorphicLayoutEffect(() => {
    engine.commit(options, keyIndices, plan);
  });
  // Syncs the listeners, observers, timer, frame and anchoring attribute
  // with the list's life: it releases them on unmount.
  useIsomorphicLayoutEffect(() => engine.release, [engine]);

  return {
    segments: plan.segments,
    isMountingHistory: plan.isMountingHistory,
    observeItem: engine.observeItem,
    reveal: engine.reveal,
    onItemFocus,
    onItemBlur,
  };
}
