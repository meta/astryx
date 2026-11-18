// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useResizable.ts
 * @input Resize configuration (defaultSize, minSize, maxSize, snaps), with
 *   removed pixel-bound aliases rejected even through assembled objects, and
 *   collapse configuration (collapsible, defaultIsCollapsed, isCollapsed)
 * @output Hook return: size, isCollapsed, collapse/expand/resize methods, props
 *   for handle, over the internal resize factory (createResizable)
 * @position Public hook; consumed by layout components via `resizable` prop
 */

import {
  useCallback,
  useReducer,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import {useCommittedRef} from '../hooks/useCommittedRef';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import type {SizeValue} from '../utils/types';
import type {ResizableSize} from './utils';
import {
  createResizableAs,
  readInitialResizableState,
  readResizableInternals,
  type CreateResizableOptions,
  type ResizableController,
  type ResizableSnapshot,
} from './createResizable';
import {
  createRegionPaneSlot,
  registerPropsRegion,
  type RegionPaneSlot,
} from './resizablePane';
import {
  DEFAULT_COLLAPSED_SIZE,
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
  /**
   * Size in px under which a lift or a key step collapses the region.
   * @default 40
   */
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
  /**
   * Called once per collapse state change. A lift or a key step closes the
   * region, and a drag or a key reopens it. Enter, a double-click,
   * `collapse()`, `expand()` and `resize()` report too.
   */
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
   * Controlled collapse state. When set, the caller owns collapse, and the
   * hook reports instead of changing its state. `collapse()`, `expand()`, a
   * lift or a key step past the collapse threshold, and a drag that reopens
   * the region report through `onCollapseChange`.
   */
  isCollapsed?: boolean;
  /** Called when size changes during drag. */
  onSizeChange?: (size: number) => void;
  /**
   * Called once per collapse state change. A lift or a key step closes the
   * region, and a drag or a key reopens it. Enter, a double-click,
   * `collapse()`, `expand()` and `resize()` report too.
   */
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
// Single-region hook: the configuration object, on the factory
// =============================================================================

const EMPTY_SNAPS: number[] = [];

/**
 * The configuration-object form: createResizable with no handle of its own,
 * so the region's state has one copy, the factory's. The props it returns
 * carry what the factory reports, and a ResizeHandle given them drives the
 * factory's region through them.
 */
function useSingleResizable(config: UseResizableSingleConfig): ResizableRegion {
  // The region's pane: the LayoutPanel that takes these props hands it over.
  const [regionSlot] = useState(createRegionPaneSlot);
  const {getResizable, size, isCollapsed, snapshot, collapse, expand, resize} =
    useResizableController(config, regionSlot);
  // The region's side of the handle's gesture, read at each input, so a whole
  // drag reaches the factory as it is now.
  const model = useCallback(() => {
    const current = getResizable();
    return current == null ? undefined : readResizableInternals(current)?.model;
  }, [getResizable]);
  const onResizeStart = useCallback(() => {
    model()?.start();
  }, [model]);
  const onResizeMove = useCallback(
    (delta: number) => {
      model()?.move(delta);
    },
    [model],
  );
  const onResizeEnd = useCallback(() => {
    model()?.end();
  }, [model]);
  const onResizeRelease = useCallback(
    (velocity: number) => {
      model()?.end(velocity);
    },
    [model],
  );
  const onResizeCancel = useCallback(() => {
    model()?.cancel();
  }, [model]);

  const props: ResizableProps = {
    _size: size,
    _isCollapsed: isCollapsed,
    _onResizeStart: onResizeStart,
    _onResizeMove: onResizeMove,
    _onResizeEnd: onResizeEnd,
    _onResizeCancel: onResizeCancel,
    _minSizePx: snapshot.minPx,
    _maxSizePx: snapshot.maxPx,
    _snaps: config.snaps ?? EMPTY_SNAPS,
    _collapsedSize: config.collapsedSize ?? DEFAULT_COLLAPSED_SIZE,
    _collapsible: config.collapsible ?? false,
    _direction: config.direction ?? 'horizontal',
    _isResizableProps: true,
  };
  collapseControls.set(props, {collapse, expand});
  releaseEnds.set(props, onResizeRelease);
  // The LayoutPanel that takes these props hands its pane to the region, and
  // the ResizeHandle that takes them says when a pointer drags it.
  registerPropsRegion(props, regionSlot);
  // Without a configured maximum a measured extent stands in, only once it
  // is a real measurement (an observed container, or the window).
  if (snapshot.effectiveMaxPx != null) {
    effectiveMaxima.set(props, snapshot.effectiveMaxPx);
  }

  return {size, isCollapsed, collapse, expand, resize, props};
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
 * A drag's end with its release velocity, in px per second and signed like
 * the move's delta. Kept off the exported `ResizableProps` for the same reason
 * as the collapse controls; {@link endResizeAt} is internal.
 */
const releaseEnds = new WeakMap<ResizableProps, (velocity: number) => void>();

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

/**
 * The props behind a component's `resizable` slot. It takes useResizable's
 * output directly, and still takes that output's `props`.
 */
export function resizablePropsOf(
  value: ResizableRegion | ResizableProps,
): ResizableProps {
  return 'props' in value ? value.props : value;
}

/** Whether a `resizable` value is useResizable's output for one region. */
export function isResizableRegion(value: unknown): value is ResizableRegion {
  return typeof value === 'object' && value !== null && 'props' in value;
}

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

/**
 * Ends the drag `props` follows at a release `velocity`. A props object the
 * hook did not return ends without one. Internal to the package.
 */
export function endResizeAt(props: ResizableProps, velocity: number): void {
  const end = releaseEnds.get(props);
  if (end == null) {
    props._onResizeEnd();
    return;
  }
  end(velocity);
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
// The resize factory in React
// =============================================================================

interface ResizableEntry {
  readonly resizable: ResizableController;
  /** The options the factory has now: those it was created with, or updated to. */
  passed: CreateResizableOptions;
}

/**
 * The factory a hook holds, and one store over it for React. It follows the
 * factory the slot holds now and reads the snapshot that factory reports.
 * Before there is one, it reads the state the region starts in. A reading
 * equal in every part to the last one is the last one. So a mount that
 * settles where it started renders once.
 */
interface ResizableSlot {
  get(): ResizableEntry | null;
  set(next: ResizableEntry | null): void;
  subscribe(listener: () => void): () => void;
  read(): ResizableSnapshot;
}

function sameSnapshot(a: ResizableSnapshot, b: ResizableSnapshot): boolean {
  return (
    a.size === b.size &&
    a.isCollapsed === b.isCollapsed &&
    a.expandedSize === b.expandedSize &&
    a.minPx === b.minPx &&
    a.maxPx === b.maxPx &&
    a.effectiveMaxPx === b.effectiveMaxPx
  );
}

function createSlot(initial: ResizableSnapshot): ResizableSlot {
  let current: ResizableEntry | null = null;
  let last: ResizableSnapshot = initial;
  const listeners = new Set<() => void>();
  let stopFactory: (() => void) | null = null;
  const notify = () => {
    for (const listener of [...listeners]) {
      listener();
    }
  };
  const follow = () => {
    stopFactory?.();
    stopFactory = null;
    if (current != null && listeners.size > 0) {
      const {resizable} = current;
      const channel = readResizableInternals(resizable);
      stopFactory =
        channel != null
          ? channel.subscribeSnapshot(notify)
          : resizable.subscribe(notify);
    }
  };
  return {
    get: () => current,
    set(next) {
      current = next;
      follow();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        follow();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopFactory?.();
          stopFactory = null;
        }
      };
    },
    read() {
      if (current == null) {
        return last;
      }
      const {resizable} = current;
      // A stand-in controller without the internal channel reports only its
      // size and collapse state.
      const next = readResizableInternals(resizable)?.snapshot() ?? {
        ...initial,
        size: resizable.size,
        isCollapsed: resizable.isCollapsed,
        expandedSize: resizable.size,
      };
      if (!sameSnapshot(last, next)) {
        last = next;
      }
      return last;
    },
  };
}

/** What the hook renders from its factory. */
interface ResizableReading {
  /** The region's size in px, 0 while collapsed. */
  readonly size: number;
  readonly isCollapsed: boolean;
  readonly collapse: () => void;
  readonly expand: () => void;
  readonly resize: (size: number) => void;
  /** The bounds the handle announces, and the size as expanded. */
  readonly snapshot: ResizableSnapshot;
  /** The factory the region has now: null before its first commit. */
  readonly getResizable: () => ResizableController | null;
}

/**
 * createResizable in React, with nothing of its own. It creates the factory as
 * it mounts, passes later options through `update` and returns what the
 * factory reports.
 * Before its first commit (the server, the first render, a hydrating render)
 * it returns the state the factory starts in. While it is unmounted or an
 * `<Activity>` hides it, the factory lets go of the page and keeps the region.
 * So collapse, expand and resize apply and report whenever they are called, as
 * React state did. A call before the first commit starts the factory early.
 *
 * A controlled `isCollapsed` is read from the options in the render that
 * passes it, before `update` reaches the factory. So the size and collapse
 * state a parent renders land in the same commit as the state its
 * `onCollapseChange` set.
 */
function useResizableController(
  options: CreateResizableOptions,
  regionSlot?: RegionPaneSlot,
): ResizableReading {
  // The committed options, which the factory starts from.
  const optionsRef = useCommittedRef(options);
  const [slot] = useState(() => createSlot(readInitialResizableState(options)));
  const [serverInitial] = useState(() =>
    readInitialResizableState(options, 'server'),
  );
  // Every start of the factory, the commit's and an early call's, follows the
  // region a LayoutPanel lends.
  const start = useCallback(
    (passed: CreateResizableOptions): ResizableController => {
      const resizable = createResizableAs('useResizable', null, passed);
      if (regionSlot != null) {
        // destroy() stops following the region.
        readResizableInternals(resizable)?.followRegion(regionSlot);
      }
      return resizable;
    },
    [regionSlot],
  );
  // The hook keeps one factory. After an unmount or an `<Activity>` hide, the
  // same factory takes the page back (`resume`).
  const follow = useCallback(() => {
    const entry = slot.get();
    if (entry != null) {
      readResizableInternals(entry.resizable)?.resume();
      return;
    }
    const passed = optionsRef.current;
    const resizable = start(passed);
    slot.set({resizable, passed});
  }, [optionsRef, slot, start]);
  useIsomorphicLayoutEffect(() => {
    follow();
  });
  // On unmount, or when an `<Activity>` hides the component, the factory lets
  // go of the page and keeps the region. Calls meanwhile apply, and a reveal
  // goes on from where the region stands. A stand-in without the internal
  // channel goes.
  useIsomorphicLayoutEffect(
    () => () => {
      const entry = slot.get();
      if (entry == null) {
        return;
      }
      const channel = readResizableInternals(entry.resizable);
      if (channel != null) {
        channel.suspend();
      } else {
        slot.set(null);
        entry.resizable.destroy();
      }
    },
    [slot],
  );
  // The factory, a store outside React: each new options object reaches it
  // through update().
  useIsomorphicLayoutEffect(() => {
    const entry = slot.get();
    if (entry != null && options !== entry.passed) {
      entry.passed = options;
      entry.resizable.update(options);
    }
  }, [slot, options]);
  // A container swapped behind `containerRef` with the same options: the
  // factory follows it at each commit, as it follows new options.
  useIsomorphicLayoutEffect(() => {
    const entry = slot.get();
    if (entry != null) {
      readResizableInternals(entry.resizable)?.syncContainer();
    }
  });

  const snapshot = useSyncExternalStore(
    slot.subscribe,
    slot.read,
    () => serverInitial,
  );
  // When an `<Activity>` shows this component, React subscribes to the slot
  // again but does not read it. The factory resumes and reports in that same
  // commit. Render again with what it reports.
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useIsomorphicLayoutEffect(() => {
    if (slot.read() !== snapshot) {
      rerender();
    }
  });
  const isControlled = options.isCollapsed !== undefined;
  const isCollapsed = isControlled
    ? (options.collapsible ?? false) && Boolean(options.isCollapsed)
    : snapshot.isCollapsed;
  const size = isControlled
    ? isCollapsed
      ? 0
      : snapshot.expandedSize
    : snapshot.size;

  const getResizable = useCallback(() => slot.get()?.resizable ?? null, [slot]);
  // A call before the first commit, from a child's layout effect say, starts
  // the factory now. The factory stays off the page until that commit.
  const ensureResizable = useCallback((): ResizableController => {
    const entry = slot.get();
    if (entry != null) {
      return entry.resizable;
    }
    const passed = optionsRef.current;
    const resizable = start(passed);
    readResizableInternals(resizable)?.suspend();
    slot.set({resizable, passed});
    return resizable;
  }, [optionsRef, slot, start]);
  const collapse = useCallback(() => {
    ensureResizable().collapse();
  }, [ensureResizable]);
  const expand = useCallback(() => {
    ensureResizable().expand();
  }, [ensureResizable]);
  const resize = useCallback(
    (next: number) => {
      ensureResizable().resize(next);
    },
    [ensureResizable],
  );
  return {snapshot, getResizable, size, isCollapsed, collapse, expand, resize};
}

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
