// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Decides when a template thumbnail may download its template ahead of its render.
 * @input Reads thumbnail positions, scroll events, the viewport height, and the connection's data-saving hints.
 * @output Reports thumbnails that are near the viewport, and holds work while the page scrolls fast.
 * @position Client-side policy shared by every TemplateThumbnail. It owns one observer, one scroll listener and one resize listener while a thumbnail is mounted.
 */

// Above this speed, in viewport heights per second, tiles cross the screen
// too fast to be read.
const FAST_SCROLL_VIEWPORTS_PER_SECOND = 2;
// Scroll events stop when scrolling stops. After this long with no event, the
// page is at rest.
const SCROLL_REST_MS = 100;

type NetworkInformation = {saveData?: boolean; effectiveType?: string};

/**
 * The root margin of the near-viewport observer: one viewport above and
 * below, the distance Safari uses for lazy images. No lead when the user
 * asked to save data or the connection is 2G.
 */
function leadMargin(): string {
  const connection = (
    navigator as Navigator & {connection?: NetworkInformation}
  ).connection;
  if (
    connection?.saveData === true ||
    /2g/.test(connection?.effectiveType ?? '')
  ) {
    return '0px';
  }
  return '100% 0px';
}

const nearListeners = new Map<Element, (isNear: boolean) => void>();
let nearObserver: IntersectionObserver | null = null;

const lastPositions = new WeakMap<
  EventTarget,
  {offset: number; time: number}
>();
const waiting = new Set<() => void>();
let lastScrollTime = Number.NEGATIVE_INFINITY;
let pixelsPerMs = 0;
let restTimer: number | undefined;
// Read on resize only. A read during a scroll can force a layout.
let viewportHeight = 0;

function isCalm(): boolean {
  if (performance.now() - lastScrollTime > SCROLL_REST_MS) {
    return true;
  }
  return (
    pixelsPerMs < (FAST_SCROLL_VIEWPORTS_PER_SECOND * viewportHeight) / 1000
  );
}

function onResize(): void {
  viewportHeight = window.innerHeight;
}

function runWaiting(): void {
  if (!isCalm()) {
    return;
  }
  for (const run of [...waiting]) {
    waiting.delete(run);
    run();
  }
}

function onScroll(event: Event): void {
  const target = event.target;
  if (!target) {
    return;
  }
  const offset = target instanceof Element ? target.scrollTop : window.scrollY;
  const now = performance.now();
  const last = lastPositions.get(target);
  lastPositions.set(target, {offset, time: now});
  if (last && now - last.time <= SCROLL_REST_MS && now > last.time) {
    pixelsPerMs = Math.abs(offset - last.offset) / (now - last.time);
  } else {
    // The first event of a scroll has no speed yet. Hold work until the next
    // event or the rest timer gives one.
    pixelsPerMs = Number.POSITIVE_INFINITY;
  }
  lastScrollTime = now;
  window.clearTimeout(restTimer);
  restTimer = window.setTimeout(() => {
    pixelsPerMs = 0;
    runWaiting();
  }, SCROLL_REST_MS);
  runWaiting();
}

function startWatching(): void {
  nearObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        nearListeners.get(entry.target)?.(entry.isIntersecting);
      }
    },
    {rootMargin: leadMargin()},
  );
  // Scroll events do not bubble. The capture phase also reports scrolls of
  // nested containers.
  document.addEventListener('scroll', onScroll, {capture: true, passive: true});
  viewportHeight = window.innerHeight;
  window.addEventListener('resize', onResize, {passive: true});
}

function stopWatching(): void {
  nearObserver?.disconnect();
  nearObserver = null;
  document.removeEventListener('scroll', onScroll, {capture: true});
  window.removeEventListener('resize', onResize);
  window.clearTimeout(restTimer);
  lastScrollTime = Number.NEGATIVE_INFINITY;
  pixelsPerMs = 0;
}

/**
 * Reports when `element` enters or leaves the zone within one viewport of
 * the screen. All elements share one observer and one scroll listener, which
 * exist only while an element is observed. Returns a function that stops the
 * reports for this element.
 */
export function observeNearViewport(
  element: Element,
  onChange: (isNear: boolean) => void,
): () => void {
  if (nearListeners.size === 0) {
    startWatching();
  }
  nearListeners.set(element, onChange);
  nearObserver?.observe(element);

  return () => {
    if (nearListeners.get(element) !== onChange) {
      return;
    }
    nearListeners.delete(element);
    nearObserver?.unobserve(element);
    if (nearListeners.size === 0) {
      stopWatching();
    }
  };
}

/**
 * Runs `run` now when the page is at rest or scrolls slowly. During a fast
 * scroll, runs it when the scroll slows down or stops. The speed is known
 * only while an element is observed with `observeNearViewport`. Returns a
 * function that cancels a run that has not happened yet.
 */
export function whenScrollIsCalm(run: () => void): () => void {
  if (isCalm()) {
    run();
    return () => {};
  }
  waiting.add(run);
  return () => {
    waiting.delete(run);
  };
}
