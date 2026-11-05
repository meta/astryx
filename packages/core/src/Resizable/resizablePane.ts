// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resizablePane.ts
 * @input A LayoutPanel's element, and the collapse state the ResizeHandle
 *   beside it reports
 * @output The internal channel through which a LayoutPanel at a region's size
 *   lends its element to the ResizeHandle beside it, and the ResizeHandle a
 *   collapsing panel hands focus to
 * @position Internal to Resizable and Layout; no entry point exports it. No
 *   React, and no DOM work on import
 */

/** What a LayoutPanel lends the ResizeHandle beside it. */
export interface ResizablePane {
  readonly element: HTMLElement;
  /**
   * The handle says whether its region is collapsed, and which handle focus
   * inside the panel moves to as it collapses. The panel is then inert and
   * hidden from assistive technology while it is collapsed.
   */
  setCollapsed(isCollapsed: boolean, focusTarget: HTMLElement | null): void;
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
 * a handle looks for its pane again. Returns the function that stops it.
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

/** The lent panel a handle sizes: before it, or after it when reversed. */
export function resizablePaneFor(
  handle: Element,
  isReversed: boolean,
): ResizablePane | null {
  return resizablePaneBeside(handle, isReversed ? 'after' : 'before');
}

/**
 * Moves a handle's hold from `held` to `next`, and returns `next`. A pane the
 * handle no longer holds opens. The held pane takes the region's collapse
 * state, and focus inside it moves to `handle` as it collapses.
 */
export function handOverPane(
  held: ResizablePane | null,
  next: ResizablePane | null,
  isCollapsed: boolean,
  handle: HTMLElement | null,
): ResizablePane | null {
  if (next !== held) {
    held?.setCollapsed(false, null);
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

/** LayoutPanel's side of the channel, one per panel. */
export interface ResizablePaneLink {
  /** For useSyncExternalStore: whether a handle holds the panel collapsed. */
  readonly subscribe: (listener: () => void) => () => void;
  readonly isCollapsed: () => boolean;
  /** The handle that named itself for focus to move to, if any. */
  focusTarget(): HTMLElement | null;
  /**
   * From the panel's callback ref: its element, lent beside its handle for
   * the handle to find. Null takes it back.
   */
  attach(element: HTMLElement | null): void;
}

export function createResizablePaneLink(): ResizablePaneLink {
  let isCollapsed = false;
  let focusTarget: HTMLElement | null = null;
  let attached: ResizablePane | null = null;
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
    attach(element) {
      if (attached?.element === element) {
        return;
      }
      const wasLent = attached != null;
      if (attached != null && lent.get(attached.element) === attached) {
        lent.delete(attached.element);
      }
      attached = null;
      if (element == null) {
        // Taken back: no handle holds it collapsed any more.
        focusTarget = null;
        setCollapsed(false);
      } else {
        const pane: ResizablePane = {
          element,
          setCollapsed(next, nextFocusTarget) {
            if (attached === pane) {
              focusTarget = nextFocusTarget;
              setCollapsed(next);
            }
          },
        };
        attached = pane;
        lent.set(element, pane);
      }
      if (wasLent || element != null) {
        notifyWatchers();
      }
    },
  };
}
