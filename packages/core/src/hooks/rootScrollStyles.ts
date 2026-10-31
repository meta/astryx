// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file rootScrollStyles.ts
 * @input The inline style of the element whose overflow the viewport uses
 *   (the root, or `<body>` when its own overflow propagates to the viewport),
 *   and the inline styles of the root and `<body>`
 * @output claimRootScrollStyle, the one owner of the page's `overflow` and its
 *   `overscroll-behavior-y` (written on the root and on `<body>`, which Chrome
 *   on Android reads for its pull-to-refresh); isScrollLockActive /
 *   subscribeScrollLock, which report whether a scroll lock holds the page
 * @position Internal hook utility. Everything that changes how the page itself
 *   scrolls (a modal's scroll lock, a drawer's lock, a control that turns the
 *   page's top-edge bounce off) claims the root's styles here, so no caller
 *   overwrites a value another one still needs.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/useScrollLock.ts
 */

/** The root scroll styles a caller can hold. */
export interface RootScrollStyle {
  /** `hidden` or `clip` stops wheel, keyboard and scrollbar scrolling of the page. */
  overflow?: 'hidden' | 'clip';
  /** `none` turns the page's own bounce off at both vertical edges. */
  overscrollBehaviorY?: 'none' | 'contain';
}

type RootScrollProperty = keyof RootScrollStyle;

const PROPERTIES: ReadonlyArray<RootScrollProperty> = [
  'overflow',
  'overscrollBehaviorY',
];

interface Claim {
  readonly id: number;
  readonly value: string;
}

const claims: Record<RootScrollProperty, Claim[]> = {
  overflow: [],
  overscrollBehaviorY: [],
};

type SavedStyle =
  'overflow' | 'overflowX' | 'overflowY' | 'overscrollBehaviorY';

/**
 * The inline styles saved for each property, so a page's own value comes back
 * exactly, including a one-axis `overflow-x` or `overflow-y`.
 */
const SAVED: Record<RootScrollProperty, ReadonlyArray<SavedStyle>> = {
  overflow: ['overflow', 'overflowX', 'overflowY'],
  overscrollBehaviorY: ['overscrollBehaviorY'],
};

/**
 * One element a property's claims are written to while any is held: the
 * element, the page's own inline values there (saved when the first claim
 * arrives), and the value these claims last wrote.
 */
interface HeldTarget {
  readonly element: HTMLElement;
  readonly pageValues: Partial<Record<SavedStyle, string>>;
  written: string;
}

const held = new Map<RootScrollProperty, HeldTarget[]>();

let nextClaimId = 0;

/**
 * The element whose `overflow` the viewport uses. That is the root, unless the
 * root's own is `visible` and `<body>` sets one, which then propagates to the
 * viewport (CSS Overflow 3). Writing the root in that case would stop the
 * propagation: `<body>` would become a scroller of its own at offset 0, the
 * page would jump to its top and lose its offset.
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
 * Where a property's claims go. `overflow`: the element the viewport takes it
 * from (overflowTarget). `overscroll-behavior-y`: the root and `<body>`, since
 * Chrome on Android reads `<body>`'s value for its own pull-to-refresh while
 * other browsers read the root's.
 */
function claimTargets(
  property: RootScrollProperty,
  doc: Document,
): HTMLElement[] {
  if (property === 'overflow') {
    return [overflowTarget(doc)];
  }
  return doc.body == null
    ? [doc.documentElement]
    : [doc.documentElement, doc.body];
}

function applyTopClaim(property: RootScrollProperty): void {
  const targets = held.get(property);
  if (targets == null) {
    return;
  }
  const stack = claims[property];
  const top = stack[stack.length - 1];
  for (const target of targets) {
    const {style} = target.element;
    if (top != null) {
      style[property] = top.value;
      target.written = top.value;
      continue;
    }
    // The last claim is gone: the page gets its own values back, unless a
    // writer outside these claims changed the style meanwhile; its value stays.
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
    held.delete(property);
  }
}

/**
 * Sets the page's `overflow` and/or `overscroll-behavior-y` until the returned
 * release runs. `overflow` goes where the viewport takes it from: the root, or
 * `<body>` when the root's is `visible` and `<body>` sets its own.
 * `overscroll-behavior-y` goes on both the root and `<body>` (Chrome on
 * Android reads `<body>`'s for its pull-to-refresh).
 * Claims stack per property: the latest claim wins, releasing a claim restores
 * the one beneath it whatever the release order, and the page's own inline
 * value comes back once the last claim on a property is released, unless
 * something outside these claims wrote that style meanwhile. Releasing twice
 * does nothing.
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
  nextClaimId += 1;
  const id = nextClaimId;
  const claimed: RootScrollProperty[] = [];
  for (const property of PROPERTIES) {
    const value = claim[property];
    if (value == null) {
      continue;
    }
    if (claims[property].length === 0) {
      held.set(
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
    claims[property].push({id, value});
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
      const stack = claims[property];
      const index = stack.findIndex(entry => entry.id === id);
      if (index !== -1) {
        stack.splice(index, 1);
      }
      applyTopClaim(property);
    }
  };
}

let lockCount = 0;
const lockListeners = new Set<(isActive: boolean) => void>();

/** Whether a scroll lock (useScrollLock) currently holds the page. */
export function isScrollLockActive(): boolean {
  return lockCount > 0;
}

/**
 * Calls `listener` with the new state each time the page becomes locked or
 * free; a second lock taken while one holds is not a change. Returns the
 * unsubscribe function.
 */
export function subscribeScrollLock(
  listener: (isActive: boolean) => void,
): () => void {
  lockListeners.add(listener);
  return () => {
    lockListeners.delete(listener);
  };
}

/** For scroll locks: one lock taken (`1`) or released (`-1`). */
export function reportScrollLock(delta: 1 | -1): void {
  const wasActive = lockCount > 0;
  lockCount = Math.max(0, lockCount + delta);
  const isActive = lockCount > 0;
  if (isActive === wasActive) {
    return;
  }
  for (const listener of [...lockListeners]) {
    listener(isActive);
  }
}
