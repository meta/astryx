// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file usePager.test.ts
 * @input vitest (jsdom), the gesture host on a manual clock, the animator on
 *   an injected clock with a recording Web Animations stub, and synthetic
 *   touches at explicit timestamps
 * @output Proves the pager's behaviour: 1:1 tracking with no layout read, the
 *   rubber band at the ends, UIKit's measured page choice (`pageForRelease`)
 *   and settle at the lift, the
 *   catch, goTo cancelling a drag, loop, RTL, axis lock, shouldBeginPan,
 *   resize and the callbacks' timing
 * @position Testing; the browser proofs are
 *   __tests__/usePager.interaction.browser.spec.ts
 */

import {act, render} from '@testing-library/react';
import {createElement, useRef, useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {GestureHost} from '../gestures/GestureHost';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {ManualClock} from '../gestures/__tests__/harness';
import {createAnimator, type Animator} from '../motion/animator';
import {solveAnimatedPageScroll, solvePaging} from '../motion/paging';
import type * as motionResolution from '../motion/resolveMotion';
import {resolveMotion} from '../motion/resolveMotion';
import {rubberBand} from '../motion/rubberBand';
import {paging} from '../motion/uikit/paging';
import {
  createPager,
  pageForRelease,
  usePager,
  type Pager,
  type PagerOptions,
} from './usePager';

const WIDTH = 400;

// resolveMotion as shipped, observable: a test can stand in other values for
// the roles a motion reads (spec:AST-094 FR4).
vi.mock('../motion/resolveMotion', async importOriginal => {
  const actual = await importOriginal<typeof motionResolution>();
  return {...actual, resolveMotion: vi.fn(actual.resolveMotion)};
});

// --- A recording Web Animations stub (pending until a frame commits). ------

interface Recorded {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  startTime: number | null;
  cancelled: boolean;
  playState: string;
  ready: Promise<unknown>;
  cancel(): void;
  commit(at: number): void;
}

let now = 1000;
let recorded: Recorded[] = [];
let frameQueue: (() => void)[] = [];

beforeEach(() => {
  now = 1000;
  recorded = [];
  frameQueue = [];
  vi.useFakeTimers();
  // A phone: a coarse primary pointer, which the gesture host reads when it
  // first attaches. Gestures attach for every pointer (spec:AST-094 FR19,
  // FR43); where the pointer is fine, an element keeps one passive
  // `pointerdown` listener and the page's listeners last only a press (FR24).
  stubMedia(false, true);
  HTMLElement.prototype.animate = function (keyframes, options) {
    let resolveReady: (value: unknown) => void = () => {};
    let rejectReady: (error: Error) => void = () => {};
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    ready.catch(() => {});
    let start: number | null = null;
    const animation: Recorded = {
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      get startTime() {
        return start;
      },
      set startTime(value) {
        start = value;
        resolveReady(animation);
      },
      cancelled: false,
      get playState() {
        return this.cancelled ? 'idle' : 'running';
      },
      ready,
      cancel() {
        this.cancelled = true;
        rejectReady(new Error('AbortError'));
      },
      commit(at) {
        if (!this.cancelled && start == null) {
          start = at;
        }
        resolveReady(this);
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
  document.body.innerHTML = '';
});

/**
 * The person's settings, through `matchMedia` as the animator reads them: no
 * option overrides them (design:reduced-motion DR4).
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

/** Commits a frame, then moves both clocks forward by `ms`. */
async function advance(ms: number, clock?: ManualClock) {
  for (const animation of recorded) {
    if (animation.startTime == null && !animation.cancelled) {
      animation.commit(now);
    }
  }
  const frames = frameQueue;
  frameQueue = [];
  for (const callback of frames) {
    callback();
  }
  await Promise.resolve();
  await Promise.resolve();
  now += ms;
  if (clock != null) {
    clock.time = now;
  }
  await vi.advanceTimersByTimeAsync(ms);
}

/**
 * A frame in WebKit's order: the browser starts new animations and resolves
 * their start inside the frame's rendering update, before this frame's
 * animation-frame callbacks run (`advance` runs the callbacks first), with
 * no task (timer) in between.
 */
async function advanceInWebKitOrder(ms: number, clock?: ManualClock) {
  for (const animation of recorded) {
    if (animation.startTime == null && !animation.cancelled) {
      animation.commit(now);
    }
  }
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
  const frames = frameQueue;
  frameQueue = [];
  for (const callback of frames) {
    callback();
  }
  await Promise.resolve();
  await Promise.resolve();
  now += ms;
  if (clock != null) {
    clock.time = now;
  }
  await vi.advanceTimersByTimeAsync(ms);
}

// --- Touches ----------------------------------------------------------------

function touch(
  type: 'touchstart' | 'touchmove' | 'touchend',
  target: EventTarget,
  x: number,
  y: number,
  time: number,
): Event {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const contact = {identifier: 1, clientX: x, clientY: y, target};
  const list = type === 'touchend' ? [] : [contact];
  Object.defineProperty(event, 'changedTouches', {value: [contact]});
  Object.defineProperty(event, 'touches', {value: list});
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
  return event;
}

/** A mouse event for the gesture host (jsdom has no PointerEvent). */
function mouse(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  target: EventTarget,
  x: number,
  y: number,
  time: number,
): Event {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const fields: Record<string, unknown> = {
    pointerType: 'mouse',
    pointerId: 1,
    isPrimary: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: x,
    clientY: y,
    timeStamp: time,
  };
  for (const [key, value] of Object.entries(fields)) {
    Object.defineProperty(event, key, {value});
  }
  target.dispatchEvent(event);
  return event;
}

/**
 * A wheel for the gesture host: `dx`/`dy` px (or lines with `mode` 1). With
 * no legacy `wheelDeltaX`/`wheelDeltaY` it reads as a mouse's wheel.
 */
function wheel(
  target: EventTarget,
  init: {
    dx?: number;
    dy?: number;
    mode?: number;
    time: number;
    legacy?: {x: number; y: number};
  },
): WheelEvent {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: 300,
    clientY: 100,
    deltaX: init.dx ?? 0,
    deltaY: init.dy ?? 0,
    deltaMode: init.mode ?? 0,
  });
  Object.defineProperty(event, 'timeStamp', {value: init.time});
  if (init.legacy != null) {
    Object.defineProperty(event, 'wheelDeltaX', {value: init.legacy.x});
    Object.defineProperty(event, 'wheelDeltaY', {value: init.legacy.y});
  }
  target.dispatchEvent(event);
  return event;
}

/**
 * A trackpad's scroll: precise deltas, whose legacy `wheelDelta` Chromium and
 * WebKit report as three times each, against the content.
 */
function trackpad(
  target: EventTarget,
  init: {dx?: number; dy?: number; time: number},
): WheelEvent {
  const dx = init.dx ?? 0;
  const dy = init.dy ?? 0;
  return wheel(target, {...init, legacy: {x: -3 * dx, y: -3 * dy}});
}

interface Fixture {
  pager: Pager;
  viewport: HTMLElement;
  track: HTMLElement;
  page: HTMLElement;
  animator: Animator;
  clock: ManualClock;
  host: GestureHost;
  calls: string[];
  /** The track's x on screen now, from the animator. */
  x(): number;
}

function setup(options: Partial<PagerOptions> = {}, rtl = false): Fixture {
  const clock = new ManualClock();
  clock.time = now;
  const host = new GestureHost(document, {clock});
  const viewport = document.createElement('div');
  const track = document.createElement('div');
  const page = document.createElement('div');
  if (rtl) {
    viewport.style.direction = 'rtl';
  }
  track.appendChild(page);
  viewport.appendChild(track);
  document.body.appendChild(viewport);
  Object.defineProperty(viewport, 'clientWidth', {
    value: WIDTH,
    configurable: true,
  });
  const animator = createAnimator(track, {
    now: () => now,
    requestFrame: callback => {
      frameQueue.push(callback);
    },
  });
  const calls: string[] = [];
  const pager = createPager(
    {
      count: 5,
      onIndexChange: (index, reason) => calls.push(`index:${index}:${reason}`),
      onSettle: (index, previous) => calls.push(`settle:${index}:${previous}`),
      ...options,
    },
    {
      host,
      animator,
      requestFrame: callback => {
        frameQueue.push(callback);
      },
    },
  );
  pager.attach(viewport, track);
  return {
    pager,
    viewport,
    track,
    page,
    animator,
    clock,
    host,
    calls,
    x: () => animator.get('x', now),
  };
}

/**
 * A horizontal drag on the page: lands at `from`, moves `dx` in steps of
 * `step` px every `dt` ms, optionally holds still, then lifts. Returns the
 * lift time.
 */
async function drag(
  f: Fixture,
  {
    from = 200,
    dx,
    dy = 0,
    step = 4,
    dt = 8,
    hold = 0,
    still = 0,
  }: {
    from?: number;
    dx: number;
    dy?: number;
    step?: number;
    dt?: number;
    /** A silent rest before the lift: no events, ms. */
    hold?: number;
    /** Move samples that stand still at the end, `dt` apart, before the lift. */
    still?: number;
  },
): Promise<number> {
  const y = 100;
  touch('touchstart', f.page, from, y, now);
  const steps = Math.max(1, Math.round(Math.abs(dx) / step));
  for (let i = 1; i <= steps; i++) {
    await advance(dt, f.clock);
    touch(
      'touchmove',
      f.page,
      from + (dx * i) / steps,
      y + (dy * i) / steps,
      now,
    );
  }
  for (let i = 0; i < still; i++) {
    await advance(dt, f.clock);
    touch('touchmove', f.page, from + dx, y + dy, now);
  }
  if (hold > 0) {
    await advance(hold, f.clock);
  }
  await advance(dt, f.clock);
  touch('touchend', f.page, from + dx, y + dy, now);
  return now;
}

/** Three display frames: a release's report waits for its settle to run. */
async function frames(f: Fixture, count = 3) {
  for (let i = 0; i < count; i++) {
    await advance(16, f.clock);
  }
}

async function settle(f: Fixture) {
  for (let i = 0; i < 80 && f.pager.isSettling; i++) {
    await advance(16, f.clock);
  }
  await advance(16, f.clock);
}

/**
 * A trackpad fling: `count` steady deltas of `px` every 8 ms, then four
 * shrinking ones as the fingers lift into momentum. The gesture engine
 * releases the pan at the lift, at the fingers' travel and speed; the
 * shrinking deltas never move it (#8676).
 */
async function fling(f: Fixture, px: number, count: number) {
  const events: WheelEvent[] = [];
  for (const dx of [
    ...Array.from({length: count}, () => px),
    ...[0.95, 0.9, 0.85, 0.78].map(k => k * px),
  ]) {
    events.push(trackpad(f.page, {dx, time: now}));
    await advance(8, f.clock);
  }
  return events;
}

describe('createPager', () => {
  it('rests on the default page', () => {
    const f = setup({defaultIndex: 2});
    expect(f.pager.index).toBe(2);
    expect(f.x()).toBe(-2 * WIDTH);
  });

  it('tracks the finger 1:1 without reading layout while it moves', async () => {
    const f = setup({defaultIndex: 1});
    const width = vi.spyOn(f.viewport, 'clientWidth', 'get');
    touch('touchstart', f.page, 300, 100, now);
    for (let i = 1; i <= 10; i++) {
      await advance(8, f.clock);
      touch('touchmove', f.page, 300 - 6 * i, 100, now);
    }
    // The pan began at 10 px and dropped the threshold's travel (UIKit).
    expect(f.pager.isDragging).toBe(true);
    const shown = -f.x() - WIDTH;
    expect(shown).toBeGreaterThan(40);
    expect(shown).toBeLessThanOrEqual(60);
    const readsWhileMoving = width.mock.calls.length;
    for (let i = 11; i <= 20; i++) {
      await advance(8, f.clock);
      touch('touchmove', f.page, 300 - 6 * i, 100, now);
    }
    expect(width.mock.calls.length).toBe(readsWhileMoving);
    expect(-f.x() - WIDTH - shown).toBeCloseTo(60, 6);
  });

  // A lift within 40 ms of the last move keeps the release velocity: the
  // settle carries it.
  it('a lift within 40 ms of the last move keeps the release velocity: the settle carries it', async () => {
    const f = setup({defaultIndex: 1});
    // 250 px left in 8 ms steps of about 4 px (496 px/s), then 24 ms with no
    // events: the lift comes 32 ms after the last move.
    await drag(f, {from: 300, dx: -250, step: 4, dt: 8, hold: 24});
    expect(f.pager.index).toBe(2);
    const position = -f.x();
    const velocity = (250 / Math.round(250 / 4) / 8) * 1000;
    const carried = solvePaging({from: position, velocity, to: 2 * WIDTH});
    const rest = solvePaging({from: position, velocity: 0, to: 2 * WIDTH});
    await advance(16, f.clock);
    await advance(100, f.clock);
    expect(carried.at(0.116) - rest.at(0.116)).toBeGreaterThan(5);
    expect(-f.x()).toBeCloseTo(carried.at(0.116), 0);
    await settle(f);
    expect(f.x()).toBe(-2 * WIDTH);
    expect(f.calls).toEqual(['index:2:drag', 'settle:2:1']);
  });

  // UIKit keeps the release velocity through a silent rest (recorded, iOS
  // 26.2: 600 pt/s to 25 % of a page, then no touch event for up to 397 ms
  // before the lift kept 0.55 to 0.61 pt/ms). The shared release filter
  // reads 0 after 40 ms of silence instead (spec:AST-100 FR2: a still finger
  // never flicks), and the pager reads the filter.
  it('a silent hold of more than 40 ms before the lift starts the settle at rest (spec:AST-100 FR2), where UIKit keeps the speed', async () => {
    const f = setup({defaultIndex: 1});
    // The same drag, then 100 ms with no events.
    await drag(f, {from: 300, dx: -250, step: 4, dt: 8, hold: 100});
    expect(f.pager.index).toBe(2);
    const position = -f.x();
    const rest = solvePaging({from: position, velocity: 0, to: 2 * WIDTH});
    await advance(16, f.clock);
    await advance(100, f.clock);
    expect(-f.x()).toBeCloseTo(rest.at(0.116), 0);
    await settle(f);
    expect(f.x()).toBe(-2 * WIDTH);
    expect(f.calls).toEqual(['index:2:drag', 'settle:2:1']);
  });

  // A sample at the finger's last place is not motion (spec:AST-100's one
  // filter): a finger that keeps reporting while it stands still keeps the
  // speed it had until the stillness interval runs out.
  it('move samples that stand still are not motion: a lift 32 ms after the last move keeps the release velocity', async () => {
    const f = setup({defaultIndex: 1});
    // The same drag, then three samples at the same place, 8 ms apart; the
    // lift comes 8 ms later, 32 ms after the last move.
    await drag(f, {from: 300, dx: -250, step: 4, dt: 8, still: 3});
    expect(f.pager.index).toBe(2);
    const position = -f.x();
    const velocity = (250 / Math.round(250 / 4) / 8) * 1000;
    const carried = solvePaging({from: position, velocity, to: 2 * WIDTH});
    const rest = solvePaging({from: position, velocity: 0, to: 2 * WIDTH});
    await advance(16, f.clock);
    await advance(100, f.clock);
    expect(carried.at(0.116) - rest.at(0.116)).toBeGreaterThan(5);
    expect(-f.x()).toBeCloseTo(carried.at(0.116), 0);
    await settle(f);
    expect(f.x()).toBe(-2 * WIDTH);
  });

  it('a finger that stands still, still reporting, for more than 40 ms before the lift starts the settle at rest (spec:AST-100 FR2)', async () => {
    const f = setup({defaultIndex: 1});
    // The same drag, then six samples at the same place, 8 ms apart; the
    // lift comes 56 ms after the last move.
    await drag(f, {from: 300, dx: -250, step: 4, dt: 8, still: 6});
    expect(f.pager.index).toBe(2);
    const position = -f.x();
    const rest = solvePaging({from: position, velocity: 0, to: 2 * WIDTH});
    await advance(16, f.clock);
    await advance(100, f.clock);
    expect(-f.x()).toBeCloseTo(rest.at(0.116), 0);
    await settle(f);
    expect(f.x()).toBe(-2 * WIDTH);
  });

  it('reports the new page once the settle runs on the compositor, two frames after its first', async () => {
    const f = setup({defaultIndex: 1});
    await drag(f, {from: 300, dx: -250, step: 4, dt: 8, hold: 100});
    // Chosen at the lift (index), reported once the settle is moving.
    expect(f.pager.index).toBe(2);
    expect(f.calls).toEqual([]);
    await advance(16, f.clock);
    await advance(16, f.clock);
    expect(f.calls).toEqual([]);
    expect(recorded.some(a => a.startTime != null && !a.cancelled)).toBe(true);
    await advance(16, f.clock);
    expect(f.calls).toEqual(['index:2:drag']);
  });

  // WebKit resolves an animation's start in the frame's rendering update,
  // before that same frame's animation-frame callbacks; counting that frame
  // reported the page one frame into the settle.
  it("in WebKit's frame order the settle's start frame does not count: the page is still reported two frames after it", async () => {
    const f = setup({defaultIndex: 1});
    await drag(f, {from: 300, dx: -250, step: 4, dt: 8, hold: 100});
    expect(f.calls).toEqual([]);
    // The frame that starts the settle, then one more: not yet.
    await advanceInWebKitOrder(16, f.clock);
    expect(recorded.some(a => a.startTime != null && !a.cancelled)).toBe(true);
    await advanceInWebKitOrder(16, f.clock);
    expect(f.calls).toEqual([]);
    // The second frame after the start.
    await advanceInWebKitOrder(16, f.clock);
    expect(f.calls).toEqual(['index:2:drag']);
  });

  it('a drag that catches the settle before the report still reports the page', async () => {
    const f = setup({defaultIndex: 1});
    await drag(f, {from: 300, dx: -250, step: 4, dt: 8, hold: 100});
    touch('touchstart', f.page, 300, 100, now);
    await advance(8, f.clock);
    touch('touchmove', f.page, 288, 100, now);
    expect(f.pager.isDragging).toBe(true);
    expect(f.calls).toEqual(['index:2:drag']);
    touch('touchend', f.page, 288, 100, now + 200);
  });

  it('a release whose report is still waiting reports nothing when the pager detaches: no callback from an unmount', async () => {
    const f = setup({defaultIndex: 1});
    await drag(f, {from: 300, dx: -250, step: 4, dt: 8, hold: 100});
    expect(f.pager.index).toBe(2);
    expect(f.calls).toEqual([]);
    f.pager.dispose();
    await frames(f, 4);
    expect(f.calls).toEqual([]);
  });

  it("a controlled move during a release's waiting report drops it: the owner's own page wins, with no callback", async () => {
    const f = setup({defaultIndex: 1});
    await drag(f, {from: 300, dx: -250, step: 4, dt: 8, hold: 100});
    expect(f.pager.index).toBe(2);
    f.pager.goTo(3, {reason: 'controlled'});
    expect(f.calls).toEqual([]);
    await settle(f);
    expect(f.pager.index).toBe(3);
    expect(f.calls).toEqual(['settle:3:1']);
  });

  it('released slowly before half a page, returns to the page it started on', async () => {
    const f = setup({defaultIndex: 1});
    // 2 px every 16 ms (125 px/s), then still.
    await drag(f, {from: 300, dx: -150, step: 2, dt: 16, hold: 100});
    expect(f.calls).toEqual([]);
    await settle(f);
    expect(f.x()).toBe(-WIDTH);
    expect(f.calls).toEqual(['settle:1:1']);
  });

  it('a flick at the advance speed pages from a few percent', async () => {
    const f = setup({defaultIndex: 1});
    // 40 px in 4 events of 10 px every 16 ms: 625 px/s, no hold.
    await drag(f, {from: 300, dx: -50, step: 10, dt: 16});
    await frames(f);
    expect(f.calls).toEqual(['index:2:drag']);
    await settle(f);
    expect(f.x()).toBe(-2 * WIDTH);
  });

  it('a flick lifted within 40 ms of its last move pages on its speed', async () => {
    const f = setup({defaultIndex: 1});
    // 625 px/s to 12.5 %, then 16 ms with no events: the lift comes 32 ms
    // after the last move.
    await drag(f, {from: 300, dx: -50, step: 10, dt: 16, hold: 16});
    await frames(f);
    expect(f.calls).toEqual(['index:2:drag']);
  });

  it('a hold of more than 40 ms before the lift cancels a flick (spec:AST-100 FR2): the page stays, where UIKit still pages', async () => {
    const f = setup({defaultIndex: 1});
    // 625 px/s to 12.5 %, then still for 400 ms.
    await drag(f, {from: 300, dx: -50, step: 10, dt: 16, hold: 400});
    expect(f.pager.index).toBe(1);
    await settle(f);
    expect(f.x()).toBe(-WIDTH);
    expect(f.calls).toEqual(['settle:1:1']);
  });

  it('a slow drift does not page', async () => {
    const f = setup({defaultIndex: 1});
    // 2 px every 16 ms: 125 px/s, under the advance speed.
    await drag(f, {from: 300, dx: -60, step: 2, dt: 16});
    await frames(f);
    expect(f.calls).toEqual([]);
  });

  it('never travels more than one page from the page the drag started on', async () => {
    const f = setup({defaultIndex: 1});
    // 1.5 pages in one fast drag: still only the next page.
    await drag(f, {from: 390, dx: -380, step: 12, dt: 8});
    expect(f.pager.index).toBe(2);
    await frames(f);
    expect(f.calls).toEqual(['index:2:drag']);
  });

  it('rubber-bands past the first page with d = the page width', async () => {
    const f = setup({defaultIndex: 0});
    touch('touchstart', f.page, 100, 100, now);
    for (let i = 1; i <= 30; i++) {
      await advance(8, f.clock);
      touch('touchmove', f.page, 100 + 10 * i, 100, now);
    }
    // 300 px of finger, 10 px of it spent on the pan's threshold.
    const finger = 300 - 10;
    expect(f.x()).toBeCloseTo(rubberBand(finger, WIDTH), 1);
    await advance(8, f.clock);
    touch('touchend', f.page, 400, 100, now);
    await settle(f);
    expect(f.x()).toBe(0);
    expect(f.calls).toEqual(['settle:0:0']);
  });

  it('mirrors in RTL: a drag to the right goes forward', async () => {
    const f = setup({defaultIndex: 0}, true);
    expect(f.x()).toBe(0);
    await drag(f, {from: 100, dx: 250, hold: 100});
    expect(f.pager.index).toBe(1);
    await settle(f);
    expect(f.x()).toBe(WIDTH);
    expect(f.calls).toEqual(['index:1:drag', 'settle:1:0']);
  });

  it('leaves a vertical drag to the page: the pan fails', async () => {
    const f = setup({defaultIndex: 1});
    await drag(f, {from: 300, dx: -20, dy: 60});
    expect(f.pager.isDragging).toBe(false);
    expect(f.calls).toEqual([]);
    expect(f.x()).toBe(-WIDTH);
  });

  it('asks shouldBeginPan with the initial direction', async () => {
    const directions: string[] = [];
    const f = setup({
      defaultIndex: 1,
      shouldBeginPan: direction => {
        directions.push(direction);
        return direction === 'right';
      },
    });
    await drag(f, {from: 300, dx: -200, hold: 50});
    expect(directions).toEqual(['left']);
    expect(f.x()).toBe(-WIDTH);
    await drag(f, {from: 100, dx: 250, hold: 50});
    expect(directions).toEqual(['left', 'right']);
    await frames(f);
    expect(f.calls).toContain('index:0:drag');
  });

  it("goTo animates setContentOffset's curve, and fires the callbacks", async () => {
    const f = setup({defaultIndex: 0});
    f.pager.goTo(3);
    expect(f.calls).toEqual(['index:3:goTo']);
    await advance(0, f.clock);
    const curve = solveAnimatedPageScroll({from: 0, to: 3 * WIDTH});
    await advance(150, f.clock);
    expect(-f.x()).toBeCloseTo(curve.at(0.15), 0);
    await settle(f);
    expect(f.x()).toBe(-3 * WIDTH);
    expect(f.calls).toEqual(['index:3:goTo', 'settle:3:0']);
  });

  it('goTo without animation lands at once', () => {
    const f = setup({defaultIndex: 0});
    f.pager.goTo(4, {animated: false});
    expect(f.x()).toBe(-4 * WIDTH);
    expect(f.calls).toEqual(['index:4:goTo', 'settle:4:0']);
  });

  // spec:AST-094 FR4: a component reads touch motion through resolveMotion and
  // plays no literal. goTo reads setContentOffset's duration and curve there:
  // what resolveMotion returns for them is what plays (the paging table's
  // values today, as FR4 names neither as a role).
  it("goTo plays the duration and curve resolveMotion gives setContentOffset's", async () => {
    const actual = await vi.importActual<typeof motionResolution>(
      '../motion/resolveMotion',
    );
    const LINEAR = [0, 0, 1, 1] as const;
    function standIn(
      element: Element | null | undefined,
      leafOrGroup: object,
      key?: string,
    ): number | object | undefined {
      if (leafOrGroup === paging.animatedScroll && key === 'durationMs') {
        return 600;
      }
      if (leafOrGroup === paging.animatedScroll.curve) {
        return LINEAR;
      }
      return (
        actual.resolveMotion as (
          ...args: unknown[]
        ) => number | object | undefined
      )(element, leafOrGroup, key);
    }
    vi.mocked(resolveMotion).mockImplementation(
      standIn as typeof resolveMotion,
    );
    try {
      const f = setup({defaultIndex: 0});
      f.pager.goTo(2);
      await advance(0, f.clock);
      // A quarter of the way along a linear 600 ms curve at 150 ms (the
      // table's 300 ms sinusoid would be at 50 %)…
      await advance(150, f.clock);
      expect(-f.x()).toBeGreaterThan(0.4 * WIDTH);
      expect(-f.x()).toBeLessThan(0.6 * WIDTH);
      // …halfway at 300 ms, where the table's 300 ms has landed…
      await advance(150, f.clock);
      expect(-f.x()).toBeGreaterThan(0.9 * WIDTH);
      expect(-f.x()).toBeLessThan(1.1 * WIDTH);
      // …and on the page at 600 ms.
      await settle(f);
      expect(f.x()).toBe(-2 * WIDTH);
    } finally {
      vi.mocked(resolveMotion).mockImplementation(actual.resolveMotion);
    }
  });

  it('goTo during a drag cancels the drag and starts from what is on screen', async () => {
    const f = setup({defaultIndex: 1});
    touch('touchstart', f.page, 300, 100, now);
    for (let i = 1; i <= 10; i++) {
      await advance(8, f.clock);
      touch('touchmove', f.page, 300 - 8 * i, 100, now);
    }
    const onScreen = -f.x();
    f.pager.goTo(3);
    expect(f.pager.isDragging).toBe(false);
    expect(f.pager.pan.state).not.toBe('changed');
    await advance(0, f.clock);
    expect(-f.x()).toBeCloseTo(onScreen, 0);
    // The rest of the finger's travel no longer moves the track.
    await advance(8, f.clock);
    touch('touchmove', f.page, 100, 100, now);
    await settle(f);
    touch('touchend', f.page, 100, 100, now);
    expect(f.x()).toBe(-3 * WIDTH);
    expect(f.calls).toEqual(['index:3:goTo', 'settle:3:1']);
  });

  it('a drag catches a settling track at the value on screen', async () => {
    const f = setup({defaultIndex: 1});
    f.pager.goTo(2);
    await advance(0, f.clock);
    await advance(100, f.clock);
    const onScreen = -f.x();
    expect(onScreen).toBeGreaterThan(WIDTH);
    expect(onScreen).toBeLessThan(2 * WIDTH);
    touch('touchstart', f.page, 300, 100, now);
    await advance(8, f.clock);
    touch('touchmove', f.page, 289, 100, now);
    expect(f.pager.isDragging).toBe(true);
    expect(f.pager.isSettling).toBe(false);
    // From the caught position, 1 px past the threshold.
    expect(-f.x()).toBeCloseTo(-f.animator.get('x', now), 6);
    touch('touchend', f.page, 289, 100, now + 40);
  });

  it(`a still finger catches a settle ${paging.catchStopMs} ms after it lands, and the lift settles on the nearest page`, async () => {
    const f = setup({defaultIndex: 1});
    f.pager.goTo(2);
    await advance(0, f.clock);
    await advance(60, f.clock);
    touch('touchstart', f.page, 300, 100, now);
    await advance(40, f.clock);
    // Still moving 40 ms after the touch.
    expect(f.pager.isSettling).toBe(true);
    await advance(paging.catchStopMs, f.clock);
    expect(f.pager.isSettling).toBe(false);
    const held = -f.x();
    await advance(100, f.clock);
    expect(-f.x()).toBe(held);
    touch('touchend', f.page, 300, 100, now);
    await settle(f);
    expect(f.x()).toBe(-2 * WIDTH);
  });

  it('loops: past the last page goes forward to a virtual page, wrapped for callbacks', async () => {
    const f = setup({defaultIndex: 4, loop: true});
    await drag(f, {from: 300, dx: -250, hold: 50});
    expect(f.pager.virtualIndex).toBe(5);
    expect(f.pager.index).toBe(0);
    await frames(f);
    expect(f.calls).toEqual(['index:0:drag']);
    await settle(f);
    expect(f.x()).toBe(-5 * WIDTH);
    // goTo takes the nearest copy: from virtual 5 (page 0), page 4 is back one.
    f.pager.goTo(4, {animated: false});
    expect(f.pager.virtualIndex).toBe(4);
  });

  it("with two pages, a loop's step forward goes forward: of two copies equally near, the one asked for", () => {
    const f = setup({count: 2, loop: true});
    f.pager.goTo(f.pager.virtualIndex + 1, {animated: false});
    expect(f.pager.virtualIndex).toBe(1);
    f.pager.goTo(f.pager.virtualIndex + 1, {animated: false});
    expect(f.pager.virtualIndex).toBe(2);
    expect(f.x()).toBe(-2 * WIDTH);
    f.pager.goTo(f.pager.virtualIndex - 1, {animated: false});
    expect(f.pager.virtualIndex).toBe(1);
    // A page index takes its nearest copy as before.
    f.pager.goTo(0, {animated: false});
    expect(f.pager.virtualIndex).toBe(0);
  });

  it('clamps goTo to the pages when not looping', () => {
    const f = setup({defaultIndex: 0});
    f.pager.goTo(9, {animated: false});
    expect(f.pager.index).toBe(4);
    f.pager.goTo(-3, {animated: false});
    expect(f.pager.index).toBe(0);
  });

  it('a resize mid-settle lands on the target page at its new offset', async () => {
    let onResize: ResizeObserverCallback | null = null;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          onResize = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const f = setup({defaultIndex: 0});
    f.pager.goTo(2);
    await advance(0, f.clock);
    await advance(100, f.clock);
    expect(f.pager.isSettling).toBe(true);
    Object.defineProperty(f.viewport, 'clientWidth', {
      value: 300,
      configurable: true,
    });
    expect(onResize).not.toBeNull();
    onResize!(
      [{target: f.viewport} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );
    expect(f.pager.isSettling).toBe(false);
    expect(f.x()).toBe(-600);
    expect(f.calls).toEqual(['index:2:goTo', 'settle:2:0']);
    vi.unstubAllGlobals();
  });

  // The shared resize observer is one per module: a fresh pager module, with
  // this case's ResizeObserver installed first, so another case's observer
  // cannot stand in for it.
  it("observes the track once pages becomes 'children' after attach, and stops when it goes back", async () => {
    const observed: Element[] = [];
    const unobserved: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(element: Element) {
          observed.push(element);
        }
        unobserve(element: Element) {
          unobserved.push(element);
        }
        disconnect() {}
      },
    );
    vi.resetModules();
    const fresh = await import('./usePager');
    const f = setup({defaultIndex: 0});
    f.pager.dispose();
    const pager = fresh.createPager(
      {count: 3, defaultIndex: 0},
      {host: f.host, animator: f.animator},
    );
    pager.attach(f.viewport, f.track);
    expect(observed).toContain(f.viewport);
    expect(observed).not.toContain(f.track);
    pager.setOptions({pages: 'children'});
    expect(observed).toContain(f.track);
    pager.setOptions({pages: undefined});
    expect(unobserved).toContain(f.track);
    pager.dispose();
    vi.unstubAllGlobals();
  });

  it('a smaller count clamps the target page', () => {
    const f = setup({defaultIndex: 4});
    f.pager.setOptions({count: 2});
    expect(f.pager.index).toBe(1);
  });

  // Touch motion stays internal: the paging values are constants, so no
  // `--motion-paging-…` variable changes a settle or a goTo.
  it('a --motion-paging-… variable changes neither the settle nor goTo', async () => {
    const plain = setup({defaultIndex: 1});
    await drag(plain, {from: 300, dx: -250, step: 4, dt: 8, hold: 100});
    await advance(16, plain.clock);
    await advance(150, plain.clock);
    const integrator = plain.x();

    const f = setup({defaultIndex: 1});
    const scope = document.createElement('div');
    scope.setAttribute('data-astryx-theme', 'paging-test');
    scope.style.setProperty(
      '--motion-paging-settle',
      'spring(response 1.2s, damping-ratio 1)',
    );
    scope.style.setProperty(
      '--motion-paging-animated-scroll-duration-ms',
      '600ms',
    );
    scope.style.setProperty(
      '--motion-paging-animated-scroll-curve',
      'cubic-bezier(0, 0, 1, 1)',
    );
    document.body.appendChild(scope);
    scope.appendChild(f.viewport);
    await drag(f, {from: 300, dx: -250, step: 4, dt: 8, hold: 100});
    await advance(16, f.clock);
    await advance(150, f.clock);
    expect(f.x()).toBe(integrator);
    await settle(f);
    expect(f.x()).toBe(-2 * WIDTH);

    // goTo plays the table's 300 ms: landed at 300 ms, not halfway.
    f.pager.goTo(3);
    await advance(0, f.clock);
    await advance(300, f.clock);
    await advance(16, f.clock);
    expect(f.x()).toBe(-3 * WIDTH);
    scope.remove();
  });

  // design:reduced-motion (current): after the finger lifts nothing travels.
  // A finger's release settles with an opacity cross-fade of at most 200 ms
  // on any pointer (DR2); a mouse's, a trackpad's or a pen's follows DR2 on a
  // coarse primary pointer and DR3 otherwise (spec:AST-094 FR43). goTo
  // cross-fades on a coarse pointer (DR2) and lands at once on any other
  // (DR3). The drag itself follows the pointer (out of scope).
  function reducedPager(f: Fixture, defaultIndex: number, coarse: boolean) {
    stubMedia(true, coarse);
    const reduced = createAnimator(f.track, {
      now: () => now,
      requestFrame: callback => {
        frameQueue.push(callback);
      },
    });
    f.pager.dispose();
    const pager = createPager(
      {count: 3, defaultIndex},
      {host: f.host, animator: reduced},
    );
    pager.attach(f.viewport, f.track);
    return {pager, reduced};
  }

  /**
   * Animations started after `from` that move the track through values in
   * between (a cross-fade's jump holds the start, then the end: two values).
   */
  function travelsSince(from: number) {
    return recorded.slice(from).filter(a => {
      const xs = new Set<string>();
      for (const k of a.keyframes as Record<string, unknown>[]) {
        const v = k.translate ?? k.transform;
        if (typeof v === 'string') {
          xs.add(v);
        }
      }
      return xs.size > 2;
    });
  }

  /**
   * How long `property` keeps changing: the animator compiles a long
   * animation that holds its last value, so this is the offset of the first
   * keyframe from which the value stays at its end, times the duration.
   */
  function activeMs(animation: Recorded, property: string): number {
    const frames = animation.keyframes as Record<string, unknown>[];
    const values = frames.map(k => {
      const v = k[property];
      return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
    });
    const end = values[values.length - 1];
    let i = values.length - 1;
    while (i > 0 && values[i - 1] === end) {
      i--;
    }
    const offset = Number(
      frames[i]?.offset ?? i / Math.max(1, frames.length - 1),
    );
    return offset * Number(animation.options.duration ?? 0);
  }

  function fadesSince(from: number) {
    return recorded
      .slice(from)
      .filter(a =>
        a.keyframes.some(k => (k as Record<string, unknown>).opacity != null),
      );
  }

  it('under Reduce Motion, a release settle does not travel: an opacity cross-fade of at most 200 ms on a coarse pointer (a touch release, DR2)', async () => {
    const f = setup({defaultIndex: 1});
    const {pager, reduced} = reducedPager(f, 1, true);
    // The pointer this case claims, as the animator sees it.
    expect(reduced.reducedMotion()).toBe('crossfade');
    expect(reduced.reducedMotion({touchRelease: true})).toBe('crossfade');
    const before = recorded.length;
    await drag(
      {...f, pager, animator: reduced, x: () => reduced.get('x', now)},
      {from: 300, dx: -250, step: 4, dt: 8, hold: 100},
    );
    await frames(f, 40);
    // The drag itself writes the track (no animation); every animation is
    // the settle's.
    expect(travelsSince(before)).toEqual([]);
    const fades = fadesSince(before);
    expect(fades.length).toBeGreaterThan(0);
    for (const fade of fades) {
      expect(activeMs(fade, 'opacity')).toBeLessThanOrEqual(200);
    }
    expect(-reduced.get('x', now)).toBeCloseTo(2 * WIDTH, 0);
  });

  // spec:AST-094 FR43: under reduced motion a release from a mouse, a
  // trackpad, or a pen follows DR2 on a coarse primary pointer and DR3
  // otherwise.
  for (const coarse of [false, true]) {
    it(`under Reduce Motion, a mouse drag's release follows the primary pointer (spec:AST-094 FR43): ${coarse ? 'coarse, an opacity cross-fade of at most 200 ms (DR2)' : 'fine, at once with no cross-fade (DR3)'}`, async () => {
      const f = setup({defaultIndex: 1});
      const {pager, reduced} = reducedPager(f, 1, coarse);
      const before = recorded.length;
      mouse('pointerdown', f.page, 300, 100, now);
      for (let i = 1; i <= 62; i++) {
        await advance(8, f.clock);
        mouse('pointermove', f.page, 300 - 4 * i, 100, now);
      }
      await advance(8, f.clock);
      mouse('pointerup', f.page, 52, 100, now);
      await frames(f, 40);
      expect(pager.index).toBe(2);
      expect(travelsSince(before)).toEqual([]);
      const fades = fadesSince(before);
      if (coarse) {
        expect(fades.length).toBeGreaterThan(0);
        for (const fade of fades) {
          expect(activeMs(fade, 'opacity')).toBeLessThanOrEqual(200);
        }
      } else {
        expect(fades).toEqual([]);
      }
      expect(-reduced.get('x', now)).toBeCloseTo(2 * WIDTH, 0);
    });
  }

  it("under Reduce Motion on a fine primary pointer, a trackpad scroll's release lands at once (spec:AST-094 FR43, DR3)", async () => {
    const f = setup({defaultIndex: 1});
    const {pager, reduced} = reducedPager(f, 1, false);
    const before = recorded.length;
    // A fling: the fingers' lift releases it with their speed.
    await fling(f, 6.5, 12);
    await frames(f, 40);
    expect(pager.index).toBe(2);
    expect(travelsSince(before)).toEqual([]);
    expect(fadesSince(before)).toEqual([]);
    expect(-reduced.get('x', now)).toBeCloseTo(2 * WIDTH, 0);
  });

  for (const coarse of [true, false]) {
    it(`under Reduce Motion, goTo does not travel (${coarse ? 'coarse pointer: an opacity cross-fade of at most 200 ms, DR2' : 'fine pointer: at once, DR3'})`, async () => {
      const f = setup({defaultIndex: 0});
      const {pager, reduced} = reducedPager(f, 0, coarse);
      // The pointer this case claims, as the animator sees it.
      expect(reduced.reducedMotion()).toBe(coarse ? 'crossfade' : 'instant');
      const before = recorded.length;
      pager.goTo(1);
      await frames(f, 30);
      expect(travelsSince(before)).toEqual([]);
      const fades = fadesSince(before);
      if (coarse) {
        expect(fades.length).toBeGreaterThan(0);
        for (const fade of fades) {
          expect(activeMs(fade, 'opacity')).toBeLessThanOrEqual(200);
        }
      } else {
        expect(fades).toEqual([]);
      }
      expect(-reduced.get('x', now)).toBeCloseTo(WIDTH, 0);
    });
  }

  // spec:AST-094 FR43: gestures work for every pointer. A mouse drags the
  // pager as a finger does.
  it('on a fine primary pointer a mouse drag pages the pager like a finger (spec:AST-094 FR43)', async () => {
    const f = setup({defaultIndex: 1});
    stubMedia(false, false);
    f.pager.dispose();
    const pager = createPager(
      {count: 3, defaultIndex: 1},
      {host: f.host, animator: f.animator},
    );
    pager.attach(f.viewport, f.track);
    mouse('pointerdown', f.page, 300, 100, now);
    for (let i = 1; i <= 62; i++) {
      await advance(8, f.clock);
      mouse('pointermove', f.page, 300 - 4 * i, 100, now);
    }
    await advance(8, f.clock);
    mouse('pointerup', f.page, 52, 100, now);
    await frames(f, 2);
    // 500 px/s at the lift, past the advance speed: the next page.
    expect(pager.index).toBe(2);
    for (let i = 0; i < 80 && pager.isSettling; i++) {
      await advance(16, f.clock);
    }
    expect(f.x()).toBe(-2 * WIDTH);
    pager.dispose();
  });

  // spec:AST-094 FR43: on the web a pan also takes wheel and trackpad
  // scrolling, along its own axis.
  async function wheelPager(defaultIndex: number, width = WIDTH) {
    const f = setup({defaultIndex});
    stubMedia(false, false);
    f.pager.dispose();
    Object.defineProperty(f.viewport, 'clientWidth', {
      value: width,
      configurable: true,
    });
    const pager = createPager(
      {count: 3, defaultIndex},
      {host: f.host, animator: f.animator},
    );
    pager.attach(f.viewport, f.track);
    return {f, pager};
  }

  async function endWheel(f: Fixture) {
    // A trackpad swipe ends 220 ms after its last wheel, a mouse wheel's
    // notches 100 ms after theirs, both still: position alone decides.
    await advance(240, f.clock);
    f.clock.runDue(now);
    await frames(f, 2);
  }

  // Each wheel case disposes its pager even when an assertion fails, so a
  // wheel gesture it left live can never take the next case's wheels.
  it("takes a trackpad's horizontal scroll as a drag (spec:AST-094 FR43): the content follows it, and a fling releases it where the fingers lift, at their speed", async () => {
    const {f, pager} = await wheelPager(1);
    try {
      const events: WheelEvent[] = [];
      // 6.5 px every 8 ms (about 810 px/s), a trackpad's continuous scroll.
      for (let i = 0; i < 12; i++) {
        events.push(trackpad(f.page, {dx: 6.5, time: now}));
        await advance(8, f.clock);
      }
      expect(events.every(event => event.defaultPrevented)).toBe(true);
      expect(pager.isDragging).toBe(true);
      // A scroll toward later content drags the track toward its start.
      expect(f.x()).toBeLessThan(-WIDTH);
      // The fingers lift: 78 px at about 810 px/s, a flick to the next page.
      const lift = await fling(f, 6.5, 0);
      expect(lift.every(event => event.defaultPrevented)).toBe(true);
      await frames(f, 2);
      expect(pager.index).toBe(2);
      for (let i = 0; i < 80 && pager.isSettling; i++) {
        await advance(16, f.clock);
      }
      expect(f.x()).toBe(-2 * WIDTH);
    } finally {
      pager.dispose();
    }
  });

  // spec:AST-094 FR43, DEC-24: a pan whose stream stops releases still.
  it('a slow 60 px trackpad swipe that stops releases still and returns to its page', async () => {
    const {f, pager} = await wheelPager(1);
    try {
      // 2 px every 20 ms, 60 px in all (50 past the pan's 10 px start),
      // then the fingers rest.
      let furthest = -WIDTH;
      for (let i = 0; i < 30; i++) {
        trackpad(f.page, {dx: 2, time: now});
        await advance(20, f.clock);
        furthest = Math.min(furthest, f.x());
      }
      expect(furthest).toBeCloseTo(-WIDTH - 50, 6);
      await endWheel(f);
      expect(pager.index).toBe(1);
      for (let i = 0; i < 80 && pager.isSettling; i++) {
        await advance(16, f.clock);
      }
      await advance(16, f.clock);
      expect(f.x()).toBe(-WIDTH);
    } finally {
      pager.dispose();
    }
  });

  // spec:AST-094 FR43, DEC-24: a pan follows a trackpad's scroll and never a
  // mouse wheel's.
  it("leaves a mouse wheel's notches to the page: the pager follows a trackpad's scroll only", async () => {
    const {f, pager} = await wheelPager(1);
    try {
      // Whole 100 px notches on the horizontal axis (a tilt wheel, or Shift
      // with a wheel): discrete scrolling, which the pager does not take.
      const notches: WheelEvent[] = [];
      for (let i = 0; i < 3; i++) {
        notches.push(wheel(f.page, {dx: 100, time: now}));
        await advance(30, f.clock);
      }
      await endWheel(f);
      expect(notches.some(event => event.defaultPrevented)).toBe(false);
      expect(pager.isDragging).toBe(false);
      expect(pager.index).toBe(1);
      expect(f.x()).toBe(-WIDTH);
      // A trackpad's continuous scroll over the same pager still drags it.
      const scroll: WheelEvent[] = [];
      for (let i = 0; i < 6; i++) {
        scroll.push(trackpad(f.page, {dx: 6.5, time: now}));
        await advance(8, f.clock);
      }
      expect(scroll.every(event => event.defaultPrevented)).toBe(true);
      expect(pager.isDragging).toBe(true);
      expect(f.x()).toBeLessThan(-WIDTH);
    } finally {
      pager.dispose();
    }
  });

  // A scroll without the trackpad's signature is a mouse wheel's (FR43):
  // lines, a whole tick, and deltas with an accelerated mouse's remainder.
  for (const [name, init] of [
    ['lines', {dx: 3, mode: 1}],
    ['ticks: 40 px under a 120 legacy tick', {dx: 40, legacy: {x: -120, y: 0}}],
    [
      "accelerated deltas: a hair off whole pixels, under a trackpad's legacy delta",
      {dx: 12.004, legacy: {x: -36.012, y: 0}},
    ],
  ] as const) {
    it(`leaves a mouse wheel's ${name} to the page`, async () => {
      const {f, pager} = await wheelPager(1);
      try {
        const events: WheelEvent[] = [];
        for (let i = 0; i < 3; i++) {
          events.push(wheel(f.page, {...init, time: now}));
          await advance(30, f.clock);
        }
        await endWheel(f);
        expect(events.some(event => event.defaultPrevented)).toBe(false);
        expect(pager.index).toBe(1);
        expect(f.x()).toBe(-WIDTH);
      } finally {
        pager.dispose();
      }
    });
  }

  // A mouse drags as a finger does (FR43): a short fast drag pages, as a
  // finger's flick does.
  it("a mouse's short fast drag pages, as a finger's flick does", async () => {
    const {f, pager} = await wheelPager(1);
    try {
      mouse('pointerdown', f.page, 300, 100, now);
      // 10 px every 8 ms (1,250 px/s), 30 px in all.
      for (let i = 1; i <= 3; i++) {
        await advance(8, f.clock);
        mouse('pointermove', f.page, 300 - 10 * i, 100, now);
      }
      await advance(8, f.clock);
      mouse('pointerup', f.page, 270, 100, now);
      await frames(f, 2);
      expect(pager.index).toBe(2);
    } finally {
      pager.dispose();
    }
  });

  it('leaves a vertical wheel over the pager to the page (spec:AST-094 FR43)', async () => {
    const {f, pager} = await wheelPager(1);
    try {
      const events: WheelEvent[] = [];
      for (let i = 0; i < 6; i++) {
        events.push(wheel(f.page, {dy: 12.5, time: now}));
        await advance(8, f.clock);
      }
      await endWheel(f);
      expect(events.some(event => event.defaultPrevented)).toBe(false);
      expect(pager.isDragging).toBe(false);
      expect(pager.index).toBe(1);
      expect(f.x()).toBe(-WIDTH);
    } finally {
      pager.dispose();
    }
  });
});

/** A rect for jsdom, which lays nothing out. */
function rectOf(left: number, width: number): DOMRect {
  return new DOMRect(left, 0, width, 100);
}

/**
 * A pager whose pages are the track's children (`pages: 'children'`): one
 * child per width, `gap` px apart, laid out from the start edge (the right
 * one in RTL) of a WIDTH-wide viewport.
 */
function setupChildren(
  widths: number[],
  gap: number,
  options: Partial<PagerOptions> = {},
  rtl = false,
): Fixture {
  const clock = new ManualClock();
  clock.time = now;
  const host = new GestureHost(document, {clock});
  const viewport = document.createElement('div');
  const track = document.createElement('div');
  if (rtl) {
    viewport.style.direction = 'rtl';
  }
  let start = 0;
  for (const width of widths) {
    const child = document.createElement('div');
    const from = start;
    child.getBoundingClientRect = () =>
      rtl ? rectOf(WIDTH - from - width, width) : rectOf(from, width);
    track.appendChild(child);
    start += width + gap;
  }
  const extent = start - gap;
  track.getBoundingClientRect = () =>
    rtl ? rectOf(WIDTH - extent, extent) : rectOf(0, extent);
  viewport.appendChild(track);
  document.body.appendChild(viewport);
  Object.defineProperty(viewport, 'clientWidth', {
    value: WIDTH,
    configurable: true,
  });
  const animator = createAnimator(track, {
    now: () => now,
    requestFrame: callback => {
      frameQueue.push(callback);
    },
  });
  const calls: string[] = [];
  const pager = createPager(
    {
      count: widths.length,
      pages: 'children',
      onIndexChange: (index, reason) => calls.push(`index:${index}:${reason}`),
      onSettle: (index, previous) => calls.push(`settle:${index}:${previous}`),
      ...options,
    },
    {
      host,
      animator,
      requestFrame: callback => {
        frameQueue.push(callback);
      },
    },
  );
  pager.attach(viewport, track);
  return {
    pager,
    viewport,
    track,
    page: track.children[0] as HTMLElement,
    animator,
    clock,
    host,
    calls,
    x: () => animator.get('x', now),
  };
}

describe("children pages: each child's start edge, as a snap container places it", () => {
  // Five 150 px children 10 px apart in a 400 px viewport: starts at 0, 160,
  // 320, 480 and 640; the track ends at 790, so its end meets the viewport's
  // at 390, where the last two children rest.
  const CARDS = [150, 150, 150, 150, 150];

  it("measures one page per child start, the last children sharing the page where the track's end meets the viewport's", () => {
    const f = setupChildren(CARDS, 10);
    expect(f.pager.pageCount).toBe(4);
    f.pager.goTo(2, {animated: false});
    expect(f.x()).toBe(-320);
    f.pager.goTo(4, {animated: false});
    expect(f.pager.index).toBe(3);
    expect(f.x()).toBe(-390);
  });

  it('a flick moves one child, on the paging settle', async () => {
    const f = setupChildren(CARDS, 10);
    // 625 px/s, lifted 32 ms after the last move.
    await drag(f, {from: 300, dx: -50, step: 10, dt: 16, hold: 16});
    expect(f.pager.index).toBe(1);
    await settle(f);
    expect(f.x()).toBe(-160);
    expect(f.calls).toEqual(['index:1:drag', 'settle:1:0']);
  });

  it('a slow drag past half the way to the next child settles there; short of half, back', async () => {
    const f = setupChildren(CARDS, 10);
    // The finger moves 100 px: past the pan's 10 pt claim the content
    // travels 90 px, past half of the 160 px to the next child.
    await drag(f, {from: 300, dx: -100, step: 2, dt: 16, hold: 100});
    await settle(f);
    expect(f.pager.index).toBe(1);
    expect(f.x()).toBe(-160);
    // 70 px of the 160 px back toward the first child: short of half.
    await drag(f, {from: 100, dx: 70, step: 2, dt: 16, hold: 100});
    await settle(f);
    expect(f.pager.index).toBe(1);
    expect(f.x()).toBe(-160);
  });

  it('past the last page the track rubber-bands and returns: children pages never loop', async () => {
    const f = setupChildren(CARDS, 10, {loop: true});
    f.pager.goTo(3, {animated: false});
    await drag(f, {from: 300, dx: -100, step: 10, dt: 16, hold: 16});
    expect(f.pager.index).toBe(3);
    await settle(f);
    expect(f.x()).toBe(-390);
    f.pager.goTo(-1, {animated: false});
    expect(f.pager.index).toBe(0);
  });

  it('content that fits is one page: nothing pages', async () => {
    const f = setupChildren([150, 150], 10);
    expect(f.pager.pageCount).toBe(1);
    await drag(f, {from: 300, dx: -50, step: 10, dt: 16, hold: 16});
    await settle(f);
    expect(f.pager.index).toBe(0);
    expect(f.x()).toBe(0);
  });

  it('reads where each page rests and the page nearest an offset', () => {
    const f = setupChildren(CARDS, 10);
    expect([0, 1, 2, 3].map(i => f.pager.pageOffset(i))).toEqual([
      0, 160, 320, 390,
    ]);
    expect(f.pager.nearestPage(70)).toBe(0);
    expect(f.pager.nearestPage(90)).toBe(1);
    expect(f.pager.nearestPage(370)).toBe(3);
    expect(f.pager.nearestPage(5000)).toBe(3);
  });

  it('a child added to the track is measured on the next options change, and reported from the next frame', async () => {
    const pages: number[] = [];
    const f = setupChildren(CARDS, 10, {
      onPagesChange: pageCount => pages.push(pageCount),
    });
    const child = document.createElement('div');
    child.getBoundingClientRect = () => rectOf(800, 150);
    f.track.appendChild(child);
    f.track.getBoundingClientRect = () => rectOf(0, 950);
    f.pager.setOptions({count: 6});
    expect(f.pager.pageCount).toBe(5);
    expect(pages).toEqual([]);
    await advance(16, f.clock);
    expect(pages).toEqual([5]);
  });

  it("under a CSS zoom the rects are scaled; the pages are measured in the track's own pixels", () => {
    const f = setupChildren(CARDS, 10);
    // Rects at twice the size, as an ancestor's \`zoom: 2\` reports them;
    // the track's own width stays 790 CSS px.
    const children = Array.from(f.track.children) as HTMLElement[];
    children.forEach((child, i) => {
      child.getBoundingClientRect = () => rectOf(2 * i * 160, 2 * 150);
    });
    f.track.getBoundingClientRect = () => rectOf(0, 2 * 790);
    f.track.style.width = '790px';
    f.pager.setOptions({count: 5});
    expect([0, 1, 2, 3].map(i => f.pager.pageOffset(i))).toEqual([
      0, 160, 320, 390,
    ]);
  });

  it('RTL: pages measure from the right edge, and a drag right goes forward', async () => {
    const f = setupChildren(CARDS, 10, {}, true);
    expect(f.pager.pageCount).toBe(4);
    await drag(f, {from: 100, dx: 50, step: 10, dt: 16, hold: 16});
    expect(f.pager.index).toBe(1);
    await settle(f);
    expect(f.x()).toBe(160);
  });
});

describe("the drag's axis: UIKit's rule for a pager inside a scroll view", () => {
  /**
   * A drag `degrees` up from leftward, in 4 px steps every 8 ms, then a lift.
   * Returns whether each move was cancelled (a cancelled move is Safari
   * giving the page no scroll for the whole touch).
   */
  async function angledDrag(
    f: Fixture,
    degrees: number,
    length = 150,
  ): Promise<boolean[]> {
    const rad = (degrees * Math.PI) / 180;
    const x0 = 300;
    const y0 = 200;
    touch('touchstart', f.page, x0, y0, now);
    const steps = Math.round(length / 4);
    const cancelled: boolean[] = [];
    for (let i = 1; i <= steps; i++) {
      await advance(8, f.clock);
      const d = (length * i) / steps;
      const move = touch(
        'touchmove',
        f.page,
        x0 - d * Math.cos(rad),
        y0 - d * Math.sin(rad),
        now,
      );
      cancelled.push(move.defaultPrevented);
    }
    await advance(8, f.clock);
    touch(
      'touchend',
      f.page,
      x0 - length * Math.cos(rad),
      y0 - length * Math.sin(rad),
      now,
    );
    return cancelled;
  }

  for (const degrees of [35, 45]) {
    it(`a ${degrees}° drag is the pager's (|dx| ≥ |dy|, the tie included): it pages, and its moves are cancelled from the pan's start at 10 pt, not before`, async () => {
      const f = setup();
      const cancelled = await angledDrag(f, degrees);
      // 4 px steps: the horizontal part reaches the pan's 10 pt hysteresis on
      // the fourth move. Nothing claims the touch before the pan begins
      // (no earlier committed claim); every move from then on is cancelled.
      const start = 3;
      expect(cancelled.slice(0, start).some(Boolean)).toBe(false);
      expect(cancelled.slice(start).every(Boolean)).toBe(true);
      await frames(f, 40);
      expect(f.calls).toContain('index:1:drag');
    });
  }

  it("a 50° drag is the page's: the pager stays and cancels nothing", async () => {
    const f = setup();
    const cancelled = await angledDrag(f, 50);
    expect(cancelled.some(Boolean)).toBe(false);
    await frames(f, 40);
    expect(f.x()).toBe(0);
    expect(f.calls).toEqual([]);
  });

  it('inside a sheet (an enclosing vertical pan takes part in the touch), a 35° drag moves neither, as UIKit does', async () => {
    const f = setup();
    const sheetPan = new PanGestureRecognizer({direction: 'vertical'});
    const detach = f.host.attach(document.body, sheetPan);
    try {
      const cancelled = await angledDrag(f, 35);
      expect(cancelled.some(Boolean)).toBe(false);
      await frames(f, 40);
      expect(f.x()).toBe(0);
      expect(f.calls).toEqual([]);
      expect(sheetPan.state === 'began' || sheetPan.state === 'changed').toBe(
        false,
      );
    } finally {
      detach();
    }
  });
});

describe('review fixes', () => {
  // spec:AST-094 FR41: a hold that does nothing keeps the browser's native
  // long-press selection; stopping a settle does something.
  it('a finger on a resting track leaves its text selectable; one that catches a settle locks it until the lift', async () => {
    const f = setup({defaultIndex: 0});
    // Whether a selection starting on the page's text is refused: where iOS
    // WebKit does not run (jsdom), the shared lock cancels `selectstart` and
    // writes no style.
    const refuses = () => {
      const event = new Event('selectstart', {bubbles: true, cancelable: true});
      f.page.dispatchEvent(event);
      return event.defaultPrevented;
    };
    touch('touchstart', f.page, 200, 100, now);
    await advance(16, f.clock);
    expect(refuses()).toBe(false);
    touch('touchend', f.page, 200, 100, now);
    await advance(16, f.clock);
    f.pager.goTo(3);
    await advance(16, f.clock);
    await advance(16, f.clock);
    expect(f.pager.isSettling).toBe(true);
    touch('touchstart', f.page, 200, 100, now);
    await advance(16, f.clock);
    expect(refuses()).toBe(true);
    await advance(120, f.clock);
    touch('touchend', f.page, 200, 100, now);
    await advance(16, f.clock);
    expect(refuses()).toBe(false);
    expect(f.track.style.getPropertyValue('user-select')).toBe('');
  });

  // spec:AST-017 FR59: a mouse keeps its released behavior. Its press stops a
  // settle as a finger's does (spec:AST-094 FR43) and locks no selection.
  it('a mouse that catches a settle stops it and leaves the text selectable', async () => {
    const f = setup({defaultIndex: 0});
    stubMedia(false, false);
    const refuses = () => {
      const event = new Event('selectstart', {bubbles: true, cancelable: true});
      f.page.dispatchEvent(event);
      return event.defaultPrevented;
    };
    f.pager.goTo(3);
    await advance(16, f.clock);
    await advance(16, f.clock);
    expect(f.pager.isSettling).toBe(true);
    mouse('pointerdown', f.page, 200, 100, now);
    await advance(16, f.clock);
    expect(refuses()).toBe(false);
    // The catch stops the settle after UIKit's catch delay, as a finger's.
    await advance(120, f.clock);
    expect(f.pager.isSettling).toBe(false);
    expect(refuses()).toBe(false);
    mouse('pointerup', f.page, 200, 100, now);
    await advance(16, f.clock);
    expect(refuses()).toBe(false);
    expect(f.track.style.getPropertyValue('user-select')).toBe('');
  });

  // spec:AST-094 FR6.
  it('a goTo that retargets a running move keeps its velocity, read from the curve', async () => {
    const f = setup({defaultIndex: 0});
    f.pager.goTo(2);
    await advance(16, f.clock);
    await advance(16, f.clock);
    await advance(16, f.clock);
    const before = f.animator.getVelocity('x', now);
    expect(Math.abs(before)).toBeGreaterThan(1000);
    f.pager.goTo(3);
    expect(f.animator.getVelocity('x', now)).toBeCloseTo(before, -1);
    await settle(f);
    expect(f.x()).toBe(-3 * WIDTH);
  });

  // spec:AST-094 FR37.
  it('a release moving back toward the start page settles there, whatever the travel', async () => {
    const f = setup({defaultIndex: 1});
    // One touch: 70 % of the way to page 2, then back 20 px at 125 px/s,
    // lifted while moving back.
    let x = 350;
    touch('touchstart', f.page, x, 100, now);
    for (let i = 0; i < 70; i++) {
      await advance(8, f.clock);
      x -= 4;
      touch('touchmove', f.page, x, 100, now);
    }
    for (let i = 0; i < 10; i++) {
      await advance(16, f.clock);
      x += 2;
      touch('touchmove', f.page, x, 100, now);
    }
    touch('touchend', f.page, x, 100, now);
    await settle(f);
    expect(f.pager.index).toBe(1);
    expect(f.x()).toBe(-WIDTH);
  });

  // react-component-runtime INV2: setOptions and a controlled goTo run from
  // the owner's Effect, so nothing they cause may call back from inside it.
  it('a gap change before a release reports keeps the report and delivers it, and the settle, from a frame callback', async () => {
    const f = setup({defaultIndex: 1});
    await drag(f, {from: 300, dx: -250, step: 4, dt: 8, hold: 100});
    expect(f.pager.index).toBe(2);
    expect(f.calls).toEqual([]);
    f.pager.setOptions({gap: 10});
    // Nothing from inside the update.
    expect(f.calls).toEqual([]);
    expect(f.x()).toBe(-2 * (WIDTH + 10));
    await advance(16, f.clock);
    expect(f.calls).toEqual(['index:2:drag', 'settle:2:1']);
  });

  it('a controlled move calls nothing from inside the update: its settle comes on the next frame', async () => {
    const f = setup({defaultIndex: 1});
    f.pager.goTo(3, {animated: false, reason: 'controlled'});
    expect(f.calls).toEqual([]);
    await advance(16, f.clock);
    expect(f.calls).toEqual(['settle:3:1']);
  });

  it('a count that clamps the page calls nothing from inside the update', async () => {
    const f = setup({defaultIndex: 4});
    f.pager.setOptions({count: 3});
    expect(f.pager.index).toBe(2);
    expect(f.calls).toEqual([]);
    await advance(16, f.clock);
    expect(f.calls).toEqual(['settle:2:4']);
  });

  it('callbacks an update left for the next frame are dropped when the pager detaches first', async () => {
    const f = setup({defaultIndex: 1});
    f.pager.goTo(3, {animated: false, reason: 'controlled'});
    f.pager.dispose();
    await advance(16, f.clock);
    expect(f.calls).toEqual([]);
  });

  it('a vertical swipe that starts on a settling track still reaches the page: the catch never cancels its moves', async () => {
    const f = setup();
    await drag(f, {dx: -250, step: 10, dt: 8});
    await frames(f, 2);
    expect(f.pager.isSettling).toBe(true);
    touch('touchstart', f.page, 200, 100, now);
    const cancelled: boolean[] = [];
    for (let i = 1; i <= 10; i++) {
      await advance(8, f.clock);
      cancelled.push(
        touch('touchmove', f.page, 200, 100 - i * 6, now).defaultPrevented,
      );
    }
    await advance(8, f.clock);
    touch('touchend', f.page, 200, 40, now);
    expect(cancelled.some(Boolean)).toBe(false);
  });

  it('a drag that catches an overscrolled track starts from under the finger, with no jump', async () => {
    const f = setup();
    // Pulled right past page 0 and released: the track springs back from x > 0.
    await drag(f, {dx: 160, step: 10, dt: 8});
    await frames(f, 2);
    const caught = f.x();
    expect(caught).toBeGreaterThan(10);
    touch('touchstart', f.page, 200, 100, now);
    const xs: number[] = [];
    for (const dx of [4, 8, 12, 14, 15]) {
      await advance(8, f.clock);
      touch('touchmove', f.page, 200 + dx, 100, now);
      xs.push(f.x());
    }
    // Each move shifts the track by at most the finger's step (banding only
    // shrinks it): no move jumps.
    for (let i = 1; i < xs.length; i++) {
      expect(Math.abs(xs[i] - xs[i - 1])).toBeLessThanOrEqual(4.01);
    }
    expect(Math.abs(xs[0] - caught)).toBeLessThan(30);
  });

  it('a gap change keeps the track on its page', () => {
    const f = setup({gap: 0, defaultIndex: 3});
    expect(f.x()).toBe(-3 * WIDTH);
    f.pager.setOptions({gap: 40});
    expect(f.x()).toBe(-3 * (WIDTH + 40));
  });

  it('turning loop off on a virtual page lands on the page shown', () => {
    const f = setup({loop: true});
    // Forward one page at a time, past the last page twice over: virtual 7.
    for (const page of [1, 2, 3, 4, 0, 1, 2]) {
      f.pager.goTo(page, {animated: false});
    }
    expect(f.pager.virtualIndex).toBe(7);
    expect(f.pager.index).toBe(2);
    f.pager.setOptions({loop: false});
    expect(f.pager.index).toBe(2);
    expect(f.x()).toBe(-2 * WIDTH);
  });

  it('one onSettle per settle when a finger lands as the settle ends and holds', async () => {
    const f = setup();
    f.pager.goTo(1);
    // 50 ms before setContentOffset's 300 ms ends, a finger lands and holds.
    await advance(250, f.clock);
    touch('touchstart', f.page, 200, 100, now);
    await advance(400, f.clock);
    touch('touchend', f.page, 200, 100, now);
    await frames(f, 40);
    expect(f.calls.filter(c => c.startsWith('settle:'))).toEqual([
      'settle:1:0',
    ]);
  });
});

describe('usePager (React)', () => {
  function Paged(props: {
    index?: number;
    defaultIndex?: number;
    viewportKey?: string;
    isPanEnabled?: boolean;
    onIndexChange?: (index: number) => void;
    onSettle?: (index: number, previous: number) => void;
    onPager?: (pager: Pager) => void;
  }) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const pager = usePager({
      viewportRef,
      trackRef,
      count: 5,
      index: props.index,
      defaultIndex: props.defaultIndex,
      isPanEnabled: props.isPanEnabled,
      onIndexChange: props.onIndexChange,
      onSettle: props.onSettle,
    });
    props.onPager?.(pager);
    return createElement(
      'div',
      {
        ref: viewportRef,
        key: props.viewportKey ?? 'a',
        'data-testid': 'viewport',
      },
      createElement('div', {ref: trackRef}),
    );
  }

  /**
   * A finger's drag 40 px toward page 2 and back to where the pan began
   * (10 px from the landing): the pan has begun and the track rests on the
   * start page.
   */
  function restingDrag(target: Element) {
    touch('touchstart', target, 300, 100, now);
    for (let i = 1; i <= 10; i++) {
      now += 8;
      vi.advanceTimersByTime(8);
      touch('touchmove', target, 300 - 4 * i, 100, now);
    }
    for (let i = 1; i <= 10; i++) {
      now += 8;
      vi.advanceTimersByTime(8);
      touch('touchmove', target, 260 + 3 * i, 100, now);
    }
  }

  /** Animation frames run by hand (the pager defers callbacks to a frame). */
  function handFrames() {
    const queued: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queued.push(callback);
      return queued.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    return (count = 3) => {
      for (let i = 0; i < count; i++) {
        for (const callback of queued.splice(0)) {
          callback(0);
        }
      }
    };
  }

  // The pager's contract: no callback runs from an unmount.
  it('an unmount that ends a drag resting on a page calls no onSettle, then or later', () => {
    const runFrames = handFrames();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(
      WIDTH,
    );
    const onSettle = vi.fn();
    const box: {pager: Pager | null} = {pager: null};
    const view = render(
      createElement(Paged, {
        defaultIndex: 1,
        onSettle,
        onPager: p => {
          box.pager = p;
        },
      }),
    );
    const track = view.getByTestId('viewport').firstElementChild as Element;
    restingDrag(track);
    expect(box.pager?.isDragging).toBe(true);
    expect(box.pager?.presentation()).toBe(WIDTH);
    view.unmount();
    runFrames(5);
    expect(onSettle).not.toHaveBeenCalled();
  });

  // ... and none from the owner's own update: the settle that turning the pan
  // off causes is reported after the commit, not inside its Effect.
  it('turning isPanEnabled off during a drag resting on a page calls onSettle after the commit, not inside its Effect', () => {
    const runFrames = handFrames();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(
      WIDTH,
    );
    const onSettle = vi.fn();
    const box: {pager: Pager | null} = {pager: null};
    const capture = (p: Pager) => {
      box.pager = p;
    };
    const view = render(
      createElement(Paged, {
        defaultIndex: 1,
        onSettle,
        isPanEnabled: true,
        onPager: capture,
      }),
    );
    const track = view.getByTestId('viewport').firstElementChild as Element;
    restingDrag(track);
    expect(box.pager?.isDragging).toBe(true);
    expect(box.pager?.presentation()).toBe(WIDTH);
    act(() => {
      view.rerender(
        createElement(Paged, {
          defaultIndex: 1,
          onSettle,
          isPanEnabled: false,
          onPager: capture,
        }),
      );
    });
    expect(onSettle).not.toHaveBeenCalled();
    act(() => {
      runFrames(3);
    });
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith(1, 1);
    view.unmount();
  });

  it('a controlled index change does not echo onIndexChange: the owner caused it', () => {
    const onIndexChange = vi.fn();
    const view = render(createElement(Paged, {index: 0, onIndexChange}));
    act(() => {
      view.rerender(createElement(Paged, {index: 2, onIndexChange}));
    });
    expect(onIndexChange).not.toHaveBeenCalled();
    view.unmount();
  });

  // A controlled index wins, as a controlled input's value does: a page the
  // pager reports (a swipe, or goTo) that the owner does not take returns the
  // pager to the index, and is not reported again.
  it('with a controlled index, a page the owner does not take returns the pager to the index', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const runFrames = () => {
      for (const callback of frames.splice(0)) {
        callback(0);
      }
    };
    const box: {pager: Pager | null} = {pager: null};
    // The owner keeps page 2 whatever the pager reports.
    const onIndexChange = vi.fn();
    const view = render(
      createElement(Paged, {
        index: 2,
        onIndexChange,
        onPager: p => {
          box.pager = p;
        },
      }),
    );
    act(() => {
      box.pager?.goTo(3);
    });
    for (let i = 0; i < 4; i++) {
      act(() => runFrames());
    }
    expect(onIndexChange).toHaveBeenCalledTimes(1);
    expect(onIndexChange).toHaveBeenCalledWith(3, 'goTo');
    expect(box.pager?.index).toBe(2);
    view.unmount();
  });

  it('with a controlled index, a page the owner takes stays', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const runFrames = () => {
      for (const callback of frames.splice(0)) {
        callback(0);
      }
    };
    const box: {pager: Pager | null} = {pager: null};
    function Owner() {
      const [index, setIndex] = useState(2);
      return createElement(Paged, {
        index,
        onIndexChange: setIndex,
        onPager: p => {
          box.pager = p;
        },
      });
    }
    const view = render(createElement(Owner));
    act(() => {
      box.pager?.goTo(3);
    });
    for (let i = 0; i < 4; i++) {
      act(() => runFrames());
    }
    expect(box.pager?.index).toBe(3);
    view.unmount();
  });

  // spec:AST-094 FR19 and FR43: recognizers attach for every pointer. Under a
  // fine pointer the host keeps its listener on the element and adds none to
  // the document at rest (FR24), and goTo moves the pager on either pointer.
  it('attaches the pan and the catch on a fine primary pointer as under a finger (spec:AST-094 FR19, FR43), adds no input listener to the document at rest (FR24), and goTo moves the pager', () => {
    stubMedia(false, false);
    const attach = vi.spyOn(GestureHost.prototype, 'attach');
    const listen = vi.spyOn(document, 'addEventListener');
    const inputListeners = () =>
      listen.mock.calls.filter(([type]) =>
        /^(touch|pointer|mouse|wheel)/.test(type),
      );
    const box: {pager: Pager | null} = {pager: null};
    const view = render(
      createElement(Paged, {
        onPager: p => {
          box.pager = p;
        },
      }),
    );
    expect(attach).toHaveBeenCalledTimes(2);
    expect(inputListeners()).toEqual([]);
    act(() => {
      box.pager?.goTo(2);
    });
    expect(box.pager?.index).toBe(2);
    view.unmount();
    stubMedia(false, true);
    const touchView = render(createElement(Paged, {}));
    expect(attach).toHaveBeenCalledTimes(4);
    touchView.unmount();
  });

  it('reads onPagesChange through the latest render, like the other callbacks', () => {
    // The page change arrives on the next animation frame: run frames by hand.
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const runFrames = () => {
      for (const callback of frames.splice(0)) {
        callback(0);
      }
    };
    const clientWidth = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(WIDTH);
    // Children 150 px wide, 10 px apart, from the track's start.
    const rects = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.child != null) {
          const i = Array.prototype.indexOf.call(
            this.parentElement?.children ?? [],
            this,
          );
          return new DOMRect(i * 160, 0, 150, 100);
        }
        if (this.dataset.track != null) {
          const n = this.children.length;
          return new DOMRect(0, 0, n * 160 - 10, 100);
        }
        return new DOMRect(0, 0, WIDTH, 100);
      });
    try {
      function Cards({
        count,
        onPagesChange,
      }: {
        count: number;
        onPagesChange: (pageCount: number) => void;
      }) {
        const viewportRef = useRef<HTMLDivElement>(null);
        const trackRef = useRef<HTMLDivElement>(null);
        usePager({
          viewportRef,
          trackRef,
          count,
          pages: 'children',
          onPagesChange,
        });
        return createElement(
          'div',
          {ref: viewportRef},
          createElement(
            'div',
            {ref: trackRef, 'data-track': ''},
            Array.from({length: count}, (_, i) =>
              createElement('div', {key: i, 'data-child': ''}),
            ),
          ),
        );
      }
      const first = vi.fn();
      const second = vi.fn();
      const view = render(
        createElement(Cards, {count: 5, onPagesChange: first}),
      );
      act(() => {
        view.rerender(createElement(Cards, {count: 6, onPagesChange: second}));
      });
      expect(second).not.toHaveBeenCalled();
      act(() => runFrames());
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith(5);
      view.unmount();
    } finally {
      rects.mockRestore();
      clientWidth.mockRestore();
    }
  });

  it('attaches again when the viewport element is replaced', () => {
    let pager: Pager | null = null;
    const onPager = (p: Pager) => {
      pager = p;
    };
    const view = render(createElement(Paged, {viewportKey: 'a', onPager}));
    const first = view.getByTestId('viewport');
    expect(pager!.pan.view).toBe(first);
    act(() => {
      view.rerender(createElement(Paged, {viewportKey: 'b', onPager}));
    });
    const second = view.getByTestId('viewport');
    expect(second).not.toBe(first);
    expect(pager!.pan.view).toBe(second);
    view.unmount();
  });
});

describe("pageForRelease: UIKit's measured page choices (402 pt pages)", () => {
  const PAGE = 402;
  const page = (fraction: number, velocity: number, startIndex = 1) =>
    pageForRelease({
      position: (startIndex + fraction) * PAGE,
      velocity,
      stride: PAGE,
      count: 6,
      startIndex,
    });

  it('released at rest, settles on the nearest page', () => {
    expect(page(0.485, 0)).toBe(1);
    expect(page(0.575, 0)).toBe(2);
    expect(page(0.45, 0)).toBe(1);
    expect(page(0.55, 0)).toBe(2);
    expect(page(-0.485, 0)).toBe(1);
    expect(page(-0.575, 0)).toBe(0);
  });

  it('pages with the velocity at the advance speed, from wherever the content is', () => {
    // The pan's last velocity sample at the lift, measured at 10, 25 and
    // 40 % of the page: the same flip everywhere.
    for (const fraction of [0.1, 0.25, 0.4]) {
      expect(page(fraction, 292.7)).toBe(1);
      expect(page(fraction, 298.6)).toBe(1);
      expect(page(fraction, 310.7)).toBe(2);
      expect(page(fraction, 329.9)).toBe(2);
      expect(page(-fraction, -298.6)).toBe(1);
      expect(page(-fraction, -310.7)).toBe(0);
    }
    // 600 pt/s from 6 % advances; 150 pt/s at 46 % stays.
    expect(page(0.06, 600)).toBe(2);
    expect(page(0.46, 150)).toBe(1);
    expect(page(-0.06, -600)).toBe(0);
  });

  it('a slow release past the midpoint still advances', () => {
    expect(page(0.55, 150)).toBe(2);
  });

  it('never travels more than one page from the page the drag started on', () => {
    // 1.5 pages from page 1 at 0, 600 and 3000 pt/s: page 2.
    expect(page(1.5, 0)).toBe(2);
    expect(page(1.5, 600)).toBe(2);
    expect(page(1.5, 3000)).toBe(2);
    // A flick of 1200 from 70 %: one page.
    expect(page(0.7, 1200)).toBe(2);
  });

  it('a flick against the drag returns to the start page', () => {
    expect(page(0.4, -600)).toBe(1);
    expect(page(-0.4, 600)).toBe(1);
  });

  // spec:AST-094 FR37, where UIKit, slower than the advance speed, takes the
  // nearest page.
  it('a release whose velocity points back toward the start page cancels, whatever the travel', () => {
    expect(page(0.7, -50)).toBe(1);
    expect(page(0.95, -299)).toBe(1);
    expect(page(-0.7, 50)).toBe(1);
    expect(page(-0.95, 299)).toBe(1);
    // At rest, or moving on, the travel decides as before.
    expect(page(0.7, 0)).toBe(2);
    expect(page(0.7, 50)).toBe(2);
    expect(page(-0.7, -50)).toBe(0);
  });

  it('clamps to the pages, or leaves the range when looping', () => {
    expect(page(0.3, 600, 5)).toBe(5);
    expect(page(-0.3, -600, 0)).toBe(0);
    expect(
      pageForRelease({
        position: 5.3 * PAGE,
        velocity: 600,
        stride: PAGE,
        count: 6,
        startIndex: 5,
        loop: true,
      }),
    ).toBe(6);
    expect(
      pageForRelease({
        position: -0.3 * PAGE,
        velocity: -600,
        stride: PAGE,
        count: 6,
        startIndex: 0,
        loop: true,
      }),
    ).toBe(-1);
  });

  it('a stale start page past either end counts from the nearest real page, so a release still pages', () => {
    // The count shrank under a drag that began on page 7 of 8.
    expect(
      pageForRelease({
        position: 400,
        velocity: -1000,
        stride: 100,
        count: 5,
        startIndex: 7,
      }),
    ).toBe(3);
    expect(
      pageForRelease({
        position: 0,
        velocity: 1000,
        stride: 100,
        count: 5,
        startIndex: -2,
      }),
    ).toBe(1);
    // At rest it lands on a real page.
    expect(
      pageForRelease({
        position: 400,
        velocity: 0,
        stride: 100,
        count: 3,
        startIndex: 4,
      }),
    ).toBe(2);
  });

  it('reads an exact page boundary as on it', () => {
    expect(page(0, 600)).toBe(2);
    expect(page(0, -600)).toBe(0);
    expect(page(0, 0)).toBe(1);
  });

  it('handles degenerate geometry', () => {
    expect(
      pageForRelease({
        position: 10,
        velocity: 0,
        stride: 0,
        count: 3,
        startIndex: 0,
      }),
    ).toBe(0);
    expect(
      pageForRelease({
        position: 10,
        velocity: 0,
        stride: 100,
        count: 1,
        startIndex: 0,
      }),
    ).toBe(0);
  });
});
