// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resizablePane.ts
 * @input A LayoutPanel's element, its commits, the width it renders and the
 *   edge facing its content; whether the resize controller that sizes it says
 *   its region is collapsed; and the shared edge reveal of
 *   motion/animatedLayout.ts
 * @output The internal channel through which a LayoutPanel lends its element
 *   to the resize controller that sizes it (component:LayoutPanel FR7):
 *   `createResizablePaneLink` for LayoutPanel; `resizablePaneBeside` and
 *   `watchResizablePanes` for a factory that finds the panel beside its
 *   handle; `createRegionPaneSlot`, `registerPropsRegion` and
 *   `regionOfProps` for the configuration-object form, whose LayoutPanel
 *   hands its pane to the region in its callback ref; `createPaneReveal`, the
 *   edge reveal a controller plays (component:Resizable FR8); and
 *   `resizeHandleBeside`, the ResizeHandle a panel hands focus to
 *   (component:LayoutPanel AR2)
 * @position Internal to Resizable and Layout; no entry point exports it. No
 *   React, and no DOM work on import
 */

import {
  createAnimatedLayout,
  reportLayoutEdge,
  type LayoutEdge,
} from '../motion/animatedLayout';
import {isClaimedResizeHandle} from './resizeGesture';
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
   * focus inside the panel moves to as it collapses: the panel is then inert
   * and hidden from assistive technology while it is (component:LayoutPanel
   * AR2).
   */
  setCollapsed(isCollapsed: boolean, focusTarget: HTMLElement | null): void;
  /** The controller that sizes the pane listens to it; null stops it. */
  listen(listener: PaneListener | null): void;
}

const lent = new WeakMap<Element, ResizablePane>();
const watchers = new Set<() => void>();

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
export function resizablePaneBeside(
  handle: Element,
  side: 'before' | 'after',
): ResizablePane | null {
  const sibling =
    side === 'before'
      ? handle.previousElementSibling
      : handle.nextElementSibling;
  return sibling == null ? null : (lent.get(sibling) ?? null);
}

/**
 * The ResizeHandle beside a panel, on the side that faces the content: after
 * a start panel, before an end panel, and either for a panel elsewhere.
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
    if (candidate instanceof HTMLElement && isClaimedResizeHandle(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * The configuration-object form's side of a region: the LayoutPanel that
 * takes the hook's own props hands its pane here in its callback ref, and the
 * factory the region has, now or later, follows it.
 */
export interface RegionPaneSlot {
  /** From the LayoutPanel's callback ref: its pane, or null as it goes. */
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
   * From the panel's callback ref: its element, lent beside its handle for a
   * factory to find (`isFoundBeside`), or handed to a region; null takes it
   * back. Returns the pane lent, if any.
   */
  attach(
    element: HTMLElement | null,
    isFoundBeside: boolean,
  ): ResizablePane | null;
  /** Before the DOM changes in a commit that renders width 0, or away from it. */
  beforeChange(toCollapsed: boolean): void;
  /** After every commit of the panel, with the width it rendered and its content-facing edge. */
  committed(width: RenderedPaneWidth, edge: LayoutEdge): void;
  /** The width and edge the panel renders now, set during its render. */
  render(width: RenderedPaneWidth, edge: LayoutEdge): void;
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
    render(nextWidth, nextEdge) {
      width = nextWidth;
      edge = nextEdge;
    },
  };
}

/**
 * The edge reveal a resize controller plays for its pane
 * (component:Resizable FR8): measured before the DOM changes, played on the
 * pane's first commit at a new size, on the controller's own animated-layout
 * handle over the pane's row, with no copy.
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
