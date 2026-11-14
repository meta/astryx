// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTooltip.tsx
 * @input The tooltip's options and its content
 * @output Exports the useTooltip hook (stable trigger refs, the description id,
 *   renderTooltip, and imperative show() and hide()) and its option and return
 *   types
 * @position Tooltip's trigger contract. It loads the tooltip's behavior and
 *   layer (tooltipSurface.tsx) once per page, after first paint. Until the
 *   layer exists, the trigger carries no description reference.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Tooltip/index.ts
 * - /packages/core/src/Tooltip/tooltipSurface.tsx
 */

import {
  use,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefCallback,
  type RefObject,
} from 'react';
import type {
  ContextRenderProps,
  LayerAlignment,
  LayerPlacement,
} from '../Layer/useLayer';
import type {LayerTouchTrigger} from '../Layer/useTouchTrigger';
import {warnOnce} from '../utils/devWarning';
import {createModuleLoader} from '../utils/moduleLoader';
import {isElement} from '../utils/nodeType';
import {
  TooltipPresentInterestContext,
  type TooltipPresentInterestState,
} from './tooltipPresentInterest';
import type {TooltipSurface as TooltipSurfaceType} from './tooltipSurface';

/**
 * Focus trigger behavior for tooltips
 */
export type TooltipFocusTrigger = 'auto' | 'always' | 'never';

/**
 * Touch trigger behavior for tooltips
 */
export type TooltipTouchTrigger = LayerTouchTrigger;

export interface TooltipOptions {
  /**
   * Position placement relative to anchor
   * @default 'above'
   */
  placement?: LayerPlacement;

  /**
   * Alignment along the placement axis
   * @default 'center'
   */
  alignment?: LayerAlignment;

  /**
   * Delay before showing on hover (ms)
   * @default 200
   */
  delay?: number;

  /**
   * Delay before hiding after mouse/focus leave (ms)
   * @default 0
   */
  hideDelay?: number;

  /**
   * When to trigger on focus:
   * - `auto`: focus on the trigger itself, or within a trigger that is
   *   focusable when focus arrives
   * - `always`: focus on the trigger or anything inside it
   * - `never`: never on focus (for composite widgets)
   *
   * @default 'auto'
   */
  focusTrigger?: TooltipFocusTrigger;

  /**
   * What a tap does on a touch pointer, where there is no hover:
   * - `auto`: tap opens the tooltip, unless the trigger performs an action of
   *   its own (a button, a link, a form control) — that tap belongs to the
   *   control, and a hint about a control the user just operated is noise
   * - `tap`: tap always opens the tooltip, even on a trigger that acts
   * - `none`: touch never opens the tooltip
   *
   * @default 'auto'
   */
  touchTrigger?: TooltipTouchTrigger;

  /**
   * Whether the tooltip is enabled.
   * When false, hover/focus triggers are disabled.
   *
   * @default true
   */
  isEnabled?: boolean;

  /**
   * Controlled open state. When provided, overrides hover/focus triggers:
   * - `true`: force-show the tooltip (hover/focus hide is suppressed)
   * - `false`: force-hide the tooltip. Focus that would show it calls
   *   `onShow` and shows nothing.
   * - `undefined`: uncontrolled — hover/focus triggers manage visibility
   *
   * A controlled tooltip still takes Escape when it is the top-most layer, and
   * answers by calling `onHide` without hiding itself — closing is your
   * update's decision, exactly as for a controlled Dialog. Ignore the call and
   * the tip stays, and so does the press: nothing underneath dismisses.
   */
  isOpen?: boolean;

  /**
   * Whether the tooltip should be shown on mount.
   * The tooltip is still dismissible — this just opens it initially.
   */
  isDefaultOpen?: boolean;

  /**
   * Callback fired when tooltip is shown. Under `isOpen={false}`, it reports
   * focus that would show the tooltip.
   * Wrap in useCallback for stable identity.
   */
  onShow?: () => void;

  /**
   * Callback fired when tooltip is hidden.
   * Wrap in useCallback for stable identity.
   */
  onHide?: () => void;
}

export interface TooltipReturn {
  /**
   * Combined ref that sets both position and interaction on the same element.
   * Shorthand for calling both positionRef and interactionRef.
   */
  ref: RefCallback<HTMLElement>;

  /**
   * Ref for the positioning anchor element.
   * While the layer is shown, and until its exit animation ends, the trigger
   * carries the layer's CSS anchor name.
   */
  positionRef: RefCallback<HTMLElement>;

  /**
   * Ref for the interaction element.
   * Attaches hover/focus event listeners via addEventListener.
   * Can be the same element as positionRef or different.
   */
  interactionRef: RefCallback<HTMLElement>;

  /**
   * The CSS anchor name to use for positioning.
   * Use this when you need to set anchorName manually (e.g., display:contents wrapper).
   * Set it only while the layer is shown or its exit animation runs.
   * Empty until the tooltip's layer loads, after the page's first paint.
   */
  anchorId: string;

  /**
   * ID for aria-describedby on the trigger element.
   * Caller should compose with other IDs using mergeIds utility.
   * Empty until the tooltip's layer exists, after the page's first paint, so
   * the trigger never names a missing element; skip it when empty.
   */
  describedBy: string;

  /**
   * Render function for tooltip content.
   * Returns anchor-positioned popover element.
   *
   * `positioning` is excluded: the tooltip always derives its position from
   * placement/alignment, so accepting the custom opt-out here would be a
   * silent no-op.
   */
  renderTooltip: (
    children: ReactNode,
    props?: Omit<ContextRenderProps, 'positioning'>,
  ) => ReactNode;

  /**
   * Opens the tooltip now and keeps it open until `hide()`, Escape, a press
   * outside, or focus leaving its trigger. If a press on the trigger is down
   * when you call it, and the press ends off the trigger with no click, the
   * hold ends. The hover rules then decide.
   * Its text is announced once. Reports through `onShow`. Under a controlled `isOpen`,
   * it calls `onShow` and does not change `isOpen`. Does nothing while
   * `isEnabled` is false.
   *
   * Use `show()` and `hide()` to build a toggle-style trigger: your own button
   * calls them, sets `aria-describedby` and `aria-controls` to `describedBy`
   * and `aria-expanded` (true while shown), and keeps its own accessible name.
   */
  show: () => void;

  /**
   * Closes the tooltip now. Reports through `onHide`. Under a controlled
   * `isOpen`, it calls `onHide` and does not change `isOpen`.
   */
  hide: () => void;
}

/**
 * The latest the load starts after first paint, in ms, when the main thread
 * never goes idle.
 */
const LOAD_CAP_MS = 2000;

type TooltipSurfaceComponent = typeof TooltipSurfaceType;

const surfaceModule = createModuleLoader(
  async () => import('./tooltipSurface'),
);

let loadedSurface: TooltipSurfaceComponent | null = null;
let isScheduled = false;
let pendingLoad: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSurface(): TooltipSurfaceComponent | null {
  return loadedSurface;
}

function getServerSurface(): null {
  return null;
}

function publish(surface: TooltipSurfaceComponent | null): void {
  loadedSurface = surface;
  for (const listener of [...listeners]) {
    listener();
  }
}

async function loadSurface(): Promise<void> {
  try {
    publish((await surfaceModule.load()).TooltipSurface);
  } catch (error: unknown) {
    // The triggers keep working without tooltips. The next tooltip that
    // mounts schedules the load again.
    isScheduled = false;
    warnOnce(
      'tooltip-load',
      'Tooltip',
      'The tooltip module did not load. Tooltips show after a later load.',
      error,
    );
  }
}

function startLoad(): void {
  pendingLoad = loadSurface().finally(() => {
    pendingLoad = null;
  });
}

/**
 * Schedules the page's one load of the tooltip surface: after the page's
 * first paint, when the main thread is idle, and no later than LOAD_CAP_MS
 * after that paint. No input starts or hurries the load.
 */
function scheduleTooltipLoad(): void {
  if (isScheduled || loadedSurface != null || typeof window === 'undefined') {
    return;
  }
  isScheduled = true;
  // The timers belong to this window, so they end with its document.
  const view = window;
  // A frame callback runs before the frame paints. The task it queues runs
  // after that paint.
  view.requestAnimationFrame(() => {
    view.setTimeout(() => {
      if (typeof view.requestIdleCallback === 'function') {
        view.requestIdleCallback(startLoad, {timeout: LOAD_CAP_MS});
      } else {
        view.setTimeout(startLoad, 0);
      }
    }, 0);
  });
}

/** What the loaded surface gives the bridge when it connects. Internal. */
/** The loaded layer's ids, which the trigger names once the layer exists. */
export interface TooltipLayerIds {
  readonly describedBy: string;
  readonly anchorId: string;
}

export interface TooltipSurfaceHandle {
  readonly positionRef: RefCallback<HTMLElement>;
  readonly interactionRef: RefCallback<HTMLElement>;
  readonly actionsRef: RefObject<{
    readonly show: () => void;
    readonly hide: () => void;
  }>;
}

/**
 * Records the trigger elements and an open request until the surface loads,
 * then connects the surface to them. Internal.
 */
export interface TooltipBridge {
  /** The intent on the trigger when the surface connects, read once. */
  readonly interestRef: RefObject<TooltipPresentInterestState>;
  readonly ref: RefCallback<HTMLElement>;
  readonly positionRef: RefCallback<HTMLElement>;
  readonly interactionRef: RefCallback<HTMLElement>;
  readonly show: () => void;
  readonly hide: () => void;
  /**
   * Connects the loaded surface. With `readsHeldIntent`, the bridge gives it
   * the hover or keyboard focus still on the trigger.
   */
  readonly connect: (
    surface: TooltipSurfaceHandle,
    readsHeldIntent: boolean,
  ) => () => void;
  /** The loaded layer reports its ids when it exists, and null when it goes. */
  readonly reportLayer: (ids: TooltipLayerIds | null) => void;
}

function attach(
  ref: RefCallback<HTMLElement>,
  element: HTMLElement,
): () => void {
  const cleanup = ref(element);
  return typeof cleanup === 'function' ? cleanup : () => void ref(null);
}

function matchesSelector(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    // An engine without the pseudo-class reports no such state.
    return false;
  }
}

/**
 * The intent on the trigger when the surface connects: keyboard focus still
 * in it, or a pointer still over it. The surface answers it by its own rules.
 */
function heldIntent(trigger: HTMLElement | null): 'focus' | 'hover' | null {
  if (trigger == null) {
    return null;
  }
  const focused = trigger.ownerDocument.activeElement;
  if (
    isElement(focused) &&
    trigger.contains(focused) &&
    matchesSelector(focused, ':focus-visible')
  ) {
    return 'focus';
  }
  return matchesSelector(trigger, ':hover') ? 'hover' : null;
}

function createTooltipBridge(
  reportLayer: (ids: TooltipLayerIds | null) => void,
): TooltipBridge {
  const interestRef: RefObject<TooltipPresentInterestState> = {
    current: {interest: null, tapEvent: null, isRead: true},
  };
  let positionElement: HTMLElement | null = null;
  let interactionElement: HTMLElement | null = null;
  let surface: TooltipSurfaceHandle | null = null;
  let detachPosition: (() => void) | null = null;
  let detachInteraction: (() => void) | null = null;
  let isShowRequested = false;
  // Only a tooltip that mounted before the page loaded the surface can hold
  // an intent its own listeners did not see, and only at its first connect.
  // A surface that mounts again later (a trigger that a component renders
  // again) answers new input only.
  const isMountedBeforeLoad = loadedSurface == null;
  let hasConnected = false;
  // When a mouse or pen last entered the trigger before the surface loaded,
  // so a hover held at the load waits only the rest of the show delay.
  let hoverStartedAt: number | undefined;
  const noteEntry = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') {
      hoverStartedAt = performance.now();
    }
  };

  const setPosition = (element: HTMLElement | null) => {
    detachPosition?.();
    detachPosition = null;
    positionElement = element;
    if (element != null && surface != null) {
      detachPosition = attach(surface.positionRef, element);
    }
  };
  const setInteraction = (element: HTMLElement | null) => {
    detachInteraction?.();
    detachInteraction = null;
    interactionElement?.removeEventListener('pointerenter', noteEntry);
    interactionElement = element;
    hoverStartedAt = undefined;
    if (element == null) {
      return;
    }
    if (surface == null) {
      element.addEventListener('pointerenter', noteEntry);
    } else {
      detachInteraction = attach(surface.interactionRef, element);
    }
  };

  const positionRef: RefCallback<HTMLElement> = element => {
    if (element == null) {
      setPosition(null);
      return;
    }
    if (element !== positionElement) {
      setPosition(element);
    }
    return () => {
      if (positionElement === element) {
        setPosition(null);
      }
    };
  };
  const interactionRef: RefCallback<HTMLElement> = element => {
    if (element == null) {
      setInteraction(null);
      return;
    }
    if (element !== interactionElement) {
      setInteraction(element);
    }
    return () => {
      if (interactionElement === element) {
        setInteraction(null);
      }
    };
  };
  const ref: RefCallback<HTMLElement> = element => {
    const detachRefs = [positionRef(element), interactionRef(element)];
    if (element == null) {
      return;
    }
    return () => {
      for (const detach of detachRefs) {
        detach?.();
      }
    };
  };

  return {
    interestRef,
    ref,
    positionRef,
    interactionRef,
    reportLayer,
    show: () => {
      if (surface == null) {
        isShowRequested = true;
      } else {
        surface.actionsRef.current.show();
      }
    },
    hide: () => {
      if (surface == null) {
        isShowRequested = false;
      } else {
        surface.actionsRef.current.hide();
      }
    },
    connect: (next, readsHeldIntent) => {
      surface = next;
      interactionElement?.removeEventListener('pointerenter', noteEntry);
      if (positionElement != null) {
        detachPosition = attach(next.positionRef, positionElement);
      }
      const interest =
        readsHeldIntent && isMountedBeforeLoad && !hasConnected
          ? heldIntent(interactionElement)
          : null;
      hasConnected = true;
      interestRef.current = {
        interest,
        tapEvent: null,
        hoverStartedAt: interest === 'hover' ? hoverStartedAt : undefined,
        isRead: false,
      };
      if (interactionElement != null) {
        detachInteraction = attach(next.interactionRef, interactionElement);
      }
      interestRef.current.isRead = true;
      if (isShowRequested) {
        isShowRequested = false;
        next.actionsRef.current.show();
      }
      return () => {
        detachInteraction?.();
        detachInteraction = null;
        detachPosition?.();
        detachPosition = null;
        if (surface === next) {
          surface = null;
        }
      };
    },
  };
}

/**
 * Hook for tooltip behavior with hover/focus triggers.
 *
 * The tooltip's behavior and its layer load once per page, after the page's
 * first paint. Until the layer exists, `describedBy` is empty, so the trigger
 * names no element that is not there. A hover still on the trigger when they load shows the
 * tooltip once its delay has passed since the pointer entered, and keyboard
 * focus still on it shows it at once.
 *
 * Unlike HoverCard, tooltips:
 * - Don't stay open when hovering the tooltip content
 * - Have shorter delays
 * - Use inverted colors (dark background, light text)
 * - Are typically used for short, non-interactive text
 *
 * @example
 * ```
 * const tooltip = useTooltip({ placement: 'above' });
 * <Button ref={tooltip.ref} aria-describedby={tooltip.describedBy}>
 *   Hover me
 * </Button>
 * {tooltip.renderTooltip('Helpful tooltip text')}
 * ```
 */
export function useTooltip(options: TooltipOptions = {}): TooltipReturn {
  // The layer reports from its commit, so the reference goes out in the
  // same task, before the frame paints, and never ahead of the layer.
  const [layerIds, setLayerIds] = useState<TooltipLayerIds | null>(null);
  const [bridge] = useState(() => createTooltipBridge(setLayerIds));
  // Set only by a Core component that mounts the tooltip on interaction.
  const heldInterestRef = use(TooltipPresentInterestContext);
  const Surface = useSyncExternalStore(subscribe, getSurface, getServerSurface);
  // Syncs the page's one load of the tooltip surface with the first tooltip
  // that mounts.
  useEffect(scheduleTooltipLoad, []);

  const renderTooltip = (
    children: ReactNode,
    props?: Omit<ContextRenderProps, 'positioning'>,
  ): ReactNode =>
    Surface == null ? null : (
      <Surface
        options={options}
        bridge={bridge}
        heldInterestRef={heldInterestRef}
        content={children}
        renderProps={props}
      />
    );

  return {
    ref: bridge.ref,
    positionRef: bridge.positionRef,
    interactionRef: bridge.interactionRef,
    anchorId: layerIds?.anchorId ?? '',
    describedBy: layerIds?.describedBy ?? '',
    renderTooltip,
    show: bridge.show,
    hide: bridge.hide,
  };
}

/** Test only: loads the tooltip surface now and makes every tooltip see it. */
export async function __loadTooltipForTest(): Promise<void> {
  publish((await surfaceModule.load()).TooltipSurface);
  isScheduled = true;
}

/** Test only: the load in flight, or null when none has started. */
export function __pendingTooltipLoadForTest(): Promise<void> | null {
  return pendingLoad;
}

/** Test only: forgets the loaded surface and any scheduled load. */
export function __resetTooltipForTest(): void {
  isScheduled = false;
  publish(null);
}
