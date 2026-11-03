// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useSegmentedSelectionMotion.test.ts
 * @input vitest, jsdom, SegmentedSelectionMotion with an animator on a
 *   scripted clock, stubbed segment geometry and a recording `animate`
 * @output The touch layer's selection motion as a state machine: the slide,
 *   the hand-back, a change mid-flight, resize, Reduced Motion, the press, the
 *   chase, the commit at the lift and the face that follows a drag
 * @position Unit tests for useSegmentedSelectionMotion.ts; the browser proofs
 *   are __tests__/SegmentedControl.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {motionRoleOf} from '../motion/roles';
import {createMotionAnimator, type Animator} from '../motion/animator';
import {solveSpring, toSpring} from '../motion/spring';
import {cubicBezier} from '../motion/bezier';
import {segmentedControl, springs} from '../motion/uikit';
import {measureSegments, segmentTargetAt} from './useSegmentedTouchTracking';
import {
  SegmentedSelectionMotion,
  layerVariable,
  type Layer,
} from './useSegmentedSelectionMotion';

interface Geometry {
  left: number;
  width: number;
}

// The track sits at (10, 20) in the viewport; segments are 27 px tall, 2 px
// below its padding edge. Unequal widths, like a hug layout.
const TRACK = {left: 10, top: 20, width: 306, height: 31};
const SEGMENTS: Record<string, Geometry> = {
  grid: {left: 12, width: 96},
  list: {left: 108, width: 100},
  table: {left: 208, width: 106},
};

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

let clock = 0;
let reduceMotion = false;

/**
 * The person's settings, through `matchMedia` as the animator reads them.
 * No option overrides them. Reduce Motion follows `reduceMotion` at each
 * read, and `coarse` says whether the primary pointer is coarse.
 */
function stubMedia(coarse: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion')
      ? reduceMotion
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

function setup(selected: string, {coarse = true}: {coarse?: boolean} = {}) {
  stubMedia(coarse);
  const track = document.createElement('div');
  track.getBoundingClientRect = () =>
    rect(TRACK.left, TRACK.top, TRACK.width, TRACK.height);
  Object.defineProperty(track, 'offsetWidth', {
    value: TRACK.width,
    configurable: true,
  });
  const segments: Record<string, HTMLElement> = {};
  for (const [value, geometry] of Object.entries(SEGMENTS)) {
    const segment = document.createElement('button');
    segment.setAttribute('role', 'radio');
    segment.dataset.value = value;
    segment.getBoundingClientRect = () =>
      rect(geometry.left, TRACK.top + 2, geometry.width, 27);
    const title = document.createElement('span');
    title.setAttribute('data-astryx-segment-title', '');
    title.textContent = value;
    segment.append(title);
    track.append(segment);
    segments[value] = segment;
  }
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.append(style);
  document.body.append(track);
  // A finger by default: Reduced Motion fades (design:reduced-motion DR2).
  const animator: Animator = createMotionAnimator(null, {
    now: () => clock,
    pseudoElement: '::before',
  });
  // The ::after: the lifted lens's shadow, or the surface fading out.
  const afterAnimator: Animator = createMotionAnimator(null, {
    now: () => clock,
    pseudoElement: '::after',
    initial: {opacity: 0},
  });
  const motion = new SegmentedSelectionMotion(animator, {
    now: () => clock,
    afterAnimator,
  });
  motion.attachTrack(track);
  paint(segments, selected);
  /** A custom property of one of the radiogroup's pseudo-element layers. */
  const layer = (name: Layer, property: string) =>
    track.style.getPropertyValue(layerVariable(name, property));
  return {
    track,
    segments,
    animator,
    leavingAnimator: afterAnimator,
    motion,
    layer,
  };
}

type Ctx = ReturnType<typeof setup>;

/** The segment the touch tracking resolves for a finger at `clientX`. */
function targetAt(ctx: Ctx, clientX: number): HTMLElement | null {
  return segmentTargetAt(clientX, measureSegments(ctx.track));
}

/** A finger lands at `clientX` (the tracker's begin, then the motion's). */
function begin(ctx: Ctx, clientX: number, isFinger = true): void {
  ctx.motion.begin(ctx.track, targetAt(ctx, clientX), isFinger);
}

/** A finger lands at `clientX`. */
function press(ctx: Ctx, clientX: number): void {
  begin(ctx, clientX);
}

/** The finger moves to `clientX`: a lens it holds chases it. */
function drag(ctx: Ctx, clientX: number): void {
  ctx.motion.drag(clientX);
}

/** The finger lets go at `clientX`, on the segment the tracker resolves. */
function release(ctx: Ctx, clientX: number): string | null {
  return ctx.motion.release(targetAt(ctx, clientX));
}

/**
 * The component's styles, as a stylesheet: the selected segment paints the
 * raised surface, and each title's rendering follows its segment's state.
 * (A stylesheet and not inline styles: the controller hides and restores the
 * surface inline, exactly as it does over the real component's classes.)
 */
const STYLES = `
  [role="radio"] { border-top-left-radius: 6px; }
  [role="radio"][aria-checked="true"] {
    background-color: rgb(255, 255, 255);
    box-shadow: rgba(0, 0, 0, 0.1) 0px 1px 2px;
  }
  [role="radio"][aria-checked="false"] [data-astryx-segment-title] {
    color: rgb(110, 110, 110);
    font-weight: 500;
  }
  [role="radio"][aria-checked="true"] [data-astryx-segment-title] {
    color: rgb(10, 10, 10);
    font-weight: 600;
  }
  [role="radio"][aria-disabled="true"] [data-astryx-segment-title] {
    color: rgb(200, 200, 200);
  }
`;

/** What a selection does to the DOM: the checked state moves. */
function paint(segments: Record<string, HTMLElement>, selected: string) {
  for (const [value, segment] of Object.entries(segments)) {
    segment.setAttribute('aria-checked', String(value === selected));
  }
}

function select(ctx: ReturnType<typeof setup>, from: string, to: string): void {
  paint(ctx.segments, to);
  ctx.motion.select(ctx.track, from, to);
}

/** A segment's center in the track's padding-box coordinates. */
const centerOf = (value: string) =>
  SEGMENTS[value].left - TRACK.left + SEGMENTS[value].width / 2;

/** The lens carries this segment's surface: hidden on the segment, inline. */
function expectHidden(segment: HTMLElement): void {
  expect(segment.style.getPropertyValue('background-color')).toBe(
    'transparent',
  );
}

/** The segment paints its own surface again: nothing inline, the stylesheet's paint. */
/** No inline surface override is left on the segment. */
function expectNoOverride(segment: HTMLElement): void {
  expect(segment.style.getPropertyValue('background-color')).toBe('');
  expect(segment.style.getPropertyValue('background-image')).toBe('');
  expect(segment.style.getPropertyValue('box-shadow')).toBe('');
}

function expectOwnSurface(segment: HTMLElement): void {
  expect(segment.style.getPropertyValue('background-color')).toBe('');
  expect(segment.style.getPropertyValue('box-shadow')).toBe('');
  expect(getComputedStyle(segment).backgroundColor).toBe('rgb(255, 255, 255)');
}

beforeEach(() => {
  clock = 1000;
  reduceMotion = false;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

async function advance(ms: number): Promise<void> {
  clock += ms;
  await vi.advanceTimersByTimeAsync(ms);
}

describe('the motion roles (spec:AST-094 FR4)', () => {
  it('plays the slide through its internal segmented role', () => {
    setup('grid');
    expect(motionRoleOf(segmentedControl.selectionSpring)?.id).toBe(
      'segmented.selectionSpring',
    );
  });
});

describe('the selection slide', () => {
  it('paints the lens (the radiogroup’s ::before) with the selected surface and hides it on the segment: no element is added', () => {
    const ctx = setup('grid');
    const elements = ctx.track.querySelectorAll('*').length;
    select(ctx, 'grid', 'table');
    const {layer, segments} = ctx;
    expect(ctx.track.querySelectorAll('*').length).toBe(elements);
    expect(layer('lens', 'visibility')).toBe('visible');
    expect(layer('lens', 'background-color')).toBe('rgb(255, 255, 255)');
    expect(layer('lens', 'box-shadow')).toBe('rgba(0, 0, 0, 0.1) 0px 1px 2px');
    expect(layer('lens', 'border-top-left-radius')).toBe('6px');
    // Inline and with priority, so a theme's rule cannot paint a second one.
    expect(segments.table.style.getPropertyValue('background-color')).toBe(
      'transparent',
    );
    expect(segments.table.style.getPropertyPriority('background-color')).toBe(
      'important',
    );
    expect(segments.table.style.getPropertyValue('box-shadow')).toBe('none');
    // The lens is laid out on the destination's box.
    expect(layer('lens', 'left')).toBe('198px');
    expect(layer('lens', 'width')).toBe('106px');
    expect(layer('lens', 'height')).toBe('27px');
    expect(layer('lens', 'top')).toBe('2px');
  });

  it('hands the surface back to the segment when it lands', async () => {
    const ctx = setup('grid');
    select(ctx, 'grid', 'table');
    expect(ctx.motion.isSliding).toBe(true);
    await advance(400);
    expect(ctx.motion.isSliding).toBe(true);
    await advance(2000);
    expect(ctx.motion.isSliding).toBe(false);
    expect(ctx.layer('lens', 'visibility')).toBe('');
    expectOwnSurface(ctx.segments.table);
  });

  it('the hand-back restores a segment’s own inline surface (its `style`)', async () => {
    const ctx = setup('grid');
    const {table, list} = ctx.segments;
    table.style.setProperty('background-color', 'gold', 'important');
    table.style.setProperty('border-top-color', 'red');
    select(ctx, 'grid', 'table');
    // Hidden while the lens carries the surface...
    expect(table.style.getPropertyValue('background-color')).toBe(
      'transparent',
    );
    await advance(2400);
    expect(ctx.motion.isSliding).toBe(false);
    // ...then the segment's own declarations come back, priority included,
    // and nothing it did not have is left behind.
    expect(table.style.getPropertyValue('background-color')).toBe('gold');
    expect(table.style.getPropertyPriority('background-color')).toBe(
      'important',
    );
    expect(table.style.getPropertyValue('border-top-color')).toBe('red');
    expect(table.style.getPropertyPriority('border-top-color')).toBe('');
    expect(table.style.getPropertyValue('background-image')).toBe('');
    expect(table.style.getPropertyValue('box-shadow')).toBe('');
    // A segment the slide never hid keeps its inline surface too.
    list.style.setProperty('background-color', 'teal');
    select(ctx, 'table', 'grid');
    ctx.motion.settle();
    expect(list.style.getPropertyValue('background-color')).toBe('teal');
  });

  it('a change mid-flight starts from what is on screen and keeps its velocity', async () => {
    const ctx = setup('grid');
    select(ctx, 'grid', 'table');
    await advance(80);
    // The lens scales around its center: x is the center's offset from the
    // destination's center.
    const centerBefore = centerOf('table') + ctx.animator.get('x');
    const vBefore = ctx.animator.getVelocity('x');
    const widthBefore = ctx.animator.get('scaleX') * 106;
    expect(vBefore).toBeGreaterThan(500);
    select(ctx, 'table', 'list');
    // No jump and no lost velocity at the retarget.
    expect(centerOf('list') + ctx.animator.get('x')).toBeCloseTo(
      centerBefore,
      6,
    );
    expect(ctx.animator.getVelocity('x')).toBeCloseTo(vBefore, 3);
    expect(ctx.animator.get('scaleX') * 100).toBeCloseTo(widthBefore, 6);
    // The lens now carries the new destination's surface and size. The
    // abandoned destination paints nothing of its own until the lens lands:
    // its tap may still be fading, and that paint would cover the lens.
    expect(ctx.layer('lens', 'width')).toBe('100px');
    expect(ctx.segments.table.style.getPropertyValue('background-color')).toBe(
      'transparent',
    );
    expect(ctx.segments.table.style.getPropertyValue('background-image')).toBe(
      'none',
    );
    expect(ctx.segments.list.style.getPropertyValue('background-color')).toBe(
      'transparent',
    );
    await advance(3000);
    expect(ctx.animator.get('x')).toBe(0);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.list);
    expectNoOverride(ctx.segments.table);
  });

  it('a change back to the abandoned segment takes it as the destination again', async () => {
    const ctx = setup('grid');
    select(ctx, 'grid', 'table');
    await advance(80);
    select(ctx, 'table', 'list');
    await advance(40);
    select(ctx, 'list', 'table');
    expect(ctx.segments.table.style.getPropertyValue('background-color')).toBe(
      'transparent',
    );
    await advance(3000);
    expect(ctx.animator.get('x')).toBe(0);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.table);
    expectNoOverride(ctx.segments.list);
  });

  it('settle() hands the surface back at once (resize, unmount, presentation change)', () => {
    const ctx = setup('grid');
    select(ctx, 'grid', 'list');
    ctx.motion.settle();
    expect(ctx.motion.isSliding).toBe(false);
    expect(ctx.layer('lens', 'visibility')).toBe('');
    expectOwnSurface(ctx.segments.list);
  });

  it('stop() ends a slide and leaves the controller usable (StrictMode remounts)', () => {
    const ctx = setup('grid');
    select(ctx, 'grid', 'table');
    ctx.motion.stop();
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.table);
    // The next change still slides, on the same lens.
    select(ctx, 'table', 'list');
    expect(ctx.motion.isSliding).toBe(true);
    expect(ctx.layer('lens', 'visibility')).toBe('visible');
    expect(ctx.animator.get('x', clock)).toBeCloseTo(
      centerOf('table') - centerOf('list'),
      6,
    );
  });

  it('does not slide when nothing was selected, and settles when the selection clears', () => {
    const ctx = setup('none');
    select(ctx, 'none', 'list');
    expect(ctx.motion.isSliding).toBe(false);
    expect(ctx.layer('lens', 'visibility')).toBe('');
    select(ctx, 'list', 'grid');
    expect(ctx.motion.isSliding).toBe(true);
    select(ctx, 'grid', 'none');
    expect(ctx.motion.isSliding).toBe(false);
    expect(ctx.segments.grid.style.getPropertyValue('background-color')).toBe(
      '',
    );
  });

  it('does not slide a control that is not laid out', () => {
    const ctx = setup('grid');
    ctx.segments.table.getBoundingClientRect = () => rect(0, 0, 0, 0);
    select(ctx, 'grid', 'table');
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.table);
  });

  it('undoes an ancestor scale: boxes are measured in the track’s own pixels', () => {
    const ctx = setup('grid');
    // Rendered at 2x by a transformed ancestor: client rects double.
    ctx.track.getBoundingClientRect = () =>
      rect(TRACK.left, TRACK.top, TRACK.width * 2, TRACK.height * 2);
    for (const [value, geometry] of Object.entries(SEGMENTS)) {
      ctx.segments[value].getBoundingClientRect = () =>
        rect(
          TRACK.left + (geometry.left - TRACK.left) * 2,
          TRACK.top + 4,
          geometry.width * 2,
          54,
        );
    }
    select(ctx, 'grid', 'table');
    expect(ctx.layer('lens', 'width')).toBe('106px');
    expect(ctx.animator.get('x', 5000)).toBeCloseTo(0, 6);
  });

  it('Reduced Motion (design:reduced-motion): no travel, no scale; the old surface fades out where it is as the new one fades in, in 200 ms or less', async () => {
    reduceMotion = true;
    const ctx = setup('grid');
    const start = clock;
    select(ctx, 'grid', 'table');
    expect(ctx.layer('lens', 'width')).toBe('106px');
    expectHidden(ctx.segments.table);
    expectReducedMotionCrossFade(ctx, start, 'grid');
    await advance(1000);
    expect(isLeaving(ctx)).toBe(false);
    expect(ctx.motion.isSliding).toBe(false);
    expect(ctx.layer('lens', 'visibility')).toBe('');
    expectOwnSurface(ctx.segments.table);
  });

  it('Reduced Motion with any other pointer: a change completes at once, with no fade and no leaving surface (DR3)', () => {
    reduceMotion = true;
    const ctx = setup('grid', {coarse: false});
    select(ctx, 'grid', 'table');
    expect(isLeaving(ctx)).toBe(false);
    expect(ctx.animator.get('x')).toBe(0);
    expect(ctx.animator.get('opacity')).toBe(1);
    expect(ctx.animator.get('scaleX')).toBe(1);
  });

  it('Reduced Motion off again: the next change slides at full size and opacity', async () => {
    reduceMotion = true;
    const ctx = setup('grid');
    select(ctx, 'grid', 'table');
    await advance(50);
    // Turned off mid-fade: the next change travels, opaque and unscaled.
    reduceMotion = false;
    ctx.motion.settle();
    select(ctx, 'table', 'list');
    expect(ctx.animator.get('opacity')).toBe(1);
    expect(ctx.animator.get('scaleY')).toBe(1);
    await advance(3000);
    expect(ctx.animator.get('x')).toBe(0);
    expect(ctx.motion.isSliding).toBe(false);
  });
});

/**
 * Under Reduced Motion the ::after shows the surface that fades out where it
 * is: painted with a surface (the lifted lens's shadow has no fill).
 */
const isLeaving = (ctx: ReturnType<typeof setup>) =>
  ctx.layer('after', 'visibility') === 'visible' &&
  ctx.layer('after', 'background-color') !== '';

/** When `get` stops changing: the end of the fade, in ms after `start`. */
function endOf(get: (t: number) => number, start: number): number {
  const last = get(start + 5000);
  for (let t = 0; t <= 5000; t += 1) {
    if (Math.abs(get(start + t) - last) < 1e-6) {
      return t;
    }
  }
  return Infinity;
}

/**
 * The Reduce Motion cross-fade from `start` (design:reduced-motion DR1, DR2).
 * The lens fades in on its new segment, full size, and never moves. A copy of
 * the surface fades out where `leavingFrom` rests, on the same clock. It ends
 * in 200 ms or less.
 */
function expectReducedMotionCrossFade(
  ctx: ReturnType<typeof setup>,
  start: number,
  leavingFrom: string | {left: number; width: number},
): void {
  const leaving =
    typeof leavingFrom === 'string'
      ? {
          left: SEGMENTS[leavingFrom].left - TRACK.left,
          width: SEGMENTS[leavingFrom].width,
        }
      : leavingFrom;
  const entering = (t: number) => ctx.animator.get('opacity', t);
  const fadeIn = endOf(entering, start);
  expect(fadeIn).toBeGreaterThan(0);
  expect(fadeIn).toBeLessThanOrEqual(200);
  expect(entering(start)).toBeCloseTo(0, 6);
  expect(entering(start + fadeIn)).toBeCloseTo(1, 6);
  for (let t = 0; t <= fadeIn; t += 10) {
    expect(ctx.animator.get('x', start + t)).toBe(0);
    expect(ctx.animator.get('scaleX', start + t)).toBe(1);
    expect(ctx.animator.get('scaleY', start + t)).toBe(1);
  }
  // The ::after, painted with the selected surface where it rested; no
  // element is added for it.
  expect(isLeaving(ctx)).toBe(true);
  expect(ctx.layer('after', 'background-color')).toBe('rgb(255, 255, 255)');
  expect(ctx.layer('after', 'left')).toBe(`${leaving.left}px`);
  expect(ctx.layer('after', 'width')).toBe(`${leaving.width}px`);
  expect(ctx.track.querySelectorAll('*').length).toBe(6);
  const leavingOpacity = (t: number) => ctx.leavingAnimator.get('opacity', t);
  expect(leavingOpacity(start)).toBeCloseTo(1, 6);
  expect(endOf(leavingOpacity, start)).toBe(fadeIn);
  for (let t = 0; t < fadeIn; t += 10) {
    expect(ctx.leavingAnimator.get('x', start + t)).toBe(0);
    expect(entering(start + t) + leavingOpacity(start + t)).toBeCloseTo(1, 6);
  }
}

/** Client x of a segment's center (the track starts at client x 10). */
const clientCenterOf = (value: string) =>
  SEGMENTS[value].left + SEGMENTS[value].width / 2;

/** One step of the style traffic `recordStyleTraffic` records. */
type StyleEvent =
  | {kind: 'take'; style: CSSStyleDeclaration}
  | {kind: 'read'; style: CSSStyleDeclaration}
  | {kind: 'write'};

describe('style reads at a change', () => {
  /**
   * Records, in order, each computed-style declaration taken, every value
   * read from one, and every write to the track's inline style. A read from
   * a declaration after a write to the track since it was taken makes the
   * browser recompute style for it (a forced restyle).
   */
  function recordStyleTraffic(track: HTMLElement) {
    const events: StyleEvent[] = [];
    const realGetComputedStyle = window.getComputedStyle.bind(window);
    vi.stubGlobal(
      'getComputedStyle',
      (
        element: Element,
        pseudoElement?: string | null,
      ): CSSStyleDeclaration => {
        const style = realGetComputedStyle(element, pseudoElement);
        events.push({kind: 'take', style});
        const readValue = (name: string): string => {
          events.push({kind: 'read', style});
          return style.getPropertyValue(name);
        };
        return new Proxy(style, {
          // `getPropertyValue` and a property (`style.opacity`) both read.
          get(target, key): string | ((name: string) => string) | undefined {
            if (key === 'getPropertyValue') {
              return readValue;
            }
            if (typeof key !== 'string') {
              return undefined;
            }
            events.push({kind: 'read', style: target});
            const value = Reflect.get(target, key, target) as unknown;
            return typeof value === 'string' ? value : undefined;
          },
        });
      },
    );
    const setProperty = track.style.setProperty.bind(track.style);
    track.style.setProperty = (
      name: string,
      value: string | null,
      priority?: string,
    ) => {
      events.push({kind: 'write'});
      setProperty(name, value, priority);
    };
    /** Reads that follow a track write made after their declaration was taken. */
    return () => {
      const takenAt = new Map<CSSStyleDeclaration, number>();
      let reads = 0;
      let forced = 0;
      events.forEach((event, index) => {
        if (event.kind === 'take') {
          takenAt.set(event.style, index);
        } else if (event.kind === 'read') {
          reads += 1;
          const from = takenAt.get(event.style) ?? 0;
          if (events.slice(from, index).some(e => e.kind === 'write')) {
            forced += 1;
          }
        }
      });
      return {reads, forced};
    };
  }

  it('reads a segment’s whole surface before writing any of it to the track: no read follows a write, so a change restyles once, not once per property', () => {
    reduceMotion = true;
    const ctx = setup('grid');
    const traffic = recordStyleTraffic(ctx.track);
    // Under Reduce Motion a change paints both layers: the lens and the
    // surface leaving.
    select(ctx, 'grid', 'table');
    const {reads, forced} = traffic();
    expect(reads).toBeGreaterThan(0);
    expect(forced).toBe(0);
    expect(ctx.layer('lens', 'background-color')).toBe('rgb(255, 255, 255)');
    expect(ctx.layer('after', 'background-color')).toBe('rgb(255, 255, 255)');
  });

  it('a finger’s drag and its lift read before they write: no read follows a write, with or without Reduce Motion', () => {
    for (const reduced of [false, true]) {
      reduceMotion = reduced;
      const ctx = setup('grid');
      const traffic = recordStyleTraffic(ctx.track);
      press(ctx, clientCenterOf('grid'));
      drag(ctx, clientCenterOf('list'));
      drag(ctx, clientCenterOf('table'));
      expect(release(ctx, clientCenterOf('table'))).toBe('table');
      select(ctx, 'grid', 'table');
      const {reads, forced} = traffic();
      expect(reads).toBeGreaterThan(0);
      expect({reduced, forced}).toEqual({reduced, forced: 0});
      vi.unstubAllGlobals();
      document.body.innerHTML = '';
      document.head.innerHTML = '';
    }
  });
});

describe('under a finger', () => {
  it('landing on the selected segment lifts nothing by default (the pressed-thumb lift is a theme’s): the lens and the ::after stay hidden', async () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('grid'));
    await advance(600);
    expect(ctx.motion.isSliding).toBe(false);
    expect(ctx.layer('lens', 'visibility')).toBe('');
    expect(ctx.layer('after', 'visibility')).toBe('');
    expectOwnSurface(ctx.segments.grid);
  });

  it('a drag holds the lens at its resting size until the finger lets go, then it settles back and hands back', async () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('grid'));
    drag(ctx, clientCenterOf('grid') + 10);
    await advance(2000);
    expect(ctx.motion.isSliding).toBe(true);
    expect(ctx.animator.get('scaleX')).toBeCloseTo(1, 6);
    expect(ctx.animator.get('scaleY')).toBeCloseTo(1, 6);
    expect(release(ctx, clientCenterOf('grid'))).toBeNull();
    await advance(2000);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.grid);
  });

  it('landing on another segment leaves the lens alone', () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('table'));
    drag(ctx, clientCenterOf('list'));
    expect(ctx.motion.isSliding).toBe(false);
    expect(ctx.layer('lens', 'visibility')).toBe('');
  });

  it('a commit that is not adopted (vetoed, or kept by the parent) sends the lens back, and the next change to that value still slides', async () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('table'));
    expect(release(ctx, clientCenterOf('table'))).toBe('table');
    // The commit's click ran (nobody vetoed it); the value has not come back.
    ctx.motion.clicked(ctx.track, 'table', false);
    await Promise.resolve();
    await advance(60);
    expect(ctx.motion.isSliding).toBe(true);
    // Grid stays selected.
    ctx.motion.decline(ctx.track, 'table');
    await advance(3000);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.grid);
    // A later change to Table slides from Grid: the declined commit is gone.
    select(ctx, 'grid', 'table');
    expect(ctx.motion.isSliding).toBe(true);
    expect(ctx.layer('lens', 'visibility')).toBe('visible');
    expect(ctx.animator.get('x', clock)).toBeCloseTo(
      centerOf('grid') - centerOf('table'),
      6,
    );
  });

  it('a click the item vetoes sends the lens back at once', async () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('table'));
    expect(release(ctx, clientCenterOf('table'))).toBe('table');
    await advance(60);
    ctx.motion.clicked(ctx.track, 'table', true);
    // Bound for Grid again, from where it is.
    await advance(3000);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.grid);
    expectNoOverride(ctx.segments.table);
  });

  it('a parent that adopts the value 200 ms later: no bounce, the lens keeps going and lands there', async () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('table'));
    expect(release(ctx, clientCenterOf('table'))).toBe('table');
    // The click was not vetoed; the value has not come back yet (the lens
    // sets off once the click's event is over).
    ctx.motion.clicked(ctx.track, 'table', false);
    await Promise.resolve();
    // Every frame until the parent adopts it heads for Table, never back.
    let center = centerOf('table') + ctx.animator.get('x');
    for (let t = 0; t < 200; t += 16) {
      await advance(16);
      const next = centerOf('table') + ctx.animator.get('x');
      expect(next).toBeGreaterThanOrEqual(center - 1e-6);
      center = next;
    }
    select(ctx, 'grid', 'table');
    await advance(3000);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.table);
    expectNoOverride(ctx.segments.grid);
  });

  it('a value that never comes back: the lens goes back once its slide settles, the bound being the slide itself', async () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('table'));
    release(ctx, clientCenterOf('table'));
    ctx.motion.clicked(ctx.track, 'table', false);
    await Promise.resolve();
    // Mid-slide it still waits.
    await advance(300);
    expect(centerOf('table') + ctx.animator.get('x')).toBeGreaterThan(
      centerOf('list'),
    );
    await advance(6000);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.grid);
    expectNoOverride(ctx.segments.table);
  });

  it('the commit re-aims the lens at the destination’s box as it is once the new value shows (the titles’ weights move the segments)', async () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('table'));
    expect(release(ctx, clientCenterOf('table'))).toBe('table');
    // The commit's titles take their new weights: Table grows 4 px.
    ctx.segments.table.getBoundingClientRect = () =>
      rect(206, TRACK.top + 2, 110, 27);
    select(ctx, 'grid', 'table');
    expect(ctx.layer('lens', 'width')).toBe('110px');
    expect(ctx.layer('lens', 'left')).toBe('196px');
    await advance(3000);
    expect(ctx.animator.get('x')).toBe(0);
    expect(ctx.animator.get('scaleX')).toBe(1);
    expect(ctx.motion.isSliding).toBe(false);
  });

  it('a resize while a finger holds the lens (the selected face reflows the titles) keeps it held', async () => {
    const ctx = setup('grid');
    let width = TRACK.width;
    Object.defineProperty(ctx.track, 'offsetWidth', {get: () => width});
    press(ctx, clientCenterOf('grid'));
    drag(ctx, clientCenterOf('list'));
    width += 3;
    ctx.motion.resized(ctx.track);
    expect(ctx.motion.isSliding).toBe(true);
    await advance(1000);
    expect(ctx.motion.isSliding).toBe(true);
  });

  it('a drag carries the lens on the shared finger-tracking role, no further than 11 pt past the end segments', async () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('grid'));
    drag(ctx, clientCenterOf('list'));
    const chase = solveSpring(toSpring(springs.fingerTracking), {
      from: 0,
      to: centerOf('list') - centerOf('grid'),
      velocity: 0,
    });
    expect(ctx.animator.get('x', 1050)).toBeCloseTo(chase.value(0.05), 6);
    await advance(1000);
    expect(ctx.animator.get('x')).toBeCloseTo(
      centerOf('list') - centerOf('grid'),
      6,
    );
    // Far past the last segment: clamped.
    drag(ctx, 500);
    await advance(1000);
    expect(ctx.animator.get('x')).toBeCloseTo(
      centerOf('table') + segmentedControl.dragOvershoot - centerOf('grid'),
      6,
    );
    // At its resting size throughout: nothing lifts it.
    expect(ctx.animator.get('scaleX')).toBeCloseTo(1, 6);
    expect(ctx.animator.get('scaleY')).toBeCloseTo(1, 6);
  });

  it('letting go commits the segment nearest the finger: 40 % of the way stays, 60 % moves', async () => {
    const forty = setup('grid');
    const at = (p: number) =>
      clientCenterOf('grid') +
      (clientCenterOf('list') - clientCenterOf('grid')) * p;
    press(forty, clientCenterOf('grid'));
    drag(forty, at(0.4));
    await advance(500);
    expect(release(forty, at(0.4))).toBeNull();
    await advance(3000);
    expect(forty.animator.get('x')).toBe(0);
    expect(forty.motion.isSliding).toBe(false);
    expectOwnSurface(forty.segments.grid);
    document.body.innerHTML = '';
    document.head.innerHTML = '';

    const sixty = setup('grid');
    press(sixty, clientCenterOf('grid'));
    drag(sixty, at(0.6));
    await advance(500);
    const centerAtLift = centerOf('grid') + sixty.animator.get('x');
    expect(release(sixty, at(0.6))).toBe('list');
    // Until the new value comes back, the old selection's paint is carried.
    expectHidden(sixty.segments.grid);
    // The commit shows List synchronously, through the segment's click. The
    // lens re-bases onto List without a jump. Then it springs there on the
    // slide spring and comes down on the lift spring, painted by List.
    select(sixty, 'grid', 'list');
    expect(centerOf('list') + sixty.animator.get('x')).toBeCloseTo(
      centerAtLift,
      6,
    );
    expect(sixty.layer('lens', 'width')).toBe('100px');
    expectHidden(sixty.segments.list);
    expect(sixty.segments.grid.style.getPropertyValue('background-color')).toBe(
      '',
    );
    await advance(3000);
    expect(sixty.animator.get('x')).toBe(0);
    expect(sixty.animator.get('scaleX')).toBe(1);
    expect(sixty.motion.isSliding).toBe(false);
    expectOwnSurface(sixty.segments.list);
  });

  it('a tap on another segment slides there on the slide spring, at its resting size', async () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('table'));
    expect(release(ctx, clientCenterOf('table'))).toBe('table');
    select(ctx, 'grid', 'table');
    const travel = solveSpring(toSpring(segmentedControl.selectionSpring), {
      from: centerOf('grid') - centerOf('table'),
      to: 0,
      velocity: 0,
    });
    expect(ctx.animator.get('x', 1100)).toBeCloseTo(travel.value(0.1), 6);
    // Nothing lifts it on the way: Grid's width grows to Table's on the
    // same spring, and no further.
    for (let t = 0; t <= 800; t += 20) {
      expect(ctx.animator.get('scaleY', 1000 + t)).toBeCloseTo(1, 6);
      expect(ctx.animator.get('scaleX', 1000 + t)).toBeLessThan(1.02);
    }
    await advance(2000);
    expect(ctx.animator.get('scaleX')).toBe(1);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.table);
  });

  it('a cancelled touch puts the lens back', async () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('grid'));
    drag(ctx, clientCenterOf('table'));
    await advance(200);
    ctx.motion.cancel();
    await advance(3000);
    expect(ctx.animator.get('x')).toBe(0);
    expect(ctx.animator.get('scaleX')).toBe(1);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.grid);
  });

  it('the lens is bound only once a drag from the selected segment moves it', async () => {
    const ctx = setup('grid');
    begin(ctx, clientCenterOf('grid'));
    expect(ctx.motion.isSliding).toBe(false);
    drag(ctx, clientCenterOf('list'));
    expect(ctx.motion.isSliding).toBe(true);
    await advance(1000);
    expect(ctx.animator.get('scaleX')).toBeCloseTo(1, 6);
    expect(ctx.layer('after', 'visibility')).toBe('');
    expect(release(ctx, clientCenterOf('list'))).toBe('list');
  });

  it('a press cancelled before it drags leaves everything as it was', () => {
    const ctx = setup('grid');
    begin(ctx, clientCenterOf('grid'));
    ctx.motion.cancel();
    expect(ctx.motion.isSliding).toBe(false);
    drag(ctx, clientCenterOf('list'));
    expect(ctx.motion.isSliding).toBe(false);
  });

  it('never commits a disabled segment', () => {
    const ctx = setup('grid');
    ctx.segments.table.setAttribute('aria-disabled', 'true');
    press(ctx, clientCenterOf('table'));
    expect(release(ctx, clientCenterOf('table'))).toBeNull();
  });

  it('Reduced Motion: the lens still follows the finger, as direct movement, with no lift or chase; the lift commits and the selection cross-fades there, on any pointer (a touch release, DR2)', async () => {
    reduceMotion = true;
    // A fine primary pointer: the touch release still fades.
    const ctx = setup('grid', {coarse: false});
    press(ctx, clientCenterOf('grid'));
    expect(ctx.motion.isSliding).toBe(false);
    // The lens is where the finger is, at once: no spring chases it.
    drag(ctx, clientCenterOf('list'));
    expect(ctx.motion.isSliding).toBe(true);
    expect(ctx.animator.get('x')).toBeCloseTo(
      centerOf('list') - centerOf('grid'),
      6,
    );
    drag(ctx, clientCenterOf('table'));
    expect(ctx.animator.get('x')).toBeCloseTo(
      centerOf('table') - centerOf('grid'),
      6,
    );
    expect(ctx.animator.get('scaleX')).toBe(1);
    expectHidden(ctx.segments.grid);
    // The segment under the finger at the lift is committed...
    const start = clock;
    expect(release(ctx, clientCenterOf('table'))).toBe('table');
    select(ctx, 'grid', 'table');
    // ...and the selection cross-fades there, from where the lens was.
    expect(ctx.layer('lens', 'width')).toBe('106px');
    expectReducedMotionCrossFade(ctx, start, {
      left: centerOf('table') - SEGMENTS.grid.width / 2,
      width: SEGMENTS.grid.width,
    });
    expectHidden(ctx.segments.table);
    await advance(1000);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.table);
  });

  it('Reduced Motion: a hold and a lift on the selected segment change nothing', () => {
    reduceMotion = true;
    const ctx = setup('grid');
    press(ctx, clientCenterOf('grid'));
    expect(release(ctx, clientCenterOf('grid'))).toBeNull();
    expect(ctx.motion.isSliding).toBe(false);
  });
});

describe('under a mouse or a pen (spec:AST-094 FR43)', () => {
  /**
   * A fine primary pointer: the touch presentation is off (a change keeps the
   * theme's transition), and press tracking is on, as for every pointer.
   */
  function setupFine(selected: string) {
    const ctx = setup(selected, {coarse: false});
    ctx.motion.present(false);
    return ctx;
  }

  /** A theme's segment transition: 200 ms, linear. */
  function themeTiming(ctx: ReturnType<typeof setup>): void {
    for (const segment of Object.values(ctx.segments)) {
      segment.style.setProperty('transition-duration', '200ms');
      segment.style.setProperty('transition-timing-function', 'linear');
    }
  }

  /**
   * The lens slides from `from`'s box to `to`'s on the theme's 200 ms linear
   * timing, with the segments' own transitions off, then hands back.
   */
  async function expectThemedSlide(
    ctx: ReturnType<typeof setup>,
    from: string,
    to: string,
  ): Promise<void> {
    const start = centerOf(from) - centerOf(to);
    expect(ctx.motion.isSliding).toBe(true);
    expect(ctx.animator.get('x')).toBeCloseTo(start, 6);
    expectHidden(ctx.segments[to]);
    for (const segment of Object.values(ctx.segments)) {
      expect(segment.style.getPropertyValue('transition-property')).toBe(
        'none',
      );
    }
    await advance(100);
    const halfway = ctx.animator.get('x');
    expect(Math.abs(halfway)).toBeGreaterThan(0);
    expect(Math.abs(halfway)).toBeLessThan(Math.abs(start));
    await advance(3000);
    expect(ctx.animator.get('x')).toBeCloseTo(0, 6);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments[to]);
  }

  it('a change from a key or a new value slides the lens on the theme’s duration and easing, as every change does, then hands the surface back', async () => {
    const ctx = setupFine('grid');
    themeTiming(ctx);
    select(ctx, 'grid', 'table');
    await expectThemedSlide(ctx, 'grid', 'table');
  });

  it('a click on another segment slides the lens there from the selection, on the theme’s timing, once its click commits', async () => {
    const ctx = setupFine('grid');
    themeTiming(ctx);
    press(ctx, clientCenterOf('table'));
    expect(ctx.motion.isSliding).toBe(false);
    expect(release(ctx, clientCenterOf('table'))).toBe('table');
    ctx.motion.clicked(ctx.track, 'table', false);
    await Promise.resolve();
    select(ctx, 'grid', 'table');
    await expectThemedSlide(ctx, 'grid', 'table');
  });

  it('a drag from the selected segment carries the lens on the pointer itself, written at each move, at its resting size and no further than 11 pt past the end segments', () => {
    const ctx = setupFine('grid');
    press(ctx, clientCenterOf('grid'));
    drag(ctx, clientCenterOf('list'));
    expect(ctx.motion.isSliding).toBe(true);
    // Where the pointer is, at once: a pointer that holds the lens times it.
    expect(ctx.animator.get('x')).toBeCloseTo(
      centerOf('list') - centerOf('grid'),
      6,
    );
    expect(ctx.animator.get('scaleX')).toBeCloseTo(1, 6);
    expect(ctx.animator.get('scaleY')).toBeCloseTo(1, 6);
    drag(ctx, 500);
    expect(ctx.animator.get('x')).toBeCloseTo(
      centerOf('table') + segmentedControl.dragOvershoot - centerOf('grid'),
      6,
    );
  });

  it('the lift commits the segment nearest the pointer; the lens settles there on the theme’s duration and easing, read from the segment’s own transition, and hands back', async () => {
    const ctx = setupFine('grid');
    for (const segment of Object.values(ctx.segments)) {
      segment.style.setProperty('transition-duration', '175ms');
      segment.style.setProperty(
        'transition-timing-function',
        'cubic-bezier(0.24, 1, 0.4, 1)',
      );
    }
    press(ctx, clientCenterOf('grid'));
    drag(ctx, clientCenterOf('table') - 5);
    expect(release(ctx, clientCenterOf('table') - 5)).toBe('table');
    ctx.motion.clicked(ctx.track, 'table', false);
    await Promise.resolve();
    select(ctx, 'grid', 'table');
    const ease = cubicBezier([0.24, 1, 0.4, 1]);
    expect(ctx.animator.get('x', 1100)).toBeCloseTo(
      -5 + 5 * ease(100 / 175),
      4,
    );
    expect(ctx.animator.get('x', 1175)).toBeCloseTo(0, 6);
    await advance(3000);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.table);
  });

  it('under a fine pointer the settle follows a theme’s own duration and easing', async () => {
    const slow = setupFine('grid');
    for (const segment of Object.values(slow.segments)) {
      segment.style.setProperty('transition-duration', '0.4s, 0.4s');
      segment.style.setProperty('transition-timing-function', 'linear, ease');
    }
    press(slow, clientCenterOf('grid'));
    drag(slow, clientCenterOf('table') - 8);
    expect(release(slow, clientCenterOf('table') - 8)).toBe('table');
    slow.motion.clicked(slow.track, 'table', false);
    await Promise.resolve();
    select(slow, 'grid', 'table');
    expect(slow.animator.get('x', 1200)).toBeCloseTo(-4, 4);
    await advance(3000);
    expect(slow.motion.isSliding).toBe(false);
  });

  it('under a fine pointer a theme with no segment transition lands the lens at once', async () => {
    const none = setupFine('grid');
    for (const segment of Object.values(none.segments)) {
      segment.style.setProperty('transition-duration', '0s');
    }
    press(none, clientCenterOf('grid'));
    drag(none, clientCenterOf('table') - 8);
    expect(release(none, clientCenterOf('table') - 8)).toBe('table');
    none.motion.clicked(none.track, 'table', false);
    await Promise.resolve();
    select(none, 'grid', 'table');
    expect(none.animator.get('x', 1002)).toBeCloseTo(0, 6);
  });

  it('a drag that starts on another segment carries nothing; the lift commits there, and the selection slides there on the theme’s timing', async () => {
    const ctx = setupFine('grid');
    themeTiming(ctx);
    press(ctx, clientCenterOf('list'));
    drag(ctx, clientCenterOf('table'));
    expect(ctx.motion.isSliding).toBe(false);
    expect(release(ctx, clientCenterOf('table'))).toBe('table');
    ctx.motion.clicked(ctx.track, 'table', false);
    await Promise.resolve();
    select(ctx, 'grid', 'table');
    await expectThemedSlide(ctx, 'grid', 'table');
  });

  it('while the lens is carried the segments’ own transitions are off, so the surface it borrows neither fades out nor back in; they come back once it has handed back', async () => {
    const ctx = setupFine('grid');
    ctx.segments.list.style.setProperty('transition-property', 'color');
    press(ctx, clientCenterOf('grid'));
    drag(ctx, clientCenterOf('list'));
    for (const segment of Object.values(ctx.segments)) {
      expect(segment.style.getPropertyValue('transition-property')).toBe(
        'none',
      );
    }
    expect(release(ctx, clientCenterOf('grid'))).toBeNull();
    await advance(3000);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.grid);
    // Each segment's own inline value is back.
    expect(
      ctx.segments.grid.style.getPropertyValue('transition-property'),
    ).toBe('');
    expect(
      ctx.segments.list.style.getPropertyValue('transition-property'),
    ).toBe('color');
  });

  it('Reduced Motion: a mouse drag still carries the lens on the pointer, and its release lands it at once, with no fade (DR3)', async () => {
    reduceMotion = true;
    const ctx = setupFine('grid');
    begin(ctx, clientCenterOf('grid'), false);
    drag(ctx, clientCenterOf('table'));
    expect(ctx.motion.isSliding).toBe(true);
    expect(ctx.animator.get('x')).toBeCloseTo(
      centerOf('table') - centerOf('grid'),
      6,
    );
    const start = clock;
    expect(release(ctx, clientCenterOf('table'))).toBe('table');
    ctx.motion.clicked(ctx.track, 'table', false);
    await Promise.resolve();
    select(ctx, 'grid', 'table');
    // No fade: no leaving surface, and the lens is at rest and opaque.
    expect(isLeaving(ctx)).toBe(false);
    expect(ctx.animator.get('opacity', start)).toBeCloseTo(1, 6);
    expect(ctx.animator.get('x', start)).toBeCloseTo(0, 6);
    await advance(3000);
    expect(ctx.motion.isSliding).toBe(false);
    expectOwnSurface(ctx.segments.table);
  });

  it('Reduced Motion: a click and a key change move no lens; the theme’s transition shows them', async () => {
    reduceMotion = true;
    const ctx = setupFine('grid');
    themeTiming(ctx);
    press(ctx, clientCenterOf('table'));
    expect(release(ctx, clientCenterOf('table'))).toBe('table');
    ctx.motion.clicked(ctx.track, 'table', false);
    await Promise.resolve();
    select(ctx, 'grid', 'table');
    expect(ctx.motion.isSliding).toBe(false);
    expect(ctx.layer('lens', 'visibility')).toBe('');
    expectNoOverride(ctx.segments.table);
    select(ctx, 'table', 'list');
    expect(ctx.motion.isSliding).toBe(false);
    expect(ctx.layer('lens', 'visibility')).toBe('');
  });

  it('back under a finger (a touchscreen laptop flips its primary pointer), changes slide again', () => {
    const ctx = setupFine('grid');
    ctx.motion.present(true);
    select(ctx, 'grid', 'table');
    expect(ctx.motion.isSliding).toBe(true);
  });
});

describe('the titles under a finger', () => {
  interface Recorded {
    element: HTMLElement;
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
    cancel: ReturnType<typeof vi.fn>;
  }
  let recorded: Recorded[] = [];
  const realAnimate = HTMLElement.prototype.animate;

  beforeEach(() => {
    recorded = [];
    HTMLElement.prototype.animate = function (
      this: HTMLElement,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const finished = new Promise<void>(() => {});
      const cancel = vi.fn();
      if (this.getAttribute('role') !== 'radio') {
        return {finished, cancel, startTime: null} as unknown as Animation;
      }
      recorded.push({
        element: this,
        keyframes: keyframes as Keyframe[],
        options: options as KeyframeAnimationOptions,
        cancel,
      });
      return {finished, cancel} as unknown as Animation;
    };
  });

  afterEach(() => {
    HTMLElement.prototype.animate = realAnimate;
  });

  const titleOf = (segment: HTMLElement): HTMLElement => {
    const title = segment.querySelector<HTMLElement>(
      '[data-astryx-segment-title]',
    );
    if (title == null) {
      throw new Error('no title');
    }
    return title;
  };
  // Any fade the controller plays on a segment (none: a press shows the
  // shared overlay, and nothing dims).
  const fadesOf = (segment: HTMLElement) =>
    recorded.filter(r => r.element === segment);
  const faceOf = (segment: HTMLElement) => ({
    weight: titleOf(segment).style.fontWeight,
    color: titleOf(segment).style.color,
  });
  const NO_FACE = {weight: '', color: ''};

  it('a finger on an unselected segment dims nothing: no pressed state and no fade on it; the lens stays', () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('list'));
    drag(ctx, clientCenterOf('table'));
    for (const segment of Object.values(ctx.segments)) {
      expect(segment.hasAttribute('data-pressed')).toBe(false);
      expect(fadesOf(segment)).toEqual([]);
    }
    expect(ctx.motion.isSliding).toBe(false);
  });

  it('a tap on the selected segment dims nothing', () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('grid'));
    expect(release(ctx, clientCenterOf('grid'))).toBeNull();
    expect(recorded).toHaveLength(0);
  });

  it('during a lifted drag the selected face follows the lens, as a colour only (no weight swap mid-drag)', async () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('grid'));
    drag(ctx, clientCenterOf('list'));
    // The lens lags the finger: the face waits for it.
    expect(faceOf(ctx.segments.list)).toEqual(NO_FACE);
    await advance(400);
    expect(faceOf(ctx.segments.list)).toEqual({
      weight: '',
      color: 'rgb(10, 10, 10)',
    });
    expect(faceOf(ctx.segments.grid)).toEqual({
      weight: '',
      color: 'rgb(110, 110, 110)',
    });
    expect(faceOf(ctx.segments.table)).toEqual(NO_FACE);
    expect(recorded).toHaveLength(0);
    drag(ctx, clientCenterOf('table'));
    await advance(400);
    expect(faceOf(ctx.segments.table).color).toBe('rgb(10, 10, 10)');
    expect(faceOf(ctx.segments.list)).toEqual(NO_FACE);
    // The lift commits; the selection's own styles take over in its commit.
    expect(release(ctx, clientCenterOf('table'))).toBe('table');
    select(ctx, 'grid', 'table');
    for (const segment of Object.values(ctx.segments)) {
      expect(faceOf(segment)).toEqual(NO_FACE);
    }
    expect(recorded).toHaveLength(0);
  });

  it('the segment a lifted drag leaves wears an enabled segment’s unselected face, never a disabled one’s', async () => {
    const ctx = setup('list');
    // The first segment in DOM order is disabled: its title has its own colour.
    ctx.segments.grid.setAttribute('aria-disabled', 'true');
    press(ctx, clientCenterOf('list'));
    drag(ctx, clientCenterOf('table'));
    await advance(400);
    expect(faceOf(ctx.segments.table).color).toBe('rgb(10, 10, 10)');
    expect(faceOf(ctx.segments.list)).toEqual({
      weight: '',
      color: 'rgb(110, 110, 110)',
    });
  });

  it('the face crosses a boundary only once the lens is a quarter segment past it, so a ±3 px dither changes it at most once', async () => {
    const ctx = setup('grid');
    const faced = () =>
      Object.entries(ctx.segments).find(
        ([, segment]) => faceOf(segment).color === 'rgb(10, 10, 10)',
      )?.[0] ?? 'grid';
    press(ctx, clientCenterOf('grid'));
    // Grid | List boundary at x 108; List is 100 px wide: 25 px of hysteresis.
    drag(ctx, 108 + 20);
    await advance(400);
    expect(faced()).toBe('grid');
    drag(ctx, 108 + 30);
    await advance(400);
    expect(faced()).toBe('list');
    // A slow dither of ±3 px around the boundary, the lens following it.
    const seen = [faced()];
    for (let i = 0; i < 24; i++) {
      drag(ctx, 108 + (i % 2 === 0 ? 3 : -3));
      await advance(50);
      if (faced() !== seen.at(-1)) {
        seen.push(faced());
      }
    }
    expect(seen.length - 1).toBeLessThanOrEqual(1);
  });

  it('a lifted drag back onto the selected segment, or a cancel, puts the faces back', () => {
    const ctx = setup('grid');
    press(ctx, clientCenterOf('grid'));
    drag(ctx, clientCenterOf('table'));
    drag(ctx, clientCenterOf('grid'));
    expect(faceOf(ctx.segments.table)).toEqual(NO_FACE);
    expect(faceOf(ctx.segments.grid)).toEqual(NO_FACE);
    drag(ctx, clientCenterOf('list'));
    ctx.motion.cancel();
    expect(faceOf(ctx.segments.list)).toEqual(NO_FACE);
    expect(faceOf(ctx.segments.grid)).toEqual(NO_FACE);
    press(ctx, clientCenterOf('grid'));
    drag(ctx, clientCenterOf('table'));
    expect(release(ctx, clientCenterOf('grid'))).toBeNull();
    expect(faceOf(ctx.segments.table)).toEqual(NO_FACE);
    expect(faceOf(ctx.segments.grid)).toEqual(NO_FACE);
  });

  it('a programmatic or keyboard change animates no title: the titles switch at once', () => {
    const ctx = setup('grid');
    select(ctx, 'grid', 'table');
    expect(recorded).toHaveLength(0);
  });
});
