// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Private observation of the canonical scroll owner.
 * @input The viewport already measured by useScrollableArea.
 * @output Shared geometry notifications without another listener or observer.
 * @position Private bridge for Table windowing on the existing viewport.
 */
type GeometryListener = (
  hasContentInvalidation: boolean,
  hasLayoutInvalidation: boolean,
) => void;
const listeners = new WeakMap<HTMLElement, Set<GeometryListener>>();

export function subscribeScrollGeometry(
  viewport: HTMLElement,
  listener: GeometryListener,
): () => void {
  let set = listeners.get(viewport);
  if (set == null) {
    set = new Set();
    listeners.set(viewport, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set?.size === 0) {
      listeners.delete(viewport);
    }
  };
}

/**
 * A content invalidation is any change inside the scroll content, such as a
 * mounted row. A layout invalidation is a size, font, or outer class or style
 * change, which can change how content that is already mounted fits. Each
 * layout invalidation is also a content invalidation.
 */
export function publishScrollGeometry(
  viewport: HTMLElement,
  hasContentInvalidation = false,
  hasLayoutInvalidation = false,
): void {
  for (const listener of listeners.get(viewport) ?? []) {
    listener(
      hasContentInvalidation || hasLayoutInvalidation,
      hasLayoutInvalidation,
    );
  }
}
