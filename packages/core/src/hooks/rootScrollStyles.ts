// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file rootScrollStyles.ts
 * @input The inline styles of the root and `<body>`
 * @output claimRootScrollStyle, which owns the page's `overflow`,
 *   `overscroll-behavior-y` and `scrollbar-gutter`; isScrollLockActive and
 *   subscribeScrollLock, which report whether a scroll lock holds the page
 * @position Internal hook utility. Each caller that changes how the page
 *   scrolls claims these styles here, so no caller overwrites a value that
 *   another caller still needs.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/useScrollLock.ts
 */

import {sharedState} from '../utils/sharedRealm';

/** The root scroll styles a caller can hold. */
export interface RootScrollStyle {
  /** `hidden` or `clip` stops wheel, keyboard and scrollbar scrolling of the page. */
  overflow?: 'hidden' | 'clip';
  /** `none` turns the page's own bounce off at both vertical edges. */
  overscrollBehaviorY?: 'none' | 'contain';
  /** `stable` keeps a classic scrollbar's space while the page cannot scroll. */
  scrollbarGutter?: 'stable';
}

type RootScrollProperty = keyof RootScrollStyle;

const PROPERTIES: ReadonlyArray<RootScrollProperty> = [
  'overflow',
  'overscrollBehaviorY',
  'scrollbarGutter',
];

interface Claim {
  readonly id: number;
  readonly value: string;
}

type SavedStyle =
  | 'overflow'
  | 'overflowX'
  | 'overflowY'
  | 'overscrollBehaviorY'
  | 'scrollbarGutter';

/**
 * The inline styles saved for each property, so a page's own value comes back
 * exactly, including a one-axis `overflow-x` or `overflow-y`.
 */
const SAVED: Record<RootScrollProperty, ReadonlyArray<SavedStyle>> = {
  overflow: ['overflow', 'overflowX', 'overflowY'],
  overscrollBehaviorY: ['overscrollBehaviorY'],
  scrollbarGutter: ['scrollbarGutter'],
};

/**
 * An element that holds a property's claims. It keeps the page's own inline
 * values, saved at the first claim, and the value that the claims last wrote.
 */
interface HeldTarget {
  readonly element: HTMLElement;
  readonly pageValues: Partial<Record<SavedStyle, string>>;
  written: string;
}

// Every copy of Core uses this one state, so a swizzled overlay and the
// package's stack their claims and locks on the same page.
const state = sharedState('hooks/root-scroll-styles/state', 1, () => {
  const claims: Record<RootScrollProperty, Claim[]> = {
    overflow: [],
    overscrollBehaviorY: [],
    scrollbarGutter: [],
  };
  return {
    claims,
    held: new Map<RootScrollProperty, HeldTarget[]>(),
    nextClaimId: 0,
    lockCount: 0,
    lockListeners: new Set<(isActive: boolean) => void>(),
  };
});

/**
 * The element whose `overflow` the viewport uses. That is the root, unless the
 * root's own is `visible` and `<body>` sets one, which then propagates to the
 * viewport. A write to the root in that case stops the propagation. Then
 * `<body>` becomes its own scroller at offset 0, and the page jumps to its top.
 */
function overflowTarget(doc: Document): HTMLElement {
  const root = doc.documentElement;
  const {body} = doc;
  const view = doc.defaultView;
  if (body == null || view == null) {
    return root;
  }
  const isVisible = (element: Element) => {
    const style = view.getComputedStyle(element);
    return (
      (style.overflowX || 'visible') === 'visible' &&
      (style.overflowY || 'visible') === 'visible'
    );
  };
  return isVisible(root) && !isVisible(body) ? body : root;
}

/**
 * Where a property's claims go. `overflow` goes to the element that the
 * viewport takes it from. `overscroll-behavior-y` goes to the root and to
 * `<body>`, because Chrome on Android reads `<body>`'s value for its
 * pull-to-refresh. `scrollbar-gutter` goes to the root.
 */
function claimTargets(
  property: RootScrollProperty,
  doc: Document,
): HTMLElement[] {
  if (property === 'overflow') {
    return [overflowTarget(doc)];
  }
  if (property === 'scrollbarGutter') {
    return [doc.documentElement];
  }
  return doc.body == null
    ? [doc.documentElement]
    : [doc.documentElement, doc.body];
}

function applyTopClaim(property: RootScrollProperty): void {
  const targets = state.held.get(property);
  if (targets == null) {
    return;
  }
  const stack = state.claims[property];
  const top = stack[stack.length - 1];
  for (const target of targets) {
    const {style} = target.element;
    if (top != null) {
      style[property] = top.value;
      target.written = top.value;
      continue;
    }
    // The last claim is gone, so the page gets its own values back. A value
    // that an outside writer set meanwhile stays.
    if (style[property] === target.written) {
      style[property] = '';
      for (const name of SAVED[property]) {
        const value = target.pageValues[name];
        if (value) {
          style[name] = value;
        }
      }
    }
  }
  if (top == null) {
    state.held.delete(property);
  }
}

/**
 * Sets the page's `overflow`, `overscroll-behavior-y` or `scrollbar-gutter`
 * until the returned release runs. Claims stack per property: the latest claim
 * wins, and a release in any order restores the claim beneath it. The page's
 * own inline value comes back after the last release, unless an outside writer
 * changed that style meanwhile. A second release does nothing.
 *
 * @example
 * ```
 * const release = claimRootScrollStyle({overflow: 'hidden'});
 * // later
 * release();
 * ```
 */
export function claimRootScrollStyle(claim: RootScrollStyle): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }
  state.nextClaimId += 1;
  const id = state.nextClaimId;
  const claimed: RootScrollProperty[] = [];
  for (const property of PROPERTIES) {
    const value = claim[property];
    if (value == null) {
      continue;
    }
    if (state.claims[property].length === 0) {
      state.held.set(
        property,
        claimTargets(property, document).map(element => {
          const pageValues: Partial<Record<SavedStyle, string>> = {};
          for (const name of SAVED[property]) {
            pageValues[name] = element.style[name];
          }
          return {element, pageValues, written: ''};
        }),
      );
    }
    state.claims[property].push({id, value});
    claimed.push(property);
    applyTopClaim(property);
  }

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    for (const property of claimed) {
      const stack = state.claims[property];
      const index = stack.findIndex(entry => entry.id === id);
      if (index !== -1) {
        stack.splice(index, 1);
      }
      applyTopClaim(property);
    }
  };
}

/** Whether a scroll lock (useScrollLock) currently holds the page. */
export function isScrollLockActive(): boolean {
  return state.lockCount > 0;
}

/**
 * Calls `listener` with the new state each time the page becomes locked or
 * free. A second lock while one holds is no change. Returns the unsubscribe
 * function.
 */
export function subscribeScrollLock(
  listener: (isActive: boolean) => void,
): () => void {
  state.lockListeners.add(listener);
  return () => {
    state.lockListeners.delete(listener);
  };
}

/** For scroll locks: one lock taken (`1`) or released (`-1`). */
export function reportScrollLock(delta: 1 | -1): void {
  const wasActive = state.lockCount > 0;
  state.lockCount = Math.max(0, state.lockCount + delta);
  const isActive = state.lockCount > 0;
  if (isActive === wasActive) {
    return;
  }
  for (const listener of [...state.lockListeners]) {
    listener(isActive);
  }
}
