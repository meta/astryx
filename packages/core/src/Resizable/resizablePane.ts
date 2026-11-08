// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resizablePane.ts
 * @input A LayoutPanel's element, its commits and the width it renders; the
 *   collapse state its resize controller reports; motion/animatedLayout.ts
 * @output The internal channel through which a LayoutPanel lends its element
 *   to the resize controller that sizes it. It also carries that controller's
 *   edge reveal and the ResizeHandle a collapsing panel hands focus to
 * @position Internal to Resizable and Layout; no entry point exports it. No
 *   React, and no DOM work on import
 */

import {
  createAnimatedLayout,
  glideNextChange,
  glideOf,
  landLayoutGlide,
  type LayoutEdge,
  reportLayoutEdge,
  springGlide,
} from '../motion/animatedLayout';
import {animatorFor, type MotionHandle} from '../motion/animator';
import {resolveMotion} from '../motion/resolveMotion';
import type {SpringDescription} from '../motion/spring';
import {springs} from '../motion/uikit/springs';
import type {ResizableProps} from './useResizable';

export type {LayoutEdge};

/** The width a panel renders: pixels, a CSS length, or none. */
export type RenderedPaneWidth = number | string | null | undefined;

/** What the controller that sizes a pane hears from it. */
export interface PaneListener {
  /**
   * In the commit that renders the pane at width 0, or away from it, before
   * React changes the DOM.
   */
  beforeChange(toCollapsed: boolean): void;
  /** After every commit of the pane. */
  committed(): void;
}

/** What a LayoutPanel lends the resize controller that sizes it. */
export interface ResizablePane {
  readonly element: HTMLElement;
  /** The width the panel renders now. */
  renderedWidth(): RenderedPaneWidth;
  /** The panel's edge that faces its content, where its ResizeHandle sits. */
  contentFacingEdge(): LayoutEdge;
  /**
   * The controller says whether its region is collapsed, and which handle
   * focus inside the panel moves to as it collapses. The panel is then inert
   * and hidden from assistive technology while it is collapsed.
   */
  setCollapsed(isCollapsed: boolean, focusTarget: HTMLElement | null): void;
  /** The controller that sizes the pane listens to it; null stops it. */
  listen(listener: PaneListener | null): void;
}

const lent = new WeakMap<Element, ResizablePane>();
const watchers = new Set<() => void>();
// The elements ResizeHandle renders, for a panel beside one to find it.
const resizeHandles = new WeakSet<Element>();

/** ResizeHandle registers the element it renders; returns the unregister. */
export function registerResizeHandle(element: Element): () => void {
  resizeHandles.add(element);
  return () => {
    resizeHandles.delete(element);
  };
}

function notifyWatchers(): void {
  for (const watcher of [...watchers]) {
    watcher();
  }
}

/**
 * Calls `listener` whenever a panel is lent beside a handle or taken back, so
 * a factory looks for its pane again. Returns the function that stops it.
 */
export function watchResizablePanes(listener: () => void): () => void {
  watchers.add(listener);
  return () => {
    watchers.delete(listener);
  };
}

/**
 * The pane a resize handle resizes: the lent LayoutPanel just before it, or
 * just after it when the region is reversed.
 */
export function resizablePaneFor(
  handle: Element,
  isReversed: boolean,
): ResizablePane | null {
  const sibling = isReversed
    ? handle.nextElementSibling
    : handle.previousElementSibling;
  return sibling == null ? null : (lent.get(sibling) ?? null);
}

/**
 * Moves a region's hold from `held` to `next`, and returns `next`. A pane the
 * region no longer sizes stops listening and opens. The held pane takes the
 * region's collapse state, and focus inside it moves to `handle` as it
 * collapses. A controller that sizes the pane passes its `listener`.
 */
export function handOverPane(
  held: ResizablePane | null,
  next: ResizablePane | null,
  listener: PaneListener | null,
  isCollapsed: boolean,
  handle: HTMLElement | null,
): ResizablePane | null {
  if (next !== held) {
    if (listener != null) {
      held?.listen(null);
    }
    held?.setCollapsed(false, null);
    if (listener != null) {
      next?.listen(listener);
    }
  }
  next?.setCollapsed(isCollapsed, handle);
  return next;
}

/**
 * The ResizeHandle beside a panel, on the side that faces the content. It is
 * after a start panel, before an end panel, and on either side elsewhere.
 */
export function resizeHandleBeside(
  panel: Element,
  area: string | null | undefined,
): HTMLElement | null {
  const candidates =
    area === 'start'
      ? [panel.nextElementSibling]
      : area === 'end'
        ? [panel.previousElementSibling]
        : [panel.nextElementSibling, panel.previousElementSibling];
  for (const candidate of candidates) {
    if (candidate instanceof HTMLElement && resizeHandles.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * The hook's side of a region. The LayoutPanel that takes the hook's own
 * props hands its pane here as it mounts. The factory the region has, now
 * or later, follows it.
 */
export interface RegionPaneSlot {
  /** From the LayoutPanel: its pane, or null as it goes. */
  attach(pane: ResizablePane | null): void;
  /** Calls `listener` with the pane now and whenever it changes. */
  follow(listener: (pane: ResizablePane | null) => void): () => void;
  /**
   * From the ResizeHandle given the props: whether a pointer drags it, so a
   * drag that reopens the pane plays nothing while a key step plays.
   */
  setPointerDragging(isDragging: boolean): void;
  isPointerDragging(): boolean;
}

export function createRegionPaneSlot(): RegionPaneSlot {
  let current: ResizablePane | null = null;
  let isDragging = false;
  const listeners = new Set<(pane: ResizablePane | null) => void>();
  return {
    setPointerDragging(next) {
      isDragging = next;
    },
    isPointerDragging: () => isDragging,
    attach(pane) {
      if (pane === current) {
        return;
      }
      current = pane;
      for (const listener of [...listeners]) {
        listener(pane);
      }
    },
    follow(listener) {
      listeners.add(listener);
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Kept off the exported `ResizableProps`, like the hook's collapse controls:
 * a hand-built object has no region, so its panel never slides.
 */
const propsRegions = new WeakMap<ResizableProps, RegionPaneSlot>();

/** The hook registers each `props` object it returns with its region. */
export function registerPropsRegion(
  props: ResizableProps,
  slot: RegionPaneSlot,
): void {
  propsRegions.set(props, slot);
}

/** The region of the hook's own `props`, or undefined for a hand-built object. */
export function regionOfProps(
  props: ResizableProps,
): RegionPaneSlot | undefined {
  return propsRegions.get(props);
}

/** LayoutPanel's side of the channel, one per panel. */
export interface ResizablePaneLink {
  /** For useSyncExternalStore: whether a controller holds the panel collapsed. */
  readonly subscribe: (listener: () => void) => () => void;
  readonly isCollapsed: () => boolean;
  /** The handle the controller named for focus to move to, if any. */
  focusTarget(): HTMLElement | null;
  /**
   * From the panel: its element, lent beside its handle for a factory to
   * find (`isFoundBeside`). Or the element is handed to a region.
   * Null takes it back. Returns the pane lent, if any.
   */
  attach(
    element: HTMLElement | null,
    isFoundBeside: boolean,
  ): ResizablePane | null;
  /** Before the DOM changes in a commit that renders width 0, or away from it. */
  beforeChange(toCollapsed: boolean): void;
  /** After every commit of the panel, with the width it rendered and its content-facing edge. */
  committed(width: RenderedPaneWidth, edge: LayoutEdge): void;
}

export function createResizablePaneLink(): ResizablePaneLink {
  let isCollapsed = false;
  let focusTarget: HTMLElement | null = null;
  let width: RenderedPaneWidth = undefined;
  let edge: LayoutEdge = 'inline-end';
  let attached: ResizablePane | null = null;
  let isAttachedBeside = false;
  let listener: PaneListener | null = null;
  const listeners = new Set<() => void>();

  const setCollapsed = (next: boolean) => {
    if (next === isCollapsed) {
      return;
    }
    isCollapsed = next;
    for (const notify of [...listeners]) {
      notify();
    }
  };

  return {
    subscribe(notify) {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    isCollapsed: () => isCollapsed,
    focusTarget: () => focusTarget,
    attach(element, isFoundBeside) {
      if (attached?.element === element && isAttachedBeside === isFoundBeside) {
        return attached;
      }
      const wasBeside = attached != null && isAttachedBeside;
      if (attached != null && lent.get(attached.element) === attached) {
        lent.delete(attached.element);
      }
      attached = null;
      listener = null;
      isAttachedBeside = isFoundBeside;
      if (element == null) {
        // Taken back: no controller holds it collapsed any more.
        focusTarget = null;
        setCollapsed(false);
      } else {
        const pane: ResizablePane = {
          element,
          renderedWidth: () => width,
          contentFacingEdge: () => edge,
          setCollapsed(next, nextFocusTarget) {
            if (attached === pane) {
              focusTarget = nextFocusTarget;
              setCollapsed(next);
            }
          },
          listen(next) {
            if (attached === pane) {
              listener = next;
            }
          },
        };
        attached = pane;
        if (isFoundBeside) {
          lent.set(element, pane);
        }
      }
      if (wasBeside || (element != null && isFoundBeside)) {
        notifyWatchers();
      }
      return attached;
    },
    beforeChange(toCollapsed) {
      listener?.beforeChange(toCollapsed);
    },
    committed(nextWidth, nextEdge) {
      width = nextWidth;
      edge = nextEdge;
      listener?.committed();
    },
  };
}

/**
 * The edge reveal a resize controller plays for its pane. It measures before
 * the DOM changes and plays on the pane's first commit at a new size. It runs
 * on the controller's own animated-layout handle over the pane's row, with no
 * copy.
 */
export interface PaneReveal {
  /** Before the DOM changes: measures `pane` for its reveal from `edge`. */
  measure(pane: ResizablePane, edge: LayoutEdge): void;
  /** After a commit of the pane: the one that renders its new size plays. */
  committed(pane: ResizablePane): void;
  /** Lands a measured or running reveal at once. */
  land(): void;
}

type EdgeReport = ReturnType<typeof reportLayoutEdge>;

export function createPaneReveal(getRow: () => Element | null): PaneReveal {
  // Measured, waiting for the pane to render its new size; then played.
  let pending: {
    report: EdgeReport;
    pane: ResizablePane;
    widthBefore: RenderedPaneWidth;
  } | null = null;
  let played: EdgeReport | null = null;
  const layout = createAnimatedLayout(getRow);

  const land = () => {
    pending?.report.cancel();
    pending = null;
    played?.cancel();
    played = null;
    // What glides beside the pane lands with it, so no motion plays over the
    // layout that replaces it.
    for (const child of getRow()?.children ?? []) {
      landLayoutGlide(child);
    }
  };

  return {
    measure(pane, edge) {
      // A measured change the pane never rendered is stale; a running one
      // reverses from what it shows.
      pending?.report.cancel();
      pending = null;
      const element = pane.element;
      const report = reportLayoutEdge(layout, () => element, {edge});
      report.measureBefore();
      pending = {report, pane, widthBefore: pane.renderedWidth()};
    },
    committed(pane) {
      if (
        pending == null ||
        pending.pane !== pane ||
        pane.renderedWidth() === pending.widthBefore
      ) {
        return;
      }
      const {report} = pending;
      pending = null;
      played = report;
      report.animate();
    },
    land,
  };
}

/**
 * The next slide in `row` plays the settle spring at the theme's tempo, not
 * the theme's curve.
 * It starts from a release `velocity` (px per second toward the end) over
 * `distance` px. Returns the share of the distance still to go, by ms since
 * the slide began, or null when nothing slides.
 */
export function slideNextOnRelease(
  row: Element,
  velocity: number,
  distance: number,
): ((elapsedMs: number) => number) | null {
  if (!(distance > 0)) {
    return null;
  }
  const progress = springGlide(
    resolveMotion(row, springs.settle),
    velocity / distance,
  );
  glideNextChange(row, progress);
  return elapsedMs =>
    elapsedMs >= progress.durationMs ? 0 : progress.remaining(elapsedMs);
}

/**
 * Reads the size the pane's edge shows from its handle's drawn middle,
 * glides included. Measured while the pane shows `size`.
 */
export function shownSizeReader(
  pane: ResizablePane,
  size: number,
): (() => number) | null {
  const element = pane.element;
  const handle = resizeHandleBeside(element, null);
  if (handle == null) {
    return null;
  }
  const edge = pane.contentFacingEdge();
  const isInline = edge.startsWith('inline');
  const isRtl =
    isInline &&
    element.ownerDocument.defaultView?.getComputedStyle(element).direction ===
      'rtl';
  const isForward = isInline
    ? edge.endsWith('end') !== isRtl
    : edge.endsWith('end');
  const rect = element.getBoundingClientRect();
  const far = isInline
    ? isForward
      ? rect.left
      : rect.right
    : isForward
      ? rect.top
      : rect.bottom;
  const sign = isForward ? 1 : -1;
  const middle = () => {
    const box = handle.getBoundingClientRect();
    return isInline ? box.left + box.width / 2 : box.top + box.height / 2;
  };
  // The handle's middle stands this far past the pane's shown edge.
  const offset = sign * (middle() - far) - size;
  return () => Math.max(sign * (middle() - far) - offset, 0);
}

/** A motion a script plays: not a CSS transition or a CSS animation. */
export function isScriptMotion(motion: Animation): boolean {
  return !('transitionProperty' in motion) && !('animationName' in motion);
}

/**
 * The motions a slide of `pane` plays now: what glides beside it, and its own
 * edge's motion on the same clock. None once the slide lands.
 */
export function slideMotionsOf(pane: ResizablePane): Animation[] {
  const element = pane.element;
  const beside = [...(element.parentElement?.children ?? [])]
    .filter(child => child !== element)
    .map(glideOf)
    .filter((motion): motion is Animation => motion != null);
  const durationOf = (motion: Animation) =>
    Number(motion.effect?.getComputedTiming().duration ?? 0);
  const durationMs = beside.length > 0 ? durationOf(beside[0]) : null;
  const own =
    typeof element.getAnimations === 'function'
      ? element
          .getAnimations()
          .filter(
            motion =>
              isScriptMotion(motion) &&
              (durationMs == null ||
                Math.abs(durationOf(motion) - durationMs) < 1),
          )
      : [];
  return [...own, ...beside];
}

/** A pull past a limit, drawn on a pane a LayoutPanel renders. */
export interface OvershootDrawing {
  /** Draws the handle `amount` px past its limit: positive past the maximum. */
  draw(amount: number): void;
  /**
   * Springs the drawn handle back to the limit on the handle's own animator,
   * on `spring` from a release `velocity`. The velocity is the amount's own
   * rate in px per second, positive past the maximum. Returns false when
   * nothing is drawn.
   */
  springBack(spring: SpringDescription, velocity: number): boolean;
  /** How far past its limit the handle shows now, a spring-back included. */
  shown(): number;
  /** Drops the drawing at once. */
  clear(): void;
}

/**
 * Draws a pull past a limit with no layout change. The handle alone moves
 * past the limit, over the content beside it, so the panes keep their sizes
 * and nothing reflows. The geometry is measured once, as the overshoot
 * starts.
 */
export function createOvershootDrawing(pane: ResizablePane): OvershootDrawing {
  const element = pane.element;
  let geometry: {
    sign: number;
    axis: 'x' | 'y';
    handle: HTMLElement | null;
  } | null = null;
  let drawn = 0;
  let springing: MotionHandle | null = null;

  const measure = () => {
    if (geometry != null) {
      return geometry;
    }
    const edge = pane.contentFacingEdge();
    const isInline = edge.startsWith('inline');
    const isRtl =
      isInline &&
      element.ownerDocument.defaultView?.getComputedStyle(element).direction ===
        'rtl';
    geometry = {
      sign: (edge.endsWith('end') ? 1 : -1) * (isRtl ? -1 : 1),
      axis: isInline ? 'x' : 'y',
      handle: resizeHandleBeside(element, null),
    };
    return geometry;
  };
  const animator = () => {
    const handle = geometry?.handle;
    return handle == null ? null : animatorFor(handle);
  };

  return {
    draw(amount) {
      const isAtRest = drawn === 0 && springing == null;
      if (isAtRest && amount === 0) {
        return;
      }
      if (isAtRest) {
        // A new overshoot measures once: the layout can change between pulls.
        geometry = null;
      }
      springing = null;
      drawn = amount;
      const {sign, axis} = measure();
      animator()?.set({[axis]: sign * amount});
    },
    springBack(spring, velocity) {
      const motion = animator();
      if (drawn === 0 || motion == null || geometry == null) {
        return false;
      }
      const {sign, axis} = geometry;
      drawn = 0;
      const played = motion.animate(
        {[axis]: 0},
        {spring, velocity: {[axis]: sign * velocity}},
      );
      springing = played;
      void played.finished.then(() => {
        if (springing === played) {
          springing = null;
        }
      });
      return true;
    },
    shown() {
      const motion = animator();
      if (springing == null || motion == null || geometry == null) {
        return drawn;
      }
      return geometry.sign * motion.get(geometry.axis);
    },
    clear() {
      if (geometry != null && (drawn !== 0 || springing != null)) {
        // Only the value: the drawing gives the handle no layer to keep.
        animator()?.set({[geometry.axis]: 0}, {promote: false});
      }
      springing = null;
      drawn = 0;
      geometry = null;
    },
  };
}
