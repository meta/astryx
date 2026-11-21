// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file zoomStage.ts
 * @input The stage's size, the photo's fitted box and pixel size, a
 *   transform (offset from the fitted box, and scale), and pointer positions
 * @output The zoom stage's pure geometry: zoom limits, resting places, a
 *   drag's rubber band and a pinch's overshoot. Also the transform that keeps
 *   a point in place, and the keyboard's zoom
 * @position Pure math under useZoomCore and useZoomStage; no DOM, no React.
 *
 * The model is a zooming UIScrollView; its constants come from motion/uikit.
 * SYNC: When modified, update zoomStage.test.ts, useZoomCore.ts and
 * useZoomStage.ts.
 */

import {resolveSnapPoint} from '../motion/resolveSnapPoint';
import {rubberBandClamp, rubberBandUnclamp} from '../motion/rubberBand';
import {zoomMedia} from '../motion/uikit/zoomMedia';

export interface StagePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Scales the fitted box about its top-left corner and moves it by (x, y). A
 * photo point at (u, v) in the fitted box shows at (fit.x + x + u·scale,
 * fit.y + y + v·scale).
 */
export interface ZoomTransform {
  /** Offset of the photo's box from its fitted place, px. */
  readonly x: number;
  readonly y: number;
  /** Scale relative to the fitted size. */
  readonly scale: number;
}

export interface ZoomGeometry {
  /** The stage's size, px. */
  readonly width: number;
  readonly height: number;
  /** The photo's box at the fitted size, in stage coordinates. */
  readonly fit: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly minScale: number;
  readonly maxScale: number;
  /** The zoom a double tap goes to from the fitted size. */
  readonly doubleTapScale: number;
}

export const IDENTITY: ZoomTransform = {x: 0, y: 0, scale: 1};

/** Within this of the fitted size the photo counts as not zoomed. */
export const ZOOMED_EPSILON = 0.001;

/**
 * Lightbox's zoom step. A double tap zooms at least this many times, and a
 * double-click and the keyboard zoom this many times.
 */
export const ZOOM_STEP = 2;

/**
 * The zoom a double tap goes to from the fitted size. It is the larger of
 * filling the stage and `ZOOM_STEP`, for a stage of `width` × `height` and a
 * photo fitted at `fitWidth` × `fitHeight`. Photos zooms to the fill alone,
 * so Lightbox departs from it on a photo that fills at less than `ZOOM_STEP`.
 */
export function doubleTapScaleFor(
  width: number,
  height: number,
  fitWidth: number,
  fitHeight: number,
): number {
  if (!(fitWidth > 0) || !(fitHeight > 0)) {
    return ZOOM_STEP;
  }
  return Math.max(ZOOM_STEP, width / fitWidth, height / fitHeight);
}

/**
 * The largest zoom for a photo `naturalWidth` image pixels wide, fitted
 * `fitWidth` CSS px wide on a screen of `devicePixelRatio`. It is Photos'
 * multiple of the zoom that shows one image pixel per device pixel. It is
 * never less than `doubleTapScale`, so a double tap lands inside the limits.
 */
export function maxScaleFor(
  naturalWidth: number,
  fitWidth: number,
  devicePixelRatio: number,
  doubleTapScale: number,
): number {
  const {maxPixelZoomMultiple} = zoomMedia.viewer;
  if (!(fitWidth > 0) || !(naturalWidth > 0) || !(devicePixelRatio > 0)) {
    return doubleTapScale;
  }
  const pixelScale = naturalWidth / (fitWidth * devicePixelRatio);
  return Math.max(doubleTapScale, maxPixelZoomMultiple * pixelScale);
}

/** Whether `transform` shows the photo larger than fitted. */
export function isZoomed(
  geometry: ZoomGeometry,
  transform: ZoomTransform,
): boolean {
  return transform.scale > geometry.minScale + ZOOMED_EPSILON;
}

interface AxisRange {
  readonly min: number;
  readonly max: number;
}

function axisRange(
  stageSize: number,
  fitStart: number,
  fitSize: number,
  scale: number,
): AxisRange {
  const size = fitSize * scale;
  if (size <= stageSize) {
    const centred = (stageSize - size) / 2 - fitStart;
    return {min: centred, max: centred};
  }
  // `0 - fitStart`, not `-fitStart`: no negative zero in the style.
  return {min: stageSize - size - fitStart, max: 0 - fitStart};
}

/**
 * Where the photo may rest at `scale`: the offset range on each axis. On an
 * axis where the scaled photo is smaller than the stage, it rests centred, as
 * in every UIKit photo viewer. Where it is larger, it rests with no gap at
 * either edge.
 */
export function restRange(
  geometry: ZoomGeometry,
  scale: number,
): {readonly x: AxisRange; readonly y: AxisRange} {
  const {fit} = geometry;
  return {
    x: axisRange(geometry.width, fit.x, fit.width, scale),
    y: axisRange(geometry.height, fit.y, fit.height, scale),
  };
}

/** The resting transform nearest to `transform`, at its scale. */
export function restingTransform(
  geometry: ZoomGeometry,
  transform: ZoomTransform,
): ZoomTransform {
  const range = restRange(geometry, transform.scale);
  return {
    x: Math.min(range.x.max, Math.max(range.x.min, transform.x)),
    y: Math.min(range.y.max, Math.max(range.y.min, transform.y)),
    scale: transform.scale,
  };
}

/**
 * The scale a pinch shows for its own scale `scale`. It is 1:1 inside the
 * limits and gives way past them (`zoomMedia.overshoot.limitFactor`).
 */
export function overshootScale(geometry: ZoomGeometry, scale: number): number {
  const f = zoomMedia.overshoot.limitFactor;
  const {minScale: m, maxScale: M} = geometry;
  if (scale > M) {
    return M * (f - ((f - 1) * M) / scale);
  }
  if (scale < m) {
    return m / (f - ((f - 1) * scale) / m);
  }
  return scale;
}

/**
 * The pinch's own scale that shows `shown`: the inverse of
 * `overshootScale`, to continue a pinch from a photo already past a limit.
 */
export function pinchScaleFor(geometry: ZoomGeometry, shown: number): number {
  const f = zoomMedia.overshoot.limitFactor;
  const {minScale: m, maxScale: M} = geometry;
  if (shown > M) {
    // shown = M·(f − (f − 1)·M ÷ s)  ⇒  s = (f − 1)·M² ÷ (f·M − shown)
    const gap = f * M - shown;
    return gap > 0 ? ((f - 1) * M * M) / gap : Number.POSITIVE_INFINITY;
  }
  if (shown < m) {
    // shown = m ÷ (f − (f − 1)·s ÷ m)  ⇒  s = (f − m ÷ shown)·m ÷ (f − 1)
    return Math.max(0, ((f - m / shown) * m) / (f - 1));
  }
  return shown;
}

/**
 * The transform at `scale` that shows the photo point under `anchor` (as
 * placed by `from`) under `point`. A pinch keeps the point under its first
 * centroid under the current centroid. A double tap and a settle past a limit
 * keep the point where it is (`point` = `anchor`).
 */
export function transformKeepingPoint(
  geometry: ZoomGeometry,
  from: ZoomTransform,
  anchor: StagePoint,
  point: StagePoint,
  scale: number,
): ZoomTransform {
  const {fit} = geometry;
  // The fitted-box point under `anchor`.
  const u = (anchor.x - fit.x - from.x) / from.scale;
  const v = (anchor.y - fit.y - from.y) / from.scale;
  return {
    x: point.x - fit.x - u * scale,
    y: point.y - fit.y - v * scale,
    scale,
  };
}

/**
 * Where a drag shows the photo: `raw` is where the pointer's travel would put
 * it with no edges. Past an edge it gives way with UIScrollView's rubber band
 * over the stage's size on that axis. On an axis where the photo is smaller
 * than the stage, it stays centred, as a scroll view whose content fits does
 * not bounce.
 */
export function draggedTransform(
  geometry: ZoomGeometry,
  raw: ZoomTransform,
): ZoomTransform {
  const range = restRange(geometry, raw.scale);
  return {
    x:
      range.x.min === range.x.max
        ? range.x.min
        : rubberBandClamp(raw.x, range.x.min, range.x.max, geometry.width),
    y:
      range.y.min === range.y.max
        ? range.y.min
        : rubberBandClamp(raw.y, range.y.min, range.y.max, geometry.height),
    scale: raw.scale,
  };
}

/** The pointer-travel position behind a shown one: `draggedTransform` undone. */
export function rawForDragged(
  geometry: ZoomGeometry,
  shown: ZoomTransform,
): ZoomTransform {
  const range = restRange(geometry, shown.scale);
  return {
    x:
      range.x.min === range.x.max
        ? shown.x
        : rubberBandUnclamp(shown.x, range.x.min, range.x.max, geometry.width),
    y:
      range.y.min === range.y.max
        ? shown.y
        : rubberBandUnclamp(shown.y, range.y.min, range.y.max, geometry.height),
    scale: shown.scale,
  };
}

/**
 * The resting transform a double tap at `point` goes to from `from`. From
 * the fitted size it zooms to `geometry.doubleTapScale` about the tapped
 * point, kept inside the stage. Photos brings the tapped point to the centre
 * instead. When zoomed, it goes back to the fitted size.
 */
export function doubleTapTarget(
  geometry: ZoomGeometry,
  from: ZoomTransform,
  point: StagePoint,
): ZoomTransform {
  if (isZoomed(geometry, from)) {
    return restingTransform(geometry, {...IDENTITY, scale: geometry.minScale});
  }
  const scale = Math.min(
    geometry.maxScale,
    Math.max(geometry.minScale, geometry.doubleTapScale),
  );
  return restingTransform(
    geometry,
    transformKeepingPoint(geometry, from, point, point, scale),
  );
}

/**
 * The resting transform a release goes to. Inside the limits it is `shown`
 * itself, since a drag's coast settles any edge. Past a limit it is the limit,
 * with the point under the last centroid kept in place and the photo kept
 * inside the stage.
 */
export function releaseTarget(
  geometry: ZoomGeometry,
  shown: ZoomTransform,
  centroid: StagePoint,
): ZoomTransform {
  const limit = Math.min(
    geometry.maxScale,
    Math.max(geometry.minScale, shown.scale),
  );
  if (limit === shown.scale) {
    return shown;
  }
  return restingTransform(
    geometry,
    transformKeepingPoint(geometry, shown, centroid, centroid, limit),
  );
}

/**
 * Where a zoom key goes from `from`. Enter, Space or `+` zooms `ZOOM_STEP`
 * times about the stage's centre, or back to the fitted size when zoomed.
 */
export function releasedZoomTarget(
  geometry: ZoomGeometry,
  from: ZoomTransform,
): ZoomTransform {
  return doubleClickTarget(geometry, from, {
    x: geometry.width / 2,
    y: geometry.height / 2,
  });
}

/**
 * Where a double-click at `point` goes from `from`. It zooms `ZOOM_STEP`
 * times about the clicked point, kept inside the stage, or goes back to the
 * fitted size when zoomed.
 */
export function doubleClickTarget(
  geometry: ZoomGeometry,
  from: ZoomTransform,
  point: StagePoint,
): ZoomTransform {
  return doubleTapTarget({...geometry, doubleTapScale: ZOOM_STEP}, from, point);
}

/** The resting transform after panning by (dx, dy): a keyboard step. */
export function pannedBy(
  geometry: ZoomGeometry,
  from: ZoomTransform,
  dx: number,
  dy: number,
): ZoomTransform {
  return restingTransform(geometry, {
    x: from.x + dx,
    y: from.y + dy,
    scale: from.scale,
  });
}

/**
 * The transform that shows the same photo after the stage resizes, as on a
 * rotation. The photo point at the stage's centre stays at its centre. The
 * photo keeps its size on screen, so the zoom relative to the fitted size
 * changes with the fitted size. The result is within the new limits, at rest.
 */
export function transformForResize(
  before: ZoomGeometry,
  after: ZoomGeometry,
  transform: ZoomTransform,
): ZoomTransform {
  if (!isZoomed(before, transform)) {
    return {...IDENTITY, scale: after.minScale};
  }
  const ratio = after.fit.width > 0 ? before.fit.width / after.fit.width : 1;
  const scale = Math.min(
    after.maxScale,
    Math.max(after.minScale, transform.scale * ratio),
  );
  // The photo point (in fitted-box px of `before`) at the old centre, then
  // the same point in the new fitted box.
  const u =
    (before.width / 2 - before.fit.x - transform.x) /
    transform.scale /
    before.fit.width;
  const v =
    (before.height / 2 - before.fit.y - transform.y) /
    transform.scale /
    before.fit.height;
  return restingTransform(after, {
    x: after.width / 2 - after.fit.x - u * after.fit.width * scale,
    y: after.height / 2 - after.fit.y - v * after.fit.height * scale,
    scale,
  });
}

// ---------------------------------------------------------------------------
// Drag to dismiss (Photos)

/**
 * The photo under a drag to dismiss, from its fitted size. Its centre follows
 * the pointer (dx, dy). It shrinks about that centre by
 * `zoomMedia.dismiss.scalePerTravelSquared` × the downward travel².
 */
export function dismissTransform(
  geometry: ZoomGeometry,
  dx: number,
  dy: number,
): ZoomTransform {
  const travel = Math.max(0, dy);
  const scale = Math.max(
    0,
    1 - zoomMedia.dismiss.scalePerTravelSquared * travel * travel,
  );
  return {
    x: dx + ((1 - scale) * geometry.fit.width) / 2,
    y: dy + ((1 - scale) * geometry.fit.height) / 2,
    scale,
  };
}

/** The backdrop's opacity at a drag's downward travel (pt). */
export function dismissBackdropAlpha(travel: number): number {
  const t = Math.max(0, travel);
  return Math.min(
    1,
    Math.max(0, 1 - zoomMedia.dismiss.backdropAlphaPerTravelSquared * t * t),
  );
}

/** The controls' and neighbouring photos' opacity at a drag's travel (pt). */
export function dismissChromeAlpha(travel: number): number {
  const {chromeAlphaPerPoint, chromeFadeStart} = zoomMedia.dismiss;
  return Math.min(
    1,
    Math.max(0, 1 - chromeAlphaPerPoint * (travel - chromeFadeStart)),
  );
}

/**
 * Whether a released drag to dismiss dismisses, decided once at the lift by
 * Core's release rule (`resolveSnapPoint`). The release lands at the fitted
 * place or, past the commit point, gone: their midpoint is
 * `zoomMedia.dismiss.cancelTravel`. It is judged at the travel plus where its
 * velocity would coast (`zoomMedia.dismiss.projectionRate`), and a release
 * moving back toward where the drag began cancels. A short flick down closes;
 * a short pull lifted still springs back.
 */
export function dismissCommits(travel: number, velocityY: number): boolean {
  const {cancelTravel, projectionRate} = zoomMedia.dismiss;
  const release = resolveSnapPoint({
    points: [0, 2 * cancelTravel],
    position: travel,
    velocity: velocityY,
    // No flick rule: the projection alone decides.
    flickThreshold: Number.POSITIVE_INFINITY,
    // The projection that coasts at this deceleration rate.
    projection: {seconds: projectionRate / (1 - projectionRate) / 1000},
    start: 0,
  });
  return release.index === 1;
}

/**
 * Where a dismissed photo goes with no thumbnail to return to: straight on
 * down until its top passes `bottom`, in stage px. That is the screen's
 * bottom edge, which a stage that only hugs the photo sits well above. By
 * default it is the stage's own bottom.
 */
export function dismissExitY(
  geometry: ZoomGeometry,
  shown: ZoomTransform,
  bottom: number = geometry.height,
): number {
  return (
    Math.max(shown.y, Math.max(bottom, geometry.height) - geometry.fit.y) + 1
  );
}
