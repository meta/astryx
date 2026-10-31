// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useResizable.ts
 * @input Resize configuration (defaultSize, minSize, maxSize, snaps), with
 *   removed pixel-bound aliases rejected even through assembled objects, and
 *   collapse configuration (collapsible,
 *   defaultIsCollapsed, isCollapsed)
 * @output Hook return: size, isCollapsed, collapse/expand/resize methods, props for handle
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

// =============================================================================
// Types
// =============================================================================

/** Minimum size configuration. */
export type ResizableMinConfig = {minSize?: ResizableSize};

/** Maximum size configuration. */
export type ResizableMaxConfig = {maxSize?: ResizableSize};

export type ResizableDirection = 'horizontal' | 'vertical';

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

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MIN = 50;
const DEFAULT_COLLAPSED_SIZE = 40;
const STORAGE_PREFIX = 'astryx-resizable:';

// =============================================================================
// Helpers
// =============================================================================

function clampSize(
  size: number,
  min: number,
  max: number,
  snaps: number[],
): number {
  const clamped = Math.min(max, Math.max(min, size));

  // When snap points are defined, always snap to the nearest one.
  // No intermediate positions — the panel can only rest at snap values.
  if (snaps.length > 0) {
    let nearest = snaps[0];
    let nearestDist = Math.abs(clamped - nearest);
    for (let i = 1; i < snaps.length; i++) {
      const dist = Math.abs(clamped - snaps[i]);
      if (dist < nearestDist) {
        nearest = snaps[i];
        nearestDist = dist;
      }
    }
    return Math.min(max, Math.max(min, nearest));
  }

  return clamped;
}

interface PersistedResizableState {
  /** Expanded size in px, or null when the entry carries no usable size. */
  size: number | null;
  /**
   * Collapse state when the entry was written, or null when the entry
   * predates collapse persistence and says nothing about it.
   */
  isCollapsed: boolean | null;
}

/**
 * Reads a persisted entry. Three formats exist in storage:
 * - `{size, isCollapsed}` — the current format; `size` is the expanded size,
 *   so the pre-collapse width survives a collapsed session
 * - a plain non-zero number — a legacy width-only entry that never recorded
 *   collapse, so `isCollapsed` is null (unknown)
 * - a plain `0` — written by legacy collapse, which restored the region as a
 *   zero-width expanded panel (#4790); read as "collapsed, no saved size"
 */
function loadPersistedState(key: string): PersistedResizableState | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw == null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'number') {
      if (!Number.isFinite(parsed)) {
        return null;
      }
      return parsed === 0
        ? {size: null, isCollapsed: true}
        : {size: parsed, isCollapsed: null};
    }
    if (typeof parsed === 'object' && parsed != null) {
      const {size, isCollapsed} = parsed as {
        size?: unknown;
        isCollapsed?: unknown;
      };
      const hasSize =
        typeof size === 'number' && Number.isFinite(size) && size > 0;
      if (hasSize || isCollapsed === true) {
        return {
          size: hasSize ? size : null,
          isCollapsed: isCollapsed === true,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function persistState(key: string, state: PersistedResizableState): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** The released compatibility basis when there is no window to measure. */
const SERVER_BASIS = 1200;

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
const DEFAULT_SIZE_FALLBACK = 250;
const RESIZABLE_SIZE_GUIDANCE =
  'Use a non-negative number of pixels, an exact "Npx" string, an exact ' +
  '"N%" string from 0% to 100%, pixel(value), or ' +
  'percent(value, {min: pixel(value)}) / percent(value, {max: pixel(value)}).';

/** Parsed, validated input. */
type ParsedSize =
  | {kind: 'px'; value: number}
  | {kind: 'percent'; value: number; min?: number; max?: number};

const PX_PATTERN = /^(\d+(?:\.\d+)?)px$/;
const PERCENT_PATTERN = /^(\d+(?:\.\d+)?)%$/;

function parseSizeString(value: string): ParsedSize | null {
  // Preserve the released atomic fast path exactly.
  const px = PX_PATTERN.exec(value);
  if (px) {
    const parsed = Number(px[1]);
    return Number.isFinite(parsed) ? {kind: 'px', value: parsed} : null;
  }
  const percentValue = PERCENT_PATTERN.exec(value);
  if (percentValue) {
    const parsed = Number(percentValue[1]);
    return Number.isFinite(parsed) && parsed <= 100
      ? {kind: 'percent', value: parsed}
      : null;
  }
  return null;
}

function parsePixelSize(value: unknown): number | null {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as {type?: unknown; value?: unknown};
  return candidate.type === 'pixel' &&
    typeof candidate.value === 'number' &&
    Number.isFinite(candidate.value) &&
    candidate.value >= 0
    ? candidate.value
    : null;
}

function parsePercentSize(value: object): ParsedSize | null {
  if (Array.isArray(value)) {
    return null;
  }
  const candidate = value as {
    type?: unknown;
    value?: unknown;
    min?: unknown;
    max?: unknown;
  };
  if (
    candidate.type !== 'percent' ||
    typeof candidate.value !== 'number' ||
    !Number.isFinite(candidate.value) ||
    candidate.value < 0 ||
    candidate.value > 100
  ) {
    return null;
  }

  const hasMin = candidate.min !== undefined;
  const hasMax = candidate.max !== undefined;
  // Exactly one bound is required. The helper's public type enforces this for
  // typed callers; this branch preserves it for JavaScript and `any`.
  if (hasMin === hasMax) {
    return null;
  }
  if (hasMin) {
    const min = parsePixelSize(candidate.min);
    return min == null ? null : {kind: 'percent', value: candidate.value, min};
  }
  const max = parsePixelSize(candidate.max);
  return max == null ? null : {kind: 'percent', value: candidate.value, max};
}

function parseSize(value: unknown): ParsedSize | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? {kind: 'px', value} : null;
  }
  if (typeof value === 'string') {
    return parseSizeString(value);
  }
  if (typeof value === 'object' && value != null) {
    const pixelValue = parsePixelSize(value);
    return pixelValue == null
      ? parsePercentSize(value)
      : {kind: 'px', value: pixelValue};
  }
  return null;
}

/** Whether this parsed value must be recomputed when its basis changes. */
function dependsOnBasis(parsed: ParsedSize | null): boolean {
  return parsed?.kind === 'percent';
}

/** Resolve a parsed size against its basis, then apply its one pixel bound. */
function toPixels(parsed: ParsedSize, basis: number | null): number | null {
  if (parsed.kind === 'px') {
    return parsed.value;
  }
  if (basis == null) {
    return null;
  }
  const percentagePx = Math.round((parsed.value / 100) * basis);
  if (parsed.min !== undefined) {
    return Math.max(percentagePx, parsed.min);
  }
  if (parsed.max !== undefined) {
    return Math.min(percentagePx, parsed.max);
  }
  return percentagePx;
}

function describeUnknown(value: unknown): string {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function describePixelCandidate(value: unknown): string {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    return describeUnknown(value);
  }
  const candidate = value as {type?: unknown; value?: unknown};
  return candidate.type === 'pixel'
    ? `{"type":"pixel","value":${describeUnknown(candidate.value)}}`
    : describeUnknown(value);
}

function describeSize(value: unknown): string {
  if (typeof value === 'object' && value != null && !Array.isArray(value)) {
    const candidate = value as {
      type?: unknown;
      value?: unknown;
      min?: unknown;
      max?: unknown;
    };
    if (candidate.type === 'pixel') {
      return describePixelCandidate(value);
    }
    if (candidate.type === 'percent') {
      const fields = [
        '"type":"percent"',
        `"value":${describeUnknown(candidate.value)}`,
      ];
      if (candidate.min !== undefined) {
        fields.push(`"min":${describePixelCandidate(candidate.min)}`);
      }
      if (candidate.max !== undefined) {
        fields.push(`"max":${describePixelCandidate(candidate.max)}`);
      }
      return `{${fields.join(',')}}`;
    }
  }
  return describeUnknown(value);
}

/**
 * Resolves one configured value, applying its role's fallback when the input is
 * not accepted. The warning remains development-only through `devWarn`; every
 * build takes the same deterministic fallback.
 */
function resolveBound(
  raw: unknown,
  parsed: ParsedSize | null,
  basis: number | null,
  fallback: number,
  label: string,
  accepted: string,
  didWarnRef: {current: boolean},
): number {
  if (raw === undefined) {
    return fallback;
  }
  // Preserve the released explicit unbounded maximum. Other roles still
  // reject non-finite numbers.
  if (raw === Infinity && fallback === Infinity) {
    return Infinity;
  }
  if (parsed == null) {
    if (!didWarnRef.current) {
      didWarnRef.current = true;
      devWarn(
        'useResizable',
        `${label}: ${describeSize(raw)} is not a size. ${accepted} ` +
          `Falling back to ${fallback}.`,
      );
    }
    return fallback;
  }
  return toPixels(parsed, basis) ?? fallback;
}

/**
 * The container's content-box size on the active axis.
 *
 * Content box, not border box: a bordered or padded container would otherwise
 * report a basis a few pixels larger than the space a percentage is actually a
 * share of, and that error lands in `aria-valuemax`. The observer entry
 * carries `contentBoxSize` natively, which is already writing-mode aware;
 * measuring the element is the fallback for the synthetic entry
 * `observeResize` fires on registration.
 */
function measureContentBox(
  element: HTMLElement,
  direction: ResizableDirection,
  entry?: ResizeObserverEntry,
): number | null {
  const box = entry?.contentBoxSize?.[0];
  if (box) {
    return direction === 'vertical' ? box.blockSize : box.inlineSize;
  }
  const style =
    typeof window === 'undefined' ? null : window.getComputedStyle(element);
  if (style == null) {
    return null;
  }
  const size =
    direction === 'vertical'
      ? element.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom)
      : element.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
  return Number.isFinite(size) ? size : null;
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
  // Only forces the render that releases the frozen basis when a gesture ends.
  const [gestureTick, setGestureTick] = useState(0);
  void gestureTick;
  const basis = gestureBasisRef.current ?? liveBasis;

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

  useEffect(() => {
    // Nothing is written while the basis is still the temporary stand-in. The
    // size on such a render is a placeholder, and persisting it overwrites the
    // real saved size with a value derived from a basis that was never real
    // (AST-010 Platform support, FR9).
    if (autoSaveId && isBasisMeasured) {
      persistState(autoSaveId, {size, isCollapsed});
    }
  }, [size, isCollapsed, autoSaveId, isBasisMeasured]);

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
  // became during the gesture.
  const releaseGestureBasis = useCallback(() => {
    if (gestureBasisRef.current != null) {
      gestureBasisRef.current = null;
      setGestureTick(tick => tick + 1);
    }
  }, []);

  const onResizeEnd = useCallback(() => {
    // Sizes are already committed during move; only the basis is held.
    releaseGestureBasis();
  }, [releaseGestureBasis]);

  // A gesture that is cancelled rather than completed — pointercancel, a lost
  // capture, a handle unmounted mid-drag — is still over. It does not signal a
  // resize end (that is #5297's contract, and the sizes were committed during
  // move anyway), but the basis it froze has to come back, or every later
  // percentage bound stays pinned to the container size at grab time.
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

export function useResizable<const Config extends UseResizableSingleConfig>(
  config: SingleResizableArgument<Config>,
): ResizableRegion;
export function useResizable<const Config extends UseResizableMultiConfig>(
  config: MultiResizableArgument<Config>,
): Record<string, ResizableRegion>;
export function useResizable(
  config: UseResizableSingleConfig | UseResizableMultiConfig,
): ResizableRegion | Record<string, ResizableRegion> {
  if ('regions' in config) {
    // eslint-disable-next-line @eslint-react/rules-of-hooks, react-compiler/react-compiler -- branch is determined by call-site type (stable per call site)
    return useMultiResizable(config);
  }
  // eslint-disable-next-line @eslint-react/rules-of-hooks, react-compiler/react-compiler -- branch is determined by call-site type (stable per call site)
  return useSingleResizable(config);
}
