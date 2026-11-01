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
 *   collapse/expand/resize methods. The configuration-object form builds on
 *   createResizable too, with no handle of its own, so the region's state has
 *   one copy (architecture:public-component-api INV22), and returns the same
 *   plus props for a handle. Both report a change in the commit that
 *   onCollapseChange's own state lands in, a controlled `isCollapsed`
 *   included (component:Resizable FR8)
 * @position Public hook; consumed by layout components via `resizable` prop
 */

import {
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useTranslator} from '../i18n/useTranslator';
import type {SizeValue} from '../utils/types';
import type {ResizableSize} from './utils';
import {
  createResizable,
  readInitialResizableState,
  readResizableInternals,
  readResizableSelection,
  type CreateResizableOptions,
  type ResizableController,
  type ResizableSnapshot,
} from './createResizable';
import {
  DEFAULT_COLLAPSED_SIZE,
  type ResizableDirection,
} from './resizableModel';
import {watchHandleRef} from './resizeGesture';

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

// =============================================================================
// Single-region hook: the configuration object, on the factory
// =============================================================================

/** No handle: the configuration object's region is driven through its props. */
const NO_HANDLE: RefObject<HTMLElement | null> = {current: null};

const EMPTY_SNAPS: number[] = [];

/**
 * The configuration-object form: createResizable with no handle of its own,
 * so the region's state has one copy, the factory's (spec:AST-107 FR6;
 * `architecture:public-component-api` INV22). The props it returns carry what
 * the factory reports, and a ResizeHandle given them drives the factory's
 * region through them.
 */
function useSingleResizable(config: UseResizableSingleConfig): ResizableRegion {
  const {getResizable, size, isCollapsed, snapshot, collapse, expand, resize} =
    useResizableController(NO_HANDLE, config);
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

interface ResizableEntry {
  readonly element: HTMLElement | null;
  readonly resizable: ResizableController;
  readonly createdWith: CreateResizableOptions;
}

/**
 * Where a region stands: its size as expanded (undefined while it is only the
 * temporary basis's stand-in), and whether it is collapsed.
 */
type ResizableSelection = {size: number | undefined; isCollapsed: boolean};

/**
 * The factory a hook holds, and one store over it for React: it follows the
 * factory the slot holds now, and reads the snapshot it reports, or the state
 * the region starts in before there is one. A reading equal in every part to
 * the last one is the last one, so a mount that settles where it started
 * renders once. While it holds no factory (its component hidden by an
 * `<Activity>`) it keeps the last reading, and where the region stood, for
 * the next factory to start from.
 */
interface ResizableSlot {
  get(): ResizableEntry | null;
  set(next: ResizableEntry | null): void;
  /** Where the region stood when the slot last let go of a factory. */
  remembered(): ResizableSelection | undefined;
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
  let selection: ResizableSelection | undefined;
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
      if (current != null && next == null) {
        selection = readResizableSelection(current.resizable) ?? selection;
      }
      current = next;
      follow();
      notify();
    },
    remembered: () => selection,
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

function isElementRef(value: unknown): value is RefObject<HTMLElement | null> {
  return typeof value === 'object' && value != null && 'current' in value;
}

/** What both forms render from their factory. */
interface ResizableReading extends UseResizableResult {
  /** The bounds the handle announces, and the size as expanded. */
  readonly snapshot: ResizableSnapshot;
  /** The factory the region has now: null before its first commit. */
  readonly getResizable: () => ResizableController | null;
}

/**
 * createResizable in React, with nothing of its own (spec:AST-107 FR6): it
 * creates the factory as it mounts, on the element behind `ref` (null while
 * there is none), passes later options through `update`, destroys it as it
 * unmounts, and returns what the factory reports. Before its first commit (the
 * server, the first render, a hydrating render) it returns the state the
 * factory starts in.
 *
 * A controlled `isCollapsed` is read from the options in the render that
 * passes it, before `update` reaches the factory, so the size and collapse
 * state a parent renders land in the same commit as the state its
 * `onCollapseChange` set (component:Resizable FR8).
 */
function useResizableController(
  ref: RefObject<HTMLElement | null>,
  options: CreateResizableOptions,
  collapsedText?: string,
): ResizableReading {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const collapsedTextRef = useRef(collapsedText);
  collapsedTextRef.current = collapsedText;
  const [slot] = useState(() => createSlot(readInitialResizableState(options)));
  const [serverInitial] = useState(() =>
    readInitialResizableState(options, 'server'),
  );
  // The factory follows the element behind the ref. A ref is stable across an
  // element swap, so its current node is compared after every commit, and
  // whenever a ResizeHandle given the ref attaches or lets go of its element,
  // which a child can do without this component rendering. When the element
  // goes away the factory on it goes too, with its listeners and attributes,
  // and a factory with no handle keeps the region answering collapse, expand
  // and resize; a new element gets a new factory. Each new factory starts
  // where the region stood: the old factory's selection, or, after an
  // `<Activity>` hid this component, the one the slot remembered.
  const follow = useCallback(() => {
    const element = ref.current;
    const entry = slot.get();
    if (entry != null && entry.element === element) {
      return;
    }
    const previous =
      entry == null
        ? slot.remembered()
        : readResizableSelection(entry.resizable);
    entry?.resizable.destroy();
    // A size shown against the temporary basis is not carried: the new
    // factory resolves the default against the container once it measures.
    const createdWith =
      previous == null
        ? optionsRef.current
        : {
            ...optionsRef.current,
            ...(previous.size === undefined
              ? {}
              : {defaultSize: previous.size}),
            defaultIsCollapsed: previous.isCollapsed,
          };
    const resizable = createResizable(element, createdWith);
    readResizableInternals(resizable)?.setCollapsedText(
      collapsedTextRef.current,
    );
    slot.set({element, resizable, createdWith});
  }, [ref, slot]);
  useIsomorphicLayoutEffect(() => {
    follow();
  });
  useIsomorphicLayoutEffect(
    () => (ref === NO_HANDLE ? undefined : watchHandleRef(ref, follow)),
    [ref, follow],
  );
  // Unmounting, or hidden by an `<Activity>`: the factory goes, and the slot
  // remembers where the region stood, so a reveal starts there.
  useIsomorphicLayoutEffect(
    () => () => {
      const entry = slot.get();
      slot.set(null);
      entry?.resizable.destroy();
    },
    [slot],
  );
  useIsomorphicLayoutEffect(() => {
    const entry = slot.get();
    if (entry != null && options !== entry.createdWith) {
      entry.resizable.update(options);
    }
  }, [slot, options]);
  useIsomorphicLayoutEffect(() => {
    const entry = slot.get();
    if (entry != null) {
      readResizableInternals(entry.resizable)?.setCollapsedText(collapsedText);
    }
  }, [slot, collapsedText]);
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
  // React subscribes to the slot again when an `<Activity>` shows this
  // component, but does not read it again, and the factory made for the
  // reveal reports in that same commit: render again with what it reports.
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
  const collapse = useCallback(() => {
    getResizable()?.collapse();
  }, [getResizable]);
  const expand = useCallback(() => {
    getResizable()?.expand();
  }, [getResizable]);
  const resize = useCallback(
    (next: number) => {
      getResizable()?.resize(next);
    },
    [getResizable],
  );
  return {snapshot, getResizable, size, isCollapsed, collapse, expand, resize};
}

/**
 * The ref-taking form: the factory on the element behind the ref, named and
 * announced through the message catalog unless the caller names it.
 */
function useResizableElement(
  ref: RefObject<HTMLElement | null>,
  options: CreateResizableOptions = {},
): UseResizableResult {
  const translate = useTranslator();
  const label = options.label ?? translate('@astryx.resizable.handle.label');
  const named = useMemo(() => ({...options, label}), [options, label]);
  const {size, isCollapsed, collapse, expand, resize} = useResizableController(
    ref,
    named,
    translate('@astryx.resizable.collapsed'),
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
