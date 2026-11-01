// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatVirtualizer.tsx
 * @input Uses React only (no DOM libraries); attaches to a caller-owned
 *   scroll container that runs no follow of its own, or renders its own
 * @output Exports ChatVirtualizer component, ChatVirtualizerProps and
 *   ChatVirtualizerHandle
 * @position Experimental windowing participant for ChatMessageList children:
 *   keeps thousands-of-messages transcripts at a bounded DOM size while
 *   owning follow-at-end and read-position stability
 *
 * The combination under evaluation:
 *   1. aggregate top/bottom spacers — rendered rows stay in normal document
 *      flow between two placeholder divs (O(1) placeholder nodes; the two
 *      largest production chat transcripts keep rows in flow too), inside
 *      one content block whose min-height floors the scroll extent;
 *   2. bottom-distance bookkeeping as the default reference frame — the
 *      desired position is stored as "px from the bottom edge", so
 *      above-viewport estimate→measured swaps and pinned tail growth are
 *      both identity operations;
 *   3. identity-anchor override while scrolled up — reading history anchors
 *      the first row intersecting the viewport top, so above-window size
 *      corrections keep the row being read visually frozen.
 *
 * Corrections are SYNCHRONOUS pre-paint: every commit's layout effect runs
 * the pass — measure ('sync' re-reads the whole window's offsetHeight;
 * 'ro', the default, forced-reads only never-seen rows and takes the rest
 * from ResizeObserver callbacks), recompute offsets, resize the spacers,
 * restore scrollTop from the mode — all before the browser paints. No
 * compensation deltas anywhere: position is always re-derived from the
 * stored reference, so a single miss self-heals.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/Chat/index.ts (exports)
 * - /apps/storybook/stories/ChatVirtualization.stories.tsx (examples)
 */

import * as React from 'react';

// "Did the declarative target land?" — a convergence tolerance, deliberately
// NOT the same knob as `endThreshold` (which is a user-intent question).
const CONVERGE_EPSILON_PX = 4;

const GLOBAL_BUCKET = '\u0000global';
// Prior strength for shrinkage in effectiveAvg: at this many real samples
// the bucket's own data and the inherited baseline carry equal weight.
const PRIOR_SAMPLES = 5;

// The block that holds the spacers and the windowed rows, in both modes.
// Its `min-height` is the scroll extent's FLOOR and is written imperatively
// (writeSpacers), never through this object, so React's style diffing
// cannot touch it. React applies a parent's own style only after every
// child mutation of the commit, and this component writes the floor only in
// its own layout effect — after its children's — so from the first row
// removal until the pass re-derives the geometry, the floor is the previous
// extent. The extent then cannot collapse under a forced layout in that
// window (a row's layout cleanup, a ref callback, a child's layout effect),
// and the browser has nothing to clamp scrollTop against.
//
// flow-root keeps row margins inside the block, as the own scroller did
// before this block existed. flexShrink: 0 / alignSelf: stretch — in a
// column-flex host scroller (attach mode) the block is a
// flex item and would otherwise be compressed to fit (default shrink 1),
// silently corrupting the whole geometry.
const contentStyle: React.CSSProperties = {
  display: 'flow-root',
  flexShrink: 0,
  alignSelf: 'stretch',
};
// Momentum ("fling") outlives touchend and emits no further touch events, so
// the end of a gesture is detected as scroll silence, not as an event. Also
// the retry interval while the gesture is still settling.
//
// No platform test gates this: a programmatic scrollTop write cancels an
// in-flight fling wherever momentum belongs to the scroll view (iOS WebKit,
// Android), and where it does not (a macOS trackpad, whose momentum arrives
// as wheel events) there are no touch events to put the gate in the first
// place. Sniffing the UA would only have made this path miss touchscreens.
const TOUCH_SETTLE_MS = 150;

// The list owns its scroller's position in both modes (follow-at-end and the
// identity anchor), so the browser's own scroll anchoring must not move it.
// The switch rides on an attribute and one injected rule rather than the
// element's inline style: in attach mode the scroller is the caller's, and
// whatever `overflow-anchor` they set — before or during our tenure — is
// never read, written or restored; it simply applies again once the
// attribute is gone. `!important` so an inline `auto` cannot switch native
// anchoring back on under a list that is anchoring by itself.
const VIRTUALIZED_ATTR = 'data-astryx-chat-virtualized';
const VIRTUALIZED_STYLE_ATTR = 'data-astryx-chat-virtualized-style';

function ensureVirtualizedStyle(): void {
  if (
    typeof document === 'undefined' ||
    document.head.querySelector(`[${VIRTUALIZED_STYLE_ATTR}]`)
  ) {
    return;
  }
  const style = document.createElement('style');
  style.setAttribute(VIRTUALIZED_STYLE_ATTR, '');
  style.textContent = `[${VIRTUALIZED_ATTR}]{overflow-anchor:none !important}`;
  document.head.appendChild(style);
}

export type ChatVirtualizerMeasureMode = 'ro' | 'sync';

/** Imperative surface — both methods are declarations, not scroll actions. */
export interface ChatVirtualizerHandle {
  /** Declare "be N px above the bottom edge" (0 = follow-at-end). */
  scrollToDistanceFromBottomPx: (px?: number) => void;
  /**
   * Hold one row at a fixed viewport offset (0 = its top edge at the
   * viewport top — the "pin the new prompt to the top" pattern). Same
   * declaration semantics; the reference frame becomes a row identity
   * instead of the bottom edge, so rows resizing above it are absorbed.
   * The position clamps to the scrollable range, and the key must exist in
   * the CURRENT data: a missing key falls back to follow-at-end on the next
   * pass, so declare after the data commit, not ahead of it.
   */
  anchorToKey: (key: string, viewportOffset?: number) => void;
}

export interface ChatVirtualizerProps<T> {
  /** Row data. Changes are detected by REFERENCE — replace, don't mutate. */
  data: readonly T[];
  /**
   * Stable string identity per row (coerced with String() internally).
   * Never derive keys from indices: the size cache and the running size
   * averages are keyed by identity.
   */
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: {item: T; index: number}) => React.ReactNode;
  /**
   * Static estimate (px) for unmeasured rows, or a function — a function is
   * authoritative and never overridden by the running averages.
   *
   * Bias it LOW. The two directions are not symmetric: an estimate that is too
   * small makes content grow as it measures, which extends the scroll range
   * below you and leaves your position valid; one that is too large makes it
   * shrink, and the browser then clamps scrollTop into a range that just got
   * smaller — a position loss nothing can undo. The default errs small on
   * purpose, and raising it past typical row height is the one setting that
   * can make a drag look broken.
   */
  estimatedItemSize?: number | ((item: T, index: number) => number);
  /**
   * 'ro' (default, the shipping gear) = sizes come from ResizeObserver
   * callbacks plus a one-shot sync read at first mount; steady-state
   * commits force no layout. 'sync' = forced-layout measurement in EVERY
   * commit's layout effect — zero-window corrections, pays a sync layout
   * per commit. Kept as the experimental control arm: same code, one
   * switch, so any residual artifact bisects into "pipeline timing" vs
   * "logic" instantly.
   */
  measureMode?: ChatVirtualizerMeasureMode;
  /** Imperative declarations (see ChatVirtualizerHandle). */
  apiRef?: React.Ref<ChatVirtualizerHandle>;
  /**
   * Optional item classifier: measured sizes feed a running average PER
   * TYPE, so a corpus mixing tool-call stubs with long markdown converges
   * to honest per-shape prices instead of one blended number.
   */
  getItemType?: (item: T, index: number) => string;
  /**
   * ATTACH MODE. By default the list renders its own scroll container. Pass
   * the caller's scroll element instead — a scroller that runs no follow of
   * its own, such as a page shell's content area — and it renders one
   * content block (spacers + windowed rows) into the container the caller
   * already owns: the layout component keeps the scroller, the virtualizer
   * is one participant in it. Not ChatLayout's: ChatLayout runs its own
   * follow on that element with no way to turn it off, so attaching there
   * puts two writers on one position. It cannot host attach mode until it
   * exposes a seam to disable that follow.
   *
   * Pass the ELEMENT, not a ref: a parent's ref attaches after its
   * children's layout effects, so a ref would still read null on the commit
   * that matters, while state holding the element re-renders with it
   * available. Pass null (not undefined) while the
   * element is pending: absent = own-container mode, null = attach mode
   * waiting — falling back to the own container for even one commit mounts
   * EVERY row (unbounded clientHeight) and tears it back down (measured:
   * 10s boot at 2000 messages).
   *
   * CONTRACT: row spacing must live INSIDE the rows (padding), never as
   * flex `gap` or margins on the container — offsetHeight cannot see
   * either, so the geometry would drift by one gap per row. Nest inside
   * ChatMessageList with gap=0.
   */
  scrollElement?: HTMLElement | null;
  /**
   * How close to the bottom (px) a user scroll must land to re-engage
   * follow-at-end. This is the RE-ENGAGE condition only — disengaging is
   * upward movement past it. Default 24 matches the value shipped by a
   * production chat transcript; TanStack Virtual's chat mode uses 1px and
   * Legend List 10% of the viewport, so the useful range is wide. Too tight
   * and a user who stops "visually at the bottom" (trackpad inertia,
   * fractional row heights, page zoom) silently stops following while
   * output grows below them.
   */
  endThreshold?: number;
  overscanTop?: number;
  overscanBottom?: number;
  /** Own-container mode only. */
  style?: React.CSSProperties;
  /** Own-container mode only. */
  className?: string;
}

type AnchorMode = {kind: 'anchor'; key: string; viewportOffset: number};

type Mode = {kind: 'end'; distance: number} | AnchorMode;

type Win = {start: number; end: number};

type Geo = {
  offsets: number[];
  total: number;
  keys: string[];
  index: Map<string, number>;
};

type Bucket = {sum: number; count: number; eff: number};

export function ChatVirtualizer<T>(
  props: ChatVirtualizerProps<T>,
): React.ReactNode {
  const {
    data,
    keyExtractor,
    renderItem,
    estimatedItemSize = 120,
    measureMode = 'ro',
    apiRef,
    getItemType,
    scrollElement,
    endThreshold = 24,
    overscanTop = 1600,
    overscanBottom = 600,
    style,
    className,
  } = props;

  const ownScrollerRef = React.useRef<HTMLDivElement | null>(null);
  const attachMode = scrollElement !== undefined;
  // CLOSURE DISCIPLINE (canonical statement): the machinery is plain
  // render-scope functions, so same-commit callers always see live props;
  // everything created ONCE and outliving renders — the ResizeObserver
  // callback, the imperative handle, the rAF retry — must go through a
  // live ref (syncRef and the prop mirrors below) instead of its birth
  // closure. A violation froze attach mode for a memoized consumer on the
  // first render's null scroller (geometry stuck on estimates forever).
  const scrollElementRef = React.useRef(scrollElement);
  scrollElementRef.current = scrollElement;
  const overscanTopRef = React.useRef(overscanTop);
  overscanTopRef.current = overscanTop;
  const overscanBottomRef = React.useRef(overscanBottom);
  overscanBottomRef.current = overscanBottom;
  // Single accessor so every pass reads the live element in either mode.
  // In attach mode a pending (null) element makes every pass bail rather
  // than falling back to the own container.
  const getScroller = (): HTMLElement | null =>
    scrollElementRef.current !== undefined
      ? scrollElementRef.current
      : ownScrollerRef.current;
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const spacerTopRef = React.useRef<HTMLDivElement | null>(null);
  const spacerBottomRef = React.useRef<HTMLDivElement | null>(null);
  const rowEls = React.useRef(new Map<string, HTMLDivElement>());
  const sizes = React.useRef(new Map<string, number>());
  const geo = React.useRef<Geo>({
    offsets: [],
    total: 0,
    keys: [],
    index: new Map(),
  });
  const mode = React.useRef<Mode>({kind: 'end', distance: 0});
  // Echo-matching instead of a time window: we record the exact value we
  // wrote; a scroll event only counts as "ours" if scrollTop matches it.
  // A time gate would swallow real user scrolls arriving within the window,
  // leaving a stale anchor that the next restore then fights (double-writer).
  const progTarget = React.useRef<number | null>(null);
  // Which regime scrollTop is in: USER-DRIVEN (a non-echo scroll event was
  // the latest movement — the live-anchor refresh may re-derive identity
  // from scrollTop every pass, covering the events-lag-rAF staleness) or
  // MACHINE-DRIVEN (a declaration was issued and the user has not scrolled
  // since — the stored identity is the truth and refresh must hold off).
  // A regime, not a one-shot: at high scroll speeds several correction
  // passes run between two scroll events, and clearing per pass re-created
  // the staleness class mid-gesture (measured: 5.2% jitter at 60px steps).
  const userScrolledRef = React.useRef(false);
  // Last scrollTop observed by a scroll event, and the px the user has moved
  // away from where the machinery last placed them — the end→anchor decision
  // runs on the latter (see onScroll).
  const lastEventST = React.useRef<number | null>(null);
  const lastUserEventT = React.useRef(0);
  const userAway = React.useRef(0);
  const geoChanged = React.useRef(false);
  const rafRetry = React.useRef<number | null>(null);
  const prevScrollerRef = React.useRef<HTMLElement | null>(null);
  // ---- Touch write-gate --------------------------------------------------
  // While a gesture owns the viewport (finger down, plus the settle window
  // after lift-off) the machinery writes no scrollTop at all: near the bottom,
  // per-event restores erase a slow drag's displacement faster than it
  // accumulates, and a write during momentum cancels the fling. Nothing is
  // queued as a ledger — the reference frame is declarative, so the flush is
  // one ordinary syncAndRestore from the re-stated mode.
  //
  // Phases: 'idle' → 'down' → 'settling' (lifted, momentum may still run) →
  // 'idle'. One value, not two booleans: the gate is exactly "not idle".
  const gesturePhase = React.useRef<'idle' | 'down' | 'settling'>('idle');
  const touchSettleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Timestamp of the last scroll event of ANY origin during the gesture —
  // the settle clock, which must include momentum's own scrolls.
  const lastGestureScrollT = React.useRef(0);
  // Did the USER move the viewport this gesture? Only non-echo scrolls count.
  // Kept apart from the clock above because a browser clamp (a spacer shrink
  // near the bottom) is movement for settling purposes but is NOT intent:
  // treating it as such let a plain tap mid-stream re-judge follow against a
  // distance the stream itself had grown, and silently disengage.
  const gestureMoved = React.useRef(false);
  const gestureHeld = (): boolean => gesturePhase.current !== 'idle';
  // Spacer-side compensation while the gate holds. Rows measuring in during a
  // drag land their (real - estimate) deltas in the geometry, and with
  // scrollTop untouchable the content would crawl under the finger. Document
  // flow gives a second knob a transform-positioned virtualizer lacks: the TOP
  // SPACER absorbs the delta instead — each pass re-anchors the row at the
  // viewport top across the recompute and rolls the difference in here, so
  // on-screen positions stay invariant with zero scrollTop writes. The flush
  // folds it into the adopted anchor and zeroes it in the same atomic pass.
  const gestureAdj = React.useRef(0);
  // Convergence protection (generalized from a one-shot landing flag):
  // whenever a declarative target is set (mount landing, or any imperative
  // scrollTo*), the list is "converging" — scroll events may not flip the
  // mode (bootstrap writes and transient clamps would otherwise read as
  // user scrolls and hijack the target mid-flight), and every pass keeps
  // retrying until the target is reached. Only INTENT signals (wheel/touch,
  // not scroll effects — those mix in our own writes) break it early.
  const converging = React.useRef(true);
  // Prices hold still while a declared target is in flight: the destination is
  // an offset in the geometry, and repricing mid-flight moves it out from under
  // the target. The release gets a rAF pass of its own, so whatever the
  // averages then owe is derived from a settled geometry rather than appended
  // to the pass that just landed. (LegendList snapshots the averages for the
  // duration of a programmatic scroll; virtua reprices once and returns the
  // displacement for the caller to apply as a jump. The invariant all of them
  // hold is that a price move and its position correction are one step.)
  const priceFreeze = React.useRef(true);
  const rafRelease = React.useRef<number | null>(null);
  const [win, setWin] = React.useState<Win>({start: 0, end: -1});
  const winRef = React.useRef(win);
  winRef.current = win;
  const dataRef = React.useRef(data);
  dataRef.current = data;
  const measureModeRef = React.useRef(measureMode);
  measureModeRef.current = measureMode;
  const endThresholdRef = React.useRef(endThreshold);
  endThresholdRef.current = endThreshold;

  // Running average of everything measured so far. A static estimate that
  // undershoots makes the bottom RECEDE while scrolling toward it: each cold
  // row that mounts adds (real - est) px of newly discovered distance, faster
  // than a mouse wheel can close it. Once samples exist they price unmeasured
  // rows, so mounting a cold row discovers ~nothing. An estimatedItemSize
  // FUNCTION is authoritative and never overridden — the consumer knows more
  // than an average does. Averages accumulate per item type when getItemType
  // is given, plus a global cold-start bucket, but the EFFECTIVE price is
  // gated: hysteresis, never while converging, only in scroll-quiet, and every
  // move marks the geometry dirty (see effectiveAvg).
  const bucketsRef = React.useRef(new Map<string, Bucket>());
  const typeByKey = React.useRef(new Map<string, string>());
  const bucket = (t: string): Bucket => {
    let b = bucketsRef.current.get(t);
    if (!b) {
      bucketsRef.current.set(t, (b = {sum: 0, count: 0, eff: 0}));
    }
    return b;
  };
  const noteMeasured = (
    key: string,
    prev: number | undefined,
    px: number,
  ): void => {
    for (const t of [GLOBAL_BUCKET, typeByKey.current.get(key)]) {
      if (t === undefined) {
        continue;
      }
      const b = bucket(t);
      if (prev === undefined) {
        b.sum += px;
        b.count += 1;
      } else {
        b.sum += px - prev;
      }
    }
  };
  // A bucket's effective price INITIALIZES from the inherited baseline (the
  // global average, or the static estimate), so a type first encountered
  // mid-scroll is not a cliff — zero-initialized buckets made the first
  // per-type pricing a mass repricing event.
  // READ ONLY. Whether a price MOVES is decided once per pass, in
  // repriceBuckets — never here, which runs per row.
  const effectiveAvg = (t: string, baseline: number): number => {
    const b = bucketsRef.current.get(t);
    return !b || b.count === 0 || b.eff === 0 ? baseline : b.eff;
  };

  // ONE repricing decision per pass, taken before the geometry is rebuilt, so
  // a pass always prices every row from the same set of numbers.
  //
  // This used to live inside effectiveAvg — inside recompute's O(N) row loop —
  // and one of its gates is a CLOCK READING. A loop long enough to straddle the
  // instant that gate opens repriced the tail of the list and not the head: the
  // pass published a geometry that was internally inconsistent, restored
  // scrollTop against it, and consumed geoChanged, so the next pass — the one
  // holding the consistent geometry — found the flag clear and never wrote. The
  // odds scale with loop length, and the gate re-crosses 250ms after every
  // gesture, so it is a size-amplified race rather than a large-list-only bug.
  const repriceBuckets = (): void => {
    if (typeof estimatedItemSize === 'function') {
      return; // a function estimate is authoritative — nothing to reprice
    }
    if (converging.current || priceFreeze.current) {
      return;
    }
    // Sampled ONCE per pass, and only while scrolling is QUIET: a repricing
    // event moves every unmeasured offset at once, so landing it mid-scroll
    // costs a frame of up-to-step-size deviation. A quarter second of silence
    // defers the same correction into frames nobody is watching. (Streams
    // reprice freely — machinery echoes are not user events.)
    const quiet = performance.now() - lastUserEventT.current > 250;
    // Shrinkage toward the inherited baseline: the baseline counts as
    // PRIOR_SAMPLES virtual samples, so a young bucket's mean is mostly
    // baseline and the data takes over smoothly as samples accumulate.
    const settle = (b: Bucket | undefined, baseline: number): number => {
      if (!b || b.count === 0) {
        return baseline;
      }
      const raw =
        (b.sum + PRIOR_SAMPLES * baseline) / (b.count + PRIOR_SAMPLES);
      if (b.eff === 0) {
        b.eff = baseline > 0 ? baseline : raw;
      }
      if (quiet && Math.abs(raw - b.eff) > b.eff * 0.1) {
        b.eff = raw;
        geoChanged.current = true;
      }
      return b.eff;
    };
    // Global first: it is the baseline every type bucket shrinks toward, so it
    // has to settle before they read it.
    const global = settle(
      bucketsRef.current.get(GLOBAL_BUCKET),
      estimatedItemSize,
    );
    if (getItemType) {
      for (const [t, b] of bucketsRef.current) {
        if (t !== GLOBAL_BUCKET) {
          settle(b, global);
        }
      }
    }
  };
  const estOf = (item: T, i: number): number => {
    if (typeof estimatedItemSize === 'function') {
      return estimatedItemSize(item, i);
    }
    const global = effectiveAvg(GLOBAL_BUCKET, estimatedItemSize);
    return getItemType ? effectiveAvg(getItemType(item, i), global) : global;
  };

  const recompute = (): void => {
    const d = dataRef.current;
    const offsets = new Array<number>(d.length);
    const keys = new Array<string>(d.length);
    let y = 0;
    const index = new Map<string, number>();
    for (let i = 0; i < d.length; i++) {
      // String coercion is part of the key contract: the RO pipeline reads
      // keys back from dataset.pkey (always a string), so a number key would
      // split the size cache in two — the RO copy under the string, the sync
      // copy under the number — and every RO re-measure would feed the
      // averages as a fresh sample. Coercing at both derivation points keeps
      // every internal map keyed consistently.
      keys[i] = String(keyExtractor(d[i], i));
      index.set(keys[i], i);
      offsets[i] = y;
      y += sizes.current.get(keys[i]) ?? estOf(d[i], i);
    }
    geo.current = {offsets, total: y, keys, index};
  };

  // index of the last row whose offset <= y
  const indexAt = (y: number): number => {
    const {offsets} = geo.current;
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= y) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  };

  const computeWindow = (el: HTMLElement, desiredTop?: number): Win => {
    const g = geo.current;
    if (g.keys.length === 0) {
      return {start: 0, end: -1};
    }
    const top = (desiredTop ?? el.scrollTop) - paintOrigin();
    const start = indexAt(Math.max(0, top - overscanTopRef.current));
    const bottomEdge = top + el.clientHeight + overscanBottomRef.current;
    // When the query reaches past the content, include the last row by
    // construction instead of by binary search: a zero-height final row sits
    // AT total, which the search (offsets[i] <= total - 1) can never select.
    const end = bottomEdge >= g.total ? g.keys.length - 1 : indexAt(bottomEdge);
    return {start, end};
  };

  const setWindowIfChanged = (next: Win): void => {
    const cur = winRef.current;
    if (next.start !== cur.start || next.end !== cur.end) {
      geoChanged.current = true;
      setWin(next);
    }
  };

  // Size both spacers so the mounted window occupies its true place in the
  // scroll range, under whatever geometry is current, and move the content
  // block's floor (contentStyle) to the extent that geometry describes.
  const writeSpacers = (w: Win): void => {
    const g = geo.current;
    const empty = w.end < w.start || g.offsets.length === 0;
    // gestureAdj shifts the whole window block without touching scrollTop
    // (0 outside a touch gesture). Clamped at the very top of the list —
    // there is no spacer left to absorb into there.
    const top = empty
      ? 0
      : Math.max(0, g.offsets[w.start] + gestureAdj.current);
    const belowEnd = empty
      ? 0
      : w.end + 1 < g.offsets.length
        ? g.offsets[w.end + 1]
        : g.total;
    const write = (
      ref: React.RefObject<HTMLDivElement | null>,
      prop: 'height' | 'minHeight',
      px: number,
    ): void => {
      if (ref.current) {
        ref.current.style[prop] = `${px}px`;
      }
    };
    write(spacerTopRef, 'height', top);
    write(spacerBottomRef, 'height', Math.max(0, g.total - belowEnd));
    // The extent these spacers describe: the model total, plus whatever the
    // top spacer carries beyond its model offset (the gesture adjustment,
    // after the clamp at the very top).
    write(
      contentRef,
      'minHeight',
      empty ? g.total : g.total + top - g.offsets[w.start],
    );
  };

  // Where a row identity + viewport offset puts scrollTop under the current
  // geometry, and the reverse: the anchor for whatever is at a scroll offset.
  const anchorAt = (scrollTop: number): Mode => {
    const g = geo.current;
    const y = scrollTop - paintOrigin();
    const idx = indexAt(y);
    return {
      kind: 'anchor',
      key: g.keys[idx],
      viewportOffset: g.offsets[idx] - y,
    };
  };

  // The same reference frame, MEASURED instead of derived. anchorAt's
  // `offsets[idx] - y` IS the anchored row's painted top, but only while
  // painted == model + gestureAdj holds — and the top spacer clamps at 0 when
  // there is nothing above to absorb into, leaving every derived position
  // wrong by the difference. Reading the row's real rect skips the broken map.
  // Same row anchorAt would pick; null when nothing is rendered.
  const anchorFromPaint = (el: HTMLElement): AnchorMode | null => {
    const g = geo.current;
    const box = el.getBoundingClientRect();
    const h = el.clientHeight;
    let best: AnchorMode | null = null;
    for (const [key, rowEl] of rowEls.current) {
      if (!rowEl.isConnected || !g.index.has(key)) {
        continue;
      }
      const r = rowEl.getBoundingClientRect();
      const top = r.top - box.top;
      if (r.bottom - box.top <= 0 || top >= h) {
        continue;
      }
      if (best === null || top < best.viewportOffset) {
        best = {kind: 'anchor', key, viewportOffset: top};
      }
    }
    return best;
  };

  // Scroll offset at which our content starts. Zero when we own the scroller;
  // in attach mode the caller's container can put padding, a header or a
  // sticky region above us, and every offset in `geo` is relative to our first
  // spacer rather than to the scroll box.
  const originRef = React.useRef(0);
  // Content the caller renders BELOW our block (a docked composer's
  // overflow, say: a scroller that deliberately overflows by the composer
  // height so the tail can scroll clear of it). End mode must scroll past
  // it, or the last message parks underneath the overlay (measured:
  // constant 174px).
  const belowRef = React.useRef(0);
  const measureOrigin = (el: HTMLElement): number => {
    if (scrollElementRef.current == null) {
      // Own container: the content starts at the scroll box and nothing
      // follows it. Stated rather than skipped — a list switched back from
      // attach mode would otherwise keep the host's header and dock offsets
      // and aim every target past the end of its own scroller.
      originRef.current = 0;
      belowRef.current = 0;
      return 0;
    }
    const top = spacerTopRef.current;
    if (!top) {
      return originRef.current;
    }
    originRef.current =
      top.getBoundingClientRect().top -
      el.getBoundingClientRect().top +
      el.scrollTop;
    belowRef.current = Math.max(
      0,
      el.scrollHeight - originRef.current - geo.current.total,
    );
    return originRef.current;
  };
  // Where the model's zero sits ON SCREEN. Identical to the origin except
  // while the touch write-gate holds, when the top spacer carries an extra
  // offset (gestureAdj) that shifts every painted position. Converting
  // through this one function keeps painted space and model space from ever
  // being mixed: anchors read scrollTop through it, targets write back
  // through it.
  const paintOrigin = (): number => originRef.current + gestureAdj.current;

  // Desired scrollTop for a reference frame, clamped to the scrollable range.
  // null when the anchored row no longer exists in the data.
  const targetFor = (m: Mode, el: HTMLElement): number | null => {
    const g = geo.current;
    const origin = paintOrigin();
    let raw;
    const below = belowRef.current;
    if (m.kind === 'end') {
      raw = origin + g.total + below - el.clientHeight - m.distance;
    } else {
      const idx = g.index.get(m.key) ?? -1;
      if (idx < 0) {
        return null;
      }
      raw = origin + g.offsets[idx] - m.viewportOffset;
    }
    return Math.max(
      0,
      Math.min(raw, origin + g.total + below - el.clientHeight),
    );
  };

  // The single correction pass: spacers(old geo) -> measure -> recompute ->
  // spacers(new geo) -> restore.
  const syncAndRestore = (): void => {
    const el = getScroller();
    if (!el) {
      return;
    }
    const entryScrollTop = el.scrollTop;
    // Phase 0 — spacers FIRST, from the pre-measure geometry: a window-shift
    // commit swaps rows before the layout effect runs, so the first forced
    // layout below would otherwise place the new rows against stale spacers
    // — every origin and anchor read off it wrong by the swapped rows'
    // height. (The extent itself cannot collapse meanwhile: the content
    // block's floor holds it, see contentStyle.) Style writes don't force
    // layout, so the spacers are consistent BEFORE the first read.
    writeSpacers(winRef.current);
    measureOrigin(el);
    // Refresh the anchor from the LIVE scrollTop against the pre-measure
    // geometry (= what's currently painted). scroll events lag rAF-driven
    // scrolls by a frame; scrollTop itself is ground truth, so deriving the
    // anchor here removes that staleness class entirely.
    if (
      mode.current.kind === 'anchor' &&
      // Re-derive the anchor from the live scrollTop ONLY when scrollTop's
      // latest movement was user-authored. That is the staleness this refresh
      // exists for (scroll events lag rAF scrolls by a frame). When the
      // machinery moved last — a declared anchorToKey landing, a restore, an
      // average repricing — the stored identity is the truth and scrollTop
      // may be mid-correction: re-deriving from it replaced a declared
      // {key, 0} with the neighbouring row at the repricing delta
      // (measured: deterministic 44px landing error).
      userScrolledRef.current &&
      !converging.current &&
      geo.current.keys.length > 0
    ) {
      mode.current = anchorAt(el.scrollTop);
    }
    // 'sync' re-measures the whole window every commit. 'ro' only measures
    // rows it has never seen — the first-mount backstop: an UNMEASURED row is
    // about to paint at its real height while the geometry still carries its
    // estimate, and in document flow that displaces everything below it (the
    // whole viewport) by (real - est) for one frame, then snaps back when RO
    // delivers. Measuring ONCE at mount closes that; growth and reflow of
    // known rows stay on the RO pipeline, so steady-state commits force no
    // layout at all.
    const remeasureAll = measureModeRef.current === 'sync';
    for (const [key, rowEl] of rowEls.current) {
      if (!remeasureAll && sizes.current.has(key)) {
        continue;
      }
      const px = rowEl.offsetHeight;
      // Never record 0: a row measured while transiently EMPTY (a streaming
      // reply's first commit) would otherwise pin offsets[last] == total,
      // which no bottom-edge query can reach — the row is evicted from the
      // window and, unmounted, can never be re-measured. Deadlock, measured:
      // the streamed reply never rendered at all. Keeping the estimate keeps
      // the row reachable until it has real height.
      if (px === 0) {
        continue;
      }
      const prev = sizes.current.get(key);
      if (prev !== px) {
        noteMeasured(key, prev, px);
        sizes.current.set(key, px);
        geoChanged.current = true;
      }
    }
    // While the write-gate holds, the correction this pass would have written
    // to scrollTop goes into the spacer instead. Anchor to whatever is at the
    // viewport top BEFORE the recompute (identity, so a long momentum keeps
    // re-anchoring to what is on screen now), then absorb the resulting
    // target delta: painted positions come out bit-identical, with no
    // scrollTop write to cancel momentum or fight the finger.
    const heldAnchor =
      gestureHeld() && geo.current.keys.length > 0
        ? anchorAt(el.scrollTop)
        : null;
    repriceBuckets();
    recompute();
    if (heldAnchor !== null) {
      const t = targetFor(heldAnchor, el);
      if (t !== null) {
        gestureAdj.current -= t - el.scrollTop;
      }
    }
    writeSpacers(winRef.current);

    // restore scrollTop from the stored reference frame
    if (converging.current) {
      geoChanged.current = true;
    }
    let target = targetFor(mode.current, el);
    // Dead-anchor fallback: a null target means the anchored key is not in
    // the data — an anchorToKey to a missing key, or the anchored row left
    // with a thread switch / history replacement. Convergence could never
    // exit (it only exits by reaching a target, and its gate keeps ignoring
    // scroll events — scrollbar and keyboard could not recover), and a
    // parked dead anchor would neither follow nor restore until the next
    // gesture. Fall back to follow-at-end, the chat default.
    if (target === null) {
      converging.current = false;
      if (dataRef.current.length > 0) {
        mode.current = {kind: 'end', distance: 0};
        userAway.current = 0;
        geoChanged.current = true;
        target = targetFor(mode.current, el);
      }
    }
    if (target !== null && geoChanged.current && !gestureHeld()) {
      geoChanged.current = false;
      if (Math.abs(el.scrollTop - target) > 0.5) {
        el.scrollTop = target;
        // Read back: the browser may clamp the write if the spacer resize
        // hasn't reached layout yet. The echo target must be the ACTUAL
        // landing value (otherwise our own clamped write is misread as a
        // user scroll and flips the mode), and a clamp marks the geometry
        // dirty again with a next-frame retry until the write sticks.
        const actual = el.scrollTop;
        progTarget.current = actual;
        if (Math.abs(actual - target) > 1) {
          geoChanged.current = true;
          // One retry slot: consecutive clamped writes coalesce, and unmount
          // cancels it (a post-unmount pass would setWin on a dead tree).
          if (rafRetry.current !== null) {
            cancelAnimationFrame(rafRetry.current);
          }
          rafRetry.current = requestAnimationFrame(() => {
            rafRetry.current = null;
            syncRef.current();
          });
        }
      }
    }
    if (
      converging.current &&
      target !== null &&
      dataRef.current.length > 0 &&
      Math.abs(el.scrollTop - target) <= CONVERGE_EPSILON_PX
    ) {
      // Reaching the target does not end a HEAD-CHANGE convergence: the rows
      // that arrived above are still measuring in, so the prices and the
      // offsets keep moving for several more passes. Both halves of the
      // protection therefore lift on the SAME later pass — one that sees the
      // settled numbers. Releasing the anchor half here instead let the
      // live-anchor refresh re-derive from a scrollTop still mid-settle and
      // freeze that intermediate position as the new reference frame
      // (measured: a 300-row prepend read at the top moved the reader 33-53px
      // and kept it, every time).
      if (priceFreeze.current) {
        if (rafRelease.current !== null) {
          cancelAnimationFrame(rafRelease.current);
        }
        rafRelease.current = requestAnimationFrame(() => {
          rafRelease.current = null;
          converging.current = false;
          priceFreeze.current = false;
          geoChanged.current = true;
          syncRef.current();
        });
      } else {
        converging.current = false;
      }
    }
    // The window must cover the DESIRED position, not the stale scrollTop:
    // in end mode a newly appended tail row would otherwise never enter the
    // window and its growth stay invisible to the geometry; for a declared
    // anchor it is what renders the destination before the position lands.
    // While the write-gate holds, the viewport belongs to the finger — the
    // desired target is not going to be written, so the window tracks the
    // ACTUAL position (rows must keep mounting under the drag).
    setWindowIfChanged(
      computeWindow(
        el,
        target === null || gestureHeld() ? el.scrollTop : target,
      ),
    );
    // Entry/exit claim: if scrollTop moved during this pass — by our write OR
    // by a SILENT BROWSER CLAMP during a transient layout (spacers not yet
    // caught up with a window shift, an estimate replaced by a smaller
    // measured size) — the movement is machinery-induced, and the coalesced
    // scroll event that dispatches next frame will carry the CURRENT value.
    // Claim it, or that event is misread as a user scroll and hijacks the
    // mode. User input cannot move scrollTop inside synchronous JS
    // (compositor scrolls land at frame boundaries), so this never swallows
    // a real gesture.
    if (el.scrollTop !== entryScrollTop) {
      progTarget.current = el.scrollTop;
    }
  };
  // Latest-pass ref for once-created callers (see CLOSURE DISCIPLINE).
  const syncRef = React.useRef(syncAndRestore);
  syncRef.current = syncAndRestore;

  // Data identity change (append / chunk growth) also invalidates geometry.
  const prevData = React.useRef(data);
  if (prevData.current !== data) {
    prevData.current = data;
    geoChanged.current = true;
    // HEAD CHANGE (loading older history, or trimming it). Rows arrived above
    // everything placed, so the restore owes a correction the size of the whole
    // page, paid across several passes as those rows measure in. That is a
    // CONVERGENCE, and treating it as one stops the live-anchor refresh from
    // re-deriving the anchor from a scrollTop still mid-flight — which
    // otherwise freezes the intermediate position as the new anchor, for good.
    // Cannot wedge: every gesture path already clears `converging`.
    const head = data.length > 0 ? String(keyExtractor(data[0], 0)) : null;
    if (
      head !== null &&
      geo.current.keys.length > 0 &&
      geo.current.keys[0] !== head
    ) {
      converging.current = true;
      priceFreeze.current = true;
    }
  }

  // Runs after EVERY commit — this is the pre-paint correction slot. (No
  // separate initial-landing effect: this pass computes the window from the
  // declared target on the same commits, attach arrival included.)
  React.useLayoutEffect(() => {
    syncAndRestore();
  });

  // In 'sync' mode the RO is only a backstop for out-of-commit size changes
  // (images, fonts). In 'ro' mode it IS the measurement pipeline: sizes come
  // from the observed border-box (no forced layout anywhere).
  const roRef = React.useRef<ResizeObserver | null>(null);
  if (roRef.current === null && typeof ResizeObserver !== 'undefined') {
    roRef.current = new ResizeObserver(entries => {
      for (const entry of entries) {
        const key = (entry.target as HTMLElement).dataset.pkey;
        if (key === undefined) {
          // The scroll CONTAINER (observed in the listener effect): its
          // resize changes clientHeight, which moves the end-mode target and
          // the window coverage with zero row-size changes — without marking
          // the geometry dirty here, a window resize or a growing composer
          // would leave the pinned bottom stranded.
          geoChanged.current = true;
          continue;
        }
        if (measureModeRef.current !== 'ro') {
          continue;
        }
        // Border box, the same box the sync path reads with offsetHeight —
        // one cache, one definition of a row's size. contentRect is NOT that
        // box (it drops padding and border), so a padded row would be cached
        // short for as long as the fallback is the writer.
        const px =
          entry.borderBoxSize?.[0]?.blockSize ??
          (entry.target as HTMLElement).offsetHeight;
        const prev = sizes.current.get(key);
        if (px > 0 && prev !== px) {
          noteMeasured(key, prev, px);
          sizes.current.set(key, px);
          geoChanged.current = true;
        }
      }
      syncRef.current();
    });
  }
  React.useEffect(
    () => () => {
      roRef.current?.disconnect();
      if (rafRetry.current !== null) {
        cancelAnimationFrame(rafRetry.current);
      }
      if (rafRelease.current !== null) {
        cancelAnimationFrame(rafRelease.current);
      }
    },
    [],
  );

  // A DECLARATION re-points the reference frame and lets the restore loop
  // converge: machine-driven regime, displacement cleared, protected from
  // mode flips until reached. The window is computed from the declared
  // target first, so the destination renders before the position lands
  // (committed semantics; no blank flash on long jumps).
  const declare = (m: Mode): void => {
    mode.current = m;
    priceFreeze.current = true;
    userScrolledRef.current = false;
    userAway.current = 0;
    converging.current = true;
    geoChanged.current = true;
    syncRef.current(); // captured by the once-created handle: live ref
  };

  // Imperative API — both methods are declarations, not scroll actions.
  // useImperativeHandle so a discarded concurrent render cannot repoint the
  // handle; created once, reads only refs (see CLOSURE DISCIPLINE).
  React.useImperativeHandle(
    apiRef,
    () => ({
      scrollToDistanceFromBottomPx: (px = 0) =>
        declare({kind: 'end', distance: px}),
      anchorToKey: (key, viewportOffset = 0) =>
        declare({kind: 'anchor', key: String(key), viewportOffset}),
    }),
    [],
  );

  const onScroll = (): void => {
    const el = getScroller();
    if (!el) {
      return;
    }
    // The position the machinery last WROTE, kept before the echo slot is
    // cleared below: the user's displacement is measured from there, not
    // from the last event seen. A wheel that lands between two of our
    // writes coalesces with the next write into one event carrying the net,
    // and against the previous event's value that net can still read as
    // "moved down" — the user's own upward step erased by the re-pin.
    const lastWrite = progTarget.current;
    const isEcho =
      lastWrite !== null && Math.abs(el.scrollTop - lastWrite) <= 1;
    // STICKY echo: k offset changes within one frame queue up to k scroll
    // events, dispatched across successive frames, EACH reading the same
    // final scrollTop. A consume-once slot matches the first and misreads
    // every duplicate as a user scroll. Keep the expectation while events
    // match; only a NON-matching event (a real user scroll) clears it.
    if (!isEcho) {
      progTarget.current = null;
      userScrolledRef.current = true;
      lastUserEventT.current = performance.now();
    }
    const prevEventST = lastEventST.current;
    lastEventST.current = el.scrollTop;
    if (gestureHeld()) {
      lastGestureScrollT.current = performance.now();
      if (!isEcho) {
        gestureMoved.current = true;
      }
    }
    if (!isEcho && !converging.current) {
      const g = geo.current;
      const dist = el.scrollHeight - el.clientHeight - el.scrollTop;
      // With native anchoring off, the one move the browser still makes on
      // its own is the clamp onto a new, smaller bottom (a row shrinking in
      // a way no commit announced — an image, a font). It lands exactly on
      // the bottom, where a user scrolling up never lands, so it is not
      // displacement.
      const landedAtBottom = dist < 1;
      const anchorHere = (): void => {
        mode.current = anchorAt(el.scrollTop);
        userAway.current = 0;
      };
      if (g.keys.length === 0) {
        mode.current = {kind: 'end', distance: 0};
        userAway.current = 0;
      } else if (mode.current.kind === 'end') {
        // DISENGAGE is judged on the user's own displacement, never on the
        // absolute distance to the bottom: while following, the tail grows
        // between corrections, so the live distance carries machinery
        // movement the user did not make (measured: 6-24px nudges reading as
        // 25-59px, flipping to anchor and stranding the reader mid-stream).
        // Accumulating means a slow, persistent upward scroll still wins even
        // when each individual step is erased by a re-pin.
        const from = lastWrite ?? prevEventST;
        if (from !== null && !landedAtBottom) {
          userAway.current = Math.max(
            0,
            userAway.current + (from - el.scrollTop),
          );
        }
        if (userAway.current > endThresholdRef.current) {
          anchorHere();
        }
      } else if (dist <= endThresholdRef.current) {
        // RE-ENGAGE is judged on the absolute distance, which IS honest in
        // anchor mode: nothing is pulling the viewport, so reaching the
        // bottom is the user's own doing.
        mode.current = {kind: 'end', distance: 0};
        userAway.current = 0;
      } else {
        anchorHere();
      }
    }
    setWindowIfChanged(computeWindow(el));
  };

  // The listener is attached once per scroll element but the handler is read
  // live, so it never closes over a stale render's props.
  const onScrollRef = React.useRef(onScroll);
  onScrollRef.current = onScroll;

  // Listeners are attached imperatively rather than through JSX so both modes
  // take the same path, and so attach mode can also turn OFF the browser's own
  // scroll anchoring on a container it does not render: native anchoring picks
  // its own anchor node and adjusts scrollTop underneath us, which is exactly
  // the job this list is doing from its own reference frame.
  React.useEffect(() => {
    const el = getScroller();
    if (!el) {
      return;
    }
    // A REPLACED scroller (not the first arrival) carries none of the old
    // one's scroll state: a stale lastEventST would difference two unrelated
    // scrollTops into a phantom user displacement (instant spurious unpin),
    // and a stale echo expectation could swallow the first real event.
    if (prevScrollerRef.current !== null && prevScrollerRef.current !== el) {
      lastEventST.current = null;
      userAway.current = 0;
      progTarget.current = null;
    }
    prevScrollerRef.current = el;
    // Intent signals break convergence early: wheel/touchstart are USER INPUT,
    // unlike scroll events, which mix in our own writes and clamps.
    //
    // A wheel does NOT unpin by itself. One this scroller never consumes —
    // over a nested scroller with room above, over one with
    // `overscroll-behavior: contain`, an overscroll at the bottom — moves
    // nothing here, and unpinning on it strands the reader off the tail.
    // Whether the container moved is what onScroll measures, against the
    // position the machinery last wrote, so a wheel the next write outruns
    // still shows there.
    const onWheel = (): void => {
      converging.current = false;
      priceFreeze.current = false;
    };
    // Touch write-gate state machine (see gesturePhase for why it exists).
    // touchstart is also an INTENT signal and breaks convergence, the way a
    // wheel event does; touchcancel is the system-gesture exit (an edge
    // swipe, an incoming call) and must release the gate like a touchend, or
    // it holds forever.
    const clearSettleTimer = (): void => {
      if (touchSettleTimer.current !== null) {
        clearTimeout(touchSettleTimer.current);
        touchSettleTimer.current = null;
      }
    };
    const flushGesture = (): void => {
      touchSettleTimer.current = null;
      // Engines report scrollHeight as at least clientHeight, so this is
      // never negative in practice (verified in both) — clamped anyway to
      // hold the same invariant targetFor does.
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      // Two ways the gesture is not over yet, both retried by polling:
      // momentum is still running (no touch events accompany it, so silence
      // is the only signal), or the list is inside an elastic overscroll,
      // where a write snaps the bounce onto the clamp and discards where the
      // user actually let go.
      const coasting =
        performance.now() - lastGestureScrollT.current < TOUCH_SETTLE_MS;
      const bouncing = el.scrollTop < 0 || el.scrollTop > max + 1;
      if (coasting || bouncing) {
        touchSettleTimer.current = setTimeout(flushGesture, TOUCH_SETTLE_MS);
        return;
      }
      gesturePhase.current = 'idle';
      // Re-state the reference frame from the resting position. Whether the
      // gesture MOVED decides the semantics only: a real scroll re-judges
      // follow against the bottom edge, while a plain tap keeps the mode it
      // had — the distance grew under the gate with no writes, and re-judging
      // would read that machinery growth as a user pushing away.
      //
      // The re-statement is UNCONDITIONAL, because it is also what hands the
      // gesture adjustment back: the stored viewportOffset is where the
      // anchored row actually IS, so zeroing the adjustment below leaves the
      // sync one balancing scrollTop write, spacers and position moving in the
      // same task. Skipping the fold on a tap dropped it on the floor instead.
      // The offset comes from the DOM (anchorFromPaint) rather than being
      // derived, so a clamped spacer cannot make the two disagree.
      if (!converging.current) {
        const atEnd = gestureMoved.current
          ? max - el.scrollTop <= endThresholdRef.current
          : mode.current.kind === 'end';
        mode.current = atEnd
          ? {kind: 'end', distance: 0}
          : (anchorFromPaint(el) ?? anchorAt(el.scrollTop));
        userAway.current = 0;
        // The fold is a MACHINE repositioning: the adjustment now lives only
        // in the folded viewportOffset, and the live-anchor refresh — which
        // re-derives from scrollTop once the adjustment is gone — would
        // erase it, dropping the balancing write while the spacers revert
        // (measured: +148px). Machine-driven regime holds the fold until the
        // user actually scrolls again.
        userScrolledRef.current = false;
      }
      gestureAdj.current = 0;
      geoChanged.current = true;
      syncRef.current();
    };
    const onTouchStart = (): void => {
      converging.current = false;
      priceFreeze.current = false;
      // A second finger landing during the settle window re-opens the same
      // gesture rather than starting a new one: the adjustment the spacer is
      // carrying belongs to a frame that has not been handed back yet.
      if (gesturePhase.current === 'idle') {
        lastGestureScrollT.current = 0;
        gestureMoved.current = false;
      }
      gesturePhase.current = 'down';
      clearSettleTimer();
    };
    const onTouchEnd = (e: Event): void => {
      // Fingers left on the glass still own the viewport — only the LAST
      // lift starts settling, or a two-finger drag would get a scrollTop
      // write under the remaining finger.
      const remaining = (e as TouchEvent).touches?.length ?? 0;
      if (gesturePhase.current !== 'down' || remaining > 0) {
        return;
      }
      gesturePhase.current = 'settling';
      touchSettleTimer.current = setTimeout(flushGesture, TOUCH_SETTLE_MS);
    };
    ensureVirtualizedStyle();
    el.setAttribute(VIRTUALIZED_ATTR, '');
    const scrollHandler = (): void => onScrollRef.current();
    el.addEventListener('scroll', scrollHandler, {passive: true});
    el.addEventListener('wheel', onWheel, {passive: true});
    el.addEventListener('touchstart', onTouchStart, {passive: true});
    el.addEventListener('touchend', onTouchEnd, {passive: true});
    el.addEventListener('touchcancel', onTouchEnd, {passive: true});
    // Observe the CONTAINER too (rows alone miss clientHeight changes): a
    // window resize or a growing composer moves the end-mode target and the
    // window coverage without any row changing size. Container entries have
    // no data-pkey — the RO callback marks the geometry dirty for them.
    roRef.current?.observe(el);
    return () => {
      el.removeAttribute(VIRTUALIZED_ATTR);
      el.removeEventListener('scroll', scrollHandler);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      // A mid-gesture unbind would strand the gate: the in-flight touch
      // keeps targeting the OLD element (implicit touch capture), so the
      // replacement never delivers the touchend that releases it. Reset the
      // whole state machine with the listeners that maintained it. The
      // adjustment is dropped rather than folded — the element carrying it
      // in its spacer is going away, and the replacement re-derives its own
      // frame from the mode on its first pass.
      clearSettleTimer();
      gesturePhase.current = 'idle';
      lastGestureScrollT.current = 0;
      gestureMoved.current = false;
      gestureAdj.current = 0;
      roRef.current?.unobserve(el);
    };
  }, [scrollElement]);

  // Stable per-key ref callbacks: an inline `(el) => …` would be a new
  // identity every render, making React detach + reattach EVERY row's ref on
  // EVERY commit — and each re-observe() fires an initial ResizeObserver
  // callback, so steady-state commits would trigger a full-window RO batch
  // of pure noise.
  const rowRefCbs = React.useRef(
    new Map<string, (el: HTMLDivElement | null) => void>(),
  );
  const rowRef = (key: string): ((el: HTMLDivElement | null) => void) => {
    let cb = rowRefCbs.current.get(key);
    if (!cb) {
      cb = el => {
        if (el) {
          rowEls.current.set(key, el);
          roRef.current?.observe(el);
        } else {
          const prev = rowEls.current.get(key);
          if (prev) {
            roRef.current?.unobserve(prev);
          }
          rowEls.current.delete(key);
          rowRefCbs.current.delete(key);
        }
      };
      rowRefCbs.current.set(key, cb);
    }
    return cb;
  };

  const children: React.ReactNode[] = [
    <div key="__top" ref={spacerTopRef} aria-hidden />,
  ];
  if (win.end >= win.start) {
    for (let i = win.start; i <= Math.min(win.end, data.length - 1); i++) {
      const key = String(keyExtractor(data[i], i));
      if (getItemType) {
        typeByKey.current.set(key, getItemType(data[i], i));
      }
      children.push(
        <div key={key} ref={rowRef(key)} data-pkey={key}>
          {renderItem({item: data[i], index: i})}
        </div>,
      );
    }
  }
  children.push(<div key="__bottom" ref={spacerBottomRef} aria-hidden />);

  const content = (
    <div ref={contentRef} style={contentStyle}>
      {children}
    </div>
  );

  if (attachMode) {
    return content;
  }

  return (
    <div
      ref={ownScrollerRef}
      className={className}
      style={{
        overflowY: 'auto',
        position: 'relative',
        ...style,
      }}>
      {content}
    </div>
  );
}
