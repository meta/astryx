// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file zoomStage.test.ts
 * @input vitest, the zoom stage geometry and the UIKit zoom constants
 * @output Checks the zoom stage against UIKit's measured zooming and
 *   Lightbox's own zoom. It covers the overshoot, the maximum zoom, both
 *   double taps, resting places, a drag's rubber band, a resize and the
 *   keyboard's zoom
 * @position Testing; zoomStage.ts without a browser
 */

import {describe, expect, it} from 'vitest';
import {rubberBand} from '../motion/rubberBand';
import {
  IDENTITY,
  ZOOM_STEP,
  doubleClickTarget,
  doubleTapScaleFor,
  doubleTapTarget,
  draggedTransform,
  isZoomed,
  maxScaleFor,
  overshootScale,
  pannedBy,
  pinchScaleFor,
  rawForDragged,
  releaseTarget,
  releasedZoomTarget,
  restRange,
  restingTransform,
  transformForResize,
  transformKeepingPoint,
  type ZoomGeometry,
  type ZoomTransform,
} from './zoomStage';

/**
 * The lab's stage: a 402 × 874 screen showing a 3000 × 2000 photo fitted
 * 402 × 268 at its vertical centre, on a 3× screen.
 */
function landscape(overrides: Partial<ZoomGeometry> = {}): ZoomGeometry {
  const width = 402;
  const height = 874;
  const fit = {x: 0, y: (874 - 268) / 2, width: 402, height: 268};
  const doubleTapScale = doubleTapScaleFor(width, height, 402, 268);
  return {
    width,
    height,
    fit,
    minScale: 1,
    maxScale: maxScaleFor(3000, 402, 3, doubleTapScale),
    doubleTapScale,
    ...overrides,
  };
}

/** Where the photo point (u, v) of the fitted box shows on the stage. */
function shown(
  geometry: ZoomGeometry,
  transform: ZoomTransform,
  u: number,
  v: number,
) {
  return {
    x: geometry.fit.x + transform.x + u * transform.scale,
    y: geometry.fit.y + transform.y + v * transform.scale,
  };
}

describe('the overshoot past the zoom limits (UIKit lab, iOS 26.2)', () => {
  const geometry = landscape({minScale: 1, maxScale: 4});

  it('follows the pinch 1:1 inside the limits', () => {
    for (const scale of [1, 1.5, 2.25, 4]) {
      expect(overshootScale(geometry, scale)).toBe(scale);
    }
  });

  it('gives way past the maximum as measured', () => {
    // Pinch 4.5 / 5 / 5.5 / 6 past a maximum of 4.
    const measured = [
      [4.5, 4.444],
      [5, 4.8],
      [5.5, 5.091],
      [6, 5.333],
    ];
    for (const [pinch, zoom] of measured) {
      expect(overshootScale(geometry, pinch)).toBeCloseTo(zoom, 3);
    }
  });

  it('gives way past the minimum as measured', () => {
    const measured = [
      [0.85, 0.87],
      [0.7, 0.769],
      [0.474, 0.655],
      [0.323, 0.596],
    ];
    for (const [pinch, zoom] of measured) {
      expect(overshootScale(geometry, pinch)).toBeCloseTo(zoom, 3);
    }
  });

  it('never reaches twice the maximum or half the minimum', () => {
    expect(overshootScale(geometry, 1e6)).toBeLessThan(8);
    expect(overshootScale(geometry, 1e-6)).toBeGreaterThan(0.5);
  });

  it('inverts, so a pinch can continue from a photo already past a limit', () => {
    for (const pinch of [0.3, 0.6, 0.95, 1, 2, 4, 4.4, 7, 20]) {
      expect(
        pinchScaleFor(geometry, overshootScale(geometry, pinch)),
      ).toBeCloseTo(pinch, 9);
    }
  });
});

describe('the double tap: the larger of filling the stage and 2×, about the tapped point', () => {
  it('zooms until the photo fills the screen when that is more than 2×', () => {
    // Photos' aspect fill: landscape 402 × 268 on an 874 pt screen → 3.261.
    expect(doubleTapScaleFor(402, 874, 402, 268)).toBeCloseTo(3.261, 3);
  });

  it('zooms 2× when filling the screen takes less', () => {
    // A portrait 402 × 603 fills the screen at 1.449×, below the zoom step.
    expect(ZOOM_STEP).toBe(2);
    expect(doubleTapScaleFor(402, 874, 402, 603)).toBe(2);
    expect(doubleTapScaleFor(400, 300, 400, 300)).toBe(2);
  });

  it('keeps a centre tap at the centre, and the photo fills the screen', () => {
    const geometry = landscape();
    const target = doubleTapTarget(geometry, IDENTITY, {x: 201, y: 437});
    expect(target.scale).toBeCloseTo(874 / 268, 9);
    const centre = shown(geometry, target, 201, 134);
    expect(centre.x).toBeCloseTo(201, 9);
    expect(centre.y).toBeCloseTo(437, 9);
    expect(geometry.fit.y + target.y).toBeCloseTo(0, 9);
  });

  it('keeps an off-centre tap where it lands', () => {
    const geometry = landscape();
    // A third of the way across the photo: that point stays under the tap.
    const target = doubleTapTarget(geometry, IDENTITY, {x: 134, y: 437});
    expect(shown(geometry, target, 134, 134).x).toBeCloseTo(134, 9);
  });

  it('stops at the edge for a tap near it', () => {
    // A portrait photo 2000 × 3000, fitted 402 × 603, zooms 2×.
    const fit = {x: 0, y: (874 - 603) / 2, width: 402, height: 603};
    const geometry = landscape({
      fit,
      doubleTapScale: doubleTapScaleFor(402, 874, 402, 603),
    });
    const target = doubleTapTarget(geometry, IDENTITY, {x: 201, y: 700});
    expect(target.scale).toBe(2);
    // The photo's bottom edge rests on the screen's bottom edge.
    expect(fit.y + target.y + fit.height * 2).toBeCloseTo(874, 9);
  });

  it('returns to the fitted size when zoomed', () => {
    const geometry = landscape();
    const zoomed = doubleTapTarget(geometry, IDENTITY, {x: 201, y: 437});
    expect(isZoomed(geometry, zoomed)).toBe(true);
    expect(doubleTapTarget(geometry, zoomed, {x: 50, y: 50})).toEqual(IDENTITY);
  });
});

describe("Photos' maximum zoom (iOS 26.2)", () => {
  it('allows 6 times the zoom that shows one image pixel per device pixel', () => {
    // Measured: 14.93 for 3000 × 2000 and 9.95 for 2000 × 3000, fitted 402 pt
    // wide at 3×.
    expect(maxScaleFor(3000, 402, 3, 3.261)).toBeCloseTo(14.93, 2);
    expect(maxScaleFor(2000, 402, 3, 2)).toBeCloseTo(9.95, 2);
    // Never below the double tap's zoom.
    expect(maxScaleFor(200, 402, 3, 3.261)).toBe(3.261);
  });
});

describe('the point under the fingers', () => {
  it('stays under the centroid as it moves and the zoom changes', () => {
    const geometry = landscape();
    const start: ZoomTransform = {x: -300, y: -100, scale: 2.5};
    const anchor = {x: 150, y: 400};
    const u = (anchor.x - geometry.fit.x - start.x) / start.scale;
    const v = (anchor.y - geometry.fit.y - start.y) / start.scale;
    const centroid = {x: 190, y: 360};
    const next = transformKeepingPoint(geometry, start, anchor, centroid, 4.2);
    const point = shown(geometry, next, u, v);
    expect(point.x).toBeCloseTo(centroid.x, 9);
    expect(point.y).toBeCloseTo(centroid.y, 9);
    expect(next.scale).toBe(4.2);
  });

  it('settles a release past the maximum about the last centroid', () => {
    const geometry = landscape({maxScale: 4});
    const centroid = {x: 220, y: 430};
    // Released at 5.333 with the content point under the centroid at u, v.
    const released: ZoomTransform = {x: -700, y: -500, scale: 5.333};
    const target = releaseTarget(geometry, released, centroid);
    expect(target.scale).toBe(4);
    const u = (centroid.x - geometry.fit.x - released.x) / released.scale;
    const v = (centroid.y - geometry.fit.y - released.y) / released.scale;
    const point = shown(geometry, target, u, v);
    expect(point.x).toBeCloseTo(centroid.x, 9);
    expect(point.y).toBeCloseTo(centroid.y, 9);
  });

  it('keeps a release inside the limits where it is', () => {
    const geometry = landscape();
    const released: ZoomTransform = {x: -100, y: -50, scale: 2};
    expect(releaseTarget(geometry, released, {x: 0, y: 0})).toBe(released);
  });

  it('settles a release past the minimum to the fitted size, centred', () => {
    const geometry = landscape();
    const released: ZoomTransform = {x: 40, y: 30, scale: 0.6};
    expect(releaseTarget(geometry, released, {x: 180, y: 420})).toEqual(
      IDENTITY,
    );
  });
});

describe('the resting place', () => {
  it('centres the photo on an axis where it is smaller than the stage', () => {
    const geometry = landscape();
    // 2× is 804 × 536: wider than the screen, shorter than it.
    const range = restRange(geometry, 2);
    expect(range.x).toEqual({min: 402 - 804, max: 0});
    expect(range.y.min).toBe(range.y.max);
    expect(geometry.fit.y + range.y.min + 536 / 2).toBeCloseTo(874 / 2, 9);
  });

  it('keeps a zoomed photo with no gap at either edge', () => {
    const geometry = landscape();
    expect(restingTransform(geometry, {x: 50, y: 0, scale: 2}).x).toBe(0);
    expect(restingTransform(geometry, {x: -900, y: 0, scale: 2}).x).toBe(
      402 - 804,
    );
  });

  it('pans by keyboard steps inside those bounds', () => {
    const geometry = landscape();
    const from: ZoomTransform = {
      x: -10,
      y: restRange(geometry, 2).y.min,
      scale: 2,
    };
    expect(pannedBy(geometry, from, 50, 0).x).toBe(0);
    expect(pannedBy(geometry, from, -50, 0).x).toBe(-60);
    expect(pannedBy(geometry, from, 0, 50).y).toBe(from.y);
  });
});

describe('the rubber band of a drag', () => {
  const geometry = landscape();

  it('follows the finger inside the bounds', () => {
    const raw: ZoomTransform = {x: -200, y: 0, scale: 2};
    expect(draggedTransform(geometry, raw).x).toBe(-200);
  });

  it("gives way past an edge with UIScrollView's rubber band over the stage width", () => {
    const raw: ZoomTransform = {x: 120, y: 0, scale: 2};
    expect(draggedTransform(geometry, raw).x).toBeCloseTo(
      rubberBand(120, 402, 0.55),
      9,
    );
    const far: ZoomTransform = {x: 402 - 804 - 300, y: 0, scale: 2};
    expect(draggedTransform(geometry, far).x).toBeCloseTo(
      402 - 804 + rubberBand(-300, 402, 0.55),
      9,
    );
  });

  it('does not move the photo on an axis where it fits', () => {
    const raw: ZoomTransform = {x: -200, y: 500, scale: 2};
    expect(draggedTransform(geometry, raw).y).toBe(
      restRange(geometry, 2).y.min,
    );
  });

  it('inverts, so a finger landing on a banded photo picks it up where it shows', () => {
    const raw: ZoomTransform = {x: 150, y: 0, scale: 2};
    const banded = draggedTransform(geometry, raw);
    expect(rawForDragged(geometry, banded).x).toBeCloseTo(150, 9);
  });
});

describe('a resize while zoomed (rotation)', () => {
  it('keeps the photo point at the centre and its size on screen', () => {
    const before = landscape();
    const transform: ZoomTransform = {x: -500, y: -150, scale: 3};
    const u = (201 - before.fit.x - transform.x) / transform.scale / 402;
    const v = (437 - before.fit.y - transform.y) / transform.scale / 268;
    // Landscape orientation: 874 × 402, the photo fitted 603 × 402.
    const after: ZoomGeometry = {
      width: 874,
      height: 402,
      fit: {x: (874 - 603) / 2, y: 0, width: 603, height: 402},
      minScale: 1,
      maxScale: maxScaleFor(3000, 603, 3, 874 / 603),
      doubleTapScale: 874 / 603,
    };
    const next = transformForResize(before, after, transform);
    // The same on-screen size: 402 × 3 = 1206 px wide either way.
    expect(603 * next.scale).toBeCloseTo(402 * 3, 9);
    const centre = shown(after, next, u * 603, v * 402);
    expect(centre.x).toBeCloseTo(437, 6);
    expect(centre.y).toBeCloseTo(201, 6);
  });

  it('stays at the fitted size when not zoomed', () => {
    const before = landscape();
    const after = landscape({width: 500});
    expect(transformForResize(before, after, IDENTITY)).toEqual(IDENTITY);
  });
});

describe('the double-click: 2× about the clicked point', () => {
  const g = landscape();
  it('zooms 2× and keeps the clicked photo point under the pointer', () => {
    // Aspect fill would zoom this photo about 3.3×.
    expect(g.doubleTapScale).toBeGreaterThan(3);
    const fitted = {...IDENTITY, scale: g.minScale};
    const target = doubleClickTarget(g, fitted, {x: 134, y: 437});
    expect(target.scale).toBe(ZOOM_STEP);
    expect(shown(g, target, 134, 134).x).toBeCloseTo(134, 9);
  });
  it('returns to the fitted size when zoomed', () => {
    const fitted = {...IDENTITY, scale: g.minScale};
    const zoomed = doubleClickTarget(g, fitted, {x: 134, y: 437});
    expect(doubleClickTarget(g, zoomed, {x: 50, y: 50})).toEqual(
      restingTransform(g, fitted),
    );
  });
});

describe("the keyboard's zoom", () => {
  const g = landscape();
  const centre = {x: g.width / 2, y: g.height / 2};
  it('zooms 2x about the centre, whatever aspect fill would give', () => {
    // Aspect fill would zoom this photo about 3.3x.
    expect(g.doubleTapScale).toBeGreaterThan(3);
    const target = releasedZoomTarget(g, {...IDENTITY, scale: g.minScale});
    expect(target.scale).toBe(2);
    // The stage's centre shows the photo's centre, as before.
    const middle = shown(g, target, g.fit.width / 2, g.fit.height / 2);
    expect(middle.x).toBeCloseTo(centre.x, 9);
    expect(middle.y).toBeCloseTo(centre.y, 9);
  });
  it('returns to the fitted size when zoomed', () => {
    const zoomed = releasedZoomTarget(g, {...IDENTITY, scale: g.minScale});
    expect(releasedZoomTarget(g, zoomed)).toEqual(
      restingTransform(g, {...IDENTITY, scale: g.minScale}),
    );
  });
  it('stays inside the limits', () => {
    const small = landscape({maxScale: 1.5});
    expect(
      releasedZoomTarget(small, {...IDENTITY, scale: small.minScale}).scale,
    ).toBe(1.5);
  });
});
