// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file popoverSurfaceMotion.test.ts
 * @input vitest (jsdom), popoverSurfaceMotion, the theme's duration and
 *   easing defaults, a recording stand-in for Element.animate
 * @output Checks where the popover grows from on each side of its source,
 *   and that every frame stays on UIKit's measured path. Checks that the
 *   growth plays the entrance tokens and the shrink the exit tokens. Covers
 *   present, dismiss, turn-back, reset, Reduce Motion and the input hold
 *   while it grows.
 * @position Testing; the curves on a real compositor are proven in
 *   __tests__/PopoverTouchMotion.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {isInHeldLayer, isInputShield} from '../Layer/inputHold';
import {cubicBezier} from '../motion/bezier';
import {parseCssEasing, parseMotionRoleValue} from '../motion/roles';
import {popover, timing} from '../motion/uikit';
import {findPopoverExitCopy} from '../privateAttributes/popoverExit.stylex';
import {durationDefaults, easeDefaults} from '../theme/tokens.stylex';
import {
  createPopoverSurfaceMotion,
  popoverCollapsedState,
  popoverFrame,
  type PopoverSurfaceGeometry,
} from './popoverSurfaceMotion';

/** A motion's duration (ms) and eased progress, as CSS gives them. */
function cssTiming(duration: string, easing: string) {
  const ms = parseMotionRoleValue('duration', duration);
  const points = parseCssEasing(easing);
  if (ms == null || points == null) {
    throw new Error(`not a playable timing: ${duration} ${easing}`);
  }
  const ease = cubicBezier(points);
  return {ms, at: (tMs: number) => (tMs >= ms ? 1 : ease(tMs / ms))};
}

// The theme's defaults, which a page with no theme scope plays.
const ENTRANCE = cssTiming(
  durationDefaults['--duration-medium-min'],
  easeDefaults['--ease-entrance'],
);
const EXIT = cssTiming(
  durationDefaults['--duration-fast'],
  easeDefaults['--ease-exit'],
);

// UIKit on iOS 26.2 (batch 36): a 120 × 44 button at (141, 160). It presents
// a 320 × 253 popover below it at (41, 204), centred on it.
const GEOMETRY: PopoverSurfaceGeometry = {
  surface: {left: 41, top: 204, width: 320, height: 253},
  source: {left: 141, top: 160, width: 120, height: 44},
};

/** The visual box of the surface scaled by (sx, sy) about the origin. */
function visualBox(
  geometry: PopoverSurfaceGeometry,
  origin: {x: number; y: number},
  sx: number,
  sy: number,
) {
  const {left, top, width, height} = geometry.surface;
  return {
    left: left + origin.x * (1 - sx),
    top: top + origin.y * (1 - sy),
    width: width * sx,
    height: height * sy,
  };
}

const scaleOf = (frame: Keyframe) =>
  String(frame.scale)
    .split(' ')
    .map(value => Number(value));

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

describe('popoverCollapsedState', () => {
  it('grows a popover below its source out of the source\u2019s bottom centre', () => {
    const state = popoverCollapsedState(GEOMETRY);
    expect(state.originX).toBe(160);
    expect(state.originY).toBe(0);
    expect(state.axis).toBe('y');
    expect(state.scale).toBe(popover.collapsedScale);
    expect(state.length).toBeCloseTo(popover.collapsedLengthPx / 253, 12);
  });

  it('turns the same motion toward a source above or beside the popover', () => {
    const above = popoverCollapsedState({
      surface: {left: 41, top: 100, width: 320, height: 200},
      source: {left: 141, top: 310, width: 120, height: 44},
    });
    expect([above.originX, above.originY, above.axis]).toEqual([160, 200, 'y']);
    const right = popoverCollapsedState({
      surface: {left: 200, top: 100, width: 180, height: 240},
      source: {left: 20, top: 150, width: 160, height: 40},
    });
    expect([right.originX, right.originY, right.axis]).toEqual([0, 70, 'x']);
    expect(right.length).toBeCloseTo(popover.collapsedLengthPx / 180, 12);
    const left = popoverCollapsedState({
      surface: {left: 10, top: 100, width: 180, height: 240},
      source: {left: 200, top: 150, width: 160, height: 40},
    });
    expect([left.originX, left.originY, left.axis]).toEqual([180, 70, 'x']);
  });

  it('keeps the point on the popover when its source is wider than it, and never grows a short popover', () => {
    const state = popoverCollapsedState({
      surface: {left: 300, top: 60, width: 90, height: 80},
      source: {left: 0, top: 10, width: 402, height: 44},
    });
    // The source's centre (201) lies left of the popover: its nearest point.
    expect(state.originX).toBe(0);
    expect(state.originY).toBe(0);
    // Shorter than the 100 pt it would grow from: the length does not move.
    expect(state.length).toBe(1);
  });
});

describe('popoverFrame', () => {
  it('keeps every frame on UIKit\u2019s path: the top on the source, the centre on its line, the length growing from 100 pt', () => {
    const state = popoverCollapsedState(GEOMETRY);
    // Progress past 1 is an easing's overshoot; the path extends straight.
    for (const p of [0, 0.1, 0.3126, 0.5, 0.9, 1, 1.0152]) {
      const frame = popoverFrame(state, p);
      const box = visualBox(
        GEOMETRY,
        {x: state.originX, y: state.originY},
        frame.scaleX,
        frame.scaleY,
      );
      const scale = popover.collapsedScale + (1 - popover.collapsedScale) * p;
      expect(box.top).toBeCloseTo(204, 9);
      expect(box.left + box.width / 2).toBeCloseTo(201, 9);
      expect(box.width).toBeCloseTo(320 * scale, 9);
      expect(box.height).toBeCloseTo(scale * (100 + 153 * p), 9);
      expect(frame.opacity).toBeCloseTo(p, 12);
    }
  });

  it('matches the popover view\u2019s measured frames', () => {
    const state = popoverCollapsedState(GEOMETRY);
    // Presentation frames of the popover view, iOS 26.2 (batch 36): scale,
    // then the visual width and height.
    for (const [scale, width, height] of [
      [0.0865, 27.69, 9.68],
      [0.3195, 102.25, 47.24],
      [0.6664, 213.26, 134.25],
      [0.9632, 308.22, 238.2],
      [1.015, 324.79, 259.14],
    ]) {
      const p = (scale - popover.collapsedScale) / (1 - popover.collapsedScale);
      const frame = popoverFrame(state, p);
      expect(320 * frame.scaleX).toBeCloseTo(width, 1);
      expect(253 * frame.scaleY).toBeCloseTo(height, 1);
    }
  });
});

interface Recorded {
  target: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  cancelled: boolean;
}

describe('createPopoverSurfaceMotion', () => {
  let clock = 1000;
  let recorded: Recorded[] = [];

  beforeEach(() => {
    clock = 1000;
    recorded = [];
    vi.useFakeTimers();
    HTMLElement.prototype.animate = function (keyframes, options) {
      const animation = {
        target: this,
        keyframes: keyframes as Keyframe[],
        options: options as KeyframeAnimationOptions,
        cancelled: false,
        // The browser starts it at once: its first frame is committed at the
        // call (the animator holds a curve's start until it has one).
        startTime: clock as number | null,
        finished: new Promise(() => {}),
        cancel() {
          this.cancelled = true;
        },
      };
      recorded.push(animation);
      return animation as unknown as Animation;
    };
  });

  // jsdom has no layout: the dismissal's copy stands where its inline box
  // says.
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (findPopoverExitCopy(this.parentElement ?? document) !== this) {
        return originalRect.call(this);
      }
      const left = parseFloat(this.style.left);
      const top = parseFloat(this.style.top);
      const width = parseFloat(this.style.width);
      const height = parseFloat(this.style.height);
      return {
        left,
        top,
        width,
        height,
        x: left,
        y: top,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      };
    };
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const create = (reducedMotion = false) => {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const element = document.createElement('div');
    element.id = 'popover-layer';
    element.setAttribute('popover', 'auto');
    element.innerHTML =
      '<div role="dialog" id="popover-dialog" aria-label="Filters"><button id="apply">Apply</button></div>';
    // jsdom has no layout: the surface stands where the open measured it.
    element.getBoundingClientRect = () => ({
      ...GEOMETRY.surface,
      x: GEOMETRY.surface.left,
      y: GEOMETRY.surface.top,
      right: GEOMETRY.surface.left + GEOMETRY.surface.width,
      bottom: GEOMETRY.surface.top + GEOMETRY.surface.height,
      toJSON: () => ({}),
    });
    host.appendChild(element);
    // The touch presentation runs under a coarse pointer, where Reduce
    // Motion cross-fades.
    stubMedia(reducedMotion, true);
    const motion = createPopoverSurfaceMotion(element, {now: () => clock});
    return {element, motion};
  };

  const live = (property: string, target?: Element) =>
    recorded.filter(
      animation =>
        !animation.cancelled &&
        (target == null || animation.target === target) &&
        animation.keyframes.some(frame => property in frame),
    );
  const copyOf = (element: HTMLElement) =>
    findPopoverExitCopy(element.parentElement!);

  /**
   * Checks each keyframe of `animation` against the path from collapsed to
   * presented at `progress(t ms)`, and returns the time the motion ends.
   */
  const expectPath = (
    animation: Recorded,
    state: ReturnType<typeof popoverCollapsedState>,
    progress: (tMs: number) => number,
  ) => {
    const duration = Number(animation.options.duration);
    let endMs = 0;
    let peak = 0;
    let previous: number[] | null = null;
    for (const frame of animation.keyframes) {
      const tMs = (frame.offset as number) * duration;
      const expected = popoverFrame(state, progress(tMs));
      const scale = scaleOf(frame);
      expect(scale[0]).toBeCloseTo(expected.scaleX, 2);
      expect(scale[1]).toBeCloseTo(expected.scaleY, 2);
      peak = Math.max(peak, scale[0]);
      if (previous == null || previous.some((v, i) => v !== scale[i])) {
        endMs = tMs;
      }
      previous = scale;
    }
    return {endMs, peak};
  };

  it('grows the popover out of its source on the theme\u2019s entrance tokens, without the layer\u2019s CSS entrance', () => {
    const {element, motion} = create();
    // The read happens with the CSS entrance already off and no scale left.
    const measure = vi.fn(() => {
      expect(element.style.getPropertyValue('animation-name')).toBe('none');
      return GEOMETRY;
    });
    motion.enter(measure);
    expect(measure).toHaveBeenCalledTimes(1);
    const state = popoverCollapsedState(GEOMETRY);
    expect(element.style.getPropertyValue('animation-name')).toBe('none');
    expect(element.style.getPropertyValue('transform-origin')).toBe(
      `${state.originX}px ${state.originY}px`,
    );
    const [scaleAnimation] = live('scale');
    const first = scaleOf(scaleAnimation.keyframes[0]);
    expect(first[0]).toBeCloseTo(state.scale, 4);
    expect(first[1]).toBeCloseTo(state.scale * state.length, 4);
    expect(scaleOf(scaleAnimation.keyframes.at(-1)!)).toEqual([1, 1]);
    // Every keyframe is the measured path at the entrance easing's progress,
    // and the growth ends with the entrance duration: no spring, no bounce.
    const {endMs, peak} = expectPath(scaleAnimation, state, ENTRANCE.at);
    expect(endMs).toBeLessThanOrEqual(ENTRANCE.ms + 1);
    expect(endMs).toBeGreaterThan(ENTRANCE.ms * 0.8);
    expect(peak).toBeLessThanOrEqual(1);
    const [opacityAnimation] = live('opacity');
    expect(Number(opacityAnimation.keyframes[0].opacity)).toBe(0);
    expect(Number(opacityAnimation.keyframes.at(-1)!.opacity)).toBe(1);
  });

  it('plays the dismissal on a static copy of the popover, back into its source on the theme\u2019s exit tokens, removed when it ends', async () => {
    const {element, motion} = create();
    motion.enter(() => GEOMETRY);
    clock += 1000;
    vi.advanceTimersByTime(1000);
    motion.exit();
    const copy = copyOf(element);
    expect(copy).not.toBeNull();
    // Beside the layer (same inherited theme), where it stands, out of reach.
    expect(copy!.previousElementSibling).toBe(element);
    expect(copy!.getAttribute('aria-hidden')).toBe('true');
    expect(copy!.hasAttribute('inert')).toBe(true);
    // In the top layer, as the popover was (the layer runtime's exit copy).
    expect(copy!.getAttribute('popover')).toBe('manual');
    expect(copy!.querySelectorAll('[id]')).toHaveLength(0);
    expect(copy!.style.getPropertyValue('left')).toBe('41px');
    expect(copy!.style.getPropertyValue('top')).toBe('204px');
    const state = popoverCollapsedState(GEOMETRY);
    expect(copy!.style.getPropertyValue('transform-origin')).toBe(
      `${state.originX}px ${state.originY}px`,
    );
    // The copy shrinks into the point on the exit easing, in the exit
    // duration (the fast duration while the theme sets none), and fades.
    const [scaleAnimation] = live('scale', copy!);
    const last = scaleOf(scaleAnimation.keyframes.at(-1)!);
    expect(last[0]).toBeCloseTo(state.scale, 4);
    expect(last[1]).toBeCloseTo(state.scale * state.length, 4);
    const {endMs} = expectPath(scaleAnimation, state, t => 1 - EXIT.at(t));
    expect(endMs).toBeLessThanOrEqual(EXIT.ms + 1);
    expect(endMs).toBeGreaterThan(EXIT.ms * 0.8);
    const [opacityAnimation] = live('opacity', copy!);
    expect(Number(opacityAnimation.keyframes[0].opacity)).toBe(1);
    expect(Number(opacityAnimation.keyframes.at(-1)!.opacity)).toBe(0);
    // The layer itself is left at rest for its next presentation (an
    // identity at rest leaves no inline value).
    expect(element.style.getPropertyValue('scale')).toMatch(/^(1( 1)?)?$/);
    expect(element.style.getPropertyValue('opacity')).toMatch(/^(1)?$/);
    // Gone once the shrink ends.
    clock += 2000;
    vi.advanceTimersByTime(2000);
    return Promise.resolve().then(() => {
      expect(copyOf(element)).toBeNull();
    });
  });

  it('reads the theme\u2019s tokens where the popover is: the entrance duration and easing time the growth, the exit duration and easing the shrink', () => {
    const {element, motion} = create();
    element.style.setProperty('--duration-medium-min', '400ms');
    element.style.setProperty('--ease-entrance', 'linear');
    element.style.setProperty('--duration-exit', '0.3s');
    element.style.setProperty('--ease-exit', 'ease-in');
    const state = popoverCollapsedState(GEOMETRY);
    motion.enter(() => GEOMETRY);
    const growth = expectPath(
      live('scale', element)[0],
      state,
      cssTiming('400ms', 'linear').at,
    );
    expect(growth.endMs).toBeGreaterThan(320);
    expect(growth.endMs).toBeLessThanOrEqual(401);
    clock += 1000;
    vi.advanceTimersByTime(1000);
    motion.exit();
    const shrinkTiming = cssTiming('300ms', 'ease-in');
    const shrink = expectPath(
      live('scale', copyOf(element)!)[0],
      state,
      t => 1 - shrinkTiming.at(t),
    );
    expect(shrink.endMs).toBeGreaterThan(240);
    expect(shrink.endMs).toBeLessThanOrEqual(301);
  });

  it('a theme that sets no exit duration shrinks the popover in its fast duration', () => {
    const {element, motion} = create();
    element.style.setProperty('--duration-fast', '250ms');
    const state = popoverCollapsedState(GEOMETRY);
    motion.enter(() => GEOMETRY);
    clock += 1000;
    vi.advanceTimersByTime(1000);
    motion.exit();
    const fast = cssTiming('250ms', easeDefaults['--ease-exit']);
    const shrink = expectPath(
      live('scale', copyOf(element)!)[0],
      state,
      t => 1 - fast.at(t),
    );
    expect(shrink.endMs).toBeGreaterThan(200);
    expect(shrink.endMs).toBeLessThanOrEqual(251);
  });

  it('dismissed during the growth, shrinks from the frame on screen on the exit tokens', () => {
    const {element, motion} = create();
    motion.enter(() => GEOMETRY);
    clock += ENTRANCE.ms / 2;
    vi.advanceTimersByTime(ENTRANCE.ms / 2);
    motion.exit();
    const state = popoverCollapsedState(GEOMETRY);
    const [scaleAnimation] = live('scale', copyOf(element)!);
    const first = scaleOf(scaleAnimation.keyframes[0]);
    const onScreen = popoverFrame(state, ENTRANCE.at(ENTRANCE.ms / 2));
    expect(first[0]).toBeCloseTo(onScreen.scaleX, 2);
    expect(first[1]).toBeCloseTo(onScreen.scaleY, 2);
    expect(first[0]).toBeLessThan(1);
    const last = scaleOf(scaleAnimation.keyframes.at(-1)!);
    expect(last[0]).toBeCloseTo(state.scale, 4);
  });

  it('lets the hidden layer go of its compositing layer as the dismissal starts, so no style write reaches it during the dismissal', async () => {
    const {element, motion} = create();
    motion.enter(() => GEOMETRY);
    // Dismissed about 100 ms after the presentation's curve ended, while the
    // animator still keeps the element promoted (its PROMOTION_LINGER_MS).
    clock += 600;
    vi.advanceTimersByTime(600);
    motion.exit();
    // The exit's own task.
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
      clock += 50;
      vi.advanceTimersByTime(50);
      await Promise.resolve();
    }
    writes.push(...observer.takeRecords().map(record => record.oldValue ?? ''));
    observer.disconnect();
    expect(writes).toEqual([]);
    expect(element.style.getPropertyValue('will-change')).toBe('');
  });

  it('presented again during the dismissal, grows back from the frame on screen about the same point', () => {
    const {element, motion} = create();
    motion.enter(() => GEOMETRY);
    clock += 1000;
    vi.advanceTimersByTime(1000);
    motion.exit();
    const origin = element.style.getPropertyValue('transform-origin');
    clock += 80;
    const measure = vi.fn(() => GEOMETRY);
    motion.enter(measure);
    // No new measurement and no new pivot; the copy is gone.
    expect(measure).not.toHaveBeenCalled();
    expect(element.style.getPropertyValue('transform-origin')).toBe(origin);
    expect(copyOf(element)).toBeNull();
    const first = scaleOf(live('scale', element).at(-1)!.keyframes[0]);
    const state = popoverCollapsedState(GEOMETRY);
    // Mid-dismissal: smaller than the presented popover, larger than the
    // point, with the length between its two values.
    expect(first[0]).toBeLessThan(1);
    expect(first[0]).toBeGreaterThan(state.scale);
    const length = first[1] / first[0];
    expect(length).toBeLessThan(1);
    expect(length).toBeGreaterThan(state.length);
  });

  it('a dismissal with no touch presentation before it does nothing', () => {
    const {element, motion} = create();
    motion.exit();
    expect(recorded).toHaveLength(0);
    expect(copyOf(element)).toBeNull();
  });

  it('reset leaves the element as the component styles it', () => {
    const {element, motion} = create();
    motion.enter(() => GEOMETRY);
    motion.reset();
    for (const property of [
      'scale',
      'opacity',
      'transform-origin',
      'animation-name',
    ]) {
      expect(element.style.getPropertyValue(property), property).toBe('');
    }
    motion.exit();
    expect(copyOf(element)).toBeNull();
  });

  it('Reduce Motion: the popover cross-fades in at its size and out where it stands, in 200 ms or less, with no spring', () => {
    const {element, motion} = create(true);
    motion.enter(() => GEOMETRY);
    // No growth: every scale keyframe is the full size.
    for (const animation of live('scale', element)) {
      for (const frame of animation.keyframes) {
        expect(String(frame.scale)).toMatch(/^1( 1)?$/);
      }
    }
    const ease = cubicBezier(timing.curves.move);
    // The animator holds a curve's end value to the end of a longer
    // animation. The fade ends at the first keyframe after which the opacity
    // stays at its target.
    const fadeMs = (
      animation: {
        options: KeyframeAnimationOptions;
        keyframes: Keyframe[];
      },
      target: number,
    ) => {
      const total = Number(animation.options.duration);
      let end = animation.keyframes.length - 1;
      while (
        end > 0 &&
        Number(animation.keyframes[end - 1].opacity) === target
      ) {
        end -= 1;
      }
      return (animation.keyframes[end].offset as number) * total;
    };
    const [fadeIn] = live('opacity', element);
    // design:reduced-motion DR2: opacity only, 200 ms or less.
    const fadeInMs = fadeMs(fadeIn, 1);
    expect(fadeInMs).toBeGreaterThan(0);
    expect(fadeInMs).toBeLessThanOrEqual(timing.reducedMotionCrossFadeMs + 1);
    // UIKit's cross-fade curve, not a spring.
    const fadeInTotal = Number(fadeIn.options.duration);
    for (const frame of fadeIn.keyframes) {
      const t = (frame.offset as number) * fadeInTotal;
      expect(Number(frame.opacity)).toBeCloseTo(
        ease(Math.min(1, t / timing.reducedMotionCrossFadeMs)),
        2,
      );
    }
    clock += 1000;
    vi.advanceTimersByTime(1000);
    motion.exit();
    const copy = copyOf(element)!;
    const [fadeOut] = live('opacity', copy);
    const fadeOutMs = fadeMs(fadeOut, 0);
    expect(fadeOutMs).toBeGreaterThan(0);
    expect(fadeOutMs).toBeLessThanOrEqual(timing.reducedMotionCrossFadeMs + 1);
    expect(Number(fadeOut.keyframes[0].opacity)).toBe(1);
    expect(Number(fadeOut.keyframes.at(-1)!.opacity)).toBe(0);
    const fadeOutTotal = Number(fadeOut.options.duration);
    for (const frame of fadeOut.keyframes) {
      const t = (frame.offset as number) * fadeOutTotal;
      expect(Number(frame.opacity)).toBeCloseTo(
        1 - ease(Math.min(1, t / timing.reducedMotionCrossFadeMs)),
        2,
      );
    }
    // The copy keeps its size while it fades (where it lands once it is out
    // is the animator's business).
    for (const animation of live('scale', copy)) {
      const total = Number(animation.options.duration);
      for (const frame of animation.keyframes) {
        if ((frame.offset as number) * total < fadeOutMs - 1) {
          expect(String(frame.scale)).toMatch(/^1( 1)?$/);
        }
      }
    }
  });
  describe('the hold while it grows', () => {
    const shieldOf = (element: HTMLElement) =>
      [...element.children].find(node => isInputShield(node)) ?? null;

    it('holds every touch while the popover grows, and lets go when the growth ends', async () => {
      const {element, motion} = create();
      motion.enter(() => GEOMETRY);
      expect(isInHeldLayer(element)).toBe(true);
      expect(shieldOf(element)).not.toBeNull();
      // Still held halfway through the growth.
      clock += ENTRANCE.ms / 2;
      vi.advanceTimersByTime(ENTRANCE.ms / 2);
      await Promise.resolve();
      expect(isInHeldLayer(element)).toBe(true);
      // Free once the growth has ended.
      const [growth] = live('scale', element);
      const duration = Number(growth.options.duration);
      clock += duration;
      vi.advanceTimersByTime(duration);
      await Promise.resolve();
      await Promise.resolve();
      expect(isInHeldLayer(element)).toBe(false);
      expect(shieldOf(element)).toBeNull();
    });

    it('lets go at once when the popover is dismissed or reset during the growth', () => {
      const dismissed = create();
      dismissed.motion.enter(() => GEOMETRY);
      expect(isInHeldLayer(dismissed.element)).toBe(true);
      dismissed.motion.exit();
      expect(isInHeldLayer(dismissed.element)).toBe(false);
      expect(shieldOf(dismissed.element)).toBeNull();

      const reset = create();
      reset.motion.enter(() => GEOMETRY);
      reset.motion.reset();
      expect(isInHeldLayer(reset.element)).toBe(false);
      expect(shieldOf(reset.element)).toBeNull();
    });

    it('holds under Reduce Motion too, for the length of the cross-fade', async () => {
      const {element, motion} = create(true);
      motion.enter(() => GEOMETRY);
      expect(isInHeldLayer(element)).toBe(true);
      clock += timing.reducedMotionCrossFadeMs / 2;
      vi.advanceTimersByTime(timing.reducedMotionCrossFadeMs / 2);
      await Promise.resolve();
      expect(isInHeldLayer(element)).toBe(true);
      clock += timing.reducedMotionCrossFadeMs;
      vi.advanceTimersByTime(timing.reducedMotionCrossFadeMs);
      await Promise.resolve();
      await Promise.resolve();
      expect(isInHeldLayer(element)).toBe(false);
    });
  });
});
