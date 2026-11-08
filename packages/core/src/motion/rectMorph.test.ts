// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rectMorph.test.ts
 * @input vitest (jsdom), the rect morph, a recording stand-in for
 *   Element.animate (jsdom runs no animations), and the models of the
 *   presentations that move onto the morph, as their pull requests have them
 * @output Checks that present and dismiss continue each other from the rect
 *   on screen with its velocity; the dismissal's target; the inline state
 *   left behind; Reduced Motion through the animator (the paths and the
 *   presentations' models are checked in morphPath.test.ts)
 * @position Testing; the compositor side is proven in
 *   __tests__/rectMorph.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createMotionEngine} from './animator';
import {cubicBezier} from './bezier';
import {easedProgress, progressCurve} from './progress';
import {
  createRectMorph,
  edgeGrowPath,
  lerpPath,
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

const SQUARE: MorphRect = {x: 179, y: 160, width: 22, height: 22};
const BOX: MorphRect = {x: 40, y: 204, width: 320, height: 253};

// The popover's model, as #8187 has it, for the present that turns around
// on its edge growth.
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
    morph.present(path, {spring: springs.menuOpen});
    const [presenting] = live(element, 'scale');
    const withVariable = Number(presenting.options.duration);
    vi.restoreAllMocks();

    const plain = setup();
    plain.morph.present(lerpPath(SQUARE, BOX, {opacity: [0, 1]}), {
      spring: springs.menuOpen,
    });
    const [plainPresenting] = live(plain.element, 'scale');
    expect(withVariable).toBeCloseTo(
      Number(plainPresenting.options.duration),
      6,
    );
  });

  it('presents the element from its source to rest on the spring', async () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, {spring: BOUNCY});
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

  it('presents on a theme timing: its duration and easing as given, from the velocity it is given', async () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    const easing = [0.2, 0, 0, 1] as const;
    // A timed present keeps the velocity it is given (a new target keeps the
    // current velocity) and still lands on time.
    morph.present(path, {duration: 300, easing}, {velocity: 6});
    await playFrame();
    expect(live(element, 'scale').length).toBe(1);
    const progress = easedProgress(0.3, cubicBezier(easing), {velocity: 6});
    const start = clock;
    for (const t of [0, 0.05, 0.12, 0.2, 0.29]) {
      clock = start + t * 1000;
      expectRect(morph.presentedRect()!, path.rectAt(progress.at(t)), 0.01);
    }
  });

  it('plays a timed present from rest on its easing as given', async () => {
    const {morph} = setup();
    const path = lerpPath(SQUARE, BOX);
    const easing = [0, 0, 0.58, 1] as const;
    const ease = cubicBezier(easing);
    morph.present(path, {duration: 250, easing});
    await playFrame();
    const start = clock;
    for (const t of [0.02, 0.05, 0.1, 0.2]) {
      clock = start + t * 1000;
      expectRect(morph.presentedRect()!, path.rectAt(ease(t / 0.25)), 0.01);
    }
  });

  it('plays a timed dismissal from a settled present on its easing as given', async () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX);
    morph.present(path, {spring: SPRING});
    await settle(2000);
    const easing = [0, 0, 0.58, 1] as const;
    const ease = cubicBezier(easing);
    morph.dismiss(path, {duration: 250, easing}, {target: copyOf(element)});
    await playFrame();
    const start = clock;
    for (const t of [0.02, 0.05, 0.1, 0.2]) {
      clock = start + t * 1000;
      expectRect(morph.presentedRect()!, path.rectAt(1 - ease(t / 0.25)), 0.01);
    }
  });

  it('plays on an animator it is handed, and leaves it to its owner when disposed', async () => {
    // A zoom stage already drives the photo with its own animator (pinch,
    // pan, settle): the morph plays on it, so the two share the channels.
    const element = document.createElement('div');
    document.body.appendChild(element);
    stubMedia(false, true);
    const stage = createMotionEngine(element, {
      now: () => clock,
      requestFrame,
    });
    const morph = createRectMorph(element, {
      animator: stage,
      now: () => clock,
      requestFrame,
    });
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, {spring: BOUNCY});
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

  it('leaves a handed-in animator on the element through a dismissal onto a copy', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    stubMedia(false, true);
    const stage = createMotionEngine(element, {
      now: () => clock,
      requestFrame,
    });
    const morph = createRectMorph(element, {
      animator: stage,
      now: () => clock,
      requestFrame,
    });
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, {spring: SPRING});
    await playFrame();
    const copy = element.cloneNode(true) as HTMLElement;
    element.after(copy);
    morph.dismiss(path, {spring: SPRING}, {target: copy});
    await playFrame();
    clock += 2000;
    await vi.advanceTimersByTimeAsync(2000);
    // The owner's own write still reaches the element.
    stage.set({x: 12});
    expect(element.style.getPropertyValue('translate')).toContain('12px');
    morph.dispose();
  });

  it('holds the element at its first values until two frames present it, when asked for the presented start', async () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, {spring: BOUNCY}, {start: 'presented'});
    expect(live(element, 'scale')).toHaveLength(0);
    expectRect(morph.presentedRect()!, path.rectAt(0), 0.01);
    await playFrame();
    expect(live(element, 'scale')).toHaveLength(0);
    await playFrame();
    expect(live(element, 'scale')).toHaveLength(1);
  });

  it('leaves nothing of its own inline once the present settles', async () => {
    const {element, morph} = setup();
    morph.present(lerpPath(SQUARE, BOX, {opacity: [0, 1]}), {spring: SPRING});
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
    morph.present(lerpPath(SQUARE, BOX), {spring: SPRING});
    await settle(progressCurve(SPRING).duration * 1000 + 50);
    expect(element.style.getPropertyValue('opacity')).toBe('0.5');
    expect(live(element, 'opacity').length).toBe(0);
  });

  it('dismisses on its target from the rect on screen, leaves the element as laid out, then releases the target', async () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX, {opacity: [0, 1]});
    morph.present(path, {spring: SPRING});
    await settle(progressCurve(SPRING).duration * 1000 + 50);
    const copy = copyOf(element);
    const dismissing = morph.dismiss(path, {spring: BOUNCY}, {target: copy});
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
    morph.present(path, {spring: SPRING});
    // Dismissed about 100 ms after the present's curve ended, while the
    // animator still keeps the element promoted (its promotion linger).
    await settle(progressCurve(SPRING).duration * 1000 + 100);
    const copy = copyOf(element);
    morph.dismiss(path, {spring: BOUNCY}, {target: copy});
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
    morph.present(path, {spring: SPRING});
    await settle(progressCurve(SPRING).duration * 1000 + 100);
    morph.dismiss(path, {spring: BOUNCY}, {target: copyOf(element)});
    await settle(progressCurve(BOUNCY).duration * 1000 + 50);
    const presenting = morph.present(path, {spring: SPRING});
    expect(live(element, 'scale').length).toBe(1);
    await settle(progressCurve(SPRING).duration * 1000 + 50);
    expect(await presenting.finished).toBe(true);
    expect(element.style.getPropertyValue('scale')).toBe('');
  });

  it('hands its target to the caller\u2019s release, and dismisses the element itself when it is the target', async () => {
    const {element, morph} = setup();
    const path = lerpPath(SQUARE, BOX);
    morph.present(path, {spring: SPRING});
    await settle(1000);
    const released: HTMLElement[] = [];
    const copy = copyOf(element);
    morph.dismiss(
      path,
      {spring: SPRING},
      {
        target: copy,
        release: target => released.push(target),
      },
    );
    await settle(1000);
    expect(released).toEqual([copy]);
    expect(copy.isConnected).toBe(true);

    morph.present(path, {spring: SPRING});
    await settle(1000);
    morph.dismiss(path, {spring: SPRING}, {target: element});
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
    morph.present(path, {spring: SPRING});
    await settle(progressCurve(SPRING).duration * 1000 + 50);
    const released: HTMLElement[] = [];
    const release = (target: HTMLElement) => {
      released.push(target);
      target.remove();
    };
    const copy = copyOf(element);
    morph.dismiss(path, {spring: BOUNCY}, {target: copy, release});
    clock += 60;
    await vi.advanceTimersByTimeAsync(60);
    const onScreen = morph.presentedRect()!;

    const again = morph.dismiss(
      path,
      {spring: SPRING},
      {target: copy, release},
    );
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
    morph.present(path, {spring: SPRING});
    await playFrame();
    const progress = progressCurve(SPRING);
    clock += 60;
    await vi.advanceTimersByTimeAsync(60);
    const p = progress.at(0.06);
    const dp = progress.velocity(0.06);
    const onScreen = morph.presentedRect()!;
    expectRect(onScreen, path.rectAt(p), 0.01);
    const copy = copyOf(element);
    morph.dismiss(path, {spring: BOUNCY}, {target: copy});
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
    morph.present(path, {spring: SPRING});
    await settle(1000);
    const copy = copyOf(element);
    morph.dismiss(path, {spring: SPRING}, {target: copy});
    await playFrame();
    clock += 80;
    await vi.advanceTimersByTimeAsync(80);
    const onScreen = morph.presentedRect()!;
    const before = {...onScreen};
    clock += 1;
    const moving = morph.presentedRect()!;
    clock -= 1;
    morph.present(path, {spring: SPRING});
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
    morph.present(path, {spring: SPRING}, {velocity: 6});
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
    morph.present(lerpPath(SQUARE, BOX, {opacity: [0, 1]}), {spring: SPRING});
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
    morph.present(path, {spring: SPRING});
    const copy = copyOf(element);
    morph.dismiss(path, {spring: SPRING}, {target: copy});
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
      morph.present(path, {spring: SPRING});
      const [fadeIn] = live(element, 'opacity');
      expect(fadeEndMs(fadeIn, 1)).toBeLessThanOrEqual(
        timing.reducedMotionCrossFadeMs + 1,
      );
      // Nothing grows: it stands at rest while it fades.
      expectRect(morph.presentedRect()!, BOX, 0.01);
      await settle(1000);

      const copy = copyOf(element);
      morph.dismiss(path, {spring: SPRING}, {target: copy});
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
      morph.present(path, {spring: SPRING});
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
      morph.present(path, {spring: SPRING}, {crossfadeAs: 'move'});
      const [dip] = live(element, 'opacity');
      expect(dip).toBeDefined();
      expect(Number(dip.keyframes[0].opacity)).toBeCloseTo(1, 6);
      expect(
        Math.min(...dip.keyframes.map(frame => Number(frame.opacity))),
      ).toBeLessThan(0.5);
    });

    it('on any other pointer, it completes at once', () => {
      const {element, morph} = setup({reducedMotion: true, coarse: false});
      morph.present(lerpPath(SQUARE, BOX, {opacity: [0, 1]}), {spring: SPRING});
      expect(live(element, 'scale').length).toBe(0);
      expect(live(element, 'opacity').length).toBe(0);
      expectRect(morph.presentedRect()!, BOX, 0.01);
    });
  });
});
