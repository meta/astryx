// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ToastViewport.tsx
 * @input Uses React state/effects, ToastContext, content-provider boundary, useAnnounce, viewport tokens,
 *   shared layer text reset, the active modal outlet, and placement-derived motion variables
 * @output Exports the ToastViewport provider, stack, live announcement dispatch,
 *   focus handoff, safe-area-aware edge gutters, modal rehosting, and motion context
 * @position Core provider/imperative viewport for useToast()
 *
 * SYNC: When placement, stacking, hosting, focus, announcement, or safe-area
 *   behavior changes, update ToastViewport.test.tsx, Toast.doc.mjs, and Toast.stories.tsx.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {spacingVars, durationVars, easeVars} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import {getNodeText} from '../utils/getNodeText';
import {INTERACTIVE_SELECTORS} from '../hooks/useClickableContainer';
import {useAnnounce} from '../hooks/useAnnounce';
import {layerTextReset} from '../Layer/layerTextReset.stylex';
import {layerStructureReset} from '../Layer/layerStructureReset.stylex';
import {LayerContentBoundary} from '../Layer/layerScopedContext';
import {
  getActiveModalOutlet,
  subscribeModalOutlets,
  type ModalOutletChange,
} from '../Layer/modalOutlet';
import {ToastSurface} from './Toast';
import {ToastContext, type ToastContextValue} from './ToastContext';
import type {ToastEntry, ToastPosition, ToastDismissReason} from './types';
import {useTranslator} from '../i18n';
import {layerInsetProperties} from '../Layer/layerInset';
import type {LayerInset} from '../Layer/LayerContext';

const SAFE_AREA_INLINE_START = `max(${spacingVars['--spacing-4']}, env(safe-area-inset-left, 0px))`;
const SAFE_AREA_INLINE_END = `max(${spacingVars['--spacing-4']}, env(safe-area-inset-right, 0px))`;
const SAFE_AREA_BLOCK_START = `max(${spacingVars['--spacing-4']}, env(safe-area-inset-top, 0px))`;
const SAFE_AREA_BLOCK_END = `max(${spacingVars['--spacing-4']}, env(safe-area-inset-bottom, 0px))`;
const TOAST_EDGE_DRIFT = spacingVars['--spacing-2'];
const TOAST_EDGE_DRIFT_NEGATIVE = `calc(-1 * ${TOAST_EDGE_DRIFT})`;

const styles = stylex.create({
  rootOutlet: {
    display: 'contents',
  },
  viewport: {
    position: 'fixed',
    zIndex: 500,
    display: 'flex',
    boxSizing: 'border-box',
    flexDirection: 'column',
    paddingBlockStart: SAFE_AREA_BLOCK_START,
    paddingBlockEnd: SAFE_AREA_BLOCK_END,
    paddingInlineStart: {
      default: SAFE_AREA_INLINE_START,
      ':is([dir="rtl"] *)': SAFE_AREA_INLINE_END,
    },
    paddingInlineEnd: {
      default: SAFE_AREA_INLINE_END,
      ':is([dir="rtl"] *)': SAFE_AREA_INLINE_START,
    },
    pointerEvents: 'none',
    // Reset popover styles — the popover attribute puts us in the top
    // layer (above dialogs), but we don't want its default styles.
    // UA stylesheet applies background-color: Canvas, margin: auto, etc.
    inset: 'unset',
    // `width` is part of that reset: the UA gives every popover
    // `width: fit-content`, and this element is positioned by spanning the
    // inline axis (`viewportInlineSpan` sets both inset-inline edges to 0) and
    // then aligning within itself. A shrink-wrapped box cannot span, so both
    // edges cannot be honoured — the box resolves against the start edge at
    // its content width, and `align-items: flex-end` then aligns the toast to
    // the right of a box that is itself sitting on the left. Measured in
    // Chromium at 1200px wide: 438px box at x=0, end-positioned toast landing
    // at x=19.
    width: 'auto',
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  // The viewport sits at the inset the app declared on LayerProvider for a
  // bar floating over that edge (spec:AST-059 FR6); unset, each reads 0px.
  // A toast-only `inset` prop writes the same edges inline and wins.
  viewportInlineSpan: {
    insetInlineStart: 'var(--astryx-layer-inset-inline-start, 0px)',
    insetInlineEnd: 'var(--astryx-layer-inset-inline-end, 0px)',
  },
  bottomEnd: {
    bottom: 'var(--astryx-layer-inset-block-end, 0px)',
    alignItems: 'flex-end',
  },
  bottomStart: {
    bottom: 'var(--astryx-layer-inset-block-end, 0px)',
    alignItems: 'flex-start',
  },
  topEnd: {
    top: 'var(--astryx-layer-inset-block-start, 0px)',
    alignItems: 'flex-end',
    flexDirection: 'column-reverse',
  },
  topStart: {
    top: 'var(--astryx-layer-inset-block-start, 0px)',
    alignItems: 'flex-start',
    flexDirection: 'column-reverse',
  },
  toastWrapper: {
    pointerEvents: 'auto',
    display: 'grid',
    width: '100%',
    maxWidth: 400,
    minWidth: 0,
    gridTemplateRows: '1fr',
    transitionProperty: 'grid-template-rows, padding',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0.01ms',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
    '@starting-style': {
      gridTemplateRows: '0fr',
      paddingBlockEnd: 0,
    },
  },
  toastWrapperFromBottom: {
    '--_toast-slide-y': TOAST_EDGE_DRIFT,
  },
  toastWrapperFromTop: {
    '--_toast-slide-y': TOAST_EDGE_DRIFT_NEGATIVE,
  },
  // The inter-toast gap is padding on each wrapper so it collapses with the
  // grid track. The wrapper nearest the viewport edge drops that padding; the
  // child flips because top stacks use column-reverse.
  toastWrapperGap: {
    paddingBlockEnd: {default: spacingVars['--spacing-2'], ':last-child': 0},
  },
  toastWrapperGapReversed: {
    paddingBlockEnd: {default: spacingVars['--spacing-2'], ':first-child': 0},
  },
  toastWrapperExiting: {
    gridTemplateRows: '0fr',
    paddingBlockEnd: 0,
  },
  toastWrapperInner: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    minHeight: 0,
    // Clip while the grid row opens and closes so the toast reads as folding
    // into the stack. Once the entry transition settles, the companion style
    // below releases the clip so the card's shadow can paint. `hidden` works
    // in every engine and restores the exact exit paint/hit boundary that the
    // viewport shipped with before the shadow fix.
    overflow: 'hidden',
  },
  toastWrapperInnerSettled: {
    overflow: 'visible',
  },
});

export interface ToastViewportProps {
  position?: ToastPosition;
  /** Maximum number of visible toasts. @default 5 */
  maxVisible?: number;
  inset?: {top?: number; bottom?: number; start?: number; end?: number};
  /**
   * The app-declared viewport inset from LayerProvider (spec:AST-059 FR6).
   * The viewport sits at it on each edge unless `inset` overrides that edge.
   */
  layerInset?: LayerInset;
  /**
   * Promote viewport to CSS top layer via popover="manual". While a Dialog
   * is open, the viewport moves into the latest one so toasts stay visible
   * and clickable above it. Set to false to render in place, e.g. a viewport you mount
   * inside your own top-layer element.
   * @default true
   */
  isTopLayer?: boolean;
  children?: React.ReactNode;
}

/**
 * Drop an id from a Set of ids, keeping the Set's identity when the id is not
 * in it so React can skip the re-render. The viewport tracks two of these
 * (exiting rows, settled rows) and each has to be pruned from more than one
 * place.
 */
const withoutId =
  (id: string) =>
  (prev: Set<string>): Set<string> => {
    if (!prev.has(id)) {
      return prev;
    }
    const next = new Set(prev);
    next.delete(id);
    return next;
  };

interface ToastRowProps {
  entry: ToastEntry;
  isExiting: boolean;
  /** Top-anchored stacks grow downward and flip the row's drift and gap. */
  isReversed: boolean;
  onExited: (id: string) => void;
  onDismiss: (id: string, reason: ToastDismissReason) => void;
}

/**
 * One row of the stack: the grid wrapper that opens and collapses, and the
 * clip that releases once it is open so the card's elevation can paint.
 *
 * Settled state lives here, on the mounted row, rather than in a Set of ids on
 * the viewport. A row leaves the DOM by more paths than dismissal — `maxVisible`
 * evicts the oldest when a newer toast arrives, and a uniqueID overwrite swaps
 * a new entry into a replaced toast's place — and on those paths nothing on the
 * dismissal path runs to prune it. Holding the flag on the row makes every one
 * of them the same event: the row unmounts, the flag goes with it, and a toast
 * that resurfaces when the stack drains mounts clipped and runs its own entry
 * transition. Re-clipping on dismissal is the same rule read forward, since the
 * clip is released only while the row is settled *and* not exiting.
 */
function ToastRow({
  entry,
  isExiting,
  isReversed,
  onExited,
  onDismiss,
}: ToastRowProps) {
  const o = entry.options;
  const type = o.type ?? 'info';
  const isAutoHide = o.isAutoHide ?? (type === 'error' ? false : true);
  const dur = o.autoHideDuration ?? 5000;
  const [isSettled, setIsSettled] = useState(false);

  return (
    <div
      data-toast-id={entry.id}
      {...stylex.props(
        styles.toastWrapper,
        isReversed ? styles.toastWrapperFromTop : styles.toastWrapperFromBottom,
        isReversed ? styles.toastWrapperGapReversed : styles.toastWrapperGap,
        isExiting && styles.toastWrapperExiting,
      )}
      onTransitionEnd={(e: React.TransitionEvent) => {
        // `grid-template-rows` is not private to this wrapper — any descendant
        // may animate its own grid, and transitionend bubbles. Only the row's
        // own transition says the row has finished opening or collapsing.
        if (e.target !== e.currentTarget) {
          return;
        }
        if (e.propertyName !== 'grid-template-rows') {
          return;
        }
        if (isExiting) {
          onExited(entry.id);
          return;
        }
        // The row is fully open now. Release only the paint clip; the wrapper
        // still owns pointer events and restores the clip synchronously when
        // dismissal starts.
        setIsSettled(true);
      }}>
      <div
        {...stylex.props(
          styles.toastWrapperInner,
          isSettled && !isExiting && styles.toastWrapperInnerSettled,
        )}>
        <ToastSurface
          type={type}
          body={o.body}
          endContent={o.endContent}
          isAutoHide={isAutoHide}
          autoHideDuration={dur}
          isExiting={isExiting}
          gestureDirection={isReversed ? -1 : 1}
          onDismiss={reason => onDismiss(entry.id, reason)}
          renderContent={o.renderContent}
        />
      </div>
    </div>
  );
}
ToastRow.displayName = 'ToastRow';

/**
 * Container that renders and manages toast notifications. Place at the root
 * of your app to enable useToast(). Toasts stack with enter/exit
 * animations and auto-promote to the CSS top layer.
 *
 * @example
 * ```
 * <ToastViewport position="bottomEnd" maxVisible={3}>
 *   <App />
 * </ToastViewport>
 * ```
 */
export function ToastViewport({
  position = 'bottomEnd',
  maxVisible = 5,
  inset,
  layerInset,
  isTopLayer = true,
  children,
}: ToastViewportProps) {
  const t = useTranslator();
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;
  // The list as last rendered: addToast moves toastsRef ahead of it within
  // a batch, so this tells a rendered toast from one raised since.
  const renderedToastsRef = useRef(toasts);
  renderedToastsRef.current = toasts;
  // Read by removeToast, which keeps one identity across renders.
  const maxVisibleRef = useRef(maxVisible);
  maxVisibleRef.current = maxVisible;
  // Rendered entries a repeat has replaced in this batch: still found by a
  // dismissal in the same handler, as before the swap. One replaced before it
  // rendered was never shown and reports no onHide (Toast.spec.md FR3). A
  // render starts a new batch.
  const replacedRef = useRef<Map<string, ToastEntry>>(new Map());
  replacedRef.current.clear();

  const viewportRef = useRef<HTMLDivElement>(null);
  // Toast ids whose exit has begun — guards onHide from double-firing (see
  // removeToast). Mirrors exitingIds state, readable synchronously.
  const exitingIdsRef = useRef<Set<string>>(new Set());
  // Toasts dispatched since the last commit, by id: a dismiss() called
  // before the toast first renders still finds it (and its onHide).
  const pendingEntriesRef = useRef<Map<string, ToastEntry>>(new Map());
  // The element that was focused before focus entered the viewport, by F6,
  // Tab or a click. Used to restore focus once all toasts are dismissed so
  // focus never falls to <body> (FR10).
  const prevFocusRef = useRef<HTMLElement | null>(null);
  // The element focus last reached inside the viewport's React tree,
  // portaled toast content included.
  const lastFocusedWithinRef = useRef<EventTarget | null>(null);
  // When a toast is dismissed while focus lives inside it, we need to move
  // focus to a sensible neighbor after that toast unmounts. This holds the
  // id of the toast whose removal should trigger a focus handoff.
  const focusHandoffIdRef = useRef<string | null>(null);
  // The next toast id that should receive focus once the dismissed toast has
  // unmounted, or 'restore' to fall back to the previously-focused element.
  const pendingFocusRef = useRef<string | 'restore' | null>(null);

  // Collect a focusable control within a toast node, if any.
  // Reuses the canonical INTERACTIVE_SELECTORS list (native controls plus
  // role-based interactive elements) instead of a hand-rolled subset, then
  // narrows to the first candidate that can actually receive focus —
  // excluding elements opted out with `tabindex="-1"` and disabled controls.
  const getFocusable = useCallback(
    (container: HTMLElement | null): HTMLElement | null => {
      if (!container) {
        return null;
      }
      const candidates = container.querySelectorAll<HTMLElement>(
        INTERACTIVE_SELECTORS,
      );
      for (const candidate of candidates) {
        if (
          candidate.getAttribute('tabindex') === '-1' ||
          candidate.hasAttribute('disabled') ||
          candidate.getAttribute('aria-disabled') === 'true'
        ) {
          continue;
        }
        return candidate;
      }
      return null;
    },
    [],
  );

  // Announce toasts through the persistent singleton live regions. Each
  // <Toast> also renders its own role="status"/"alert" region, but that region
  // is "born with content" — mounted together with its text — which many
  // screen readers do not announce (see useAnnounce.ts); the singleton regions
  // are mounted empty and only mutated afterwards, so they are what actually
  // guarantees the announcement (the per-toast markup is kept for browse-mode
  // discoverability). The announcement happens in addToast — the imperative
  // dispatch path invoked once per useToast() call from an event handler,
  // never from render — so each toast is announced exactly once by
  // construction, independent of the React render lifecycle (StrictMode
  // double-render/double-effect, viewport remounts, and unrelated list
  // re-renders never re-announce). It is client-only (addToast never runs
  // during SSR), so it is SSR-safe.
  const announce = useAnnounce();

  const addToast = useCallback(
    (entry: ToastEntry) => {
      const {uniqueID, collisionBehavior = 'overwrite'} = entry.options;
      // A toast holds its uniqueID until it unmounts, leaving included
      // (Toast.spec.md FR8): an overwrite replaces it in place, and an ignored
      // namesake is dropped.
      const holdsUniqueID = (t: ToastEntry) => t.options.uniqueID === uniqueID;
      // Resolve an ignored collision synchronously against the committed list
      // so a suppressed toast is neither shown nor announced. The remaining
      // announce + setToasts run outside the setToasts updater, which React may
      // invoke more than once — keeping the announcement exactly-once.
      if (
        uniqueID &&
        collisionBehavior === 'ignore' &&
        toastsRef.current.some(holdsUniqueID)
      ) {
        return;
      }
      // Only text is announced; interactive endContent is reachable via F6.
      const text = getNodeText(entry.options.body);
      if (text) {
        // Error toasts map to the assertive region (role="alert"); everything
        // else to the polite region (role="status") — mirrors Toast.tsx.
        announce(text, entry.options.type === 'error' ? 'assertive' : 'polite');
      }
      // A leaving toast that a new one pushes out of the visible window can no
      // longer finish its exit on screen, so it leaves the list now (it
      // already reported onHide); otherwise its row would come back collapsed
      // when the window reached it again, holding a slot and the landmark.
      const committed = toastsRef.current;
      const overwritten = uniqueID ? committed.find(holdsUniqueID) : undefined;
      if (overwritten && renderedToastsRef.current.includes(overwritten)) {
        replacedRef.current.set(overwritten.id, overwritten);
      }
      const projected = overwritten
        ? committed.map(t => (t === overwritten ? entry : t))
        : [...committed, entry];
      // `maxVisible={0}` shows every toast (FR7): nothing leaves the window.
      const firstVisible = maxVisible > 0 ? projected.length - maxVisible : 0;
      const cutIds = new Set(
        projected
          .filter((t, i) => i < firstVisible && exitingIdsRef.current.has(t.id))
          .map(t => t.id),
      );
      if (cutIds.size > 0) {
        // Gone from every list, so a later dismissal reports nothing more.
        for (const id of cutIds) {
          exitingIdsRef.current.delete(id);
          pendingEntriesRef.current.delete(id);
        }
        setExitingIds(prev => new Set([...prev].filter(id => !cutIds.has(id))));
      }
      // Later toasts in the same batch see this one before the next render.
      toastsRef.current = projected.filter(t => !cutIds.has(t.id));
      const pending = pendingEntriesRef.current;
      if (uniqueID) {
        // An overwrite replaces a toast that has not rendered yet too.
        for (const [pendingId, pendingEntry] of pending) {
          if (pendingEntry.options.uniqueID === uniqueID) {
            pending.delete(pendingId);
          }
        }
      }
      pending.set(entry.id, entry);
      // An overwrite swaps a new entry, with a new id, into the replaced
      // toast's place, so the old row leaves the DOM without ever being
      // dismissed. Its settled id is dropped by the prune below, which covers
      // every silent exit with one rule rather than one branch per path.
      setToasts(prev => {
        // The cut entries go first, then the choice the projection above made
        // (by identity): a dismissal in the same handler may have marked the
        // replaced namesake as leaving since, which must not turn the
        // overwrite into an append. An ignored collision already returned.
        const kept = prev.filter(t => !cutIds.has(t.id));
        return overwritten && kept.includes(overwritten)
          ? kept.map(t => (t === overwritten ? entry : t))
          : [...kept, entry];
      });
    },
    [announce, maxVisible],
  );

  const removeToast = useCallback((id: string, reason: ToastDismissReason) => {
    // An exiting toast stays in toastsRef until its exit transition ends, so
    // a second dismissal inside that window (double-click, auto-timer plus
    // manual dismiss()) would re-fire onHide. Track exiting ids in a ref —
    // the exitingIds state dedupe below runs too late to protect onHide.
    if (exitingIdsRef.current.has(id)) {
      return;
    }
    const entry =
      toastsRef.current.find(t => t.id === id) ??
      replacedRef.current.get(id) ??
      pendingEntriesRef.current.get(id);
    if (entry == null) {
      // Already gone: nothing to hide or report.
      return;
    }
    exitingIdsRef.current.add(id);
    entry.options.onHide?.(reason);
    // If focus currently lives inside the toast being dismissed, remember
    // that its removal must hand focus off to a neighbor (or the element
    // focused before the user entered the viewport) rather than <body>.
    const el = viewportRef.current;
    const active = document.activeElement;
    const dismissedNode =
      el?.querySelector<HTMLElement>(`[data-toast-id="${id}"]`) ?? null;
    if (
      dismissedNode &&
      active instanceof Node &&
      dismissedNode.contains(active)
    ) {
      focusHandoffIdRef.current = id;
      // Pick the toast to receive focus while the DOM is still intact: the
      // nearest one after it, then before it, that shows once it is gone
      // (FR10), else restore. The list may already run ahead of the render
      // within this handler: a toast a repeat replaced has left it, and the
      // replacement holds its place, so the neighbors are taken around the
      // replacement, which takes focus only when no neighbor shows.
      const list = toastsRef.current;
      const {uniqueID} = entry.options;
      const ownIndex = list.findIndex(t => t.id === id);
      const placeIndex =
        ownIndex >= 0 || uniqueID == null
          ? ownIndex
          : list.findIndex(t => t.options.uniqueID === uniqueID);
      const remaining = list.filter(t => t.id !== id);
      const max = maxVisibleRef.current;
      const shown = new Set(max > 0 ? remaining.slice(-max) : remaining);
      const isShown = (t: ToastEntry) => shown.has(t);
      const replacement = ownIndex < 0 ? list[placeIndex] : undefined;
      const next =
        placeIndex < 0
          ? undefined
          : (list.slice(placeIndex + 1).find(isShown) ??
            list.slice(0, placeIndex).reverse().find(isShown) ??
            (replacement != null && isShown(replacement)
              ? replacement
              : undefined));
      pendingFocusRef.current = next ? next.id : 'restore';
    }
    // A toast this handler has already pushed out of the visible window still
    // has its row now, but loses it when the batch renders.
    const index = toastsRef.current.findIndex(t => t.id === id);
    const isPushedOut =
      maxVisibleRef.current > 0 &&
      index >= 0 &&
      index < toastsRef.current.length - maxVisibleRef.current;
    if (dismissedNode == null || isPushedOut) {
      // No row is mounted for it, or none will be: it is hidden past
      // `maxVisible`, or it has not rendered yet. Nothing animates out, so it
      // leaves the list now.
      // Waiting for its row to finish exiting would keep it forever: when it
      // surfaced, its row would mount already collapsed, with no transition
      // left to end, and hold a visible slot as an empty row.
      // It leaves the committed list now too, so a second dismissal before
      // the next render finds nothing to report (nor does a toast a repeat
      // replaced in this batch).
      exitingIdsRef.current.delete(id);
      pendingEntriesRef.current.delete(id);
      replacedRef.current.delete(id);
      toastsRef.current = toastsRef.current.filter(t => t.id !== id);
      setToasts(prev => prev.filter(t => t.id !== id));
      return;
    }
    setExitingIds(prev => {
      if (prev.has(id)) {
        return prev;
      }
      return new Set(prev).add(id);
    });
  }, []);

  const handleExited = useCallback((id: string) => {
    exitingIdsRef.current.delete(id);
    pendingEntriesRef.current.delete(id);
    setExitingIds(withoutId(id));
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // After a dismissed toast unmounts, hand focus off so it never falls to
  // <body>. Runs in a layout effect once the toast list no longer contains
  // the dismissed toast.
  useLayoutEffect(() => {
    const handoffId = focusHandoffIdRef.current;
    const target = pendingFocusRef.current;
    if (handoffId == null || target == null) {
      return;
    }
    // Wait until the dismissed toast is actually gone from the list.
    if (toasts.some(t => t.id === handoffId)) {
      return;
    }
    focusHandoffIdRef.current = null;
    pendingFocusRef.current = null;
    const el = viewportRef.current;
    if (target !== 'restore' && el) {
      const nextNode = el.querySelector<HTMLElement>(
        `[data-toast-id="${target}"]`,
      );
      const focusable = getFocusable(nextNode) ?? nextNode;
      if (focusable) {
        focusable.focus();
        return;
      }
    }
    // No remaining toast to receive focus — restore the previously-focused
    // element if it's still connected, else fall back to the container.
    const prev = prevFocusRef.current;
    prevFocusRef.current = null;
    if (prev && prev.isConnected) {
      prev.focus();
    } else if (el) {
      el.focus();
    }
  }, [toasts, getFocusable]);

  const findByUniqueID = useCallback((uid: string) => {
    return toastsRef.current.find(t => t.options.uniqueID === uid);
  }, []);

  const contextValue = useMemo<ToastContextValue>(
    () => ({addToast, removeToast, findByUniqueID}),
    [addToast, removeToast, findByUniqueID],
  );

  const visibleToasts = toasts.slice(-maxVisible);

  const insetStyle: React.CSSProperties = {
    ...layerInsetProperties(layerInset),
  };
  if (inset?.top) {
    insetStyle.top = inset.top;
  }
  if (inset?.bottom) {
    insetStyle.bottom = inset.bottom;
  }
  if (inset?.start) {
    insetStyle.insetInlineStart = inset.start;
  }
  if (inset?.end) {
    insetStyle.insetInlineEnd = inset.end;
  }

  // A top-layer viewport renders into a host element this component owns, so
  // the host can move into the latest open native modal and back without
  // React remounting the rows: their timers and gesture state live there.
  // Outside a modal the host sits at the viewport's own place in the tree.
  const rootOutletRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!isTopLayer) {
      return;
    }
    const element = document.createElement('div');
    element.style.display = 'contents';
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- the host exists only on the client, so server and hydration markup carry no portal
    setHost(element);
    return () => {
      element.remove();
      setHost(null);
    };
  }, [isTopLayer]);

  useLayoutEffect(() => {
    if (!isTopLayer || host == null) {
      return;
    }
    const place = (change: ModalOutletChange = 'outlet') => {
      const parent = getActiveModalOutlet() ?? rootOutletRef.current;
      if (parent == null) {
        return;
      }
      if (host.parentNode !== parent) {
        // Moving a node blurs whatever inside it had focus.
        const active = document.activeElement;
        const hadFocus = active instanceof HTMLElement && host.contains(active);
        parent.appendChild(host);
        if (hadFocus) {
          active.focus({preventScroll: true});
        }
      }
      // Leaving the document hid the popover. Showing it again puts it above
      // the modal that just opened, or above everything once the last modal
      // closed. A non-modal surface that entered the top layer (`entry`)
      // moved nothing, so the viewport leaves and re-enters in place to get
      // above it; focus inside it is kept across the re-entry.
      const el = viewportRef.current;
      if (el == null || typeof el.showPopover !== 'function') {
        return;
      }
      let isShowing = false;
      try {
        isShowing = el.matches(':popover-open');
      } catch {
        /* :popover-open unsupported */
      }
      if (isShowing && change === 'entry') {
        const active = document.activeElement;
        const hadFocus = active instanceof HTMLElement && el.contains(active);
        try {
          el.hidePopover();
          isShowing = false;
        } catch {
          /* not a showing popover */
        }
        if (isShowing) {
          return;
        }
        try {
          el.showPopover();
        } catch {
          /* already showing */
        }
        if (hadFocus) {
          active.focus({preventScroll: true});
        }
        return;
      }
      if (!isShowing) {
        try {
          el.showPopover();
        } catch {
          /* already showing */
        }
      }
    };
    place();
    return subscribeModalOutlets(place);
  }, [isTopLayer, host]);

  // F6 jumps focus into the toast viewport — the standard "go to
  // notifications" affordance. Focus the first control in the newest toast,
  // or the viewport container if none. Toasts are non-modal, so this only
  // moves focus in; Shift+Tab / Escape let focus leave naturally.
  const hasToasts = toasts.length > 0;
  useEffect(() => {
    if (!hasToasts) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'F6') {
        return;
      }
      const el = viewportRef.current;
      if (!el) {
        return;
      }
      // Already inside the viewport — nothing to do.
      const active = document.activeElement;
      if (active instanceof Node && el.contains(active)) {
        return;
      }
      e.preventDefault();
      // Remember where focus was so it can be restored on dismiss.
      if (active instanceof HTMLElement) {
        prevFocusRef.current = active;
      }
      // Newest toast is the last one rendered in the DOM.
      const toastNodes = el.querySelectorAll<HTMLElement>('[data-toast-id]');
      const newest = toastNodes[toastNodes.length - 1] ?? null;
      const focusable = getFocusable(newest) ?? newest ?? el;
      focusable.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [hasToasts, getFocusable]);

  const posStyle =
    position === 'topEnd'
      ? styles.topEnd
      : position === 'topStart'
        ? styles.topStart
        : position === 'bottomStart'
          ? styles.bottomStart
          : styles.bottomEnd;
  const isReversed = position === 'topEnd' || position === 'topStart';

  const viewport = (
    <div
      ref={viewportRef}
      onFocus={event => {
        // Focus entering from outside, however it came, is where a dismissal
        // of the last toast returns it. React also delivers focus inside a
        // toast's portaled content here, so focus coming back from the last
        // element focused within is not an entry, though it sits outside
        // this element.
        const from = event.relatedTarget;
        const fromWithin =
          from === lastFocusedWithinRef.current ||
          (from instanceof Node && event.currentTarget.contains(from));
        lastFocusedWithinRef.current = event.target;
        if (from instanceof HTMLElement && !fromWithin) {
          prevFocusRef.current = from;
        }
      }}
      role={hasToasts ? 'region' : undefined}
      aria-label={hasToasts ? t('@astryx.toast.viewport') : undefined}
      tabIndex={hasToasts ? -1 : undefined}
      // popover="manual" promotes to the top layer; the host effect above
      // keeps it above the latest open modal. Omitted when the caller
      // renders the viewport in place.
      popover={isTopLayer ? 'manual' : undefined}
      {...mergeProps(
        stylex.props(
          layerTextReset.reset,
          layerStructureReset.reset,
          styles.viewport,
          styles.viewportInlineSpan,
          posStyle,
        ),
        {
          style: Object.keys(insetStyle).length > 0 ? insetStyle : undefined,
        },
      )}>
      <LayerContentBoundary>
        {visibleToasts.map(entry => (
          <ToastRow
            key={entry.id}
            entry={entry}
            isExiting={exitingIds.has(entry.id)}
            isReversed={isReversed}
            onExited={handleExited}
            onDismiss={removeToast}
          />
        ))}
      </LayerContentBoundary>
    </div>
  );

  return (
    <ToastContext value={contextValue}>
      {children}
      {isTopLayer ? (
        <>
          <div ref={rootOutletRef} {...stylex.props(styles.rootOutlet)} />
          {host != null ? createPortal(viewport, host) : null}
        </>
      ) : (
        viewport
      )}
    </ToastContext>
  );
}
ToastViewport.displayName = 'ToastViewport';
