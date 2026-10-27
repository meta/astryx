// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rectMorph.test.ts
 * @input vitest (jsdom), the rect morph, a recording stand-in for
 *   Element.animate (jsdom runs no animations), and the models of the
 *   presentations that move onto the morph, as their pull requests have them
 * @output Checks that the morph's curves put an element on its path's rect
 *   every frame; that each presentation's model (an anchored menu, a popover,
 *   a lifted preview, a zoom, a sub-menu's parent card) is the same rect at
 *   every progress, within 0.5 px; that present and dismiss continue each
 *   other from the rect on screen with its velocity; the dismissal's target;
 *   the inline state left behind; Reduced Motion through the animator
 * @position Testing; the compositor side is proven in
 *   __tests__/rectMorph.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createAnimator,
  type MotionCurve,
  type MotionProperty,
} from './animator';
import {progressCurve} from './progress';
import {
  createRectMorph,
  edgeGrowPath,
  lerpPath,
  morphCurves,
  type MorphPath,
  type MorphRect,
} from './rectMorph';
import {timing} from './uikit/timing';
import {registerSpringsTable, springs} from './uikit/springs';
import {resolveMotion} from './resolveMotion';

interface Recorded {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  cancelled: boolean;
  startTime: number | null;
  readonly playState: 'idle' | 'running';
  ready: Promise<Recorded>;
  cancel(): void;
}

let clock = 1000;
let recorded: Recorded[] = [];
// The animator's frames: a call reads the browser's start for its curves in
// the frame after it, never in the task that makes them, so a test plays that
// frame before it reads where the element is.
let frameQueue: (() => void)[] = [];
const requestFrame = (callback: () => void) => {
  frameQueue.push(callback);
};
async function playFrame() {
  const frames = frameQueue;
  frameQueue = [];
  for (const callback of frames) {
    callback();
  }
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  clock = 1000;
  recorded = [];
  frameQueue = [];
  vi.useFakeTimers();
  HTMLElement.prototype.animate = function (keyframes, options) {
    const animation: Recorded = {
      element: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      cancelled: false,
      // The browser starts it at once: its first frame is committed at the
      // call, so the animator's model starts the curve then.
      startTime: clock,
      get playState() {
        return this.cancelled ? 'idle' : 'running';
      },
      ready: new Promise(() => {}),
      cancel() {
        this.cancelled = true;
      },
    };
    recorded.push(animation);
    return animation as unknown as Animation;
  };
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/**
 * The person's settings, through `matchMedia` as the animator reads them: no
 * option overrides them.
 */
function stubMedia(reduced: boolean, coarse: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion')
      ? reduced
      : query.includes('pointer: coarse')
        ? coarse
        : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

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

/** Popover (#8187, popoverSurfaceMotion.ts): popoverCollapsedState, popoverFrame. */
const POPOVER = {collapsedScale: 0.01, collapsedLengthPx: 100};
function popoverModel(surface: MorphRect, source: MorphRect) {
  const gaps = {
    below: surface.y - (source.y + source.height),
    above: source.y - (surface.y + surface.height),
    right: surface.x - (source.x + source.width),
    left: source.x - (surface.x + surface.width),
  };
  let side: keyof typeof gaps = 'below';
  for (const candidate of ['above', 'right', 'left'] as const) {
    if (gaps[candidate] > gaps[side]) {
      side = candidate;
    }
  }
  const clamp = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), max);
  const centerX = clamp(
    source.x + source.width / 2 - surface.x,
    0,
    surface.width,
  );
  const centerY = clamp(
    source.y + source.height / 2 - surface.y,
    0,
    surface.height,
  );
  const vertical = side === 'below' || side === 'above';
  const fullLength = vertical ? surface.height : surface.width;
  const axis: 'x' | 'y' = vertical ? 'y' : 'x';
  const state = {
    originX: vertical ? centerX : side === 'right' ? 0 : surface.width,
    originY: vertical ? (side === 'below' ? 0 : surface.height) : centerY,
    axis,
    scale: POPOVER.collapsedScale,
    length: Math.min(1, POPOVER.collapsedLengthPx / fullLength),
  };
  // A frame of (scale, length, opacity), scaled about the origin.
  const frameRect = (scale: number, length: number): MorphRect => {
    const along = scale * length;
    const scaleX = state.axis === 'x' ? along : scale;
    const scaleY = state.axis === 'y' ? along : scale;
    return {
      x: surface.x + state.originX * (1 - scaleX),
      y: surface.y + state.originY * (1 - scaleY),
      width: surface.width * scaleX,
      height: surface.height * scaleY,
    };
  };
  return {
    state,
    rectAt: (p: number) =>
      frameRect(
        state.scale + (1 - state.scale) * p,
        state.length + (1 - state.length) * p,
      ),
    frameRect,
  };
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
    };
    for (const surface of Object.values(surfaces)) {
      const model = popoverModel(surface, source);
      const path = edgeGrowPath({
        box: surface,
        origin: {x: model.state.originX, y: model.state.originY},
        axis: model.state.axis,
        collapsedScale: model.state.scale,
        collapsedLength: model.state.length,
      });
      for (const p of PROGRESSES) {
        expectRect(path.rectAt(p), model.rectAt(p), 0.5);
        expect(path.opacityAt!(p)).toBeCloseTo(p, 9);
      }
    }
  });

  it('a popover (#8187) continues an interrupted motion in its own law: scale and length from the frame on screen', () => {
    const surface = {x: 41, y: 204, width: 320, height: 253};
    const model = popoverModel(surface, {
      x: 141,
      y: 160,
      width: 120,
      height: 44,
    });
    const path = edgeGrowPath({
      box: surface,
      origin: {x: model.state.originX, y: model.state.originY},
      axis: model.state.axis,
      collapsedScale: model.state.scale,
      collapsedLength: model.state.length,
    });
    // Mid-dismissal: scale 0.4, length 0.6 (readState), opacity 0.5.
    const onScreen = model.frameRect(0.4, 0.6);
    const back = path.restartFrom!(onScreen, 0.5, 'rest');
    const away = path.restartFrom!(onScreen, 0.5, 'source');
    for (const p of [0, 0.25, 0.5, 0.75, 1, 1.05]) {
      // #8187's surfaceCurves: each of scale, length and opacity on a line.
      expectRect(
        back.rectAt(p),
        model.frameRect(0.4 + 0.6 * p, 0.6 + 0.4 * p),
        0.5,
      );
      expect(back.opacityAt!(p)).toBeCloseTo(0.5 + 0.5 * p, 9);
      expectRect(
        away.rectAt(p),
        model.frameRect(
          0.4 + (model.state.scale - 0.4) * p,
          0.6 + (model.state.length - 0.6) * p,
        ),
        0.5,
      );
      expect(away.opacityAt!(p)).toBeCloseTo(0.5 - 0.5 * p, 9);
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

describe('createRectMorph', () => {
  const setup = (options: {reducedMotion?: boolean; coarse?: boolean} = {}) => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    stubMedia(options.reducedMotion ?? false, options.coarse ?? true);
    const morph = createRectMorph(element, {now: () => clock, requestFrame});
    return {element, morph};
  };
  const copyOf = (element: HTMLElement) => {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.setAttribute('data-copy', '');
    element.after(copy);
    return copy;
  };
  const live = (target: Element, property: string) =>
    recorded.filter(
      animation =>
        !animation.cancelled &&
        animation.element === target &&
        animation.keyframes.some(frame => property in frame),
    );
  const settle = async (ms: number) => {
    await playFrame();
    clock += ms;
    await vi.advanceTimersByTimeAsync(ms);
  };

  it('plays the table value, since a motion role is internal (DEC-11)', () => {
    // A registered table's leaf is a motion role, but a role resolves to its
    // table value: touch motion stays internal and no `--motion-*` variable
    // retunes it. Writing one on the scope therefore changes nothing.
    const {element, morph} = setup();
    const scope = document.createElement('div');
    scope.setAttribute('data-astryx-theme', 'brisk');
    document.body.appendChild(scope);
    scope.appendChild(element);
    registerSpringsTable();
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (node: Element) =>
        ({
          getPropertyValue: (name: string) =>
            node === scope && name === '--motion-springs-menu-open'
              ? '0.9s 0.25'
              : '',
        }) as CSSStyleDeclaration,
    );
    expect(resolveMotion(element, springs.menuOpen)).toBe(springs.menuOpen);

    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, springs.menuOpen);
    const [presenting] = live(element, 'scale');
    const withVariable = Number(presenting.options.duration);
    vi.restoreAllMocks();

    const plain = setup();
    plain.morph.present(
      lerpPath(SQUARE, BOX, {opacity: [0, 1]}),
      springs.menuOpen,
    );
    const [plainPresenting] = live(plain.element, 'scale');
    expect(withVariable).toBeCloseTo(
      Number(plainPresenting.options.duration),
      6,
    );
  });

  it('presents the element from its source to rest on the spring', async () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, BOUNCY);
    await playFrame();
    expect(element.style.getPropertyValue('transform-origin')).toBe('0px 0px');
    expect(live(element, 'scale').length).toBe(1);
    expect(live(element, 'translate').length).toBe(1);
    const progress = progressCurve(BOUNCY);
    const start = clock;
    for (const t of [0, 0.03, 0.08, 0.15, 0.3]) {
      clock = start + t * 1000;
      expectRect(morph.presentedRect()!, path.rectAt(progress.at(t)), 0.01);
    }
  });

  it('plays on an animator it is handed, and leaves it to its owner when disposed', async () => {
    // A zoom stage already drives the photo with its own animator (pinch,
    // pan, settle): the morph plays on it, so the two share the channels.
    const element = document.createElement('div');
    document.body.appendChild(element);
    stubMedia(false, true);
    const stage = createAnimator(element, {now: () => clock, requestFrame});
    const morph = createRectMorph(element, {
      animator: stage,
      now: () => clock,
      requestFrame,
    });
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, BOUNCY);
    await playFrame();
    expect(live(element, 'scale')).toHaveLength(1);
    clock += 50;
    expect(stage.get('scaleX', clock)).toBeCloseTo(
      morph.presentedRect()!.width / BOX.width,
      9,
    );
    expect(stage.get('scaleX', clock)).not.toBeCloseTo(1, 3);
    morph.dispose();
    // Still the stage's: it moves the element after the morph is gone.
    stage.set({x: 12});
    expect(stage.get('x')).toBe(12);
  });

  it('holds the element at its first values until two frames present it, when asked for the presented start', async () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, BOUNCY, {start: 'presented'});
    expect(live(element, 'scale')).toHaveLength(0);
    expectRect(morph.presentedRect()!, path.rectAt(0), 0.01);
    await playFrame();
    expect(live(element, 'scale')).toHaveLength(0);
    await playFrame();
    expect(live(element, 'scale')).toHaveLength(1);
  });

  it('leaves nothing of its own inline once the present settles', async () => {
    const {element, morph} = setup();
    morph.present(lerpPath(SQUARE, BOX, {opacity: [0, 1]}), SPRING);
    await settle(progressCurve(SPRING).duration * 1000 + 50);
    for (const property of [
      'translate',
      'scale',
      'transform-origin',
      'opacity',
    ]) {
      expect(element.style.getPropertyValue(property), property).toBe('');
    }
    expectRect(morph.presentedRect()!, BOX, 1e-9);
  });

  it('leaves a component\u2019s own opacity alone when its path has none', async () => {
    const {element, morph} = setup();
    element.style.setProperty('opacity', '0.5');
    morph.present(lerpPath(SQUARE, BOX), SPRING);
    await settle(progressCurve(SPRING).duration * 1000 + 50);
    expect(element.style.getPropertyValue('opacity')).toBe('0.5');
    expect(live(element, 'opacity').length).toBe(0);
  });

  it('dismisses on its target from the rect on screen, leaves the element as laid out, then releases the target', async () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, SPRING);
    await settle(progressCurve(SPRING).duration * 1000 + 50);
    const copy = copyOf(element);
    const dismissing = morph.dismiss(path, BOUNCY, {target: copy});
    expect(copy.style.getPropertyValue('transform-origin')).toBe('0px 0px');
    expect(live(copy, 'scale').length).toBe(1);
    for (const property of [
      'translate',
      'scale',
      'transform-origin',
      'opacity',
    ]) {
      expect(element.style.getPropertyValue(property), property).toBe('');
    }
    // It runs from rest back to the square, fading out.
    await playFrame();
    const progress = progressCurve(BOUNCY);
    const back = lerpPath(BOX, SQUARE, {opacity: [1, 0]});
    const start = clock;
    for (const t of [0, 0.05, 0.1, 0.2]) {
      clock = start + t * 1000;
      expectRect(morph.presentedRect()!, back.rectAt(progress.at(t)), 0.01);
    }
    clock = start;
    await settle(progress.duration * 1000 + 50);
    expect(await dismissing.finished).toBe(true);
    expect(copy.isConnected).toBe(false);
  });

  it('lets the element go of its compositing layer as a dismissal on a copy starts, so no style write reaches it during the dismissal', async () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, SPRING);
    // Dismissed about 100 ms after the present's curve ended, while the
    // animator still keeps the element promoted (its promotion linger).
    await settle(progressCurve(SPRING).duration * 1000 + 100);
    const copy = copyOf(element);
    morph.dismiss(path, BOUNCY, {target: copy});
    // The dismissal's own task.
    await Promise.resolve();
    await Promise.resolve();
    const writes: string[] = [];
    const observer = new MutationObserver(records => {
      for (const record of records) {
        writes.push(record.oldValue ?? '');
      }
    });
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['style'],
      attributeOldValue: true,
    });
    // The dismissal's whole run, and any linger past it.
    for (let ms = 0; ms < 1200; ms += 50) {
      await settle(50);
    }
    writes.push(...observer.takeRecords().map(record => record.oldValue ?? ''));
    observer.disconnect();
    expect(writes).toEqual([]);
    expect(element.style.getPropertyValue('will-change')).toBe('');
  });

  it('presents the element again after a dismissal on a copy', async () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, SPRING);
    await settle(progressCurve(SPRING).duration * 1000 + 100);
    morph.dismiss(path, BOUNCY, {target: copyOf(element)});
    await settle(progressCurve(BOUNCY).duration * 1000 + 50);
    const presenting = morph.present(path, SPRING);
    expect(live(element, 'scale').length).toBe(1);
    await settle(progressCurve(SPRING).duration * 1000 + 50);
    expect(await presenting.finished).toBe(true);
    expect(element.style.getPropertyValue('scale')).toBe('');
  });

  it('hands its target to the caller\u2019s release, and dismisses the element itself when it is the target', async () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX);
    morph.present(path, SPRING);
    await settle(1000);
    const released: HTMLElement[] = [];
    const copy = copyOf(element);
    morph.dismiss(path, SPRING, {
      target: copy,
      release: target => released.push(target),
    });
    await settle(1000);
    expect(released).toEqual([copy]);
    expect(copy.isConnected).toBe(true);

    morph.present(path, SPRING);
    await settle(1000);
    morph.dismiss(path, SPRING, {target: element});
    expect(live(element, 'scale').length).toBe(1);
    await settle(1000);
    expect(element.isConnected).toBe(true);
    expectRect(morph.presentedRect()!, SQUARE, 0.01);
  });

  it('a second dismissal on the copy in flight keeps the copy and continues from its rect', async () => {
    // A dismissal continues the dismissal in flight, so a caller that hands
    // the same copy again (a retargeted shrink) keeps it: its release runs
    // once, when the dismissal that is still running ends.
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, SPRING);
    await settle(progressCurve(SPRING).duration * 1000 + 50);
    const released: HTMLElement[] = [];
    const release = (target: HTMLElement) => {
      released.push(target);
      target.remove();
    };
    const copy = copyOf(element);
    morph.dismiss(path, BOUNCY, {target: copy, release});
    clock += 60;
    await vi.advanceTimersByTimeAsync(60);
    const onScreen = morph.presentedRect()!;

    const again = morph.dismiss(path, SPRING, {target: copy, release});
    expect(copy.isConnected).toBe(true);
    expect(released).toEqual([]);
    expect(live(copy, 'scale').length).toBe(1);
    expectRect(morph.presentedRect()!, onScreen, 0.01);

    await settle(progressCurve(SPRING).duration * 1000 + 50);
    expect(await again.finished).toBe(true);
    expect(released).toEqual([copy]);
    expect(copy.isConnected).toBe(false);
  });

  it('a dismissal during the present starts from the rect on screen, with its velocity', async () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, SPRING);
    await playFrame();
    const progress = progressCurve(SPRING);
    clock += 60;
    await vi.advanceTimersByTimeAsync(60);
    const p = progress.at(0.06);
    const dp = progress.velocity(0.06);
    const onScreen = morph.presentedRect()!;
    expectRect(onScreen, path.rectAt(p), 0.01);
    const copy = copyOf(element);
    morph.dismiss(path, BOUNCY, {target: copy});
    // The same rect, now on the copy, and the same velocity: the dismissal's
    // path is the rest of the line back to the square, so the growth's
    // velocity carries on along it.
    expectRect(morph.presentedRect()!, onScreen, 0.01);
    await playFrame();
    const before = morph.presentedRect()!;
    clock += 0.01;
    const after = morph.presentedRect()!;
    const expectedWidthSpeed = (BOX.width - SQUARE.width) * dp; // px/s
    expect((after.width - before.width) / 0.01e-3).toBeCloseTo(
      expectedWidthSpeed,
      -1,
    );
  });

  it('a present during the dismissal starts from the copy\u2019s rect with its velocity and takes the copy away', async () => {
    const {element, morph} = setup();
    const surface = {x: 41, y: 204, width: 320, height: 253};
    const model = popoverModel(surface, {
      x: 141,
      y: 160,
      width: 120,
      height: 44,
    });
    const path = edgeGrowPath({
      box: surface,
      origin: {x: model.state.originX, y: model.state.originY},
      axis: model.state.axis,
      collapsedScale: model.state.scale,
      collapsedLength: model.state.length,
    });
    morph.present(path, SPRING);
    await settle(1000);
    const copy = copyOf(element);
    morph.dismiss(path, SPRING, {target: copy});
    await playFrame();
    clock += 80;
    await vi.advanceTimersByTimeAsync(80);
    const onScreen = morph.presentedRect()!;
    const before = {...onScreen};
    clock += 1;
    const moving = morph.presentedRect()!;
    clock -= 1;
    morph.present(path, SPRING);
    expect(copy.isConnected).toBe(false);
    expectRect(morph.presentedRect()!, onScreen, 0.01);
    await playFrame();
    // It keeps shrinking for a moment (the dismissal's velocity), then grows.
    clock += 1;
    const next = morph.presentedRect()!;
    expect(Math.sign(next.width - before.width)).toBe(
      Math.sign(moving.width - before.width),
    );
    await settle(1000);
    expectRect(morph.presentedRect()!, surface, 1e-6);
  });

  it('takes a release velocity as given (progress per second)', async () => {
    const {morph} = setup();
    const path = lerpPath(SQUARE, BOX);
    morph.present(path, SPRING, {velocity: 6});
    await playFrame();
    const before = morph.presentedRect()!;
    clock += 0.01;
    const after = morph.presentedRect()!;
    expect((after.x - before.x) / 0.01e-3).toBeCloseTo(
      (BOX.x - SQUARE.x) * 6,
      -1,
    );
  });

  it('reset after a settled present writes nothing back inline', async () => {
    const {element, morph} = setup();
    morph.present(lerpPath(SQUARE, BOX, {opacity: [0, 1]}), SPRING);
    await settle(progressCurve(SPRING).duration * 1000 + 50);
    morph.reset();
    for (const property of [
      'translate',
      'scale',
      'transform-origin',
      'opacity',
    ]) {
      expect(element.style.getPropertyValue(property), property).toBe('');
    }
  });

  it('reset ends every motion, takes the target away and leaves the element as laid out', () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, SPRING);
    const copy = copyOf(element);
    morph.dismiss(path, SPRING, {target: copy});
    morph.reset();
    expect(copy.isConnected).toBe(false);
    for (const property of [
      'translate',
      'scale',
      'transform-origin',
      'opacity',
    ]) {
      expect(element.style.getPropertyValue(property), property).toBe('');
    }
    expect(morph.presentedRect()).toBeNull();
  });

  describe('under Reduced Motion (the animator\u2019s, design:reduced-motion)', () => {
    /** When `animation`'s opacity reaches `target` for good, ms after its start. */
    const fadeEndMs = (animation: Recorded, target: number) => {
      const duration = Number(animation.options.duration);
      let end = 0;
      for (const frame of animation.keyframes) {
        if (Math.abs(Number(frame.opacity) - target) > 1e-3) {
          end = (frame.offset as number) * duration;
        }
      }
      const index = animation.keyframes.findIndex(
        frame => (frame.offset as number) * duration > end,
      );
      return (animation.keyframes[index].offset as number) * duration;
    };

    it('on a coarse pointer, a present lands at rest and fades in, a dismissal fades out where it stands, in 200 ms', async () => {
      const {element, morph} = setup({reducedMotion: true, coarse: true});
      const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
      morph.present(path, SPRING);
      const [fadeIn] = live(element, 'opacity');
      expect(fadeEndMs(fadeIn, 1)).toBeLessThanOrEqual(
        timing.reducedMotionCrossFadeMs + 1,
      );
      // Nothing grows: it stands at rest while it fades.
      expectRect(morph.presentedRect()!, BOX, 0.01);
      await settle(1000);

      const copy = copyOf(element);
      morph.dismiss(path, SPRING, {target: copy});
      const [fadeOut] = live(copy, 'opacity');
      const fadeMs = fadeEndMs(fadeOut, 0);
      expect(fadeMs).toBeLessThanOrEqual(timing.reducedMotionCrossFadeMs + 1);
      const start = clock;
      for (const t of [0, 50, 100, 150]) {
        clock = start + t;
        expectRect(morph.presentedRect()!, BOX, 0.01);
      }
    });

    it('lands a path with no opacity at rest, instead of starting on its source rect', () => {
      // With no opacity of its own the path gives the cross-fade nothing to
      // read, so the morph says which way it goes: a present lands at rest
      // (design:reduced-motion), it does not dip to the source and grow.
      const {element, morph} = setup({reducedMotion: true, coarse: true});
      const path = lerpPath(SQUARE, BOX);
      morph.present(path, SPRING);
      expectRect(morph.presentedRect()!, BOX, 0.01);
      expect(live(element, 'scale').length).toBe(0);
      expect(live(element, 'translate').length).toBe(0);
    });

    it('keeps the animator’s dip for an element that only moves, when the caller says so', () => {
      // A sub-menu's parent card stays visible and only moves: treated as an
      // entrance it would cut out and fade in, so its caller asks for a move,
      // and the animator dips it: out, the travel lands, back in.
      const {element, morph} = setup({reducedMotion: true, coarse: true});
      const path = lerpPath(SQUARE, BOX);
      morph.present(path, SPRING, {crossfadeAs: 'move'});
      const [dip] = live(element, 'opacity');
      expect(dip).toBeDefined();
      expect(Number(dip.keyframes[0].opacity)).toBeCloseTo(1, 6);
      expect(
        Math.min(...dip.keyframes.map(frame => Number(frame.opacity))),
      ).toBeLessThan(0.5);
    });

    it('on any other pointer, it completes at once', () => {
      const {element, morph} = setup({reducedMotion: true, coarse: false});
      morph.present(lerpPath(SQUARE, BOX, {opacity: [0, 1]}), SPRING);
      expect(live(element, 'scale').length).toBe(0);
      expect(live(element, 'opacity').length).toBe(0);
      expectRect(morph.presentedRect()!, BOX, 0.01);
    });
  });
});
