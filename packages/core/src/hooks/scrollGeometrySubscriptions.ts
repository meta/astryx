// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Private observation of the canonical scroll owner.
 * @input The viewport already measured by useScrollableArea.
 * @output Shared geometry notifications without another listener or observer.
 * @position Private bridge for Table windowing on the existing viewport.
 */
const listeners = new WeakMap<
  HTMLElement,
  Set<(hasContentInvalidation: boolean) => void>
>();

export function subscribeScrollGeometry(
  viewport: HTMLElement,
  listener: (hasContentInvalidation: boolean) => void,
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

export function publishScrollGeometry(
  viewport: HTMLElement,
  hasContentInvalidation = false,
): void {
  for (const listener of listeners.get(viewport) ?? []) {
    listener(hasContentInvalidation);
  }
}
