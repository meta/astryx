// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createResizable.ts
 * @input A handle element (or null, for a region with no handle yet) and the
 *   region's options: its size, bounds, snap
 *   points, collapse, persistence key, percentage basis, axis, and the
 *   handle's reversal, disabled state and name
 * @output createResizable(handle, options) → {size, isCollapsed, collapse,
 *   expand, resize, update, subscribe, destroy}: a resizable region driven by
 *   a window-splitter handle, with no React (spec:AST-107 FR6;
 *   `architecture:public-component-api` INV22)
 * @position The Resizable family's factory, internal to the package; its
 *   input is resizeGesture.ts. Importing it does no DOM work, so it is safe
 *   on the server
 *
 * The factory never sizes the panel: it reports the size, through
 * `onSizeChange` for an interaction and `subscribe` for every change, and the
 * caller applies it, as a React caller renders it.
 */

import enCatalog from '../i18n/generated-locales/en.generated';
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
import {
  createResizeGesture,
  type ResizeGesture,
  type ResizeGestureModel,
  type ResizeGestureState,
} from './resizeGesture';
import type {ResizableSize} from './utils';

/**
 * The catalog's messages for the handle: its name when no other is given, and
 * what it announces while collapsed (the shipped English messages).
 */
const LABEL_KEY = '@astryx.resizable.handle.label';
const COLLAPSED_LABEL_KEY = '@astryx.resizable.collapsed';

export interface CreateResizableOptions {
  /**
   * Initial size: a number or exact `Npx` is pixels, an exact `N%` is a share
   * of the basis, and `percent(value, {min | max: pixel(value)})` adds one
   * pixel floor or ceiling. A basis-dependent value resolves once into a pixel
   * size. @default 250
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
   * Controlled collapse state. When set, the caller owns collapse: a request
   * to collapse or expand reports through `onCollapseChange` and changes
   * nothing until the caller passes the new value through `update`.
   */
  isCollapsed?: boolean;
  /** Called when an interaction changes the size. */
  onSizeChange?: (size: number) => void;
  /** Called when an interaction collapses or expands the region. */
  onCollapseChange?: (isCollapsed: boolean) => void;
  /**
   * The handle sits after the panel it resizes (the panel is at the end), so
   * a drag toward the start grows it.
   * @default false
   */
  isReversed?: boolean;
  /**
   * Ignores pointer and keyboard input and says so; the handle keeps its tab
   * stop.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * The handle's accessible name, when the element has none of its own.
   * Without it, the message catalog's English message names it.
   * @default 'Resize handle'
   */
  label?: string;
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
  /**
   * Removes every listener, observer and attribute the factory added and the
   * body's drag cursor; a drag in flight ends as cancelled.
   */
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

/** The attributes the factory writes on a handle, restored by `destroy`. */
const MANAGED_ATTRIBUTES = [
  'role',
  'tabindex',
  'aria-label',
  'aria-orientation',
  'aria-valuenow',
  'aria-valuemin',
  'aria-valuemax',
  'aria-valuetext',
  'aria-disabled',
  'data-resizing',
] as const;

/**
 * Make `handle` a window splitter that resizes a region (spec:AST-107 FR6;
 * component:Resizable FR3).
 *
 * It gives the handle `role="separator"`, a tab stop and an accessible name
 * when it has none of its own, its orientation and its value, and answers a
 * pointer drag (holding the pointer for the whole drag), the arrow keys, Home,
 * End, and Enter and a double-click to collapse and restore. A horizontal
 * region resizes along the inline axis, and under right-to-left the drag
 * follows the pointer. `destroy` takes all of it away. With a null handle the
 * region has no handle yet: it still answers collapse, expand, resize and
 * subscribe, and touches no element.
 *
 * @example
 * ```
 * const sidebar = document.querySelector('#sidebar');
 * const resizable = createResizable(document.querySelector('#divider'), {
 *   defaultSize: 260,
 *   minSize: 180,
 *   maxSize: 480,
 *   collapsible: true,
 *   autoSaveId: 'sidebar',
 * });
 * const paint = () => {
 *   sidebar.style.width = `${resizable.size}px`;
 * };
 * paint();
 * resizable.subscribe(paint);
 * ```
 */
export function createResizable(
  handle: HTMLElement | null,
  options: CreateResizableOptions = {},
): ResizableController {
  let opts = options;
  let isDestroyed = false;
  const listeners = new Set<() => void>();
  // The element the factory drives: its listeners and attributes.
  const drivenHandle = handle;
  const isReversed = (): boolean => opts.isReversed ?? false;
  const isDisabled = (): boolean => opts.isDisabled ?? false;
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

  // What the region last computed, notified, wrote, and announced.
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
    // Before a supplied container has been measured (and while it measures
    // 0, as a hidden or detached one does), the deterministic 1200px stands
    // in, and the first real measurement replaces it.
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
      'createResizable',
    );
    const max = resolveBound(
      opts.maxSize,
      parseSize(opts.maxSize),
      basis,
      Infinity,
      'maxSize',
      RESIZABLE_SIZE_GUIDANCE,
      didWarn.max,
      'createResizable',
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
          'createResizable',
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
        'createResizable',
        `the resolved minimum (${min}px) is above the resolved maximum ` +
          `(${max}px). The maximum wins.`,
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

  /** Recompute, then bring the observers, the handle, storage and subscribers along. */
  function commit(): void {
    if (isDestroyed) {
      return;
    }
    // The observation a computation needs can change with it (a default made
    // final stops following its container): settle both.
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
    if (drivenHandle != null) {
      announce();
    }
    persist();
    const reported = {
      size: derived.isCollapsed ? 0 : derived.size,
      isCollapsed: derived.isCollapsed,
    };
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

  // --- The handle's attributes ---
  const original = new Map<string, string | null>();
  if (drivenHandle != null) {
    for (const name of MANAGED_ATTRIBUTES) {
      original.set(name, drivenHandle.getAttribute(name));
    }
  }
  const hasOwnName =
    drivenHandle != null &&
    (drivenHandle.hasAttribute('aria-label') ||
      drivenHandle.hasAttribute('aria-labelledby'));

  const setAttribute = (name: string, value: string | null) => {
    if (drivenHandle == null) {
      return;
    }
    if (value == null) {
      drivenHandle.removeAttribute(name);
    } else if (drivenHandle.getAttribute(name) !== value) {
      drivenHandle.setAttribute(name, value);
    }
  };

  function announce(): void {
    if (original.get('role') == null) {
      setAttribute('role', 'separator');
    }
    if (original.get('tabindex') == null) {
      setAttribute('tabindex', '0');
    }
    if (!hasOwnName) {
      setAttribute('aria-label', opts.label ?? enCatalog[LABEL_KEY]);
    }
    setAttribute(
      'aria-orientation',
      direction() === 'horizontal' ? 'vertical' : 'horizontal',
    );
    const {size, isCollapsed, min, effectiveMax} = derived;
    // A collapsed pane's real size (0) sits below aria-valuemin, which is
    // invalid; it announces its minimum and says it is collapsed instead.
    setAttribute('aria-valuenow', String(isCollapsed ? min : size));
    setAttribute('aria-valuemin', String(min));
    setAttribute(
      'aria-valuemax',
      effectiveMax != null && Number.isFinite(effectiveMax)
        ? String(effectiveMax)
        : null,
    );
    setAttribute(
      'aria-valuetext',
      isCollapsed ? enCatalog[COLLAPSED_LABEL_KEY] : null,
    );
    setAttribute('aria-disabled', isDisabled() ? 'true' : null);
  }

  // --- State changes ---
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
        'createResizable',
        `resize(${String(next)}) is not a pixel size. Keeping the current ` +
          'size. Percentages configure the region; they are not a ' +
          'programmatic input.',
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

  const gesture: ResizeGesture = createResizeGesture(
    () => handle,
    model,
    () => ({
      direction: direction(),
      isReversed: isReversed(),
      isDisabled: isDisabled(),
    }),
    dragging => {
      setAttribute('data-resizing', dragging ? '' : null);
    },
  );

  // --- Listeners on the handle ---
  const onPointerDown = (event: PointerEvent) => {
    gesture.pointerDown(event);
  };
  const onPointerMove = (event: PointerEvent) => {
    gesture.pointerMove(event);
  };
  const onPointerUp = (event: PointerEvent) => {
    gesture.pointerUp(event);
  };
  const onPointerCancel = (event: PointerEvent) => {
    gesture.pointerCancel(event);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    gesture.keyDown(event);
  };
  const onDoubleClick = () => {
    gesture.doubleClick();
  };
  if (drivenHandle != null) {
    drivenHandle.addEventListener('pointerdown', onPointerDown);
    drivenHandle.addEventListener('pointermove', onPointerMove);
    drivenHandle.addEventListener('pointerup', onPointerUp);
    drivenHandle.addEventListener('pointercancel', onPointerCancel);
    drivenHandle.addEventListener('lostpointercapture', onPointerCancel);
    drivenHandle.addEventListener('keydown', onKeyDown);
    drivenHandle.addEventListener('dblclick', onDoubleClick);
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
      // A drag in flight ends first, as cancelled, so the size it reached is
      // saved and the pointer and the body's cursor are released.
      gesture.interrupt();
      isDestroyed = true;
      drivenHandle?.removeEventListener('pointerdown', onPointerDown);
      drivenHandle?.removeEventListener('pointermove', onPointerMove);
      drivenHandle?.removeEventListener('pointerup', onPointerUp);
      drivenHandle?.removeEventListener('pointercancel', onPointerCancel);
      drivenHandle?.removeEventListener('lostpointercapture', onPointerCancel);
      drivenHandle?.removeEventListener('keydown', onKeyDown);
      drivenHandle?.removeEventListener('dblclick', onDoubleClick);
      stopObservingContainer?.();
      stopObservingContainer = null;
      if (isObservingViewport) {
        window.removeEventListener('resize', onViewportResize);
        isObservingViewport = false;
      }
      for (const [name, value] of original) {
        setAttribute(name, value);
      }
      listeners.clear();
    },
  };
  return controller;
}
