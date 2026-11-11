// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Private DOM registry used by future axis-aware Sticky consumers. */

import {sharedWeakMap} from '../utils/sharedRealm';

export interface RegisteredScrollAxisState {
  isScrollable: boolean;
  atStart: boolean;
  atEnd: boolean;
}

export interface RegisteredScrollOwnerState {
  inline: RegisteredScrollAxisState;
  block: RegisteredScrollAxisState;
}

// Shared by every copy of Core, so a swizzled AppShell's keyboard delegation
// yields to a package ScrollableArea inside it, and the reverse.
const owners = sharedWeakMap<HTMLElement, RegisteredScrollOwnerState>(
  'hooks/scroll-owner-registry/owners',
  1,
);

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
