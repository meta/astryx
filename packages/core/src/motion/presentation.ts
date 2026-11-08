// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentation.ts
 * @input Animators reporting, while a translate runs on the compositor, how
 *   far their element is drawn from where the engine hit-tests it, and how
 *   to make the engine hit-test it where it is drawn
 * @output The registry that the gesture host reads at touch-down, to send a
 *   touch to what is drawn. The host also follows it to keep a drag on a
 *   moving element blocking. Exports: registerPresentedOffset,
 *   batchPresented, presentedElements, presentedOffsetOf, resolvePresented,
 *   watchPresentedElements and the resolve write
 * @position Motion foundation (DOM, no React). Written by animator.ts and
 *   animatedLayout.ts, read by gestures/GestureHost.ts; internal to core
 *
 * iOS WebKit hit-tests an element that a Web Animations transform moves on
 * the compositor where the animation STARTED: it keeps the transform it
 * resolved when the animation went to the compositor, so event targets,
 * `elementFromPoint` and `getBoundingClientRect` stay there for the whole
 * curve, while the inline style holds the value the curve starts from (the
 * animator writes it there while the curve runs) and the computed style is
 * live (iOS 26.2, measured). A style write on the element makes it
 * resolve the transform again, to the value drawn at that moment, and it
 * stays there. UIKit keeps an interruptible animation hit-testable where it
 * is drawn (UIViewPropertyAnimator), so the host corrects for it from this
 * registry.
 *
 * Translation only: a scale or a rotation (a zoom transition, a lifted
 * preview) is still hit at its untransformed box.
 *
 * An engine workaround (`spec:AST-013` FR6). Review condition: re-measure on
 * each iOS release, and remove this registry and the host's correction once
 * iOS WebKit hit-tests a compositor-moved element where it is drawn.
 * Regression fixture: gestures/__tests__/presentedHitTesting.test.ts.
 */

import {parentAcrossShadow} from '../utils/flatTree';
import {isElement} from '../utils/nodeType';
import {realmValue, sharedKey} from '../utils/sharedRealm';

/** How far an element is drawn from where the engine hit-tests it, CSS px. */
export interface PresentedOffset {
  readonly x: number;
  readonly y: number;
}

/** What an animator reports for an element it is moving. */
export interface PresentedSource {
  /**
   * The element's offset at `time` (ms on the `performance.now()` clock,
   * now by default), read live (the motion keeps going): a past time says
   * where it was drawn then, against where the engine hit-tests it now.
   */
  offset(time?: number): PresentedOffset;
  /**
   * Makes the engine hit-test the element where it is drawn now (one style
   * write); the offset restarts from there.
   */
  resolve(): void;
}

const ZERO: PresentedOffset = {x: 0, y: 0};

// Registered, so the gesture host hit-tests elements a swizzled copy moves
// as it does the package's.
const presented = realmValue(sharedKey('motion/presentation', 1), () => ({
  sources: new Map<Element, PresentedSource>(),
  watchers: new Set<() => void>(),
  // Inside batchPresented, a change waits for the batch's end.
  batchDepth: 0,
  isChanged: false,
}));
const {sources, watchers} = presented;

/** Tell every watcher the reported elements changed; one's throw stops none. */
function notifyWatchers(): void {
  if (presented.batchDepth > 0) {
    presented.isChanged = true;
    return;
  }
  for (const watcher of [...watchers]) {
    try {
      watcher();
    } catch (error) {
      queueMicrotask(() => {
        throw error;
      });
    }
  }
}

/**
 * Runs `apply`, which reports elements or removes reports, and tells the
 * watchers once, at its end, when the reported elements changed. So the
 * moves of one layout change cost one notice.
 */
export function batchPresented(apply: () => void): void {
  presented.batchDepth += 1;
  try {
    apply();
  } finally {
    presented.batchDepth -= 1;
    if (presented.batchDepth === 0 && presented.isChanged) {
      presented.isChanged = false;
      notifyWatchers();
    }
  }
}

/**
 * Call `listener` each time an element starts or stops being reported.
 * Returns the function that stops it.
 */
export function watchPresentedElements(listener: () => void): () => void {
  watchers.add(listener);
  return () => {
    watchers.delete(listener);
  };
}

/**
 * Report an element drawn away from where the engine hit-tests it. Returns
 * the function that removes the report.
 */
export function registerPresentedOffset(
  element: Element,
  source: PresentedSource,
): () => void {
  sources.set(element, source);
  notifyWatchers();
  return () => {
    if (sources.get(element) === source) {
      sources.delete(element);
      notifyWatchers();
    }
  };
}

/** The elements reported now. */
export function presentedElements(): ReadonlyArray<Element> {
  return sources.size === 0 ? [] : [...sources.keys()];
}

/**
 * How far `element` is drawn from where the engine hit-tests it: its own
 * offset plus those of its moving ancestors along the flat tree (through a
 * slot to the panel it is drawn in, and across shadow roots), now or at
 * `time` (ms on the `performance.now()` clock).
 */
export function presentedOffsetOf(
  element: Element,
  time?: number,
): PresentedOffset {
  if (sources.size === 0) {
    return ZERO;
  }
  let x = 0;
  let y = 0;
  for (
    let node: Node | null = element;
    node != null;
    node = parentAcrossShadow(node)
  ) {
    const source = isElement(node) ? sources.get(node) : undefined;
    if (source != null) {
      const offset = source.offset(time);
      x += offset.x;
      y += offset.y;
    }
  }
  return {x, y};
}

/** The custom property whose writes make WebKit resolve a moving element. */
const RESOLVE_PROPERTY = '--astryx-presented';

/**
 * Makes iOS WebKit resolve `element`'s transform again, to the value drawn
 * now: one write of a value the property does not have yet. The animator and
 * the animated layout both write it, so it counts up from the element's own
 * last value.
 */
export function writePresentedResolve(element: ElementCSSInlineStyle): void {
  const last = Number(element.style.getPropertyValue(RESOLVE_PROPERTY)) || 0;
  element.style.setProperty(RESOLVE_PROPERTY, String(last + 1));
}

/** Removes the resolve write from `element`. */
export function clearPresentedResolve(element: ElementCSSInlineStyle): void {
  element.style.removeProperty(RESOLVE_PROPERTY);
}

/**
 * Makes the engine hit-test each of `elements` where it is drawn now; the
 * next hit test (an `elementFromPoint`) flushes the writes.
 */
export function resolvePresented(elements: Iterable<Element>): void {
  for (const element of elements) {
    sources.get(element)?.resolve();
  }
}
