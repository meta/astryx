// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file zoomStage.test.ts
 * @input vitest, the zoom stage geometry, the UIKit zoom constants and
 *   Lightbox's record
 * @output Checks the zoom stage against UIKit's measured zooming and
 *   Lightbox's own zoom. It covers the overshoot, the maximum zoom, both
 *   double taps and resting places. It also covers a drag's rubber band, a
 *   resize, Photos' drag to dismiss, its springs in the record and the
 *   keyboard's zoom
 * @position Testing; zoomStage.ts without a browser
 */

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {rubberBand} from '../motion/rubberBand';
import {zoomMedia} from '../motion/uikit/zoomMedia';
import {
  IDENTITY,
  ZOOM_STEP,
  dismissBackdropAlpha,
  dismissChromeAlpha,
  dismissCommits,
  dismissExitY,
  dismissTransform,
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

describe("Photos' drag to dismiss (iOS 26.2)", () => {
  // Photos, a 3000 × 2000 photo at its fitted size dragged down: travel →
  // photo scale, backdrop alpha, neighbours' and controls' alpha.
  const measured = [
    {travel: 25, scale: 0.997, backdrop: 1.0, chrome: 0.96},
    {travel: 65, scale: 0.978, backdrop: 0.95, chrome: 0.76},
    {travel: 105, scale: 0.942, backdrop: 0.86, chrome: 0.52},
    {travel: 145, scale: 0.899, backdrop: 0.71, chrome: 0.33},
  ];

  it('shrinks the photo about its centre, which follows the finger', () => {
    const geometry = landscape();
    for (const row of measured) {
      const t = dismissTransform(geometry, 12, row.travel);
      expect(t.scale).toBeCloseTo(row.scale, 2);
      // The fitted box's centre moved by exactly the finger's travel.
      const centre = shown(geometry, t, 201, 134);
      expect(centre.x).toBeCloseTo(geometry.fit.x + 201 + 12, 6);
      expect(centre.y).toBeCloseTo(geometry.fit.y + 134 + row.travel, 6);
    }
    // Above where the drag started, the photo follows without shrinking.
    expect(dismissTransform(geometry, 0, -30)).toEqual({
      x: 0,
      y: -30,
      scale: 1,
    });
  });

  it('fades the backdrop and, faster, the controls', () => {
    for (const row of measured) {
      expect(dismissBackdropAlpha(row.travel)).toBeCloseTo(row.backdrop, 1);
      expect(
        Math.abs(dismissChromeAlpha(row.travel) - row.chrome),
      ).toBeLessThan(0.02);
    }
    expect(dismissBackdropAlpha(-10)).toBe(1);
    expect(dismissChromeAlpha(0)).toBe(1);
    expect(dismissChromeAlpha(1000)).toBe(0);
  });

  it('dismisses on any release unless moving up or back at the start', () => {
    // Pulls of 20, 40 and 60 pt held still, then lifted, dismiss. So do a
    // 60 pt flick and a slow downward release.
    expect(dismissCommits(20, 0)).toBe(true);
    expect(dismissCommits(60, 1500)).toBe(true);
    expect(dismissCommits(100, 40)).toBe(true);
    // A pull flicked back up cancels, as does one brought back to ~5 pt.
    expect(dismissCommits(150, -800)).toBe(false);
    expect(dismissCommits(5, 0)).toBe(false);
    expect(zoomMedia.dismiss.cancelTravel).toBeGreaterThan(5);
    expect(zoomMedia.dismiss.cancelTravel).toBeLessThan(20);
  });

  it('dismisses a short flick down: its projected travel reaches the commit point (spec:AST-094 FR36)', () => {
    // An 18 px flick reaches the stage as about 8 pt past the pan's begin
    // threshold. That is short of the commit point, but its velocity carries
    // it on.
    expect(dismissCommits(8, 600)).toBe(true);
    // The same travel lifted still springs back: nothing projects it on.
    expect(dismissCommits(8, 0)).toBe(false);
    // Moving back up cancels, however far it came.
    expect(dismissCommits(8, -600)).toBe(false);
  });

  it('decides the release at the commit point itself, and cancels one moving back toward the start', () => {
    // Exactly at the commit point and held still, the release stays: only
    // past it does a still pull dismiss.
    expect(dismissCommits(zoomMedia.dismiss.cancelTravel, 0)).toBe(false);
    expect(dismissCommits(zoomMedia.dismiss.cancelTravel + 0.01, 0)).toBe(true);
    // Above where the drag began, a release moving down moves back toward
    // the start, so it springs back however fast it moves.
    expect(dismissCommits(-5, 2000)).toBe(false);
  });

  it('sends a dismissed photo below the screen when the stage only hugs it', () => {
    const geometry = landscape();
    const t = dismissTransform(geometry, 0, 100);
    // The screen's bottom 300 px below the stage's.
    const bottom = geometry.height + 300;
    const exit = dismissExitY(geometry, t, bottom);
    expect(geometry.fit.y + exit).toBeGreaterThan(bottom);
  });

  it('sends a dismissed photo below the stage with no thumbnail to return to', () => {
    const geometry = landscape();
    const t = dismissTransform(geometry, 0, 100);
    const exit = dismissExitY(geometry, t);
    expect(geometry.fit.y + exit).toBeGreaterThan(geometry.height);
    expect(exit).toBeGreaterThan(t.y);
  });

  it("lists each spring the dismissal plays in Lightbox's record, with its value", () => {
    // A gesture-driven exit may play a measured spring that its component's
    // motion table lists with its platform source.
    const record = readFileSync(
      resolve(
        __dirname,
        '../../../../docs/specs/components/Lightbox/Lightbox.spec.md',
      ),
      'utf8',
    ).split('\n');
    const {dismissPositionSpring, dismissSizeSpring} = zoomMedia.dismiss;
    for (const [name, spring] of Object.entries({
      dismissPositionSpring,
      dismissSizeSpring,
    })) {
      const row = record.find(line =>
        line.startsWith(`| \`zoomMedia.dismiss.${name}\``),
      );
      expect(row, name).toBeDefined();
      expect(row).toContain(`stiffness ${spring.stiffness.toFixed(2)}`);
      expect(row).toContain(`damping ${spring.damping.toFixed(2)}`);
    }
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
