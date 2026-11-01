// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentation.ts
 * @input Animators reporting, while a translate runs on the compositor, how
 *   far their element is drawn from where the engine hit-tests it, and how
 *   to make the engine hit-test it where it is drawn
 * @output Exports registerPresentedOffset, presentedElements,
 *   presentedOffsetOf, resolvePresented and watchPresentedElements: the
 *   registry the gesture host reads at touch-down to send a touch to what is
 *   drawn, and follows to keep a drag on a moving element blocking
 * @position Motion foundation (DOM, no React). Written by animator.ts, read
 *   by gestures/GestureHost.ts; internal to core
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

const sources = new Map<Element, PresentedSource>();
const watchers = new Set<() => void>();

/** Tell every watcher the reported elements changed; one's throw stops none. */
function notifyWatchers(): void {
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
 * offset plus those of its moving ancestors (across shadow roots), now or at
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
    node = node instanceof ShadowRoot ? node.host : node.parentNode
  ) {
    const source = node instanceof Element ? sources.get(node) : undefined;
    if (source != null) {
      const offset = source.offset(time);
      x += offset.x;
      y += offset.y;
    }
  }
  return {x, y};
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
