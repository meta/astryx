// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Private DOM registry used by future axis-aware Sticky consumers. */

export interface RegisteredScrollAxisState {
  isScrollable: boolean;
  atStart: boolean;
  atEnd: boolean;
}

export interface RegisteredScrollOwnerState {
  inline: RegisteredScrollAxisState;
  block: RegisteredScrollAxisState;
}

const owners = new WeakMap<HTMLElement, RegisteredScrollOwnerState>();

export function registerScrollOwner(
  element: HTMLElement,
  state: RegisteredScrollOwnerState,
): void {
  owners.set(element, state);
}

export function unregisterScrollOwner(element: HTMLElement): void {
  owners.delete(element);
}

export function getRegisteredScrollOwnerState(
  element: HTMLElement,
): RegisteredScrollOwnerState | undefined {
  return owners.get(element);
}

export function findNearestScrollOwner(
  element: Element,
  axis: 'inline' | 'block',
): HTMLElement | null {
  let candidate = element.parentElement;
  while (candidate != null) {
    if (owners.get(candidate)?.[axis].isScrollable === true) {
      return candidate;
    }
    candidate = candidate.parentElement;
  }
  return null;
}
