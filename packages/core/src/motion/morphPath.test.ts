// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file morphPath.test.ts
 * @input vitest, the morph paths and the progress helpers, and the models of
 *   the presentations that move onto the morph, as their pull requests have
 *   them
 * @output Checks that the morph's curves put an element on its path's rect
 *   every frame, and that each presentation's model (an anchored menu, a
 *   popover, a lifted preview, a zoom, a sub-menu's parent card) is the same
 *   rect at every progress, within 0.5 px
 * @position Testing; the rect morph's player has its own tests
 */

import {describe, expect, it} from 'vitest';
import type {MotionCurve, MotionProperty} from './animator';
import {
  edgeGrowPath,
  lerpPath,
  morphCurves,
  type MorphPath,
  type MorphRect,
} from './morphPath';
import {
  frameOf,
  popoverCollapsedState,
  popoverFrame,
  PRESENTED,
  type PopoverCollapsedState,
} from '../Popover/popoverSurfaceFrame';
import {readState, surfaceCurves} from '../Popover/popoverSurfaceMotion';
import {progressCurve} from './progress';

const SPRING = {response: 0.4, dampingRatio: 1};
const BOUNCY = {response: 0.35, dampingRatio: 0.8};

/** Where translate and scale about the top-left corner put `box`. */
function rectOf(
  box: MorphRect,
  values: {x: number; y: number; scaleX: number; scaleY: number},
): MorphRect {
  return {
    x: box.x + values.x,
    y: box.y + values.y,
    width: box.width * values.scaleX,
    height: box.height * values.scaleY,
  };
}

function expectRect(actual: MorphRect, expected: MorphRect, tolerance: number) {
  const gap = Math.max(
    Math.abs(actual.x - expected.x),
    Math.abs(actual.y - expected.y),
    Math.abs(actual.width - expected.width),
    Math.abs(actual.height - expected.height),
  );
  expect(gap, JSON.stringify({actual, expected})).toBeLessThanOrEqual(
    tolerance,
  );
}

/** The rect `curves` show at `t` s for an element laid out in `box`. */
function curvesRect(
  box: MorphRect,
  curves: Partial<Record<MotionProperty, MotionCurve>>,
  t: number,
): MorphRect {
  return rectOf(box, {
    x: curves.x!.at(t),
    y: curves.y!.at(t),
    scaleX: curves.scaleX!.at(t),
    scaleY: curves.scaleY!.at(t),
  });
}

/** Every 1/120 s of `progress`, and its end. */
function frames(progress: MotionCurve): number[] {
  const times: number[] = [];
  for (let t = 0; t < progress.duration; t += 1 / 120) {
    times.push(t);
  }
  times.push(progress.duration);
  return times;
}

const SQUARE: MorphRect = {x: 179, y: 160, width: 22, height: 22};

const BOX: MorphRect = {x: 40, y: 204, width: 320, height: 253};

describe('morphCurves', () => {
  it('puts the element on a straight path\u2019s rect every frame, each axis scaled to it', () => {
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    const progress = progressCurve(BOUNCY);
    const curves = morphCurves(path, progress);
    let overshoot = false;
    for (const t of frames(progress)) {
      const p = progress.at(t);
      overshoot ||= p > 1;
      expectRect(curvesRect(BOX, curves, t), path.rectAt(p), 0.01);
      expect(curves.opacity!.at(t)).toBeCloseTo(p, 9);
    }
    // Past 1 on the spring's overshoot, the rect runs past rest too.
    expect(overshoot).toBe(true);
  });

  it('keeps the element\u2019s aspect under a uniform scale', () => {
    const thumb = {x: 12, y: 300, width: 100, height: 75};
    const detail = {x: 0, y: 120, width: 390, height: 292.5};
    const path = lerpPath(thumb, detail, {scale: 'uniform'});
    const progress = progressCurve(SPRING);
    const curves = morphCurves(path, progress);
    for (const t of frames(progress)) {
      expect(curves.scaleY!.at(t)).toBe(curves.scaleX!.at(t));
      expectRect(
        curvesRect(detail, curves, t),
        path.rectAt(progress.at(t)),
        0.01,
      );
    }
    expect(curves.opacity).toBeUndefined();
  });

  it('moves the companion opacity on a progress of its own when given one', () => {
    const path = lerpPath(SQUARE, BOX, {opacity: [1, 0]});
    const progress = progressCurve(SPRING);
    const fade = progressCurve({response: 0.2, dampingRatio: 1});
    const curves = morphCurves(path, progress, fade);
    for (const t of [0.01, 0.05, 0.1, 0.2]) {
      expect(curves.opacity!.at(t)).toBeCloseTo(1 - fade.at(t), 9);
    }
  });

  it('ends exactly on identity when the path ends on its box', () => {
    const progress = progressCurve(BOUNCY);
    for (const path of [
      lerpPath(SQUARE, BOX),
      edgeGrowPath({
        box: BOX,
        origin: {x: 160, y: 0},
        axis: 'y',
        collapsedScale: 0.01,
        collapsedLength: 100 / 253,
      }),
    ]) {
      const curves = morphCurves(path, progress);
      const end = progress.duration;
      expect([
        curves.x!.at(end),
        curves.y!.at(end),
        curves.scaleX!.at(end),
        curves.scaleY!.at(end),
      ]).toEqual([0, 0, 1, 1]);
    }
  });
});

// The models of the presentations that move onto the morph, as their pull
// requests have them; each migration checks the morph against its live code.
// Popover is on main, so its proofs read its live geometry.

/** Popover's live geometry, in the morph's rect form. */
function popoverState(surface: MorphRect, source: MorphRect) {
  const box = (rect: MorphRect) => ({
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
  });
  return popoverCollapsedState({surface: box(surface), source: box(source)});
}

/** The rect a Popover frame shows: its scale about its origin. */
function popoverRect(
  surface: MorphRect,
  state: PopoverCollapsedState,
  frame: {scaleX: number; scaleY: number},
): MorphRect {
  return {
    x: surface.x + state.originX * (1 - frame.scaleX),
    y: surface.y + state.originY * (1 - frame.scaleY),
    width: surface.width * frame.scaleX,
    height: surface.height * frame.scaleY,
  };
}

function popoverPath(surface: MorphRect, state: PopoverCollapsedState) {
  return edgeGrowPath({
    box: surface,
    origin: {x: state.originX, y: state.originY},
    axis: state.axis,
    collapsedScale: state.scale,
    collapsedLength: state.length,
  });
}

/** DropdownMenu (#8080, menuSurfaceMotion.ts): menuCollapsedState, scaled per axis about its origin. */
function menuModel(surface: MorphRect, anchor: {x: number; y: number}) {
  const collapsedSize = 22;
  const scaleX0 = collapsedSize / surface.width;
  const scaleY0 = collapsedSize / surface.height;
  const originX =
    (anchor.x - surface.x - (surface.width / 2) * scaleX0) / (1 - scaleX0);
  const originY =
    (anchor.y - surface.y - (surface.height / 2) * scaleY0) / (1 - scaleY0);
  return (p: number): MorphRect => {
    const scaleX = scaleX0 + (1 - scaleX0) * p;
    const scaleY = scaleY0 + (1 - scaleY0) * p;
    return {
      x: surface.x + originX * (1 - scaleX),
      y: surface.y + originY * (1 - scaleY),
      width: surface.width * scaleX,
      height: surface.height * scaleY,
    };
  };
}

/** ContextMenu (#8201, ContextMenuLift.tsx): the preview laid out on its source, x, y and scale sprung together. */
function liftModel(source: MorphRect, pressScale: number, lifted: MorphRect) {
  const from = {
    x: (source.width * (1 - pressScale)) / 2,
    y: (source.height * (1 - pressScale)) / 2,
    scale: pressScale,
  };
  const to = {
    x: lifted.x - source.x,
    y: lifted.y - source.y,
    scale: lifted.width / source.width,
  };
  return (p: number): MorphRect => {
    const scale = from.scale + (to.scale - from.scale) * p;
    return {
      x: source.x + from.x + (to.x - from.x) * p,
      y: source.y + from.y + (to.y - from.y) * p,
      width: source.width * scale,
      height: source.height * scale,
    };
  };
}

/** Lightbox (#8231, zoomTransition.ts): zoomFramesAt's detail, centred, and its fade gain. */
function zoomModel(source: MorphRect, detail: MorphRect) {
  const aspect = detail.height / detail.width;
  const startHeight = source.width * aspect;
  const start = {
    x: source.x,
    y: source.y + source.height / 2 - startHeight / 2,
    width: source.width,
    height: startHeight,
  };
  return {
    rectAt: (p: number): MorphRect => {
      const lerp = (a: number, b: number) => a + (b - a) * p;
      const width = lerp(start.width, detail.width);
      const anchor = lerp(
        start.y + start.height / 2,
        detail.y + detail.height / 2,
      );
      const height = width * aspect;
      return {
        x: lerp(start.x, detail.x),
        y: anchor - height / 2,
        width,
        height,
      };
    },
    opacityAt: (p: number) => Math.min(1, Math.max(0, 1.56 * p)),
  };
}

/** DropdownMenu sub-menu (#8220, menuDrillInMotion.ts): the parent card, scaled about its centre and dropped. */
function cardModel(box: MorphRect) {
  const parentScale = 0.97;
  const dropPx = 3;
  return (p: number): MorphRect => {
    const scale = 1 + (parentScale - 1) * p;
    return {
      x: box.x + (box.width * (1 - scale)) / 2,
      y: box.y + (box.height * (1 - scale)) / 2 + dropPx * p,
      width: box.width * scale,
      height: box.height * scale,
    };
  };
}

/** Progresses 0 to 1.1 (a spring's overshoot) and a little below 0. */
const PROGRESSES = Array.from({length: 24}, (_, i) => -0.05 + i * 0.05);

/**
 * An opacity as drawn: clamped to 0 through 1. A popover's path stops at 0,
 * while Popover's own model reads below 0 before its start and past its end.
 */
const drawn = (opacity: number) => Math.min(1, Math.max(0, opacity));

describe('the presentations that move onto the morph are the same rect at every progress', () => {
  it('an anchored menu (#8080): a straight line from the collapsed square on its control', () => {
    const anchor = {x: 190, y: 171};
    const model = menuModel(BOX, anchor);
    const path = lerpPath(
      {x: anchor.x - 11, y: anchor.y - 11, width: 22, height: 22},
      BOX,
      {opacity: [0, 1]},
    );
    for (const p of PROGRESSES) {
      expectRect(path.rectAt(p), model(p), 0.5);
      expect(path.opacityAt!(p)).toBeCloseTo(p, 9);
    }
  });

  it('a popover (#8187): UIKit\u2019s edge growth, on each side of its source', () => {
    const source = {x: 141, y: 160, width: 120, height: 44};
    const surfaces: Record<string, MorphRect> = {
      below: {x: 41, y: 204, width: 320, height: 253},
      above: {x: 41, y: -93, width: 320, height: 253},
      right: {x: 261, y: 100, width: 200, height: 160},
      left: {x: -59, y: 100, width: 200, height: 160},
      overlapping: {x: 41, y: 100, width: 140, height: 200},
    };
    // A popover that overlaps its source grows from below: from its top edge.
    expect(popoverState(surfaces.overlapping, source)).toMatchObject({
      axis: 'y',
      originY: 0,
    });
    for (const surface of Object.values(surfaces)) {
      const state = popoverState(surface, source);
      const path = popoverPath(surface, state);
      for (const p of PROGRESSES) {
        const frame = popoverFrame(state, p);
        expectRect(path.rectAt(p), popoverRect(surface, state, frame), 0.5);
        expect(path.opacityAt!(p)).toBeCloseTo(Math.max(0, frame.opacity), 9);
      }
    }
  });

  it('a popover (#8187) continues an interrupted motion in its own law: scale and length from the frame on screen', () => {
    const surface = {x: 41, y: 204, width: 320, height: 253};
    const state = popoverState(surface, {
      x: 141,
      y: 160,
      width: 120,
      height: 44,
    });
    const path = popoverPath(surface, state);
    // Mid-dismissal: scale 0.4, length 0.6, opacity 0.5 on screen.
    const shown = frameOf({scale: 0.4, length: 0.6, opacity: 0.5}, state.axis);
    const onScreen = popoverRect(surface, state, shown);
    // Popover's own turn-around: it reads that frame back and plays on.
    const from = readState(
      {get: (property: string) => shown[property as keyof typeof shown]},
      state.axis,
    );
    const linear: MotionCurve = {duration: 1, at: t => t, velocity: () => 1};
    const toRest = surfaceCurves(from, PRESENTED, state.axis, linear);
    const toSource = surfaceCurves(
      from,
      {scale: state.scale, length: state.length, opacity: 0},
      state.axis,
      linear,
    );
    const back = path.restartFrom!(onScreen, 0.5, 'rest');
    const away = path.restartFrom!(onScreen, 0.5, 'source');
    for (const p of [0, 0.25, 0.5, 0.75, 1, 1.05]) {
      for (const [morph, live] of [
        [back, toRest],
        [away, toSource],
      ] as const) {
        expectRect(
          morph.rectAt(p),
          popoverRect(surface, state, {
            scaleX: live.scaleX.at(p),
            scaleY: live.scaleY.at(p),
          }),
          0.5,
        );
        expect(drawn(morph.opacityAt!(p))).toBeCloseTo(
          drawn(live.opacity.at(p)),
          9,
        );
      }
    }
  });

  it('a popover never reads an opacity below 0, before its start or past its end', () => {
    const surface = {x: 41, y: 204, width: 320, height: 253};
    const state = popoverState(surface, {
      x: 141,
      y: 160,
      width: 120,
      height: 44,
    });
    const path = popoverPath(surface, state);
    const shown = frameOf({scale: 0.4, length: 0.6, opacity: 0.5}, state.axis);
    const away = path.restartFrom!(
      popoverRect(surface, state, shown),
      0.5,
      'source',
    );
    for (const p of [-0.1, -0.05, 0]) {
      expect(path.opacityAt!(p)).toBe(0);
    }
    for (const p of [1, 1.05, 1.1]) {
      expect(away.opacityAt!(p)).toBe(0);
    }
  });

  it('a lifted preview (#8201): its source box, scaled about its centre by the press, to its lifted box', () => {
    const source = {x: 60, y: 300, width: 270, height: 64};
    const pressScale = 0.96;
    const lifted = {x: 50.5, y: 297.75, width: 289, height: 68.5};
    const model = liftModel(source, pressScale, lifted);
    const pressed = {
      x: source.x + (source.width * (1 - pressScale)) / 2,
      y: source.y + (source.height * (1 - pressScale)) / 2,
      width: source.width * pressScale,
      height: source.height * pressScale,
    };
    const path = lerpPath(pressed, lifted, {box: source, scale: 'uniform'});
    const progress = progressCurve(SPRING);
    const curves = morphCurves(path, progress);
    for (const p of PROGRESSES) {
      expectRect(path.rectAt(p), model(p), 0.5);
    }
    for (const t of frames(progress)) {
      expectRect(curvesRect(source, curves, t), model(progress.at(t)), 0.5);
    }
  });

  it('a zoom (#8231): the detail on its portal\u2019s frame, with its fade gain', () => {
    const source = {x: 130, y: 400, width: 120, height: 120};
    const detail = {x: 0, y: 160, width: 390, height: 292.5};
    const model = zoomModel(source, detail);
    const path: MorphPath = {
      box: detail,
      scale: 'uniform',
      rectAt: model.rectAt,
      opacityAt: model.opacityAt,
    };
    const progress = progressCurve(SPRING);
    const curves = morphCurves(path, progress);
    for (const t of frames(progress)) {
      const p = progress.at(t);
      // zoomElementCurves: x and y from the box, scale by the width.
      const frame = model.rectAt(p);
      expect(curves.x!.at(t)).toBeCloseTo(frame.x - detail.x, 6);
      expect(curves.y!.at(t)).toBeCloseTo(frame.y - detail.y, 6);
      expect(curves.scaleX!.at(t)).toBeCloseTo(frame.width / detail.width, 9);
      expect(curves.opacity!.at(t)).toBeCloseTo(model.opacityAt(p), 9);
      expectRect(curvesRect(detail, curves, t), frame, 0.5);
    }
  });

  it('a sub-menu\u2019s parent card (#8220): scaled about its centre and dropped', () => {
    const box = {x: 40, y: 204, width: 250, height: 300};
    const model = cardModel(box);
    const card = model(1);
    const path = lerpPath(box, card, {box, scale: 'uniform'});
    for (const p of PROGRESSES) {
      expectRect(path.rectAt(p), model(p), 0.5);
    }
  });
});
