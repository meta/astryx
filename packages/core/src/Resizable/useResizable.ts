// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useResizable.ts
 * @input A handle's ref and createResizable's options; or, in the
 *   configuration-object form, resize configuration (defaultSize, minSize,
 *   maxSize, snaps), with removed pixel-bound aliases rejected even through
 *   assembled objects, and collapse configuration (collapsible,
 *   defaultIsCollapsed, isCollapsed)
 * @output `useResizable(handleRef, options)`: createResizable's thin React
 *   wrapper (spec:AST-107 FR6), returning size, isCollapsed and the
 *   collapse/expand/resize methods. The configuration-object form returns the
 *   same plus props for a handle
 * @position Public hook; consumed by layout components via `resizable` prop
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import {observeResize} from '../utils/sharedResizeObserver';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {devWarn} from '../utils/devWarning';
import type {SizeValue} from '../utils/types';
import type {ResizableSize} from './utils';
import {
  createResizable,
  readInitialResizableState,
  type CreateResizableOptions,
  type ResizableController,
} from './createResizable';
import {
  DEFAULT_COLLAPSED_SIZE,
  DEFAULT_MIN,
  DEFAULT_SIZE_FALLBACK,
  RESIZABLE_SIZE_GUIDANCE,
  SERVER_BASIS,
  clampSize,
  dependsOnBasis,
  loadPersistedState,
  measureContentBox,
  parseSize,
  persistState,
  resolveBound,
  type PersistedResizableState,
  type ResizableDirection,
} from './resizableModel';

// =============================================================================
// Types
// =============================================================================

/** Minimum size configuration. */
export type ResizableMinConfig = {minSize?: ResizableSize};

/** Maximum size configuration. */
export type ResizableMaxConfig = {maxSize?: ResizableSize};

export type {ResizableDirection} from './resizableModel';

export interface ResizableRegionSizing {
  /**
   * Initial size. A number is pixels, exact `Npx` is pixels, exact `N%` is a
   * share of the basis, and the structured percent form in
   * {@link ResizableSize} adds exactly one pixel floor or ceiling to that percentage. The public type retains the released
   * {@link SizeValue} (`number | string`) for compatibility, so runtime
   * validation remains authoritative for strings.
   *
   * A basis-dependent value resolves ONCE into a pixel size — against the
   * container when `containerRef` is supplied, against the viewport otherwise.
   * It configures the initial selection; it does not make the region track its
   * basis afterwards.
   */
  defaultSize?: ResizableSize | SizeValue;
  /** Whether this region can collapse to 0. @default false */
  collapsible?: boolean;
  /** Size in px at which dragging triggers collapse. @default 40 */
  collapsedSize?: number;
  /** Pixel values to snap to during resize. */
  snaps?: number[];
  /** Cascade priority — lower number shrinks first. */
  shrinkOrder?: number;
}

export type ResizableRegionConfig = ResizableRegionSizing &
  ResizableMinConfig &
  ResizableMaxConfig;

/**
 * Shared config shape for any component that integrates built-in resize
 * (e.g. SideNav `resizable` prop). Provides a simplified API surface
 * over the full ResizableRegionConfig.
 */
export interface ResizableConfig {
  /** Initial width in pixels. @default 260 */
  defaultWidth?: number;
  /** Minimum width in pixels. @default 180 */
  minWidth?: number;
  /** Maximum width in pixels. @default 480 */
  maxWidth?: number;
  /** localStorage key for persisting width and collapse state. */
  autoSaveId?: string;
  /** Called when the width changes (on drag end). */
  onWidthChange?: (width: number) => void;
  /** Start collapsed (uncontrolled). A persisted entry wins over this. */
  defaultIsCollapsed?: boolean;
  /** Controlled collapse state. Pair with `onCollapseChange`. */
  isCollapsed?: boolean;
  /** Called when collapse state changes (via drag or programmatic). */
  onCollapseChange?: (isCollapsed: boolean) => void;
}

export interface UseResizableSingleOptions {
  /**
   * The element a percentage is a share of. Caller-owned: only the caller
   * knows which element is the intended layout container, so the hook never
   * infers one from the panel or the handle.
   *
   * Omitted, percentages keep the released viewport basis. Supplied, they use
   * this element's content-box size on the active axis. It changes the basis
   * only — it does not make a selected size responsive.
   */
  containerRef?: RefObject<HTMLElement | null>;
  /**
   * Which axis this region resizes along. Selects the container's inline or
   * block content-box size as the percentage basis, and must match the
   * `direction` given to `ResizeHandle`. @default 'horizontal'
   */
  direction?: ResizableDirection;
  /** Unique key for localStorage persistence. */
  autoSaveId?: string;
  /**
   * Initial collapse state (uncontrolled). A persisted entry wins over it,
   * so a restored session keeps the state the user left behind.
   * Only honored when `collapsible` is true.
   */
  defaultIsCollapsed?: boolean;
  /**
   * Controlled collapse state. When set, the caller owns collapse:
   * `collapse()`, `expand()` and a drag past the collapse threshold report
   * through `onCollapseChange` instead of changing state here.
   */
  isCollapsed?: boolean;
  /** Called when size changes during drag. */
  onSizeChange?: (size: number) => void;
  /** Called when collapse state changes (via drag or programmatic). */
  onCollapseChange?: (isCollapsed: boolean) => void;
}

export type UseResizableSingleConfig = ResizableRegionConfig &
  UseResizableSingleOptions;

export interface UseResizableMultiConfig {
  /** Layout direction, shared by every region. @default 'horizontal' */
  direction?: ResizableDirection;
  /**
   * One container for every region's percentage basis. Regions stay
   * independently pixel-selected; sharing a basis adds no ratio or
   * total-100% invariant between them.
   */
  containerRef?: RefObject<HTMLElement | null>;
  /** Named region configurations. */
  regions: Record<string, ResizableRegionConfig>;
  /** Unique key for localStorage persistence. */
  autoSaveId?: string;
}

export interface ResizableRegion {
  /** Current size in pixels. */
  size: number;
  /** Whether the region is currently collapsed. */
  isCollapsed: boolean;
  /** Collapse the region (if collapsible). */
  collapse: () => void;
  /** Expand from collapsed state. */
  expand: () => void;
  /** Resize to a specific pixel value. */
  resize: (size: number) => void;
  /** Props to pass to a component's `resizable` prop or ResizeHandle. */
  props: ResizableProps;
}

export interface ResizableProps {
  _size: number;
  // eslint-disable-next-line @astryx/boolean-prop-naming
  _isCollapsed: boolean;
  _onResizeStart: () => void;
  _onResizeMove: (delta: number) => void;
  _onResizeEnd: () => void;
  /**
   * The gesture ended without completing — pointercancel, a lost pointer
   * capture, or a handle unmounted mid-drag. Separate from `_onResizeEnd`
   * because a cancelled drag deliberately does not signal a resize end (#5297),
   * but it must still release everything the gesture was holding.
   *
   * Optional: `ResizableProps` is exported, so a hand-built object from before
   * this existed has to keep compiling.
   */
  _onResizeCancel?: () => void;
  _minSizePx: number;
  _maxSizePx: number;
  _snaps: number[];
  _collapsedSize: number;
  /** Whether the region supports collapsing. */
  // eslint-disable-next-line @astryx/boolean-prop-naming
  _collapsible: boolean;
  /**
   * The hook's axis, so a handle can flag a direction mismatch.
   *
   * Optional for the same reason as `_onResizeCancel`: this type is exported,
   * and requiring a new field would break every object literal that already
   * satisfies it. Absent means "no axis to check", not "horizontal".
   */
  _direction?: ResizableDirection;
  _isResizableProps: true;
}

/** A store that never changes on its own; the snapshot is re-read on render. */
const noopSubscribe = () => () => {};

// The window snapshots are module functions, so their identity is stable:
// React re-reads a snapshot after the commit whenever getSnapshot is a new
// function, and a window size read after the DOM changed forces a layout of
// the whole page. With these, the window is read during render only.

/** The viewport width, the basis without a container. */
function readViewportBasis(): number {
  return typeof window === 'undefined' ? SERVER_BASIS : window.innerWidth;
}

function readServerBasis(): number {
  return SERVER_BASIS;
}

/** The window's extent along a horizontal hook's axis. */
function readWindowWidth(): number | null {
  return typeof window === 'undefined' ? null : window.innerWidth;
}

/** The window's extent along a vertical hook's axis. */
function readWindowHeight(): number | null {
  return typeof window === 'undefined' ? null : window.innerHeight;
}

function readNoWindowExtent(): null {
  return null;
}
// =============================================================================
// Single-region hook
// =============================================================================

function useSingleResizable(config: UseResizableSingleConfig): ResizableRegion {
  const {
    defaultSize,
    minSize,
    maxSize,
    containerRef,
    direction = 'horizontal',
    collapsible = false,
    collapsedSize = DEFAULT_COLLAPSED_SIZE,
    snaps: configuredSnaps,
    autoSaveId,
    defaultIsCollapsed,
    isCollapsed: controlledIsCollapsed,
    onSizeChange,
    onCollapseChange,
  } = config;
  const emptySnapsRef = useRef<number[]>([]);
  const snaps = configuredSnaps ?? emptySnapsRef.current;

  const rawMin = minSize;
  const rawMax = maxSize;

  const parsedDefault = parseSize(defaultSize);
  const parsedMin = parseSize(minSize);
  const parsedMax = parseSize(maxSize);
  const hasContainer = containerRef != null;
  const persisted = autoSaveId ? loadPersistedState(autoSaveId) : null;
  const initialDefaultRef = useRef<{px: number; isFinal: boolean} | null>(null);
  const [, setDefaultBasisCleanupTick] = useState(0);

  const defaultDependsOnBasis = dependsOnBasis(parsedDefault);
  const boundsDependOnBasis =
    dependsOnBasis(parsedMin) || dependsOnBasis(parsedMax);
  // A default needs a live container only until its initial pixel choice is
  // final. A persisted pixel choice wins without measuring the unused default.
  // Bounds are different: percentages keep following the basis so they can
  // re-clamp the selected pixel size.
  const defaultNeedsInitialBasis =
    persisted?.size == null &&
    defaultDependsOnBasis &&
    initialDefaultRef.current?.isFinal !== true;
  const observeContainerBasis =
    hasContainer && (boundsDependOnBasis || defaultNeedsInitialBasis);
  const observeViewportBasis = !hasContainer && boundsDependOnBasis;

  // The container basis, read through the shared observer. `useSyncExternalStore`
  // rather than an effect: the store IS the measurement, so there is no render
  // that paints before the basis is known and no `setState` in an effect.
  //
  // The subscription depends on the ELEMENT, not on the ref object. A ref is
  // stable across an element swap, so `containerRef.current` can become a
  // different node — a remount behind the same ref, a conditional branch, a
  // portal moving — without any input to this hook changing. Keyed on the ref,
  // the old detached node stayed observed (and a detached node measures 0,
  // which is how a replacement zeroed the bounds) and the new one was never
  // observed at all.
  const containerElementRef = useRef<HTMLElement | null>(null);
  // DOM ref changes are invisible to React. This state is only a version tick
  // while basis observation is active; the element itself lives in a ref so it
  // can be released without adding a cleanup render.
  const [, setContainerElementVersion] = useState(0);
  const containerBasisRef = useRef<number | null>(null);
  const containerElement = observeContainerBasis
    ? containerElementRef.current
    : null;

  // Follow the ref only while some configuration needs its basis. A numeric-only
  // region never reads the ref. Once observation stops, drop both the element
  // and its measurement without a state update; a later percentage starts from
  // the ref's then-current element and a fresh basis.
  useIsomorphicLayoutEffect(() => {
    if (!observeContainerBasis) {
      containerElementRef.current = null;
      containerBasisRef.current = null;
      return;
    }
    const element = containerRef?.current ?? null;
    if (element !== containerElementRef.current) {
      containerBasisRef.current = null;
      containerElementRef.current = element;
      setContainerElementVersion(version => version + 1);
    }
  });

  const subscribeToContainer = useCallback(
    (onStoreChange: () => void) => {
      if (
        !observeContainerBasis ||
        containerElement == null ||
        containerElement !== containerRef?.current
      ) {
        return () => {};
      }
      // Unsubscribe by callback: several regions share one container, and any
      // number of unrelated hooks may observe the same node.
      return observeResize(containerElement, entry => {
        containerBasisRef.current = measureContentBox(
          containerElement,
          direction,
          entry,
        );
        onStoreChange();
      });
    },
    [containerElement, observeContainerBasis, direction, containerRef],
  );
  const readContainerBasis = useCallback(() => {
    if (!observeContainerBasis || containerElement == null) {
      // An inactive subscription owns no current measurement. Clearing this is
      // important when a percentage bound is added later: the first active
      // render must measure the container as it is now, not clamp against the
      // last basis seen by a default-only subscription.
      containerBasisRef.current = null;
      return null;
    }
    // Cached in a ref so the snapshot is referentially stable between resizes;
    // returning a fresh measurement every call would loop the store.
    if (containerBasisRef.current == null) {
      containerBasisRef.current = measureContentBox(
        containerElement,
        direction,
      );
    }
    return containerBasisRef.current;
  }, [containerElement, observeContainerBasis, direction]);
  const containerBasis = useSyncExternalStore(
    subscribeToContainer,
    readContainerBasis,
    () => null,
  );

  // The viewport basis is always readable synchronously. Percentage-dependent
  // BOUNDS subscribe to later resizes (FR6); a default reads the initial
  // snapshot only, because it becomes a pixel choice immediately.
  const subscribeToViewport = useCallback(
    (onStoreChange: () => void) => {
      if (
        hasContainer ||
        !observeViewportBasis ||
        typeof window === 'undefined'
      ) {
        return () => {};
      }
      window.addEventListener('resize', onStoreChange);
      return () => window.removeEventListener('resize', onStoreChange);
    },
    [hasContainer, observeViewportBasis],
  );
  const viewportBasis = useSyncExternalStore(
    subscribeToViewport,
    readViewportBasis,
    readServerBasis,
  );

  // The window's extent along the hook's axis, for the REPORTED maximum of an
  // unbounded region (never for clamping). Read through the same store shape
  // so a server-rendered handle hydrates with no maximum and gains the real
  // one on the first client render, instead of a hydration mismatch. It takes
  // no resize subscription: an unbounded pixel region observes nothing
  // (component:Resizable Performance and resources).
  const windowExtent = useSyncExternalStore(
    noopSubscribe,
    direction === 'vertical' ? readWindowHeight : readWindowWidth,
    readNoWindowExtent,
  );

  // With a container, its content box is the basis; without one, the released
  // viewport basis. Before a supplied container has been measured — the first
  // render, the server, and any moment it is display:none or detached — the
  // deterministic 1200px stands in, and the first real measurement replaces it.
  //
  // A zero measurement is not a measurement. A hidden or detached container
  // reports 0, and resolving `'50%'` against it produced a real maximum of 0:
  // the panel collapsed and, with `autoSaveId`, that 0 was written over a
  // perfectly good saved width. Treating 0 as unmeasured keeps the temporary
  // basis until the container is actually laid out (AST-010 Platform support).
  const needsContainerBasis = observeContainerBasis;
  const hasPositiveMeasurement = containerBasis != null && containerBasis > 0;
  const liveBasis = hasContainer
    ? hasPositiveMeasurement
      ? containerBasis
      : SERVER_BASIS
    : viewportBasis;
  const isBasisMeasured = needsContainerBasis ? hasPositiveMeasurement : true;

  // One stable basis per gesture. A container that resizes mid-drag would
  // otherwise move the bound under the pointer; the new basis applies once the
  // gesture ends.
  const gestureBasisRef = useRef<number | null>(null);
  // Only forces the render that ends a gesture: it releases the frozen basis,
  // and its commit writes the size the gesture settled on.
  const [gestureTick, setGestureTick] = useState(0);
  void gestureTick;
  const basis = gestureBasisRef.current ?? liveBasis;
  // The frozen basis also marks a gesture in flight, from `_onResizeStart`
  // until `_onResizeEnd` or `_onResizeCancel`.
  const isGestureActive = gestureBasisRef.current != null;

  const didWarnMinRef = useRef(false);
  const didWarnMaxRef = useRef(false);
  const didWarnDefaultRef = useRef(false);
  const didWarnInvertedRef = useRef(false);

  // Bounds re-resolve from the live basis on every render — that is the whole
  // point of a percentage bound — and clamp the pixel selection below.
  const resolvedMin = resolveBound(
    rawMin,
    parsedMin,
    basis,
    DEFAULT_MIN,
    'minSize',
    RESIZABLE_SIZE_GUIDANCE,
    didWarnMinRef,
  );
  const resolvedMax = resolveBound(
    rawMax,
    parsedMax,
    basis,
    Infinity,
    'maxSize',
    RESIZABLE_SIZE_GUIDANCE,
    didWarnMaxRef,
  );

  // A basis-dependent default is resolved ONCE into a pixel size. Latched in a
  // ref (React's sanctioned lazy-init shape) rather than recomputed, because a
  // default that kept tracking its basis would be a second, responsive sizing
  // mode — the thing this API deliberately does not have.
  //
  // Not final while a supplied container is still unmeasured: that render used
  // the temporary 1200px stand-in, and the first real measurement replaces it.
  // Once final, a default-only subscription is removed. The correction is not a
  // user interaction, so it neither persists the placeholder nor fires
  // `onSizeChange`.
  if (initialDefaultRef.current == null || !initialDefaultRef.current.isFinal) {
    initialDefaultRef.current = {
      px: resolveBound(
        defaultSize,
        parsedDefault,
        basis,
        DEFAULT_SIZE_FALLBACK,
        'defaultSize',
        RESIZABLE_SIZE_GUIDANCE,
        didWarnDefaultRef,
      ),
      isFinal: isBasisMeasured,
    };
  }
  const initialDefaultPx = initialDefaultRef.current.px;

  // The size the user has settled on, or null while a container-relative
  // default is still waiting for its first positive measurement. Once that
  // basis is real, the default becomes an ordinary pixel selection — including
  // any clamp applied at initialization. Leaving it represented by `null`
  // allowed the raw default to be re-read later: 321px first clamped to 200px
  // in a 400px container, then revived to 321px when the container grew.
  //
  // Initialized outright whenever the basis is already real on the first
  // render — every pixel-only configuration, and the no-container percentage
  // path. Only a supplied container needs a measurement that does not exist
  // until after commit, so only it starts null. Initializing lazily in all
  // cases cost every legacy pixel-only mount a second render pass, because the
  // adjustment below then had to run on the first render to fill the value in.
  const [chosenSize, setChosenSize] = useState<number | null>(() => {
    if (persisted?.size != null) {
      return persisted.size;
    }
    return isBasisMeasured
      ? clampSize(initialDefaultPx, resolvedMin, resolvedMax, snaps)
      : null;
  });

  if (
    hasContainer &&
    !boundsDependOnBasis &&
    isBasisMeasured &&
    defaultNeedsInitialBasis &&
    chosenSize != null
  ) {
    // A programmatic resize may have selected pixels while the container was
    // still unmeasured, so chosenSize can already be non-null here. Force the
    // render that re-evaluates and removes the now-finished default subscription.
    setDefaultBasisCleanupTick(tick => tick + 1);
  }

  if (isBasisMeasured && chosenSize == null) {
    // The supplied container has now been measured, so the selection latched
    // against the temporary basis is replaced by one against the real one.
    // Render-phase adjustment is deliberate: React re-runs this render before
    // paint, so the corrected selection, paint, persistence, and ARIA all see
    // the same pixel value. It fires no interaction callback.
    setChosenSize(clampSize(initialDefaultPx, resolvedMin, resolvedMax, snaps));
  }

  // A re-resolved bound clamps the SELECTION, not just the paint. Deriving
  // alone was not enough: the stored choice survived, so a container that
  // shrank and grew again revived the pre-clamp size — measured 320px
  // reviving to 560px. The clamp has to be committed to be permanent.
  //
  // Adjusting state during render (React's documented shape for "a prop
  // changed, so state must follow") rather than in an effect: React re-runs
  // this render before painting, so nothing shows at the stale size, and no
  // interaction callback fires for what is only a layout correction (FR10).
  //
  // Held until the basis is final. Before a supplied container is measured the
  // bounds come from the temporary 1200px stand-in, and committing against
  // that would move a persisted size to fit a basis that was never real.
  const [committedBounds, setCommittedBounds] = useState({
    min: resolvedMin,
    max: resolvedMax,
  });
  if (
    isBasisMeasured &&
    gestureBasisRef.current == null &&
    (committedBounds.min !== resolvedMin || committedBounds.max !== resolvedMax)
  ) {
    setCommittedBounds({min: resolvedMin, max: resolvedMax});
    setChosenSize(current =>
      current == null
        ? null
        : clampSize(current, resolvedMin, resolvedMax, snaps),
    );
  }

  // Derived for paint, so the clamp above and the rendered size agree on the
  // very render that observes a new basis.
  const size = clampSize(
    chosenSize ?? initialDefaultPx,
    resolvedMin,
    resolvedMax,
    snaps,
  );
  const [uncontrolledIsCollapsed, setUncontrolledIsCollapsed] = useState(
    () => persisted?.isCollapsed ?? defaultIsCollapsed ?? false,
  );

  const isControlled = controlledIsCollapsed !== undefined;
  const isCollapsed =
    collapsible &&
    (isControlled ? controlledIsCollapsed : uncontrolledIsCollapsed);
  const dragStartSizeRef = useRef(size);

  // Mirrors isCollapsed so the callbacks below read the live value instead of
  // the one their last render captured. Two cases reach them from a stale
  // closure: two imperative calls in one tick, and a drag — ResizeHandle
  // registers its pointermove listener once at pointer down, so a whole
  // gesture runs against one props snapshot.
  const isCollapsedRef = useRef(isCollapsed);
  isCollapsedRef.current = isCollapsed;

  // Controlled callers own the state; collapse() and a drag past the
  // threshold report through onCollapseChange and change nothing here.
  const setCollapsed = useCallback(
    (value: boolean) => {
      if (!isControlled) {
        isCollapsedRef.current = value;
        setUncontrolledIsCollapsed(value);
      }
    },
    [isControlled],
  );

  useEffect(() => {
    if (resolvedMin > resolvedMax && !didWarnInvertedRef.current) {
      didWarnInvertedRef.current = true;
      devWarn(
        'useResizable',
        `the resolved minimum (${resolvedMin}px) is above the resolved ` +
          `maximum (${resolvedMax}px). The maximum wins, as it always has.`,
      );
    }
  }, [resolvedMin, resolvedMax]);

  // The size a gesture in flight has reached, for a region that unmounts
  // before the gesture ends.
  const pendingWriteRef = useRef<{
    key: string;
    state: PersistedResizableState;
  } | null>(null);

  useEffect(() => {
    // Synchronizes the `autoSaveId` entry in localStorage with the size.
    // Nothing is written while the basis is still the temporary stand-in. The
    // size on such a render is a placeholder, and persisting it overwrites the
    // real saved size with a value derived from a basis that was never real
    // (AST-010 Platform support, FR9).
    if (!autoSaveId || !isBasisMeasured) {
      pendingWriteRef.current = null;
      return;
    }
    // Nor while a gesture is in flight. A drag commits a new size on every
    // pointer move, and each write reaches every other open document of the
    // origin as a `storage` event.
    if (isGestureActive) {
      pendingWriteRef.current = {key: autoSaveId, state: {size, isCollapsed}};
      return;
    }
    // A gesture's one write happens here, in the commit that applies its
    // release, not in the handler that ended it: this render is the first to
    // know the final size. A basis that changed mid-gesture applies only at
    // the release and can re-clamp the size (AST-010 FR7), and a move the
    // release arrived before renders together with it. The handler sees
    // neither.
    pendingWriteRef.current = null;
    persistState(autoSaveId, {size, isCollapsed});
  }, [size, isCollapsed, autoSaveId, isBasisMeasured, isGestureActive]);

  // A region that unmounts mid-gesture never commits a release, so the size
  // the gesture reached is written on the way out.
  useEffect(
    () => () => {
      const pending = pendingWriteRef.current;
      pendingWriteRef.current = null;
      if (pending != null) {
        persistState(pending.key, pending.state);
      }
    },
    [],
  );

  const collapse = useCallback(() => {
    // The already-collapsed guard keeps a repeated call from re-notifying a
    // transition that already happened.
    if (!collapsible || isCollapsedRef.current) {
      return;
    }
    setCollapsed(true);
    onCollapseChange?.(true);
    onSizeChange?.(0);
  }, [collapsible, setCollapsed, onCollapseChange, onSizeChange]);

  const expand = useCallback(() => {
    const wasCollapsed = isCollapsedRef.current;
    setCollapsed(false);
    if (wasCollapsed) {
      onCollapseChange?.(false);
    }
    onSizeChange?.(size);
  }, [setCollapsed, size, onCollapseChange, onSizeChange]);

  const resize = useCallback(
    (newSize: number) => {
      // An invalid programmatic size repairs nothing — it must not replace a
      // legal selection with NaN, which would then reach paint, storage and
      // `aria-valuenow`.
      if (!Number.isFinite(newSize) || newSize < 0) {
        devWarn(
          'useResizable',
          `resize(${String(newSize)}) is not a pixel size. Keeping the ` +
            'current size. Percentages configure the hook; they are not a ' +
            'programmatic input.',
        );
        return;
      }
      const clamped = clampSize(newSize, resolvedMin, resolvedMax, snaps);
      const wasCollapsed = isCollapsedRef.current;
      setChosenSize(clamped);
      setCollapsed(false);
      // Resizing out of the collapsed state is an implicit expand — notify
      // like the drag path does when it crosses back over the threshold.
      if (wasCollapsed) {
        onCollapseChange?.(false);
      }
      onSizeChange?.(clamped);
    },
    [
      resolvedMin,
      resolvedMax,
      snaps,
      setCollapsed,
      onCollapseChange,
      onSizeChange,
    ],
  );

  const onResizeStart = useCallback(() => {
    // Freeze the basis for the whole gesture so a container resizing mid-drag
    // cannot move the bound out from under the pointer.
    gestureBasisRef.current = liveBasis;
    dragStartSizeRef.current = isCollapsedRef.current ? 0 : size;
  }, [size, liveBasis]);

  const onResizeMove = useCallback(
    (delta: number) => {
      const raw = dragStartSizeRef.current + delta;
      if (collapsible && raw < collapsedSize) {
        if (!isCollapsedRef.current) {
          setCollapsed(true);
          onCollapseChange?.(true);
          onSizeChange?.(0);
        }
        return;
      }
      if (isCollapsedRef.current && raw >= collapsedSize) {
        setCollapsed(false);
        onCollapseChange?.(false);
      }
      const clamped = clampSize(raw, resolvedMin, resolvedMax, snaps);
      setChosenSize(clamped);
      onSizeChange?.(clamped);
    },
    [
      collapsible,
      collapsedSize,
      setCollapsed,
      resolvedMin,
      resolvedMax,
      snaps,
      onSizeChange,
      onCollapseChange,
    ],
  );

  // Releasing the frozen basis needs a render to apply whatever the basis
  // became during the gesture; that render's commit writes the final size.
  const releaseGestureBasis = useCallback(() => {
    if (gestureBasisRef.current != null) {
      gestureBasisRef.current = null;
      setGestureTick(tick => tick + 1);
    }
  }, []);

  const onResizeEnd = useCallback(() => {
    // Sizes are already committed during move; the basis is held, and the
    // commit that releases it writes the final size to storage.
    releaseGestureBasis();
  }, [releaseGestureBasis]);

  // A gesture that is cancelled rather than completed — pointercancel, a lost
  // capture, a handle unmounted mid-drag — is still over. It does not signal a
  // resize end (that is #5297's contract, and the sizes were committed during
  // move anyway), but the basis it froze has to come back, or every later
  // percentage bound stays pinned to the container size at grab time, and the
  // size it reached has to reach storage.
  const onResizeCancel = releaseGestureBasis;

  // The maximum a handle REPORTS (End uses only a configured maximum). A
  // configured maximum wins. Otherwise a measured extent stands in — the
  // container's content box while a percentage bound already observes it, or
  // the window's extent along the axis — and never drops below the current size, so
  // `aria-valuenow` can never exceed `aria-valuemax` (a saved, default, or
  // pre-resize size may already be larger than the window). An unobserved
  // container reports nothing: measuring it would add an observer to an
  // atomic pixel path.
  const measuredBasisForMax = hasContainer
    ? hasPositiveMeasurement && observeContainerBasis
      ? containerBasis
      : null
    : windowExtent;
  // Never below the announced value either: a collapsed pane announces the
  // resolved minimum as its value, so the stand-in floors there as well, and
  // `aria-valuemax` can never fall under `aria-valuemin`.
  const effectiveMaxPx =
    resolvedMax !== Infinity
      ? resolvedMax
      : measuredBasisForMax == null
        ? undefined
        : Math.max(measuredBasisForMax, isCollapsed ? resolvedMin : size);

  const props: ResizableProps = {
    _size: isCollapsed ? 0 : size,
    _isCollapsed: isCollapsed,
    _onResizeStart: onResizeStart,
    _onResizeMove: onResizeMove,
    _onResizeEnd: onResizeEnd,
    _onResizeCancel: onResizeCancel,
    _minSizePx: resolvedMin,
    _maxSizePx: resolvedMax,
    _snaps: snaps,
    _collapsedSize: collapsedSize,
    _collapsible: collapsible,
    _direction: direction,
    _isResizableProps: true,
  };
  collapseControls.set(props, {collapse, expand});
  // Without a configured maximum the basis stands in — only when it is a
  // real measurement (an observed container, or the window), never the
  // temporary 1200px placeholder (component:Resizable Performance: atomic
  // pixel paths add no observer, so an unobserved container stays unknown).
  // The released no-container basis is the window WIDTH on both axes; a
  // vertical region's reported maximum reads the window height instead.
  if (effectiveMaxPx != null) {
    effectiveMaxima.set(props, effectiveMaxPx);
  }

  return {
    size: isCollapsed ? 0 : size,
    isCollapsed,
    collapse,
    expand,
    resize,
    props,
  };
}

// =============================================================================
// Multi-region hook
// =============================================================================

/**
 * Multi-region hook — delegates to individual useSingleResizable calls.
 * Region keys must be stable across renders (same count and order).
 * This is enforced by the caller providing a static `regions` object.
 */
// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- calls useSingleResizable in .map()
function useMultiResizable(
  config: UseResizableMultiConfig,
): Record<string, ResizableRegion> {
  const {regions, autoSaveId, containerRef, direction} = config;

  // Stable key order — callers must not change region keys between renders.
  // Using Object.keys is safe here because the regions object shape is static.
  const regionEntries = Object.entries(regions);

  // Call hooks unconditionally in stable order (same count every render).

  const regionResults = regionEntries.map(([key, regionConfig]) =>
    // eslint-disable-next-line @eslint-react/rules-of-hooks -- region count is stable (documented contract)
    useSingleResizable({
      ...regionConfig,
      // One container and one axis for every region (AST-010 FR11). Regions
      // stay independently pixel-selected; sharing a basis introduces no ratio
      // between them and no 100% total.
      containerRef,
      direction,
      autoSaveId: autoSaveId ? `${autoSaveId}:${key}` : undefined,
    }),
  );

  const result: Record<string, ResizableRegion> = {};
  regionEntries.forEach(([key], i) => {
    result[key] = regionResults[i];
  });
  return result;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Collapse/expand for a region, keyed by the `ResizableProps` object the hook
 * returns. A handle's Enter and double-click use them so the pane restores
 * its previous position (APG window splitter) rather than emulating the
 * toggle with a resize to the minimum.
 *
 * Kept off `ResizableProps` on purpose: that type is exported, so a new field
 * on it — optional or underscored — is a public delta. This module-private
 * map and {@link getCollapseControls} are the package's own channel between
 * the hook and the handle; neither is re-exported.
 */
type CollapseControls = {collapse: () => void; expand: () => void};
const collapseControls = new WeakMap<ResizableProps, CollapseControls>();

/**
 * The maximum an unbounded region reports as `aria-valuemax`: a measured
 * extent that stands in for the missing configured maximum — the container's
 * content box on the active axis while a percentage bound already observes
 * it, or the window's extent along the axis — floored at the current size
 * and, while collapsed, at the resolved minimum. The region is never clamped
 * to it; it is what the separator announces. Kept off the exported
 * `ResizableProps` for the same reason as the collapse controls;
 * `getEffectiveMaxPx` is internal.
 */
const effectiveMaxima = new WeakMap<ResizableProps, number>();

/** The reported maximum for `props`, or `undefined` for a hand-built object. */
export function getEffectiveMaxPx(props: ResizableProps): number | undefined {
  return effectiveMaxima.get(props);
}

/**
 * The collapse/expand pair the hook registered for `props`, or `undefined`
 * for a hand-built `ResizableProps` object (which the handle then toggles
 * with a resize gesture). Internal to the package.
 */
export function getCollapseControls(
  props: ResizableProps,
): CollapseControls | undefined {
  return collapseControls.get(props);
}

/** Removed keys must fail even when a variable bypasses excess-property checks. */
type RejectRemovedPixelBounds<Config> = Config extends unknown
  ? Config & {minSizePx?: never; maxSizePx?: never}
  : never;

type SingleResizableArgument<Config> = Config extends unknown
  ? 'regions' extends keyof Config
    ? never
    : RejectRemovedPixelBounds<Config>
  : never;

type MultiResizableArgument<Config extends UseResizableMultiConfig> =
  Config extends unknown
    ? Config & {
        regions: {
          [Key in keyof Config['regions']]: RejectRemovedPixelBounds<
            Config['regions'][Key]
          >;
        };
      }
    : never;

// =============================================================================
// The handle-taking hook: createResizable's thin React wrapper
// =============================================================================

/** What `useResizable(handleRef, options)` returns: the factory's state and controls. */
export interface UseResizableResult {
  /** The region's size in px, 0 while collapsed. */
  size: number;
  /** Whether the region is collapsed. */
  isCollapsed: boolean;
  /** Collapse the region, when it is collapsible. */
  collapse: () => void;
  /** Expand the region to the size it had before it collapsed. */
  expand: () => void;
  /** Resize the region to a pixel value, within its bounds. */
  resize: (size: number) => void;
}

const subscribeToNothing = () => () => {};
const readNoFactory = () => null;

interface ResizableEntry {
  readonly element: HTMLElement;
  readonly resizable: ResizableController;
  readonly createdWith: CreateResizableOptions;
}

/** The factory a hook holds: a small store React subscribes to. */
interface ResizableSlot {
  get(): ResizableEntry | null;
  set(next: ResizableEntry | null): void;
  subscribe(listener: () => void): () => void;
}

function createSlot(): ResizableSlot {
  let current: ResizableEntry | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next) {
      current = next;
      for (const listener of [...listeners]) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function isElementRef(value: unknown): value is RefObject<HTMLElement | null> {
  return typeof value === 'object' && value != null && 'current' in value;
}

/**
 * createResizable on the ref's element, with nothing of its own (spec:AST-107
 * FR6): it creates the factory when the element mounts, passes later options
 * through `update`, destroys it when the element goes, and returns what the
 * factory reports. Before the element exists (the server, the first render)
 * it returns the state the factory starts in.
 */
function useResizableElement(
  ref: RefObject<HTMLElement | null>,
  options: CreateResizableOptions = {},
): UseResizableResult {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [initial] = useState(() => readInitialResizableState(options));
  const [slot] = useState(createSlot);
  // The factory follows the element behind the ref. A ref is stable across
  // an element swap, so its current node is compared after every commit: a
  // new node gets a new factory, and the old one is destroyed.
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    const entry = slot.get();
    if (entry?.element === element) {
      return;
    }
    entry?.resizable.destroy();
    const createdWith = optionsRef.current;
    slot.set(
      element == null
        ? null
        : {
            element,
            resizable: createResizable(element, createdWith),
            createdWith,
          },
    );
  });
  useIsomorphicLayoutEffect(
    () => () => {
      slot.get()?.resizable.destroy();
      slot.set(null);
    },
    [slot],
  );
  const entry = useSyncExternalStore(slot.subscribe, slot.get, readNoFactory);
  useIsomorphicLayoutEffect(() => {
    if (entry != null && options !== entry.createdWith) {
      entry.resizable.update(options);
    }
  }, [entry, options]);

  const resizable = entry?.resizable ?? null;
  const size = useSyncExternalStore(
    resizable?.subscribe ?? subscribeToNothing,
    () => resizable?.size ?? initial.size,
    () => initial.size,
  );
  const isCollapsed = useSyncExternalStore(
    resizable?.subscribe ?? subscribeToNothing,
    () => resizable?.isCollapsed ?? initial.isCollapsed,
    () => initial.isCollapsed,
  );
  const collapse = useCallback(() => {
    resizable?.collapse();
  }, [resizable]);
  const expand = useCallback(() => {
    resizable?.expand();
  }, [resizable]);
  const resize = useCallback(
    (next: number) => {
      resizable?.resize(next);
    },
    [resizable],
  );
  return {size, isCollapsed, collapse, expand, resize};
}

/**
 * Makes the element behind `handleRef` a window splitter that resizes a
 * region: `createResizable` in React (spec:AST-107 FR6). The options are
 * createResizable's; later options reach the factory through `update`. Render
 * the panel at `size`.
 *
 * @example
 * ```
 * const handleRef = useRef(null);
 * const sidebar = useResizable(handleRef, {defaultSize: 260, minSize: 180});
 * <LayoutPanel width={sidebar.size}>…</LayoutPanel>
 * <ResizeHandle ref={handleRef} />
 * ```
 */
export function useResizable(
  handleRef: RefObject<HTMLElement | null>,
  options?: CreateResizableOptions,
): UseResizableResult;
export function useResizable<const Config extends UseResizableSingleConfig>(
  config: SingleResizableArgument<Config>,
): ResizableRegion;
export function useResizable<const Config extends UseResizableMultiConfig>(
  config: MultiResizableArgument<Config>,
): Record<string, ResizableRegion>;
export function useResizable(
  first:
    | RefObject<HTMLElement | null>
    | UseResizableSingleConfig
    | UseResizableMultiConfig,
  options?: CreateResizableOptions,
): UseResizableResult | ResizableRegion | Record<string, ResizableRegion> {
  if (isElementRef(first)) {
    // eslint-disable-next-line @eslint-react/rules-of-hooks, react-compiler/react-compiler -- branch is determined by call-site type (stable per call site)
    return useResizableElement(first, options);
  }
  if ('regions' in first) {
    // eslint-disable-next-line @eslint-react/rules-of-hooks, react-compiler/react-compiler -- branch is determined by call-site type (stable per call site)
    return useMultiResizable(first);
  }
  // eslint-disable-next-line @eslint-react/rules-of-hooks, react-compiler/react-compiler -- branch is determined by call-site type (stable per call site)
  return useSingleResizable(first);
}
