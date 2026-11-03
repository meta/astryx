// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createResizable.ts
 * @input A region's options
 * @output createResizable; readInitialResizableState for the hook's first
 *   render; createResizableAs and the internal channel for the hook
 * @position The Resizable family's region, internal to the package. The
 *   configuration-object useResizable builds on it, and ResizeHandle drives
 *   it through resizeGesture.ts's model. Importing it does no DOM work
 */

import {observeResize} from '../utils/sharedResizeObserver';
import {devWarn} from '../utils/devWarning';
import type {SizeValue} from '../utils/types';
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
import type {ResizeGestureModel, ResizeGestureState} from './resizeGesture';
import type {ResizableSize} from './utils';

export interface CreateResizableOptions {
  /**
   * Initial size. A number or an exact `Npx` is pixels, and an exact `N%` is
   * a share of the basis. `percent(value, {min | max: pixel(value)})` adds one
   * pixel floor or ceiling. A value that depends on the basis resolves once
   * into pixels. @default 250
   */
  defaultSize?: ResizableSize | SizeValue;
  /** The minimum size, in the same forms. @default 50 */
  minSize?: ResizableSize;
  /** The maximum size, in the same forms. Unbounded when omitted. */
  maxSize?: ResizableSize;
  /** Pixel values the region rests on; it can rest only on one of them. */
  snaps?: number[];
  /** Whether the region can collapse to 0. @default false */
  collapsible?: boolean;
  /** Size in px under which a drag collapses the region. @default 40 */
  collapsedSize?: number;
  /**
   * The element a percentage is a share of, read as `containerRef.current`.
   * Omitted, percentages are a share of the viewport. A plain `{current}`
   * object serves outside React.
   */
  containerRef?: {readonly current: HTMLElement | null};
  /** The axis the region resizes along. @default 'horizontal' */
  direction?: ResizableDirection;
  /** Key under which the size and collapse state persist in localStorage. */
  autoSaveId?: string;
  /** Initial collapse state; a persisted entry wins over it. */
  defaultIsCollapsed?: boolean;
  /**
   * Controlled collapse state. When set, the caller owns collapse. A collapse
   * or expand request reports through `onCollapseChange`. Nothing changes
   * until the caller passes the new value through `update`.
   */
  isCollapsed?: boolean;
  /** Called when an interaction changes the size. */
  onSizeChange?: (size: number) => void;
  /** Called when an interaction collapses or expands the region. */
  onCollapseChange?: (isCollapsed: boolean) => void;
}

export interface ResizableController {
  /** The region's size in px, 0 while collapsed. */
  readonly size: number;
  readonly isCollapsed: boolean;
  /** Collapses the region, when it is collapsible. */
  collapse(): void;
  /** Expands the region to the size it had before it collapsed. */
  expand(): void;
  /** Resizes the region to `size` px, within its bounds. */
  resize(size: number): void;
  /**
   * Takes the full set of options, as a new render does: an option left out
   * returns to its default. The region keeps its size and collapse state,
   * within the new options.
   */
  update(options: CreateResizableOptions): void;
  /**
   * Calls `listener` after every change to `size` or `isCollapsed`, a
   * correction a newly measured basis makes included. Returns the function
   * that stops it.
   */
  subscribe(listener: () => void): () => void;
  /** Stops every observer the factory started; a gesture in flight ends. */
  destroy(): void;
}

/** The viewport width, the basis without a container. */
function readViewportBasis(): number {
  return typeof window === 'undefined' ? SERVER_BASIS : window.innerWidth;
}

/** The window's extent along the axis, for an unbounded region's maximum. */
function readWindowExtent(direction: ResizableDirection): number | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return direction === 'vertical' ? window.innerHeight : window.innerWidth;
}

/** A warning already given, so a resolution repeated silently stays quiet. */
const QUIET = {current: true};

/**
 * The state a region with `options` starts in: the server's render and a
 * hook's first render. A container is not measured
 * yet, so a percentage of it resolves against the deterministic 1200px basis
 * until the factory measures it. `'server'` reads the state the server
 * rendered, for a render that hydrates it: the 1200px basis for a viewport
 * percentage too, and nothing saved.
 */
export function readInitialResizableState(
  options: CreateResizableOptions = {},
  environment: 'client' | 'server' = 'client',
): ResizableSnapshot {
  const {
    defaultSize,
    minSize,
    maxSize,
    containerRef,
    collapsible = false,
    snaps = [],
    autoSaveId,
    defaultIsCollapsed,
    isCollapsed: controlled,
  } = options;
  const isServer = environment === 'server';
  const persisted =
    autoSaveId && !isServer ? loadPersistedState(autoSaveId) : null;
  const parsedDefault = parseSize(defaultSize);
  const parsedMin = parseSize(minSize);
  const parsedMax = parseSize(maxSize);
  const hasContainer = containerRef != null;
  const needsContainer =
    hasContainer &&
    (dependsOnBasis(parsedMin) ||
      dependsOnBasis(parsedMax) ||
      (persisted?.size == null && dependsOnBasis(parsedDefault)));
  const basis = hasContainer || isServer ? SERVER_BASIS : readViewportBasis();
  const min = resolveBound(
    minSize,
    parsedMin,
    basis,
    DEFAULT_MIN,
    'minSize',
    RESIZABLE_SIZE_GUIDANCE,
    QUIET,
  );
  const max = resolveBound(
    maxSize,
    parsedMax,
    basis,
    Infinity,
    'maxSize',
    RESIZABLE_SIZE_GUIDANCE,
    QUIET,
  );
  const defaultPx = resolveBound(
    defaultSize,
    parsedDefault,
    basis,
    DEFAULT_SIZE_FALLBACK,
    'defaultSize',
    RESIZABLE_SIZE_GUIDANCE,
    QUIET,
  );
  const chosen =
    persisted?.size ??
    (needsContainer ? null : clampSize(defaultPx, min, max, snaps));
  const size = clampSize(chosen ?? defaultPx, min, max, snaps);
  const isCollapsed =
    collapsible &&
    (controlled !== undefined
      ? controlled
      : (persisted?.isCollapsed ?? defaultIsCollapsed ?? false));
  // A container is not measured yet; without one the window's extent stands
  // in for a missing maximum, as the factory reports it.
  const windowExtent =
    hasContainer || isServer
      ? null
      : readWindowExtent(options.direction ?? 'horizontal');
  return {
    size: isCollapsed ? 0 : size,
    isCollapsed,
    expandedSize: size,
    minPx: min,
    maxPx: max,
    effectiveMaxPx:
      max !== Infinity
        ? max
        : windowExtent == null
          ? undefined
          : Math.max(windowExtent, isCollapsed ? min : size),
  };
}

/**
 * What a React form of the region renders. A change to any part replaces it
 * as a whole. It holds the size (0 while collapsed), the collapse state, the
 * size as expanded, and the bounds the handle announces.
 */
export interface ResizableSnapshot {
  readonly size: number;
  readonly isCollapsed: boolean;
  readonly expandedSize: number;
  readonly minPx: number;
  readonly maxPx: number;
  /** The maximum the handle reports: a configured one, or a measured extent. */
  readonly effectiveMaxPx: number | undefined;
}

/**
 * The package's own channel into a factory, for useResizable: kept off the
 * exported ResizableController, so it adds no public member.
 */
interface ResizableInternals {
  snapshot(): ResizableSnapshot;
  /** Calls `listener` after every change to the snapshot. */
  subscribeSnapshot(listener: () => void): () => void;
  /**
   * Follows the element behind `containerRef` when it has changed without
   * new options, as a React caller's commit may have swapped it.
   */
  syncContainer(): void;
  /**
   * Lets go of the page and keeps the region. A gesture in flight ends as
   * cancelled, and the observers go. Collapse, expand and resize still apply
   * and report. For a React caller whose component unmounts or an
   * `<Activity>` hides.
   */
  suspend(): void;
  /** Takes the page back after `suspend`: the observers. */
  resume(): void;
  /**
   * The region's side of a ResizeHandle's gesture: the drag and keys of a
   * ResizeHandle given the configuration object's props.
   */
  model: ResizeGestureModel;
}

const internals = new WeakMap<ResizableController, ResizableInternals>();

/** The factory's internal channel, or undefined for anything else. */
export function readResizableInternals(
  controller: ResizableController,
): ResizableInternals | undefined {
  return internals.get(controller);
}

/**
 * A resizable region, without React. The factory never sizes the panel: it
 * reports the size, and the caller applies it. It resolves, clamps, snaps,
 * collapses and saves the size, and a percentage follows its basis.
 * `destroy` stops its observers.
 */
export function createResizable(
  options: CreateResizableOptions = {},
): ResizableController {
  return createResizableAs('createResizable', options);
}

/**
 * Who a factory's development warnings speak for: the bare factory, or the
 * configuration-object useResizable built on it, whose warnings keep the
 * hook's name and words.
 */
export type ResizableWarningSource = 'createResizable' | 'useResizable';

/**
 * createResizable, with its development warnings in the words of `source`:
 * the package's own entry, for useResizable.
 */
export function createResizableAs(
  source: ResizableWarningSource,
  options: CreateResizableOptions = {},
): ResizableController {
  // The configuration-object useResizable keeps its warnings word for word.
  const isHook = source === 'useResizable';
  let opts = options;
  let isDestroyed = false;
  // Let go of the page by `suspend`, with the region kept.
  let isSuspended = false;
  const listeners = new Set<() => void>();
  const didWarn = {
    min: {current: false},
    max: {current: false},
    defaultSize: {current: false},
    inverted: false,
  };

  let persistedKey = opts.autoSaveId;
  let persisted: PersistedResizableState | null = persistedKey
    ? loadPersistedState(persistedKey)
    : null;

  // The percentage basis. The container is followed through the shared
  // observer only while some option needs it; the viewport only while a
  // percentage bound needs it.
  let containerElement: HTMLElement | null = null;
  let observedDirection: ResizableDirection | null = null;
  let containerBasis: number | null = null;
  let stopObservingContainer: (() => void) | null = null;
  let isSubscribing = false;
  let isObservingViewport = false;

  // One stable basis per gesture: a container that resizes mid-drag would
  // otherwise move the bound under the pointer.
  let gestureBasis: number | null = null;
  let isGestureActive = false;
  let dragStartSize = 0;

  let initialDefault: {px: number; isFinal: boolean} | null = null;
  let chosenSize: number | null | undefined;
  let committedBounds: {min: number; max: number} | null = null;
  let uncontrolledIsCollapsed =
    persisted?.isCollapsed ?? opts.defaultIsCollapsed ?? false;

  // What the region last computed, notified and wrote.
  let derived = {
    size: 0,
    isCollapsed: false,
    min: DEFAULT_MIN,
    max: Infinity,
    effectiveMax: undefined as number | undefined,
    isBasisMeasured: true,
  };
  let notified: {size: number; isCollapsed: boolean} | null = null;
  let written: {key: string; size: number; isCollapsed: boolean} | null = null;
  let mustWrite = false;
  let snapshot: ResizableSnapshot | null = null;
  const snapshotListeners = new Set<() => void>();

  const direction = (): ResizableDirection => opts.direction ?? 'horizontal';
  const collapsible = (): boolean => opts.collapsible ?? false;
  const isControlled = (): boolean => opts.isCollapsed !== undefined;
  const snaps = (): number[] => opts.snaps ?? [];

  const onViewportResize = () => {
    commit();
  };

  /** Which bases the options need followed right now. */
  function observation() {
    const parsedDefault = parseSize(opts.defaultSize);
    const boundsDependOnBasis =
      dependsOnBasis(parseSize(opts.minSize)) ||
      dependsOnBasis(parseSize(opts.maxSize));
    const defaultNeedsInitialBasis =
      persisted?.size == null &&
      dependsOnBasis(parsedDefault) &&
      initialDefault?.isFinal !== true;
    const hasContainer = opts.containerRef != null;
    return {
      hasContainer,
      container:
        hasContainer && (boundsDependOnBasis || defaultNeedsInitialBasis),
      viewport: !hasContainer && boundsDependOnBasis,
    };
  }

  /** Follow the bases `observation()` names, and nothing else. */
  function syncObservation(): void {
    const needs = observation();
    const element = needs.container
      ? (opts.containerRef?.current ?? null)
      : null;
    if (element !== containerElement || observedDirection !== direction()) {
      stopObservingContainer?.();
      stopObservingContainer = null;
      containerElement = element;
      containerBasis = null;
      observedDirection = direction();
      if (element != null) {
        // The observer measures once as it registers; that measurement is
        // read by the computation this call is part of.
        isSubscribing = true;
        const observed = element;
        stopObservingContainer = observeResize(observed, entry => {
          containerBasis = measureContentBox(observed, direction(), entry);
          if (!isSubscribing) {
            commit();
          }
        });
        isSubscribing = false;
      }
    }
    const watchViewport = needs.viewport && typeof window !== 'undefined';
    if (watchViewport && !isObservingViewport) {
      window.addEventListener('resize', onViewportResize);
      isObservingViewport = true;
    } else if (!watchViewport && isObservingViewport) {
      window.removeEventListener('resize', onViewportResize);
      isObservingViewport = false;
    }
  }

  /** The region's state from its options, its basis and its selection. */
  function compute(): void {
    const needs = observation();
    const hasPositiveMeasurement = containerBasis != null && containerBasis > 0;
    // Before a supplied container is measured, the deterministic 1200px
    // stands in. It also stands in while the container measures 0, as a
    // hidden or detached one does. The first real measurement replaces it.
    const liveBasis = needs.hasContainer
      ? hasPositiveMeasurement
        ? (containerBasis as number)
        : SERVER_BASIS
      : readViewportBasis();
    const isBasisMeasured = needs.container ? hasPositiveMeasurement : true;
    const basis = gestureBasis ?? liveBasis;

    const min = resolveBound(
      opts.minSize,
      parseSize(opts.minSize),
      basis,
      DEFAULT_MIN,
      'minSize',
      RESIZABLE_SIZE_GUIDANCE,
      didWarn.min,
      source,
    );
    const max = resolveBound(
      opts.maxSize,
      parseSize(opts.maxSize),
      basis,
      Infinity,
      'maxSize',
      RESIZABLE_SIZE_GUIDANCE,
      didWarn.max,
      source,
    );
    // A basis-dependent default resolves ONCE into a pixel size; it is final
    // once its basis is real.
    if (initialDefault == null || !initialDefault.isFinal) {
      initialDefault = {
        px: resolveBound(
          opts.defaultSize,
          parseSize(opts.defaultSize),
          basis,
          DEFAULT_SIZE_FALLBACK,
          'defaultSize',
          RESIZABLE_SIZE_GUIDANCE,
          didWarn.defaultSize,
          source,
        ),
        isFinal: isBasisMeasured,
      };
    }
    const defaultPx = initialDefault.px;
    if (chosenSize === undefined) {
      chosenSize =
        persisted?.size ??
        (isBasisMeasured ? clampSize(defaultPx, min, max, snaps()) : null);
    }
    if (isBasisMeasured && chosenSize == null) {
      // The container is measured now: the selection the temporary basis
      // stood in for is made against the real one. Not an interaction, so it
      // reports nothing through onSizeChange.
      chosenSize = clampSize(defaultPx, min, max, snaps());
    }
    // A re-resolved bound clamps the SELECTION, once the basis is final and
    // no gesture holds it.
    if (
      isBasisMeasured &&
      gestureBasis == null &&
      (committedBounds == null ||
        committedBounds.min !== min ||
        committedBounds.max !== max)
    ) {
      committedBounds = {min, max};
      if (chosenSize != null) {
        chosenSize = clampSize(chosenSize, min, max, snaps());
      }
    }
    const size = clampSize(chosenSize ?? defaultPx, min, max, snaps());
    const isCollapsed =
      collapsible() &&
      (isControlled() ? Boolean(opts.isCollapsed) : uncontrolledIsCollapsed);

    if (min > max && !didWarn.inverted) {
      didWarn.inverted = true;
      devWarn(
        source,
        `the resolved minimum (${min}px) is above the resolved maximum ` +
          `(${max}px). The maximum wins${isHook ? ', as it always has' : ''}.`,
      );
    }

    // The maximum the handle REPORTS: a configured maximum, or a measured
    // extent standing in for it, never below what the handle announces.
    const measuredForMax = needs.hasContainer
      ? hasPositiveMeasurement && needs.container
        ? containerBasis
        : null
      : readWindowExtent(direction());
    const effectiveMax =
      max !== Infinity
        ? max
        : measuredForMax == null
          ? undefined
          : Math.max(measuredForMax, isCollapsed ? min : size);

    derived = {size, isCollapsed, min, max, effectiveMax, isBasisMeasured};
  }

  /** Recompute, then bring the observers, storage and subscribers along. */
  function commit(): void {
    if (isDestroyed) {
      return;
    }
    if (isSuspended) {
      // No observers: the last measured basis stands.
      compute();
    } else {
      // The observation a computation needs can change with it (a default
      // made final stops following its container): settle both.
      for (let pass = 0; pass < 3; pass++) {
        const before = observation();
        syncObservation();
        compute();
        const after = observation();
        if (
          before.container === after.container &&
          before.viewport === after.viewport
        ) {
          break;
        }
      }
    }
    persist();
    const reported = {
      size: derived.isCollapsed ? 0 : derived.size,
      isCollapsed: derived.isCollapsed,
    };
    const next: ResizableSnapshot = {
      size: reported.size,
      isCollapsed: reported.isCollapsed,
      expandedSize: derived.size,
      minPx: derived.min,
      maxPx: derived.max,
      effectiveMaxPx: derived.effectiveMax,
    };
    const isSnapshotChanged =
      snapshot == null ||
      (Object.keys(next) as (keyof ResizableSnapshot)[]).some(
        key => snapshot?.[key] !== next[key],
      );
    if (isSnapshotChanged) {
      snapshot = next;
    }
    if (
      notified == null ||
      notified.size !== reported.size ||
      notified.isCollapsed !== reported.isCollapsed
    ) {
      const isFirst = notified == null;
      notified = reported;
      if (!isFirst) {
        for (const listener of [...listeners]) {
          listener();
        }
      }
    }
    if (isSnapshotChanged) {
      for (const listener of [...snapshotListeners]) {
        listener();
      }
    }
  }

  /** Nothing is written while the basis stands in, nor while a gesture runs. */
  function persist(): void {
    const key = opts.autoSaveId;
    if (key == null || key === '' || !derived.isBasisMeasured) {
      return;
    }
    if (isGestureActive) {
      return;
    }
    const next = {key, size: derived.size, isCollapsed: derived.isCollapsed};
    if (
      mustWrite ||
      written == null ||
      written.key !== next.key ||
      written.size !== next.size ||
      written.isCollapsed !== next.isCollapsed
    ) {
      mustWrite = false;
      written = next;
      persistState(key, {size: next.size, isCollapsed: next.isCollapsed});
    }
  }

  const setCollapsed = (value: boolean) => {
    if (!isControlled()) {
      uncontrolledIsCollapsed = value;
    }
  };

  function collapse(): void {
    if (isDestroyed || !collapsible() || derived.isCollapsed) {
      return;
    }
    setCollapsed(true);
    commit();
    opts.onCollapseChange?.(true);
    opts.onSizeChange?.(0);
  }

  function expand(): void {
    if (isDestroyed) {
      return;
    }
    const wasCollapsed = derived.isCollapsed;
    setCollapsed(false);
    commit();
    if (wasCollapsed) {
      opts.onCollapseChange?.(false);
    }
    opts.onSizeChange?.(derived.size);
  }

  function resize(next: number): void {
    if (isDestroyed) {
      return;
    }
    // An invalid size repairs nothing: it must not replace a legal selection
    // with NaN, which would reach storage and aria-valuenow.
    if (!Number.isFinite(next) || next < 0) {
      devWarn(
        source,
        `resize(${String(next)}) is not a pixel size. Keeping the current ` +
          `size. Percentages configure the ${isHook ? 'hook' : 'region'}; ` +
          'they are not a programmatic input.',
      );
      return;
    }
    const clamped = clampSize(next, derived.min, derived.max, snaps());
    const wasCollapsed = derived.isCollapsed;
    chosenSize = clamped;
    setCollapsed(false);
    commit();
    // Resizing out of the collapsed state is an implicit expand.
    if (wasCollapsed) {
      opts.onCollapseChange?.(false);
    }
    opts.onSizeChange?.(clamped);
  }

  const model: ResizeGestureModel = {
    state(): ResizeGestureState {
      return {
        size: derived.isCollapsed ? 0 : derived.size,
        isCollapsed: derived.isCollapsed,
        minPx: derived.min,
        maxPx: derived.max,
        snaps: snaps(),
        collapsedSize: opts.collapsedSize ?? DEFAULT_COLLAPSED_SIZE,
        collapsible: collapsible(),
      };
    },
    start() {
      // The basis holds still for the whole gesture.
      gestureBasis = readLiveBasis();
      isGestureActive = true;
      dragStartSize = derived.isCollapsed ? 0 : derived.size;
    },
    move(delta) {
      const raw = dragStartSize + delta;
      const collapsedSize = opts.collapsedSize ?? DEFAULT_COLLAPSED_SIZE;
      if (collapsible() && raw < collapsedSize) {
        if (!derived.isCollapsed) {
          setCollapsed(true);
          commit();
          opts.onCollapseChange?.(true);
          opts.onSizeChange?.(0);
        }
        return;
      }
      const reopens = derived.isCollapsed && raw >= collapsedSize;
      if (reopens) {
        setCollapsed(false);
      }
      const clamped = clampSize(raw, derived.min, derived.max, snaps());
      chosenSize = clamped;
      commit();
      if (reopens) {
        opts.onCollapseChange?.(false);
      }
      opts.onSizeChange?.(clamped);
    },
    end() {
      endGesture();
    },
    // A cancelled gesture is still over: the basis it held comes back, and
    // the size it reached is saved once, like a completed one.
    cancel() {
      endGesture();
    },
    collapse,
    expand,
  };

  function readLiveBasis(): number {
    const needs = observation();
    if (!needs.hasContainer) {
      return readViewportBasis();
    }
    return containerBasis != null && containerBasis > 0
      ? containerBasis
      : SERVER_BASIS;
  }

  function endGesture(): void {
    if (!isGestureActive) {
      return;
    }
    gestureBasis = null;
    isGestureActive = false;
    mustWrite = true;
    commit();
  }

  /** The observers go; a gesture in flight has ended first. */
  function letGoOfPage(): void {
    stopObservingContainer?.();
    stopObservingContainer = null;
    containerElement = null;
    if (isObservingViewport) {
      window.removeEventListener('resize', onViewportResize);
      isObservingViewport = false;
    }
  }

  commit();

  const controller: ResizableController = {
    get size() {
      return derived.isCollapsed ? 0 : derived.size;
    },
    get isCollapsed() {
      return derived.isCollapsed;
    },
    collapse,
    expand,
    resize,
    update(next) {
      if (isDestroyed) {
        return;
      }
      opts = next;
      if (opts.autoSaveId !== persistedKey) {
        persistedKey = opts.autoSaveId;
        persisted = persistedKey ? loadPersistedState(persistedKey) : null;
      }
      commit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      if (isDestroyed) {
        return;
      }
      // A gesture a ResizeHandle drove through the region's model ends first,
      // so the size it reached is saved.
      endGesture();
      isDestroyed = true;
      if (!isSuspended) {
        letGoOfPage();
      }
      listeners.clear();
      snapshotListeners.clear();
    },
  };
  internals.set(controller, {
    snapshot: () => snapshot as ResizableSnapshot,
    subscribeSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => {
        snapshotListeners.delete(listener);
      };
    },
    model,
    suspend() {
      if (isDestroyed || isSuspended) {
        return;
      }
      endGesture();
      isSuspended = true;
      letGoOfPage();
    },
    resume() {
      if (isDestroyed || !isSuspended) {
        return;
      }
      isSuspended = false;
      commit();
    },
    syncContainer() {
      if (isDestroyed || isSuspended) {
        return;
      }
      const element = observation().container
        ? (opts.containerRef?.current ?? null)
        : null;
      if (element !== containerElement) {
        commit();
      }
    },
  });
  return controller;
}
