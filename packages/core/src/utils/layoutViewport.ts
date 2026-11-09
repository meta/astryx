// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layoutViewport.ts
 * @input A window: its innerHeight and innerWidth, its visual viewport's
 *   width and scale, and its document's root box
 * @output layoutViewportHeight, the layout viewport's height in layout px
 *   less a classic horizontal scrollbar, and __resetLayoutViewportForTest
 * @position Internal shared measurement, not re-exported from the utils
 *   entry. The keyboard module, BottomSheet's keyboard obstruction and any
 *   layout that sizes against the layout viewport read it.
 */

/**
 * The layout viewport's height, CSS px, in the units of element rects.
 *
 * `innerHeight` is the layout viewport's height in most engines. WebKit
 * reports `innerHeight` and `innerWidth` in the pinch-zoomed visual
 * viewport's px instead. At a 1.33 zoom of a 402 × 714 layout viewport,
 * Safari on iOS 26.2 reports 536 and 302. Element rects and the visual
 * viewport's height times its scale stay in layout px. So, read as is, a zoom
 * shrinks the layout viewport by the zoom, and the function scales the height
 * back.
 */
export function layoutViewportHeight(win: Window): number {
  const viewport = win.visualViewport;
  const width = viewport?.width ?? 0;
  if (viewport == null || !(width > 0)) {
    return win.innerHeight - horizontalScrollbarHeight(win);
  }
  const scale = viewport.scale;
  // Which units `innerWidth` is in tells the two apart without naming an
  // engine. It is the visual viewport's width where the zoom applies, and
  // that width times the scale where it does not. `innerWidth` is a whole
  // number of px against a fractional width, so it never equals either, and
  // the nearest wins with no tolerance constant. At a scale of 1 the two
  // widths are equal, so the function takes `innerHeight` as it is. A classic
  // scrollbar, which `innerWidth` counts, then changes nothing.
  const fromVisual = Math.abs(win.innerWidth - width);
  const fromLayout = Math.abs(win.innerWidth - width * scale);
  const height =
    fromVisual < fromLayout ? win.innerHeight * scale : win.innerHeight;
  return height - horizontalScrollbarHeight(win);
}

/**
 * The document's classic horizontal scrollbar, CSS px. It is in
 * `innerHeight` but not in the visual viewport's height. On a desktop page
 * wider than its window, Chromium's `innerHeight` is 800 for a 785 px visual
 * viewport. It is the part of `innerHeight` the root's client height leaves
 * out, up to the thickness of a scrollbar that takes room. Where scrollbars
 * overlay the content, as on every phone, that thickness is 0. So the room a
 * hidden toolbar adds to `innerHeight` is never taken for a scrollbar. Chrome
 * on Android sizes the root to the viewport with its toolbar shown.
 */
function horizontalScrollbarHeight(win: Window): number {
  const root = win.document.documentElement;
  const gap = win.innerHeight - root.clientHeight;
  if (!(gap > 0) || root.scrollWidth <= root.clientWidth) {
    return 0;
  }
  return Math.min(gap, scrollbarThickness(win.document));
}

// The scrollbar thickness each document measured, and the device pixel ratio
// it measured it at. A browser zoom changes the ratio, and with it how many
// CSS px a classic scrollbar takes. Measuring writes a probe to the document
// and forces a layout, so it runs once per document and zoom. Every later
// measurement stays one layout read.
let thicknesses = new WeakMap<
  Document,
  {devicePixelRatio: number; thickness: number}
>();

/** How much room a scrollbar takes from a scrolling box: 0 where overlaid. */
function scrollbarThickness(doc: Document): number {
  const devicePixelRatio = doc.defaultView?.devicePixelRatio ?? 1;
  const known = thicknesses.get(doc);
  if (known != null && known.devicePixelRatio === devicePixelRatio) {
    return known.thickness;
  }
  const thickness = measureScrollbarThickness(doc);
  thicknesses.set(doc, {devicePixelRatio, thickness});
  return thickness;
}

function measureScrollbarThickness(doc: Document): number {
  const probe = doc.createElement('div');
  probe.style.position = 'absolute';
  probe.style.top = '-200px';
  probe.style.width = '100px';
  probe.style.height = '100px';
  probe.style.overflow = 'scroll';
  probe.style.visibility = 'hidden';
  (doc.body ?? doc.documentElement).append(probe);
  const thickness = probe.offsetHeight - probe.clientHeight;
  probe.remove();
  return thickness;
}

/** Forgets every measured scrollbar thickness. Tests only. */
export function __resetLayoutViewportForTest(): void {
  thicknesses = new WeakMap();
}
