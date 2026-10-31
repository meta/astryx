// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useSheetGestures.test.ts
 * @input Uses vitest, @testing-library/react renderHook, useSheetGestures
 * @output Unit tests for useSheetGestures behavior
 * @position Testing; validates useSheetGestures.ts implementation
 *
 * SYNC: When useSheetGestures.ts changes, update tests to match new behavior
 */

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  afterAll,
} from 'vitest';
import {act, renderHook} from '@testing-library/react';
import {useState} from 'react';
import {END_HOLD_MS} from '../motion/animator';
/** The properties a played animation changes over its keyframes. */
function changedProperties(animation: {keyframes: Keyframe[]}): string[] {
  const first = (animation.keyframes[0] ?? {}) as Record<string, unknown>;
  const changed = new Set<string>();
  for (const frame of animation.keyframes) {
    for (const [key, value] of Object.entries(frame)) {
      if (key !== 'offset' && key !== 'easing' && key !== 'composite') {
        if (String(value) !== String(first[key])) {
          changed.add(key);
        }
      }
    }
  }
  return [...changed];
}

/** When a played animation stops changing, in ms after its start. */
function settledMs(animation: {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}): number {
  const frames = animation.keyframes as Record<string, unknown>[];
  const last = frames[frames.length - 1];
  const same = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    Object.keys({...a, ...b}).every(
      key =>
        key === 'offset' ||
        key === 'easing' ||
        key === 'composite' ||
        String(a[key]) === String(b[key]),
    );
  let i = frames.length - 1;
  while (i > 0 && same(frames[i - 1], last)) {
    i -= 1;
  }
  const offset =
    typeof frames[i].offset === 'number'
      ? (frames[i].offset as number)
      : i / Math.max(1, frames.length - 1);
  return offset * (animation.options.duration as number);
}

import {solveSpring, toSpring} from '../motion/spring';
import {sheet, springs} from '../motion/uikit';
import {
  isInsideNestedLayer,
  useSheetGestures,
  type UseSheetGesturesOptions,
} from './useSheetGestures';

const SHEET_HEIGHT = 400;

// How far a pan's touch travels before the pan begins (UIKit's hysteresis).
// Its translation leaves that travel out.
const PAN_THRESHOLD = 10;

type Contact = {id: number; x: number; y: number};

// The document's gesture host outlives a test, and its clock never runs
// backwards (an event older than the last one counts as the last one's
// time): every test's input times start past the previous test's.
let timeBase = 0;
beforeEach(() => {
  timeBase += 1_000_000;
});

/**
 * A touch event as the browser sends it, at an explicit time: the event's own
 * timestamp, which the gesture recognizers read.
 */
function touchEvent(
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  target: EventTarget,
  changed: Contact[],
  time: number,
  all: Contact[] = type === 'touchend' || type === 'touchcancel' ? [] : changed,
  cancelable = true,
): Event {
  const event = new Event(type, {
    bubbles: true,
    cancelable,
    composed: true,
  });
  const toTouch = (contact: Contact) => ({
    identifier: contact.id,
    clientX: contact.x,
    clientY: contact.y,
    target,
  });
  Object.defineProperty(event, 'changedTouches', {value: changed.map(toTouch)});
  Object.defineProperty(event, 'touches', {value: all.map(toTouch)});
  Object.defineProperty(event, 'timeStamp', {value: timeBase + time});
  target.dispatchEvent(event);
  return event;
}

/**
 * A mouse's pointer event at an explicit time, dispatched on `target` as the
 * browser does: the gesture host's recognizers take it, as they take every
 * pointer (spec:AST-094 FR19, FR43).
 */
let currentHook: Hook | null = null;
function mouseEvent(
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  target: HTMLElement,
  y: number,
  time: number,
  button = 0,
  pointerType: 'mouse' | 'pen' | 'touch' = 'mouse',
): Event {
  if (currentHook == null) {
    throw new Error('attach the sheet before a mouse event');
  }
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 1,
    pointerType,
    isPrimary: true,
    button: type === 'pointermove' ? -1 : button,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    clientX: 50,
    clientY: y,
  });
  Object.defineProperty(event, 'timeStamp', {value: timeBase + time});
  if (type === 'pointerdown') {
    pressed = {target, y, pointerType};
  } else if (type === 'pointerup' || type === 'pointercancel') {
    pressed = null;
  }
  target.dispatchEvent(event);
  return event;
}
// The pointer a test left pressed, which the next test must not inherit.
let pressed: {
  target: HTMLElement;
  y: number;
  pointerType: 'mouse' | 'pen' | 'touch';
} | null = null;

/**
 * The sheet, in the document: the surface the hook measures and moves, its
 * handle (the handle's pan attaches there) and its scrolling body.
 */
function makeTarget(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({height: SHEET_HEIGHT}) as DOMRect;
  const handle = document.createElement('div');
  handle.dataset.part = 'handle';
  const body = document.createElement('div');
  body.dataset.part = 'body';
  el.append(handle, body);
  document.body.append(el);
  return el;
}

function handleOf(target: HTMLElement): HTMLElement {
  return target.querySelector<HTMLElement>('[data-part="handle"]') ?? target;
}

function bodyOf(target: HTMLElement): HTMLElement {
  return target.querySelector<HTMLElement>('[data-part="body"]') ?? target;
}

/** The sheet an element inside it (its body, or a box in the body) is in. */
function sheetOf(element: HTMLElement): HTMLElement {
  return (element.closest<HTMLElement>('[data-part="body"]') ?? element)
    .parentElement as HTMLElement;
}

/** Give an element the scroll metrics jsdom cannot lay out. */
function scrollMetrics(
  element: HTMLElement,
  metrics: {scrollTop?: number; scrollHeight?: number; clientHeight?: number},
) {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
}

/**
 * The sheet with a scrolling body: the body scrolls its content (an
 * `overflow-y: auto` box with the given metrics), as BottomSheetPanel's does.
 */
function makeScroller(metrics: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}): HTMLElement {
  const body = bodyOf(makeTarget());
  body.style.overflowY = 'auto';
  scrollMetrics(body, metrics);
  return body;
}

/**
 * Fingers on the page: each event lists every finger still down in
 * `touches`, on a clock of its own 16 ms apart. `cancelable: false` is a
 * move the browser sends once it scrolls with the finger.
 */
function fingers() {
  stubCoarsePointer();
  const down = new Map<number, Contact>();
  let clock = 0;
  return (
    target: EventTarget,
    type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
    y: number,
    {id = 1, cancelable = true}: {id?: number; cancelable?: boolean} = {},
  ): Event => {
    clock += 16;
    const contact = {id, x: 50, y};
    if (type === 'touchstart' || type === 'touchmove') {
      down.set(id, contact);
    } else {
      down.delete(id);
    }
    return touchEvent(
      type,
      target,
      [contact],
      clock,
      [...down.values()],
      cancelable,
    );
  };
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  // The release springs run on the motion foundation's animator, whose clock
  // is performance.now() and whose curves end on a timer: fake both, so a
  // test decides when a spring has landed.
  vi.useFakeTimers({
    toFake: [
      'performance',
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
});

afterEach(() => {
  // A test that ends mid-drag ends its contacts before its hook unmounts,
  // so the gesture host goes idle and reads the next test's primary pointer:
  // a pointer left pressed lifts where it is, and losing window focus
  // cancels every touch in flight.
  if (pressed != null && currentHook != null) {
    const {target, y, pointerType} = pressed;
    act(() => {
      mouseEvent('pointerup', target, y, 100_000, 0, pointerType);
    });
  }
  window.dispatchEvent(new Event('blur'));
  // What the host defers to the next task or frame (a mouse drag's
  // selection hold lifts one task after its press ends; touch-action reads
  // batch into the next frame) runs on this test's clock, so the next test
  // does not inherit it.
  if (vi.isFakeTimers()) {
    act(() => {
      vi.runOnlyPendingTimers();
    });
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.documentElement.style.overflow = '';
});
beforeEach(() => {
  document.documentElement.style.overflow = 'hidden';
  // jsdom has no hit test. The gesture host asks for one only on iOS WebKit,
  // for a touch while the animator moves an element; null keeps the touch
  // where the engine sent it.
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => null,
  });
});

/**
 * A finger: a coarse primary pointer, here in WebKit on iOS. Every touch
 * device takes UIKit's rule and springs (one touch model, AST-094); a mouse
 * keeps today's (releaseMotion.ts, sheetRelease.ts).
 */
/**
 * A coarse primary pointer: a finger there takes UIKit's presentation
 * (spec:AST-094 FR13), and the gesture host's recognizers serve it only
 * there (FR19); every other query stays unmatched.
 */
function stubCoarsePointer() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('pointer: coarse'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function stubIosIdiom({reducedMotion = false}: {reducedMotion?: boolean} = {}) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches:
        query.includes('pointer: coarse') ||
        (reducedMotion && query.includes('prefers-reduced-motion')),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal('CSS', {
    supports: (condition: string) =>
      condition.includes('-webkit-touch-callout'),
    escape: (value: string) => value,
  });
}

/** Lets every running spring reach its end (the animator's clock and timers). */
function land() {
  act(() => {
    vi.advanceTimersByTime(2000);
  });
}

/** The sheet's travel channel (`translate`), in px down. */
function travel(el: HTMLElement): number {
  const [, y = '0px'] = el.style.translate.split(' ');
  return Number.parseFloat(y);
}

/** A keyframe's vertical travel, px (its `translate`). */
function translateYOf(frame: Keyframe): number {
  return Number.parseFloat(String(frame.translate).split(' ')[1]);
}

/**
 * The keyframes a recorded animation plays up to `untilMs` after its start,
 * as (ms, value). The animator compiles a curve into keyframes on a 30 Hz
 * grid, splitting each chord until it is within a quarter of a pixel of the
 * curve: every keyframe lies on the curve, and a point between two is the
 * browser's interpolation, so a curve is checked at its keyframes.
 */
function keyframesUntil(
  animation: {keyframes: Keyframe[]; options: KeyframeAnimationOptions},
  read: (frame: Keyframe) => number,
  untilMs: number,
): {t: number; value: number}[] {
  const duration = animation.options.duration as number;
  const frames = animation.keyframes
    .map(frame => ({
      t: (frame.offset as number) * duration,
      value: read(frame),
    }))
    .filter(frame => frame.t <= untilMs);
  // The grid puts a keyframe in every 30 Hz interval.
  expect(frames.length).toBeGreaterThanOrEqual(
    Math.floor(untilMs / (1000 / 30)),
  );
  return frames;
}

/**
 * A finger moving from `from` to `to` (px) between `t0` and `t1` (ms) on
 * pointer events every `step` ms (60 Hz by default): the estimator reads
 * gaps longer than its assume-stopped window as a finger at rest, so a
 * throw is a stream, not two samples.
 */
function stream(
  hook: Hook,
  target: HTMLElement,
  {
    from,
    to,
    t0,
    t1,
    step = 1000 / 60,
  }: {
    from: number;
    to: number;
    t0: number;
    t1: number;
    step?: number;
  },
) {
  const count = Math.max(1, Math.round((t1 - t0) / step));
  for (let i = 1; i <= count; i++) {
    move(
      hook,
      from + ((to - from) * i) / count,
      t0 + ((t1 - t0) * i) / count,
      target,
    );
  }
}

function setup(options: Partial<UseSheetGesturesOptions> = {}) {
  const onDismiss = vi.fn();
  const hook = renderHook(
    (props: UseSheetGesturesOptions) => useSheetGestures(props),
    {
      initialProps: {
        isOpen: true,
        onDismiss,
        ...options,
      },
    },
  );
  return {hook, onDismiss};
}

type Hook = {
  result: {current: ReturnType<typeof useSheetGestures>};
};

// The live drag position: written per input sample, not rendered.
function liveOffset(hook: Hook): number {
  return hook.result.current.activeOffsetRef.current;
}

/**
 * Registers the sheet's elements the way the component does on mount: the
 * handle and the body (their pans attach to them) and the sheet, whose
 * registration renders, so the recognizers attach in that commit.
 */
function attach(hook: Hook, target: HTMLElement) {
  currentHook = hook;
  act(() => {
    hook.result.current.handleProps.ref(handleOf(target));
    hook.result.current.bodyProps.ref(bodyOf(target));
  });
  act(() => hook.result.current.sheetRef(target));
}

/**
 * The pointer on the handle. A finger where the primary pointer is coarse; a
 * mouse otherwise, as on a desktop (one touch model: the presentation keys on
 * the primary pointer, a finger's release fades under reduced motion either
 * way). `useFinger`/`useMouse` pick one for a test.
 */
let pointerKind: 'touch' | 'mouse' | null = null;
function asFinger() {
  pointerKind = 'touch';
  stubCoarsePointer();
}
function asMouse() {
  pointerKind = 'mouse';
}
function currentPointer(): 'touch' | 'mouse' {
  return (
    pointerKind ?? (matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse')
  );
}
beforeEach(() => {
  pointerKind = null;
  // A test that ends mid-drag leaves its touch down in the document's
  // gesture host: losing window focus cancels every touch in flight.
  window.dispatchEvent(new Event('blur'));
});

let nextTouchId = 1;
const contacts = new WeakMap<
  HTMLElement,
  {id: number; y: number; t: number; kind: 'touch' | 'mouse'; landed: boolean}
>();

function contactDown(target: HTMLElement, y: number, t: number) {
  const contact = contacts.get(target);
  if (contact == null) {
    throw new Error('move or lift before down');
  }
  if (contact.kind === 'mouse') {
    mouseEvent('pointerdown', handleOf(target), y, t);
  } else {
    touchEvent('touchstart', handleOf(target), [{id: contact.id, x: 50, y}], t);
  }
}

// The finger touches down one pan threshold behind its first move (see
// `down`), as late as that move but on the timestamp it landed at.
function landBehind(target: HTMLElement, toward: number) {
  const contact = contacts.get(target);
  if (contact == null) {
    throw new Error('move or lift before down');
  }
  if (!contact.landed) {
    contact.landed = true;
    const direction = Math.sign(toward - contact.y);
    // Every pointer's pan begins past its threshold (spec:AST-094 FR17,
    // FR19, FR43), a mouse's too.
    const behind = PAN_THRESHOLD;
    contactDown(target, contact.y - direction * behind, contact.t);
  }
  return contact;
}

/**
 * A finger (or a mouse, see `currentPointer`) lands on the handle at `y`
 * (px) at `t` (ms). The handle's pan reports UIKit's translation, which
 * leaves out the travel before the pan begins (PAN_THRESHOLD), so the
 * contact touches down that far behind its first move: the positions a test
 * moves to are the drag's. A contact that never moves lifts where it landed.
 * `press` lands at once, for a touch-down that matters on its own (a catch).
 */
function down(hook: Hook, y: number, t: number, target: HTMLElement) {
  attach(hook, target);
  contacts.set(target, {
    id: nextTouchId++,
    y,
    t,
    kind: currentPointer(),
    landed: false,
  });
}

/** A contact lands on the handle at once, at `y` and `t`. */
function press(hook: Hook, y: number, t: number, target: HTMLElement) {
  attach(hook, target);
  contacts.set(target, {
    id: nextTouchId++,
    y,
    t,
    kind: currentPointer(),
    landed: true,
  });
  act(() => contactDown(target, y, t));
}

function move(hook: Hook, y: number, t: number, target: HTMLElement) {
  act(() => {
    const contact = landBehind(target, y);
    if (contact.kind === 'mouse') {
      mouseEvent('pointermove', handleOf(target), y, t);
    } else {
      touchEvent(
        'touchmove',
        handleOf(target),
        [{id: contact.id, x: 50, y}],
        t,
      );
    }
  });
}

/** The contact lifts at `y` and `t`; the release starts and runs on. */
function lift(hook: Hook, y: number, t: number, target: HTMLElement) {
  act(() => {
    const contact = landBehind(target, y);
    if (contact.kind === 'mouse') {
      mouseEvent('pointerup', handleOf(target), y, t);
    } else {
      touchEvent('touchend', handleOf(target), [{id: contact.id, x: 50, y}], t);
    }
  });
}
/**
 * The finger comes to rest at `y`: two still moves after it gets there.
 * UIKit's velocity filter (0.2 × the newest event's speed + 0.8 × the one
 * before) only reads zero after two of them, and never decays on its own: a
 * finger that stops sending events keeps its last speed.
 */
function restAt(hook: Hook, y: number, t: number, target: HTMLElement) {
  move(hook, y, t, target);
  move(hook, y, t + 50, target);
  move(hook, y, t + 100, target);
}

function up(hook: Hook, y: number, t: number, target: HTMLElement) {
  lift(hook, y, t, target);
  // The release spring lands before the test goes on, as a finger that lifts
  // and comes back later would find it.
  land();
}

describe('isInsideNestedLayer', () => {
  it("is true for a target inside a <dialog> rendered within the body, and false for the body's own content", () => {
    const body = document.createElement('div');
    const own = document.createElement('button');
    body.append(own);
    const nested = document.createElement('dialog');
    const nestedHandle = document.createElement('div');
    nested.append(nestedHandle);
    body.append(nested);
    expect(isInsideNestedLayer(own, body)).toBe(false);
    expect(isInsideNestedLayer(body, body)).toBe(false);
    expect(isInsideNestedLayer(nestedHandle, body)).toBe(true);
    expect(isInsideNestedLayer(nested, body)).toBe(true);
    // A dialog above the body (the sheet's own) does not count.
    const ownDialog = document.createElement('dialog');
    ownDialog.append(body);
    expect(isInsideNestedLayer(own, body)).toBe(false);
    expect(isInsideNestedLayer(null, body)).toBe(false);
  });
});

describe('useSheetGestures', () => {
  it('dismisses on a fast downward flick (swipe-to-close)', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    // 60px in 20ms = 3px/ms, and 60px > the flick distance floor (two
    // moves: the release filter needs two moved samples, spec:AST-100 FR2).
    move(hook, 30, 10, t);
    move(hook, 60, 20, t);
    up(hook, 60, 22, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('settles instead of dismissing on a downward flick when canDismiss is false', () => {
    const onSnap = vi.fn();
    const onScrimOpacity = vi.fn();
    const {hook, onDismiss} = setup({
      canDismiss: false,
      snapHeights: () => [200],
      onSnap,
      onScrimOpacity,
    });
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 30, 10, t);
    move(hook, 60, 20, t);
    up(hook, 60, 22, t);

    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(200);
    expect(onSnap).toHaveBeenLastCalledWith(200);
    // The 200px stop is half the sheet — a working surface, not a peek — so
    // the backdrop stays full there.
    expect(onScrimOpacity).toHaveBeenLastCalledWith(1);
  });

  it('expands to the tallest detent on a fast upward flick', () => {
    const onSnap = vi.fn();
    const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    // Start rested at a lower detent by first snapping there via a slow drag.
    down(hook, 0, 0, t);
    move(hook, 200, 400, t); // slow drag down toward the 200px detent
    up(hook, 200, 800, t);
    onSnap.mockClear();
    // Now flick up fast: 60px in 20ms = 3px/ms, over the distance floor.
    down(hook, 200, 1000, t);
    move(hook, 170, 1010, t);
    move(hook, 140, 1020, t);
    up(hook, 140, 1022, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSnap).toHaveBeenLastCalledWith(SHEET_HEIGHT); // full height
    expect(hook.result.current.settledOffset).toBe(0);
  });

  describe("release projection under a finger (UIKit's rule)", () => {
    beforeEach(() => stubIosIdiom());

    // A release is judged where the sheet would be after
    // sheet.release.projectionSeconds at the finger's velocity, not where the
    // finger left it; the dismissed position (gone below the screen) counts
    // as one of the positions (sheetRelease.ts). Here: detents at 0 and 200,
    // gone at 400.
    it('dismisses a throw released short of halfway to gone', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      // 1600 px/s: the finger stops at 160, but the release projects to
      // 160 + 1600 × 0.1 = 320, nearer gone (400) than the detent (200).
      stream(hook, t, {from: 0, to: 160, t0: 0, t1: 100});
      up(hook, 160, 102, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('lands a throw on the next detent once it projects past halfway', () => {
      const onSnap = vi.fn();
      const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
      const t = makeTarget();
      down(hook, 0, 0, t);
      // 600 px/s from 60: projected 60 + 68 = 128, past halfway to 200.
      stream(hook, t, {from: 0, to: 60, t0: 0, t1: 100});
      up(hook, 60, 102, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(200);
      expect(onSnap).toHaveBeenLastCalledWith(200);
    });

    it('returns a gentle throw that does not project past halfway', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      // 300 px/s from 60: projected 94, still nearer the open detent.
      stream(hook, t, {from: 0, to: 60, t0: 0, t1: 200});
      up(hook, 60, 202, t);
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('reads a throw that begins after a hold at its own speed, not the average since touch-down', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 0, 250, t); // a still hold on the handle
      // then 1200 px/s: projected 60 + 137 = 197 → the 200 detent. The
      // average since touch-down (200 px/s) would have projected 83 → open.
      stream(hook, t, {from: 0, to: 60, t0: 250, t1: 300});
      up(hook, 60, 302, t);
      expect(hook.result.current.settledOffset).toBe(200);
    });

    it('reads the velocity from the timestamps the events carry, not from when they are handled', () => {
      // The same throw, handled late and all at once: the release still
      // projects at the speed the finger moved. 160 px in 100 ms (1600 px/s)
      // projects 160 px further, to 320, past halfway (300) from the 200 px
      // detent to gone (400); 1500 px/s would land exactly on that midpoint,
      // where float rounding of the event times would decide.
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      vi.advanceTimersByTime(500); // a busy main thread, then the batch
      stream(hook, t, {from: 0, to: 160, t0: 0, t1: 100});
      up(hook, 160, 102, t);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('keeps the throw through a still finger lifted within 40 ms, as UIKit does', () => {
      // A still finger sends no events to lower the speed: UIKit reports
      // the last moving velocity at the lift (spec:AST-100 FR2).
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      stream(hook, t, {from: 0, to: 60, t0: 0, t1: 20, step: 10}); // 3000 px/s ...
      up(hook, 60, 55, t); // ... then 35 ms still, then the lift
      // Projected 60 + 3000 × 0.1 = 360, nearest gone (400).
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('cancels a release moving back toward where the drag began, whatever the travel so far (spec:AST-094 FR37)', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      // From the tallest detent down past the midpoint to 150 px ...
      down(hook, 0, 0, t);
      stream(hook, t, {from: 0, to: 150, t0: 0, t1: 300});
      // ... then back up at 50 px/s and let go at 146 px, nearest the 200 px
      // detent: the drag cancels to where it began.
      move(hook, 148, 340, t);
      move(hook, 146, 380, t);
      up(hook, 146, 382, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('releases no throw from a finger held still for longer than 40 ms before the lift', () => {
      // UIKit would keep the last motion through a silent rest; the release
      // filter reads 0 after its stillness interval, as Android's does, so a
      // finger that stopped never flicks (spec:AST-100 FR2).
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      stream(hook, t, {from: 0, to: 60, t0: 0, t1: 20}); // 3000 px/s ...
      up(hook, 60, 400, t); // ... then 380 ms still, then the lift
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('releases no throw from a finger that came to rest before lifting', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      stream(hook, t, {from: 0, to: 60, t0: 0, t1: 20});
      restAt(hook, 60, 100, t);
      up(hook, 60, 400, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('settles a throw that would project past halfway to gone at the shortest detent when canDismiss is false', () => {
      const {hook, onDismiss} = setup({
        canDismiss: false,
        snapHeights: () => [200],
      });
      const t = makeTarget();
      down(hook, 0, 0, t);
      stream(hook, t, {from: 0, to: 150, t0: 0, t1: 100});
      up(hook, 150, 102, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(200);
    });
  });

  describe("a mouse's release follows UIKit's rule, as a finger's does (spec:AST-094 FR36, FR43)", () => {
    // One decision at the release for every pointer: the offset projected
    // 0.1 s ahead at the release velocity picks the stop (sheetRelease.ts);
    // what plays the settle follows the presentation (FR13).
    it('lands a medium throw short of halfway to gone on the shortest detent', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      // 150px in 150ms = 1000 px/s, under a flick: projected to 250, nearest
      // the 200px detent (gone is at 400).
      move(hook, 50, 50, t);
      move(hook, 100, 100, t);
      move(hook, 150, 150, t);
      up(hook, 150, 152, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(200);
    });

    it('settles a gentle throw back where its projection is nearest', () => {
      const onSnap = vi.fn();
      const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
      const t = makeTarget();
      down(hook, 0, 0, t);
      // 60px in 200ms = 300 px/s: projected to 90, nearest the top.
      move(hook, 30, 100, t);
      move(hook, 60, 200, t);
      up(hook, 60, 202, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('reads the release speed over the last stretch, so one slow sample does not cancel a throw', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 60, 20, t); // 3px/ms
      move(hook, 62, 90, t); // the lift's own last, slow sample
      up(hook, 62, 92, t);
      // Still a fast flick (about 2800 px/s): projected past halfway to gone.
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('reads a throw that begins after a hold at its own speed, not the average since touch-down', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 0, 250, t); // a still hold on the handle
      move(hook, 20, 270, t); // then 60px in 50ms, the last 40 in 30
      move(hook, 40, 285, t);
      move(hook, 60, 300, t);
      up(hook, 60, 302, t);
      // A flick at its own speed: on to the next detent. The average since
      // the press (200 px/s) would project nothing and fall back to the top.
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(200);
    });

    it('reads a move after a hold through the release filter, as a finger\u2019s is read', () => {
      // One sample 300 ms after the press: the release filter (one for every
      // pointer, spec:AST-100 FR1) reads no velocity from a single move
      // (FR2), so the sheet settles where it is nearest. The window of the
      // last 100 ms it replaces read it as a 600 px/s throw and dismissed.
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 60, 300, t); // one sample, 300ms after touch-down
      up(hook, 60, 302, t);
      // The release filter reads no velocity from a single move
      // (spec:AST-100 FR2), under a mouse as under a finger: the sheet settles
      // where it is nearest.
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('throws nothing from a mouse held still for over 40 ms before the lift (spec:AST-100 FR2)', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      stream(hook, t, {from: 0, to: 60, t0: 0, t1: 40}); // 1500 px/s ...
      up(hook, 60, 95, t); // ... 55 ms still, then the lift
      // The speed over the last 100 ms used to keep the throw; the release
      // velocity every pointer reads is 0 after a still pointer.
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('releases no throw from a finger that rested before lifting', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 60, 20, t); // 3px/ms ...
      up(hook, 60, 400, t); // ... then 380ms of rest, then the lift
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('settles a throw that would coast past the line at the shortest detent when canDismiss is false', () => {
      const {hook, onDismiss} = setup({
        canDismiss: false,
        snapHeights: () => [200],
      });
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 50, 50, t);
      move(hook, 100, 100, t);
      up(hook, 100, 102, t);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(hook.result.current.settledOffset).toBe(200);
    });
  });

  it('does not flick-dismiss on a fast but short nudge', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    // Fast (20px/10ms = 2px/ms) but only 20px of travel — under the distance
    // floor, so nothing is projected and it settles rather than dismissing.
    down(hook, 0, 0, t);
    move(hook, 20, 10, t);
    up(hook, 20, 12, t);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('projects a fast short nudge onto the next detent under a finger', () => {
    stubIosIdiom();
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    // Fast (2000 px/s) but only 20px of travel: projected 20 + 200 = 220,
    // which lands on the 200 detent; gone (400) is further.
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 20, t0: 0, t1: 10, step: 10 / 3});
    up(hook, 20, 12, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(200);
  });

  it('settles to the nearest detent on a slow drag', () => {
    const onSnap = vi.fn();
    const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    // Detents: full=400 (offset 0) and 200 (offset 200). Drag slowly to ~180
    // offset -> nearest is the 200px detent (offset 200).
    down(hook, 0, 0, t);
    move(hook, 90, 300, t);
    move(hook, 180, 700, t);
    up(hook, 180, 1100, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSnap).toHaveBeenLastCalledWith(200);
    expect(hook.result.current.settledOffset).toBe(200);
  });

  it('excludes the offscreen block-end reserve from visible detent heights', () => {
    const onSnap = vi.fn();
    const {hook} = setup({
      snapHeights: () => [200],
      offscreenBlockEndInset: 48,
      onSnap,
    });
    const t = makeTarget();

    // The 400px border box has 352px visible. A 200px visible detent therefore
    // rests at offset 152, not 200; the 48px reserve remains below the viewport.
    down(hook, 0, 0, t);
    move(hook, 150, 700, t);
    up(hook, 150, 1100, t);

    expect(hook.result.current.settledOffset).toBe(152);
    expect(onSnap).toHaveBeenLastCalledWith(200);
  });

  it('keeps the full layout height at the peek detent', () => {
    // Three detents on the 400px sheet: full (0), mid 240 (offset 160), and
    // the 80px peek (offset 320).
    const {hook} = setup({snapHeights: () => [80, 240]});
    const t = makeTarget();

    // Settle at the mid detent: the scrolling area takes that travel as
    // layout height.
    down(hook, 0, 0, t);
    move(hook, 150, 700, t);
    up(hook, 150, 1100, t);
    expect(hook.result.current.settledOffset).toBe(160);
    expect(hook.result.current.settledLayoutOffset).toBe(160);

    // Settle at the peek: a glance state keeps the sheet's full layout height
    // and slides it below the viewport, so no layout travel is reported.
    down(hook, 150, 2000, t);
    move(hook, 310, 2700, t);
    up(hook, 310, 3100, t);
    expect(hook.result.current.settledOffset).toBe(320);
    expect(hook.result.current.settledLayoutOffset).toBe(0);
  });

  it('re-anchors to the same stop when the snap heights change at rest', () => {
    const onDismiss = vi.fn();
    const hook = renderHook(
      (props: UseSheetGesturesOptions) => useSheetGestures(props),
      {
        initialProps: {
          isOpen: true,
          onDismiss,
          snapHeights: () => [200],
        },
      },
    );
    const t = makeTarget();

    // Settle on the one collapsed stop: 400 - 200 = 200px of travel.
    down(hook, 0, 0, t);
    move(hook, 180, 700, t);
    up(hook, 180, 1100, t);
    act(() => hook.result.current.completeScrollAreaSettle());
    expect(hook.result.current.settledOffset).toBe(200);

    // A new resolver is a new set of stops. The sheet is resting on the one it
    // names, so it follows: a 150px stop is 250px of travel. The resolver is
    // read during render, not from a passive effect — the re-anchor runs in a
    // layout effect, which would otherwise still see the previous one.
    hook.rerender({
      isOpen: true,
      onDismiss,
      snapHeights: () => [150],
    });

    expect(hook.result.current.settledOffset).toBe(250);
    expect(hook.result.current.settledLayoutOffset).toBe(250);
  });

  it('resizes the scrolling area at a collapsed stop that is a working height', () => {
    // A 200px stop on the 400px sheet is half of it: the scrolling area takes
    // that travel as layout height rather than sliding the sheet away.
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 180, 700, t);
    up(hook, 180, 1100, t);
    expect(hook.result.current.settledOffset).toBe(200);
    expect(hook.result.current.settledLayoutOffset).toBe(200);
  });

  it('treats the only collapsed stop as a peek when it is a sliver', () => {
    // 60px of a 400px sheet is inside the quarter that makes a peek, so the
    // sheet keeps its full layout height and slides below the viewport.
    const {hook} = setup({snapHeights: () => [60]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 320, 700, t);
    restAt(hook, 320, 800, t);
    up(hook, 320, 1100, t);
    expect(hook.result.current.settledOffset).toBe(340);
    expect(hook.result.current.settledLayoutOffset).toBe(0);
  });

  it("uses the visible shortest detent height for a mouse's halfway line too", () => {
    const {hook, onDismiss} = setup({
      snapHeights: () => [200],
      offscreenBlockEndInset: 48,
    });
    const t = makeTarget();

    // Visible full height is 352px, so the 200px stop is offset 152 and gone
    // is 352: halfway is 252. Let go still at 235, the sheet keeps its stop.
    down(hook, 0, 0, t);
    move(hook, 235, 1000, t);
    up(hook, 235, 2000, t);

    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(152);
  });

  it('uses the visible shortest detent height for the halfway line under a finger', () => {
    stubIosIdiom();
    const {hook, onDismiss} = setup({
      snapHeights: () => [200],
      offscreenBlockEndInset: 48,
    });
    const t = makeTarget();

    // Visible full height is 352px, so the 200px stop is offset 152 and the
    // sheet is gone at 352. Released at rest, it dismisses past halfway
    // between them (252px); the hidden reserve must not move that line.
    down(hook, 0, 0, t);
    move(hook, 250, 1000, t);
    restAt(hook, 250, 1100, t);
    up(hook, 250, 2000, t);
    expect(onDismiss).not.toHaveBeenCalled();

    down(hook, 152, 3000, t);
    move(hook, 254, 4000, t);
    restAt(hook, 254, 4100, t);
    up(hook, 254, 5000, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('a downward drag from a middle detent never snaps back up past it', () => {
    // Three detents on a 600px sheet: full (offset 0), mid 360 (offset 240),
    // short 160 (offset 440). Rest at the mid detent, then drag DOWN a modest
    // amount that's still closer to mid than to short. It must not snap back
    // UP to full — only to mid (stay) or further down.
    const onSnap = vi.fn();
    const {hook} = setup({snapHeights: () => [160, 360], onSnap});
    const t = makeTarget();
    t.getBoundingClientRect = () => ({height: 600}) as DOMRect;
    // Drag to the mid detent (offset 240).
    down(hook, 0, 0, t);
    move(hook, 120, 300, t);
    move(hook, 240, 700, t);
    up(hook, 240, 1100, t);
    expect(hook.result.current.settledOffset).toBe(240);
    onSnap.mockClear();
    // Small slow drag DOWN from mid: offset 240 -> ~300.
    down(hook, 300, 2000, t);
    move(hook, 340, 2200, t);
    move(hook, 360, 2600, t);
    up(hook, 360, 3000, t);
    // Must not have jumped back up to full (offset 0).
    expect(hook.result.current.settledOffset).not.toBe(0);
    expect(hook.result.current.settledOffset).toBeGreaterThanOrEqual(240);
  });

  it('dismisses when dragged well below the shortest detent', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    // Shortest detent offset = 200 (height 200). Drag slowly past it by
    // >40% of 200 -> offset ~320 dismisses.
    down(hook, 0, 0, t);
    move(hook, 160, 400, t);
    move(hook, 330, 900, t);
    up(hook, 330, 1400, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('rebounds to the shortest detent when canDismiss is false', () => {
    const onScrimOpacity = vi.fn();
    const {hook, onDismiss} = setup({
      canDismiss: false,
      snapHeights: () => [200],
      onScrimOpacity,
    });
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 160, 400, t);
    move(hook, 330, 900, t);
    up(hook, 330, 1400, t);

    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(200);
    // Rebounding restores the scrim the 200px stop rests under — full, since
    // half a sheet is a working surface rather than a glance.
    expect(onScrimOpacity).toHaveBeenLastCalledWith(1);
  });

  it('fades the scrim from full toward the peek floor as it collapses onto the peek detent', () => {
    const onScrimOpacity = vi.fn();
    // Sheet 400, stops at 300 and a 60px sliver -> offsets [0, 100, 340]. The
    // fade spans the mid detent (offset 100) to the peek (offset 340): full
    // at/above 100, thinned to the peek floor (0.3) at/below 340.
    const {hook} = setup({snapHeights: () => [60, 300], onScrimOpacity});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 60, 200, t); // offset 60, above the mid detent -> full
    move(hook, 220, 600, t); // offset 220, halfway -> between 1 and 0.3 (~0.65)
    move(hook, 360, 1000, t); // offset 360, past the peek -> peek floor
    const values = onScrimOpacity.mock.calls.map(c => Number(c[0]));
    up(hook, 360, 1002, t);
    expect(values[0]).toBe(1);
    expect(values[1]).toBeGreaterThan(0.55);
    expect(values[1]).toBeLessThan(0.75);
    expect(values[values.length - 1]).toBeCloseTo(0.3);
  });

  it('thins the scrim to the peek floor when settled at the peek detent (still modal)', () => {
    const onScrimOpacity = vi.fn();
    const {hook} = setup({snapHeights: () => [60, 300], onScrimOpacity});
    const t = makeTarget();
    // Slow drag down to the peek detent (offset 340).
    down(hook, 0, 0, t);
    move(hook, 170, 400, t);
    move(hook, 340, 900, t);
    restAt(hook, 340, 1000, t);
    up(hook, 340, 1400, t);
    expect(hook.result.current.settledOffset).toBe(340);
    // Last reported opacity (on settle) is the peek floor, not fully hidden —
    // the sheet is still modal, so the backdrop keeps a minimum dim.
    const values = onScrimOpacity.mock.calls.map(c => Number(c[0]));
    expect(values[values.length - 1]).toBeCloseTo(0.3);
  });

  it('tracks the finger 1:1 between detents and into the dismiss zone', () => {
    asFinger();
    // UIKit's sheet follows the finger exactly (interaction offset = detent
    // offset + translation, no magnet); the release picks the detent. Offsets
    // for a 400px sheet with snaps 300 and 200: [0, 100, 200], gone at 400.
    const {hook} = setup({snapHeights: () => [200, 300]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    for (const y of [10, 60, 90, 99, 100, 101, 140, 199, 230, 320]) {
      move(hook, y, y * 2, t);
      expect(liveOffset(hook)).toBe(y);
    }
  });

  it('under a mouse, eases the live drag onto a detent within 40 px, as before (spec:AST-017 FR59)', () => {
    // Offsets [0, 100, 200] for a 400px sheet with snaps 300 and 200. 30 px
    // short of the 100 detent the pull is 1 - (30 / 40)^2 of the gap.
    asMouse();
    const {hook} = setup({snapHeights: () => [200, 300]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 70, 100, t);
    expect(liveOffset(hook)).toBeCloseTo(70 + 30 * (1 - (30 / 40) ** 2), 6);
    // 40 px or more from every detent, and past the shortest one, 1:1.
    move(hook, 150, 150, t);
    expect(liveOffset(hook)).toBe(150);
    move(hook, 320, 200, t);
    expect(liveOffset(hook)).toBe(320);
  });

  describe('one answer for the tracking and the release (spec:AST-094 FR13)', () => {
    // Offsets [0, 100, 200] for a 400px sheet with snaps 300 and 200: 10 px
    // short of the 100 detent, today's drag eases toward it; UIKit's tracks
    // 1:1. The release reads the same answer (releaseMotion.test.ts).
    function dragTo90(): number {
      const {hook} = setup({snapHeights: () => [200, 300]});
      const t = makeTarget();
      down(hook, 0, 0, t);
      move(hook, 90, 100, t);
      return liveOffset(hook);
    }

    it("keeps a finger on today's drag where the primary pointer is fine", () => {
      // The recognizers take it (FR19): a touchscreen's finger sends its
      // pointerdown before its touchstart; past the pan's 10 px, today's
      // tracking.
      expect(matchMedia('(pointer: coarse)').matches).toBe(false);
      const {hook} = setup({snapHeights: () => [200, 300]});
      const t = makeTarget();
      attach(hook, t);
      act(() => {
        mouseEvent('pointerdown', handleOf(t), 0, 0, 0, 'touch');
        touchEvent('touchstart', handleOf(t), [{id: 71, x: 50, y: 0}], 0);
        mouseEvent('pointermove', handleOf(t), 100, 100, 0, 'touch');
        touchEvent('touchmove', handleOf(t), [{id: 71, x: 50, y: 100}], 100);
      });
      const offset = liveOffset(hook);
      expect(offset).toBeGreaterThan(90);
      expect(offset).toBeLessThanOrEqual(100);
    });

    it("keeps a mouse on today's drag where the primary pointer is coarse", () => {
      stubIosIdiom();
      asMouse();
      const offset = dragTo90();
      expect(offset).toBeGreaterThan(90);
      expect(offset).toBeLessThanOrEqual(100);
    });

    it('tracks a finger 1:1 where the primary pointer is coarse', () => {
      asFinger();
      expect(dragTo90()).toBe(90);
    });
  });

  it("starts a mouse's drag at the pan's 10 px, as a finger's (spec:AST-094 FR17, FR19, FR43)", () => {
    asMouse();
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    press(hook, 0, 0, t);
    move(hook, 3, 16, t);
    expect(hook.result.current.isDragging).toBe(false);
    // Clear of the detents' magnet: the pan's translation past its 10 px.
    move(hook, 70, 32, t);
    expect(hook.result.current.isDragging).toBe(true);
    expect(liveOffset(hook)).toBe(60);
  });

  it('translates the surface live during a drag', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    move(hook, 50, 100, t);
    expect(liveOffset(hook)).toBe(50);
    expect(hook.result.current.isDragging).toBe(true);
    // Written to the element's travel channel, not rendered: the move costs
    // one style write and no commit.
    expect(travel(t)).toBe(50);
  });

  it('renders nothing for a move that keeps the layout split', () => {
    let renders = 0;
    const onDismiss = vi.fn();
    const hook = renderHook(
      (props: UseSheetGesturesOptions) => {
        renders += 1;
        return useSheetGestures(props);
      },
      {initialProps: {isOpen: true, onDismiss, snapHeights: () => [200]}},
    );
    const t = makeTarget();
    down(hook, 0, 0, t);
    const rendersAtDown = renders;
    move(hook, 30, 50, t);
    move(hook, 60, 100, t);
    move(hook, 90, 150, t);
    expect(travel(t)).toBe(90);
    // One render announces that the sheet is traveling; the moves after it
    // render nothing.
    expect(renders - rendersAtDown).toBeLessThanOrEqual(1);
  });

  it('restores the full layout height when a drag crosses above its base', () => {
    const onSnap = vi.fn();
    const {hook} = setup({snapHeights: () => [200], onSnap});
    const t = makeTarget();
    // Rest at the 200px working detent: the sheet gives 200px up as layout.
    down(hook, 0, 0, t);
    move(hook, 200, 400, t);
    up(hook, 200, 800, t);
    expect(hook.result.current.settledLayoutOffset).toBe(200);
    // Drag back up above the base: the layout split changes, and that one
    // render carries the offset the host pairs with the new height.
    down(hook, 200, 1000, t);
    move(hook, 150, 1100, t);
    expect(liveOffset(hook)).toBe(150);
    // The full height is back (layout 0), so the travel carries all 150px.
    expect(travel(t)).toBe(150);
  });

  it('keeps the sheet under the finger until the host renders the height a drag above its base restores', async () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    // Rest at the 200px working detent: the sheet gives 200px up as layout,
    // and the host's transform holds the rest of the detent (0 here).
    down(hook, 0, 0, t);
    move(hook, 200, 400, t);
    up(hook, 200, 800, t);
    expect(hook.result.current.settledLayoutOffset).toBe(200);
    // A press, then a move 50px above the base, handled before React renders
    // the restored height: the travel is written against the height still on
    // screen (200px less layout), so the sheet is drawn where the pointer
    // is ...
    act(() => {
      mouseEvent('pointerdown', handleOf(t), 200, 1000);
    });
    // 60 px up: 50 past the pan's 10 px.
    mouseEvent('pointermove', handleOf(t), 140, 1016);
    expect(liveOffset(hook)).toBe(150);
    expect(travel(t)).toBe(150 - 200);
    // ... and the commit that restores the full height moves the travel
    // with it, before anything paints.
    await act(async () => {});
    expect(travel(t)).toBe(150);
    act(() => {
      mouseEvent('pointerup', handleOf(t), 140, 1600);
    });
  });

  it('returns to the settled detent when a context menu interrupts a drag', () => {
    const onScrimOpacity = vi.fn();
    const {hook, onDismiss} = setup({
      snapHeights: () => [200, 300],
      onScrimOpacity,
    });
    const target = makeTarget();
    down(hook, 0, 0, target);
    move(hook, 300, 1000, target);

    const preventDefault = vi.fn();
    act(() =>
      hook.result.current.handleProps.onContextMenu({
        currentTarget: target,
        preventDefault,
      } as unknown as React.MouseEvent),
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isDragging).toBe(false);
    expect(hook.result.current.contentProps.style.transform).toBeUndefined();
    expect(onScrimOpacity).toHaveBeenLastCalledWith(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('returns to the settled detent when the browser cancels the touch', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const target = makeTarget();
    asFinger();
    down(hook, 0, 0, target);
    move(hook, 300, 1000, target);
    expect(hook.result.current.isDragging).toBe(true);

    act(() => {
      touchEvent(
        'touchcancel',
        handleOf(target),
        [{id: nextTouchId - 1, x: 50, y: 300}],
        1010,
      );
    });

    expect(hook.result.current.isDragging).toBe(false);
    expect(hook.result.current.contentProps.style.transform).toBeUndefined();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  describe('pinch', () => {
    // Fingers: a coarse primary pointer before the sheet mounts (the gesture
    // host attaches its recognizers only there, spec:AST-094 FR19).
    beforeEach(() => stubCoarsePointer());

    // A second finger is a pinch, and pinch-zoom belongs to the browser: it
    // gives the sheet's one-finger pans up, wherever it lands.
    it('declares pinch-zoom on the sliding surface, and leaves the handle to its pan', () => {
      const {hook} = setup();
      expect(hook.result.current.contentProps.style.touchAction).toBe(
        'pinch-zoom',
      );
      // The gesture host derives the handle's touch-action from its pan.
      expect(hook.result.current.handleProps.style.touchAction).toBeUndefined();
    });

    it('keeps a drag that has begun when a second finger lands on the handle (spec:AST-094 FR10)', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const target = makeTarget();
      attach(hook, target);
      const touch = fingers();
      act(() => {
        touch(handleOf(target), 'touchstart', 0);
        touch(handleOf(target), 'touchmove', 60);
        touch(handleOf(target), 'touchmove', 120);
      });
      expect(hook.result.current.isDragging).toBe(true);
      const held = liveOffset(hook);
      // The second finger neither cancels the drag nor moves the sheet ...
      act(() => {
        touch(handleOf(target), 'touchstart', 160, {id: 2});
        touch(handleOf(target), 'touchmove', 220, {id: 2});
      });
      expect(hook.result.current.isDragging).toBe(true);
      expect(liveOffset(hook)).toBe(held);
      // ... and the first still drives it, one for one.
      act(() => {
        touch(handleOf(target), 'touchmove', 140);
      });
      expect(liveOffset(hook)).toBe(held + 20);
      act(() => {
        touch(handleOf(target), 'touchend', 220, {id: 2});
        touch(handleOf(target), 'touchend', 140);
      });
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('returns to the detent when the browser cancels a handle drag to take a pinch', () => {
      const onSnap = vi.fn();
      const {hook, onDismiss} = setup({snapHeights: () => [200], onSnap});
      const target = makeTarget();
      attach(hook, target);
      const touch = fingers();
      act(() => {
        touch(handleOf(target), 'touchstart', 0);
        // Fast enough that settling from here would throw the sheet away.
        touch(handleOf(target), 'touchmove', 30);
        touch(handleOf(target), 'touchmove', 60);
        touch(handleOf(target), 'touchcancel', 60);
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.contentProps.style.transform).toBeUndefined();
      expect(onDismiss).not.toHaveBeenCalled();
      expect(onSnap).not.toHaveBeenCalled();
    });

    it('leaves a pinch to the browser when its fingers land on the handle and the body before either moves', () => {
      const {hook, onDismiss} = setup({snapHeights: () => [200]});
      const target = makeTarget();
      attach(hook, target);
      const touch = fingers();
      act(() => {
        touch(handleOf(target), 'touchstart', 0);
        touch(bodyOf(target), 'touchstart', 80, {id: 2});
        // The pinch spreads: the handle finger up, the body finger down,
        // each past a pan's threshold.
        for (let i = 1; i <= 5; i++) {
          touch(handleOf(target), 'touchmove', -6 * i);
          touch(bodyOf(target), 'touchmove', 80 + 6 * i, {id: 2});
        }
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(liveOffset(hook)).toBe(0);
      act(() => {
        touch(bodyOf(target), 'touchend', 110, {id: 2});
        touch(handleOf(target), 'touchend', -30);
      });
      land();
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('keeps a drag that has begun when a second finger lands off the sheet (spec:AST-094 FR10)', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const target = makeTarget();
      attach(hook, target);
      const touch = fingers();
      act(() => {
        touch(handleOf(target), 'touchstart', 0);
        touch(handleOf(target), 'touchmove', 40);
      });
      expect(hook.result.current.isDragging).toBe(true);
      const held = liveOffset(hook);
      act(() => {
        touch(document.body, 'touchstart', -60, {id: 2});
        touch(handleOf(target), 'touchmove', 70);
      });
      expect(hook.result.current.isDragging).toBe(true);
      expect(liveOffset(hook)).toBe(held + 30);
      act(() => {
        touch(document.body, 'touchend', -60, {id: 2});
        touch(handleOf(target), 'touchend', 70);
      });
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('leaves a body pull to the browser when a second finger lands on the body', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      attach(hook, sheetOf(body));
      const touch = fingers();
      act(() => {
        touch(body, 'touchstart', 0);
        touch(body, 'touchstart', 80, {id: 2});
        touch(body, 'touchmove', 60);
      });
      expect(hook.result.current.isDragging).toBe(false);
    });
  });

  it('does not start a drag from a secondary pointer button', () => {
    const {hook} = setup();
    const target = makeTarget();
    attach(hook, target);

    act(() => {
      mouseEvent('pointerdown', handleOf(target), 0, 0, 2);
      mouseEvent('pointermove', handleOf(target), 40, 50);
      mouseEvent('pointermove', handleOf(target), 80, 100);
    });

    expect(hook.result.current.isDragging).toBe(false);
    act(() => {
      mouseEvent('pointerup', handleOf(target), 80, 120, 2);
    });
  });

  it('stretches a finger dragged up past the fully-open position by the rubber band, within the reserve (spec:AST-094 FR3)', () => {
    // UIKit's presentation: a finger where the primary pointer is coarse.
    asFinger();
    // (1 - 1 / (x * 0.55 / d + 1)) * d past the tallest detent, d the sheet's
    // 400 px height, no farther than the 48 px the sheet reserves below.
    const band = (x: number) =>
      (1 - 1 / ((x * 0.55) / SHEET_HEIGHT + 1)) * SHEET_HEIGHT;
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 100, 0, t);
    move(hook, 60, 50, t); // 40 px past the top of a rested-at-top sheet
    expect(liveOffset(hook)).toBeCloseTo(-band(40), 6);
    move(hook, 20, 100, t); // 80 px past it
    expect(liveOffset(hook)).toBeCloseTo(-band(80), 6);
    move(hook, -100, 150, t); // 200 px past it: the reserve
    expect(liveOffset(hook)).toBe(-48);
    move(hook, 130, 200, t); // back down: the finger's travel from the press
    expect(liveOffset(hook)).toBe(30);
  });

  it('under a mouse, stretches an upward drag past the fully-open position at 0.35, within the reserve, as before (spec:AST-017 FR59)', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 100, 0, t);
    move(hook, 20, 100, t); // 80 px past the top of a rested-at-top sheet
    expect(liveOffset(hook)).toBeCloseTo(-80 * 0.35, 6);
    move(hook, -100, 150, t); // 200 px past it: the reserve
    expect(liveOffset(hook)).toBe(-48);
  });

  it('dismisses a single-height sheet on a slow drag past the floor', () => {
    const {hook, onDismiss} = setup(); // no snapHeights
    const t = makeTarget();
    // Only detent is the full 400px height (offset 0). A slow drag past 40%
    // of it (>160px) with no detent to catch it dismisses.
    down(hook, 0, 0, t);
    move(hook, 120, 400, t);
    move(hook, 240, 900, t);
    up(hook, 240, 1400, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  describe('body overscroll', () => {
    // A mouse on the scrolling body, through the body's pans (spec:AST-094
    // FR19): a pull down where nothing under the pointer can scroll up, or up
    // where nothing can scroll down while a taller detent exists, drags the
    // sheet past the pan's 10 px.
    function makeBody(scrollTop: number) {
      return makeScroller({scrollTop, clientHeight: 200, scrollHeight: 800});
    }
    function bodyDown(hook: Hook, y: number, t: number, el: HTMLElement) {
      attach(hook, sheetOf(el));
      act(() => {
        mouseEvent('pointerdown', el, y, t);
      });
    }
    function bodyMove(hook: Hook, y: number, t: number, el: HTMLElement) {
      act(() => {
        mouseEvent('pointermove', el, y, t);
      });
    }

    it('promotes a top-overscroll pull-down into a sheet drag', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(0); // at the top
      bodyDown(hook, 0, 0, body);
      bodyMove(hook, 110, 100, body); // pull down while at the top
      expect(hook.result.current.isDragging).toBe(true);
      // The body's pan: its translation past its 10 px, clear of the
      // detents' magnet.
      expect(liveOffset(hook)).toBe(100);
    });

    /**
     * A finger is never still. Tapping a control inside the sheet drifts a
     * pixel or two, and a drift that started a sheet drag wrote
     * `transition: none` onto the panel across the release, so the close the
     * tap triggered cut instead of animating. A pan begins only past its
     * threshold.
     */
    it('treats a few pixels of drift as a tap, not a drag', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(0); // at the top, where a pull-down would promote
      bodyDown(hook, 0, 0, body);
      bodyMove(hook, 3, 40, body); // the drift of a finger tapping a button
      expect(hook.result.current.isDragging).toBe(false);
      // and nothing suppressed the panel's transition, so a close that lands
      // now still animates
      expect(hook.result.current.contentProps.style.transition).toBeUndefined();
    });

    it('still promotes once the pull passes the pan threshold', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(0);
      bodyDown(hook, 0, 0, body);
      bodyMove(hook, PAN_THRESHOLD + 1, 40, body);
      expect(hook.result.current.isDragging).toBe(true);
    });

    it('does not hijack scrolling when the body is scrolled down', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(120); // scrolled, not at the top
      bodyDown(hook, 0, 0, body);
      bodyMove(hook, 40, 100, body);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('does not start a drag on an upward move from the top', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const body = makeBody(0);
      bodyDown(hook, 100, 0, body);
      bodyMove(hook, 60, 100, body); // moving up = scrolling intent
      expect(hook.result.current.isDragging).toBe(false);
    });

    it("pulls the sheet up from the content's end while a taller detent exists, and leaves the pull to the content at the tallest (spec:AST-094 FR14, FR19)", () => {
      const {hook} = setup({snapHeights: () => [200]});
      // The content at its end: scrollTop + clientHeight === scrollHeight.
      const body = makeBody(600);
      const sheet = sheetOf(body);
      attach(hook, sheet);
      // At the tallest detent an upward pull is the content's.
      act(() => {
        mouseEvent('pointerdown', body, 300, 0);
        mouseEvent('pointermove', body, 250, 100);
        mouseEvent('pointerup', body, 250, 120);
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.settledOffset).toBe(0);
      // Settled on the lower detent, the same pull drags the sheet up by its
      // travel past the pan's 10 px, and a slow release lands on the taller
      // detent nearest where it is.
      down(hook, 0, 1000, sheet);
      move(hook, 180, 1700, sheet);
      up(hook, 180, 2100, sheet);
      expect(hook.result.current.settledOffset).toBe(200);
      act(() => {
        mouseEvent('pointerdown', body, 300, 3000);
        mouseEvent('pointermove', body, 250, 3400);
      });
      expect(hook.result.current.isDragging).toBe(true);
      expect(liveOffset(hook)).toBe(200 - (50 - PAN_THRESHOLD));
      // Held still 400 ms before the lift: no release speed (spec:AST-100
      // FR2), so where it is decides.
      act(() => {
        mouseEvent('pointermove', body, 150, 3900);
        mouseEvent('pointerup', body, 150, 4300);
      });
      land();
      expect(hook.result.current.settledOffset).toBe(0);
    });
  });

  describe('body touch handoff', () => {
    // Fingers: a coarse primary pointer before the sheet mounts (the gesture
    // host attaches its recognizers only there, spec:AST-094 FR19).
    beforeEach(() => stubCoarsePointer());

    // A finger on the scrolling body, through the body's pans: down where
    // nothing under it can scroll up, up where nothing can scroll down while
    // a taller detent exists (`scrollEdge`).
    it('promotes a top pull-down (touch) into a sheet drag', () => {
      // A finger: a coarse primary pointer before the sheet mounts (the gesture
      // host attaches its recognizers only there, spec:AST-094 FR19).
      stubCoarsePointer();
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      attach(hook, sheetOf(el));
      const touch = fingers();
      act(() => {
        touch(el, 'touchstart', 0);
        touch(el, 'touchmove', 50);
      });
      expect(hook.result.current.isDragging).toBe(true);
    });

    it('promotes a top pull-down from a finger where the primary pointer is fine (a touchscreen laptop), as on a phone', () => {
      // A touchscreen laptop: a mouse is the primary pointer, and a finger on
      // the screen sends its pointer events and its touches, which the
      // browser would scroll the content with. The body's scroll-edge pan
      // takes that finger, as every pointer (spec:AST-094 FR19).
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
          matches: query.includes('any-pointer: coarse'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      );
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      attach(hook, sheetOf(el));
      // Its pointer event first, then its touch, as a touchscreen sends them.
      const touch = (
        type: 'touchstart' | 'touchmove' | 'touchend',
        y: number,
        time: number,
      ): Event => {
        const pointerType = (
          {
            touchstart: 'pointerdown',
            touchmove: 'pointermove',
            touchend: 'pointerup',
          } as const
        )[type];
        if (type !== 'touchend') {
          mouseEvent(pointerType, el, y, time, 0, 'touch');
        }
        const event = touchEvent(type, el, [{id: 7, x: 50, y}], time);
        if (type === 'touchend') {
          mouseEvent(pointerType, el, y, time, 0, 'touch');
        }
        return event;
      };
      let move: Event | undefined;
      act(() => {
        touch('touchstart', 0, 0);
        move = touch('touchmove', 50, 16);
      });
      expect(hook.result.current.isDragging).toBe(true);
      // The pull is the sheet's, not the content's scroll.
      expect(move?.defaultPrevented).toBe(true);
      act(() => {
        touch('touchmove', 100, 32);
      });
      expect(liveOffset(hook)).toBeGreaterThan(50);
      act(() => {
        touch('touchend', 100, 48);
      });
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('promotes a bottom pull-up (touch) into a sheet drag that travels', () => {
      const {hook} = setup({snapHeights: () => [200]});
      // scrolled to the bottom: scrollTop + clientHeight === scrollHeight
      const el = makeScroller({
        scrollTop: 600,
        clientHeight: 200,
        scrollHeight: 800,
      });
      const sheet = sheetOf(el);
      // Settle at the lower detent first, so expanding has somewhere to go.
      down(hook, 0, 0, sheet);
      move(hook, 180, 700, sheet);
      up(hook, 180, 1100, sheet);
      expect(hook.result.current.settledOffset).toBe(200);

      const touch = fingers();
      act(() => {
        touch(el, 'touchstart', 300);
        touch(el, 'touchmove', 250); // pull up
      });
      expect(hook.result.current.isDragging).toBe(true);
      // The handoff is only worth taking if the sheet follows the finger:
      // the 50px of pull, less the pan's threshold, expands it toward the
      // tallest detent.
      expect(liveOffset(hook)).toBe(200 - (50 - PAN_THRESHOLD));
    });

    it('leaves a bottom pull-up with the scroller at the tallest detent', () => {
      // Regression: the sheet is already fully expanded, so an upward pull has
      // nowhere to expand to. Promoting it produced a rubber-band the release
      // threw straight back, and stole the gesture from the scroller.
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 600,
        clientHeight: 200,
        scrollHeight: 800,
      });
      attach(hook, sheetOf(el));
      expect(hook.result.current.settledOffset).toBe(0);

      const touch = fingers();
      act(() => {
        touch(el, 'touchstart', 300);
        touch(el, 'touchmove', 250); // pull up
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.dragOffset).toBe(0);
    });

    it('does not preventDefault a bottom pull-up at the tallest detent', () => {
      // The captured gesture was the worse half of the bug: once promoted,
      // every later touchmove was preventDefault()ed, so reversing downward to
      // scroll back collapsed the sheet instead of scrolling.
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 600,
        clientHeight: 200,
        scrollHeight: 800,
      });
      attach(hook, sheetOf(el));

      const touch = fingers();
      let pullUp: Event | undefined;
      let reverseDown: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 300);
        pullUp = touch(el, 'touchmove', 250);
        reverseDown = touch(el, 'touchmove', 400);
      });
      expect(pullUp?.defaultPrevented).toBe(false);
      expect(reverseDown?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('finishes the active drag when another ended touch is listed first', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      attach(hook, sheetOf(el));
      const touch = fingers();
      act(() => {
        touch(el, 'touchstart', 0, {id: 2});
        touch(el, 'touchmove', 150, {id: 2});
        touch(el, 'touchmove', 300, {id: 2});
      });
      expect(hook.result.current.isDragging).toBe(true);
      act(() => {
        touchEvent(
          'touchend',
          el,
          [
            {id: 1, x: 50, y: 100},
            {id: 2, x: 50, y: 300},
          ],
          100,
          [],
        );
      });
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('leaves a pinch at the top to the browser', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      attach(hook, sheetOf(el));
      const touch = fingers();
      let pull: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 100);
        touch(el, 'touchstart', 140, {id: 2});
        // The spread carries the second finger down past the pan's threshold.
        pull = touch(el, 'touchmove', 160, {id: 2});
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('keeps a body pull that has begun when a second finger lands (spec:AST-094 FR10)', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      attach(hook, sheetOf(el));
      const touch = fingers();
      act(() => {
        touch(el, 'touchstart', 0);
        touch(el, 'touchmove', 50);
      });
      expect(hook.result.current.isDragging).toBe(true);
      const held = liveOffset(hook);
      let after: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 120, {id: 2});
        after = touch(el, 'touchmove', 90);
      });
      // The pull keeps its finger: that finger's moves are still the sheet's.
      expect(after?.defaultPrevented).toBe(true);
      expect(hook.result.current.isDragging).toBe(true);
      expect(liveOffset(hook)).toBe(held + 40);
      act(() => {
        touch(el, 'touchend', 120, {id: 2});
        touch(el, 'touchend', 90);
      });
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('leaves a pinch to the browser when the body finger lands first and the second lands on the handle', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      const sheet = sheetOf(el);
      attach(hook, sheet);
      const touch = fingers();
      let pull: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 100);
        touch(handleOf(sheet), 'touchstart', 20, {id: 2});
        // The spread carries the body finger down past the pan's threshold.
        pull = touch(el, 'touchmove', 160);
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('leaves a pinch to the browser when the second finger lands off the body', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 800,
      });
      attach(hook, sheetOf(el));
      const touch = fingers();
      let pull: Event | undefined;
      act(() => {
        touch(el, 'touchstart', 100);
        touch(document.body, 'touchstart', 20, {id: 2});
        pull = touch(el, 'touchmove', 160);
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('leaves native scrolling alone in the middle of the content', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 300,
        clientHeight: 200,
        scrollHeight: 800,
      });
      attach(hook, sheetOf(el));
      const touch = fingers();
      act(() => {
        touch(el, 'touchstart', 300);
        touch(el, 'touchmove', 250);
      });
      expect(hook.result.current.isDragging).toBe(false);
    });
  });

  describe('body touch handoff from a nested scroller', () => {
    // Fingers: a coarse primary pointer before the sheet mounts (the gesture
    // host attaches its recognizers only there, spec:AST-094 FR19).
    beforeEach(() => stubCoarsePointer());

    // A host that scrolls content in a box of its own inside the body (a
    // pinned header and footer around a scrolling middle, a grid) never moves
    // the body's scrollTop. The edge that decides the handoff is the edge of
    // every scroller under the finger, the box's first: the gesture host's
    // native scroll probe reads them all.
    function makeNested(opts: {
      bodyScrollTop: number;
      bodyScrollHeight?: number;
      innerScrollTop: number;
      innerScrollHeight?: number;
    }) {
      const body = makeScroller({
        scrollTop: opts.bodyScrollTop,
        clientHeight: 400,
        scrollHeight: opts.bodyScrollHeight ?? 400,
      });
      const inner = document.createElement('div');
      inner.style.overflowY = 'auto';
      scrollMetrics(inner, {
        scrollTop: opts.innerScrollTop,
        clientHeight: 200,
        scrollHeight: opts.innerScrollHeight ?? 800,
      });
      const tile = document.createElement('button');
      inner.appendChild(tile);
      body.appendChild(inner);
      return {body, inner, tile, sheet: sheetOf(body)};
    }

    it('leaves a pull-down to a nested scroller that is scrolled', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {sheet, tile} = makeNested({bodyScrollTop: 0, innerScrollTop: 120});
      attach(hook, sheet);
      const touch = fingers();
      let pull: Event | undefined;
      act(() => {
        touch(tile, 'touchstart', 100);
        pull = touch(tile, 'touchmove', 160);
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('promotes a pull-down from the top of a nested scroller', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {sheet, tile} = makeNested({bodyScrollTop: 0, innerScrollTop: 0});
      attach(hook, sheet);
      const touch = fingers();
      let pull: Event | undefined;
      act(() => {
        touch(tile, 'touchstart', 100);
        pull = touch(tile, 'touchmove', 160);
      });
      expect(pull?.defaultPrevented).toBe(true);
      expect(hook.result.current.isDragging).toBe(true);
      expect(liveOffset(hook)).toBe(60 - PAN_THRESHOLD);
      expect(travel(sheet)).toBe(60 - PAN_THRESHOLD);
    });

    it('chains to a scrolled body before the sheet when the nested box is at its top', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {sheet, tile} = makeNested({
        bodyScrollTop: 80,
        bodyScrollHeight: 900,
        innerScrollTop: 0,
      });
      attach(hook, sheet);
      const touch = fingers();
      let pull: Event | undefined;
      act(() => {
        touch(tile, 'touchstart', 100);
        pull = touch(tile, 'touchmove', 160);
      });
      // The browser scrolls the body back up; the sheet's turn has not come.
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('reads the body when the nested box has nothing to scroll', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {sheet, tile} = makeNested({
        bodyScrollTop: 0,
        innerScrollTop: 0,
        innerScrollHeight: 200,
      });
      attach(hook, sheet);
      const touch = fingers();
      act(() => {
        touch(tile, 'touchstart', 100);
        touch(tile, 'touchmove', 160);
      });
      expect(hook.result.current.isDragging).toBe(true);
    });

    it('leaves a touch that starts inside a nested <dialog> to that layer, and still pulls from its own content', () => {
      // A Dialog or a sheet opened from this sheet's content renders its
      // <dialog> inside the body, so its touches reach the body's pans. The
      // same pull-down from the body's own content pulls the sheet; from the
      // nested layer it must not (component:BottomSheet FR6, FR7).
      const {hook} = setup({snapHeights: () => [200]});
      const {body, sheet, tile} = makeNested({
        bodyScrollTop: 0,
        innerScrollTop: 0,
        innerScrollHeight: 200,
      });
      const nested = document.createElement('dialog');
      const nestedContent = document.createElement('div');
      nested.appendChild(nestedContent);
      body.appendChild(nested);
      attach(hook, sheet);
      const touch = fingers();
      let pull: Event | undefined;
      act(() => {
        touch(nestedContent, 'touchstart', 100);
        pull = touch(nestedContent, 'touchmove', 160);
        touch(nestedContent, 'touchmove', 220);
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
      expect(liveOffset(hook)).toBe(0);
      act(() => {
        touch(nestedContent, 'touchend', 220);
      });
      // The sheet's own content still pulls it: the pans are live.
      const second = fingers();
      act(() => {
        second(tile, 'touchstart', 100);
        second(tile, 'touchmove', 160);
        second(tile, 'touchmove', 220);
      });
      expect(hook.result.current.isDragging).toBe(true);
      expect(liveOffset(hook)).toBeGreaterThan(0);
    });

    it('leaves a pull-up to a nested scroller with content below', async () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {sheet, tile} = makeNested({bodyScrollTop: 0, innerScrollTop: 100});
      // Rest at the lower detent, so an expanding handoff would have somewhere
      // to go if the body's edge were read.
      down(hook, 0, 0, sheet);
      move(hook, 180, 700, sheet);
      up(hook, 180, 1100, sheet);
      expect(hook.result.current.settledOffset).toBe(200);
      // The settle reports its end through a promise: let it, so a touch
      // finds the sheet at rest rather than catching it.
      await act(async () => {});
      const touch = fingers();
      let pull: Event | undefined;
      act(() => {
        touch(tile, 'touchstart', 300);
        pull = touch(tile, 'touchmove', 250);
      });
      expect(pull?.defaultPrevented).toBe(false);
      expect(hook.result.current.isDragging).toBe(false);
    });

    it('leaves a mouse pull on a scrolled nested box to the box', () => {
      const {hook} = setup({snapHeights: () => [200]});
      const {sheet, tile} = makeNested({bodyScrollTop: 0, innerScrollTop: 120});
      attach(hook, sheet);
      act(() => {
        mouseEvent('pointerdown', tile, 0, 0);
        mouseEvent('pointermove', tile, 40, 100);
      });
      expect(hook.result.current.isDragging).toBe(false);
      act(() => {
        mouseEvent('pointerup', tile, 40, 120);
      });
    });
  });

  describe("a drag that begins in the content stays the content's (spec:AST-094 FR14)", () => {
    // Fingers: a coarse primary pointer before the sheet mounts (the gesture
    // host attaches its recognizers only there, spec:AST-094 FR19).
    beforeEach(() => stubCoarsePointer());

    // The finger lands mid-content and swipes up, so the content scrolls and
    // the browser owns the gesture (every remaining touchmove is
    // uncancelable). Who gets a drag is decided when it begins: when the
    // content reaches its end mid-gesture it keeps the drag and rubber-bands
    // (the browser's), and the sheet holds its detent. The sheet grows only
    // from a drag that begins with the content at its end.
    async function midDetentScroller(
      hook: Hook,
      scrollTop: number,
    ): Promise<HTMLElement> {
      const el = makeScroller({
        scrollTop,
        clientHeight: 200,
        scrollHeight: 800,
      });
      const sheet = sheetOf(el);
      down(hook, 0, 0, sheet);
      move(hook, 180, 700, sheet);
      up(hook, 180, 1100, sheet);
      expect(hook.result.current.settledOffset).toBe(200);
      // The settle reports its end through a promise: let it, so the sheet
      // rests at its detent before the next touch (one during the settle
      // would catch it).
      await act(async () => {});
      return el;
    }
    // A move the browser sends while it scrolls with the finger.
    const scrolling = {cancelable: false};

    it('keeps a scroll that runs out of content mid-gesture: the sheet holds its detent', async () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = await midDetentScroller(hook, 300); // finger lands mid-content
      const touch = fingers();
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 450; // the swipe scrolls the content...
        touch(el, 'touchmove', 350, scrolling);
        el.scrollTop = 600; // ...until it runs out at the bottom
        touch(el, 'touchmove', 200, scrolling); // the content ended here
        touch(el, 'touchmove', 150, scrolling); // 50px beyond: the rubber band
        touch(el, 'touchmove', 100, scrolling);
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(liveOffset(hook)).toBe(200);
      act(() => {
        touch(el, 'touchend', 100);
      });
      expect(hook.result.current.settledOffset).toBe(200);
    });

    it('never moves the sheet while the finger goes back and forth past the content end', async () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = await midDetentScroller(hook, 300);
      const touch = fingers();
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 450; // the swipe scrolls the content...
        touch(el, 'touchmove', 350, scrolling);
        el.scrollTop = 600; // ...to its end
        touch(el, 'touchmove', 200, scrolling);
        touch(el, 'touchmove', 150, scrolling); // past it: the rubber band
        el.scrollTop = 590; // the finger comes back and the content scrolls...
        touch(el, 'touchmove', 210, scrolling);
        el.scrollTop = 600; // ...to its end again, and the finger pulls past
        touch(el, 'touchmove', 140, scrolling);
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(liveOffset(hook)).toBe(200);
    });

    it('grows the sheet from a drag that begins with the content at its end', async () => {
      const {hook} = setup({snapHeights: () => [200]});
      const el = await midDetentScroller(hook, 600); // the content is at its end
      const touch = fingers();
      act(() => {
        touch(el, 'touchstart', 500);
        touch(el, 'touchmove', 490);
        touch(el, 'touchmove', 470);
        touch(el, 'touchmove', 450);
      });
      expect(hook.result.current.isDragging).toBe(true);
      expect(liveOffset(hook)).toBe(200 - (50 - PAN_THRESHOLD));
      act(() => {
        touch(el, 'touchend', 450);
      });
    });

    it('leaves the momentum after the lift to the content', async () => {
      // Landing on the last pixel is not a pull, and the momentum tail after
      // the finger lifts fires no touchmove at all.
      const {hook} = setup({snapHeights: () => [200]});
      const el = await midDetentScroller(hook, 300);
      const touch = fingers();
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 450;
        touch(el, 'touchmove', 350, scrolling);
        el.scrollTop = 600;
        touch(el, 'touchmove', 200, scrolling);
        touch(el, 'touchmove', 199, scrolling);
        touch(el, 'touchend', 199);
        el.scrollTop = 600; // momentum carries on with no finger down
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.settledOffset).toBe(200);
    });

    it('leaves a pull at the tallest detent to the content', () => {
      // With no taller detent there is nothing to grow into.
      const {hook} = setup({snapHeights: () => [200]});
      const el = makeScroller({
        scrollTop: 300,
        clientHeight: 200,
        scrollHeight: 800,
      });
      attach(hook, sheetOf(el));
      expect(hook.result.current.settledOffset).toBe(0);

      const touch = fingers();
      act(() => {
        touch(el, 'touchstart', 500);
        el.scrollTop = 600;
        touch(el, 'touchmove', 200, scrolling);
        touch(el, 'touchmove', 100, scrolling);
      });
      expect(hook.result.current.isDragging).toBe(false);
      expect(hook.result.current.dragOffset).toBe(0);
    });
  });

  describe('viewport resize', () => {
    // The panel pins the sheet's height in px at a resizing detent; everywhere
    // else the height comes from CSS (`92dvh`), which follows the viewport.
    // Model both, so a measurement taken while pinned reads the pin back —
    // that is the trap the hook has to work around.
    const SNAP_FRACTIONS = [0.14, 0.5, 0.92];
    const RESERVED_BELOW_FLOOR = 48;

    function viewportHarness(initialViewport: number) {
      let viewport = initialViewport;
      const el = document.createElement('div');
      document.body.append(el);
      el.getBoundingClientRect = () =>
        ({
          height: el.style.height
            ? Number.parseFloat(el.style.height)
            : 0.92 * viewport + RESERVED_BELOW_FLOOR,
        }) as DOMRect;

      const onSnap = vi.fn();
      const {hook} = setup({
        offscreenBlockEndInset: RESERVED_BELOW_FLOOR,
        snapHeights: () => SNAP_FRACTIONS.map(f => f * viewport),
        onSnap,
      });
      attach(hook, el);

      // What BottomSheetPanel renders at rest.
      const paint = () => {
        const {sheetHeight, settledLayoutOffset} = hook.result.current;
        el.style.height =
          settledLayoutOffset > 0
            ? `${sheetHeight - settledLayoutOffset}px`
            : '';
      };
      const dragTo = (offset: number) => {
        // Anchor anywhere; what matters is the delta from where it rests, so
        // this drags in whichever direction the target detent lies.
        const anchor = 1000;
        const delta = offset - hook.result.current.settledOffset;
        down(hook, anchor, 0, el);
        // Slow: well under the flick threshold, so the release settles.
        move(hook, anchor + delta, 2000, el);
        lift(hook, anchor + delta, 2400, el);
        // The panel resolves the settle when the transform transition ends.
        act(() => hook.result.current.completeScrollAreaSettle());
        paint();
      };
      const resizeTo = (next: number) => {
        viewport = next;
        act(() => {
          window.dispatchEvent(new Event('resize'));
        });
        paint();
      };
      // What the user sees: the border box, less the part reserved below the
      // viewport floor and the part translated past it.
      const visibleHeight = () =>
        hook.result.current.sheetHeight -
        RESERVED_BELOW_FLOOR -
        hook.result.current.settledOffset;

      return {hook, el, onSnap, dragTo, resizeTo, visibleHeight};
    }

    it('re-resolves the settled detent against the new viewport', () => {
      // 900px viewport: detents at 0 / 378 / 702, so the half-height stop
      // shows 450px of sheet.
      const {hook, dragTo, resizeTo, visibleHeight, onSnap} =
        viewportHarness(900);
      dragTo(378);
      expect(hook.result.current.settledOffset).toBe(378);
      expect(visibleHeight()).toBe(450);

      resizeTo(600);

      // Still the half-height stop, now half of 600 — not the 450px (75% of
      // the window) it was frozen at before.
      expect(visibleHeight()).toBe(300);
      expect(hook.result.current.settledOffset).toBe(252);
      expect(onSnap).toHaveBeenLastCalledWith(300);
    });

    it('keeps the peek detent on screen when the viewport shrinks', () => {
      const {hook, dragTo, resizeTo, visibleHeight} = viewportHarness(900);
      dragTo(702);
      expect(hook.result.current.settledOffset).toBe(702);
      // The peek keeps its full height and slides, so its offset is the whole
      // of its travel — and 702px of travel does not fit in a 600px window.
      expect(hook.result.current.settledLayoutOffset).toBe(0);

      resizeTo(600);

      expect(hook.result.current.settledOffset).toBe(468);
      expect(hook.result.current.settledOffset).toBeLessThan(
        hook.result.current.sheetHeight,
      );
      expect(visibleHeight()).toBe(84);
    });

    it('refreshes the fully open height the next drag measures against', () => {
      const {hook, dragTo, resizeTo} = viewportHarness(900);
      dragTo(378);
      expect(hook.result.current.sheetHeight).toBe(876);

      resizeTo(600);

      // Measured through the pinned height the panel had written for the old
      // viewport, so this is the natural budget and not the stale pin.
      expect(hook.result.current.sheetHeight).toBe(600);

      // Dragging back up lands on fully open rather than overshooting past it
      // toward where fully open used to be.
      dragTo(0);
      expect(hook.result.current.settledOffset).toBe(0);
      expect(hook.result.current.settledLayoutOffset).toBe(0);
    });

    it('leaves a drag in progress alone', () => {
      const {hook, el} = viewportHarness(900);
      press(hook, 0, 0, el);
      move(hook, 200, 2000, el);

      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      expect(hook.result.current.isDragging).toBe(true);
      expect(hook.result.current.sheetHeight).toBe(876);
      expect(hook.result.current.settledOffset).toBe(0);
    });

    it('stops re-resolving once the sheet closes', () => {
      const {hook, dragTo, resizeTo} = viewportHarness(900);
      dragTo(378);
      act(() => hook.rerender({isOpen: false, onDismiss: vi.fn()}));

      resizeTo(600);

      expect(hook.result.current.sheetHeight).toBe(876);
    });
  });
});

describe('useSheetGestures: the release on the compositor', () => {
  // A finger: releases run on UIKit's springs
  // (releaseMotion.ts). A mouse keeps the theme's timing.
  function stubPointer({
    coarse,
    reducedMotion = false,
  }: {
    coarse: boolean;
    reducedMotion?: boolean;
  }) {
    if (coarse) {
      stubIosIdiom({reducedMotion});
      return;
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches:
          (coarse && query.includes('pointer: coarse')) ||
          (reducedMotion && query.includes('prefers-reduced-motion')),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  }
  beforeEach(() => stubPointer({coarse: true}));

  interface Played {
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
  }
  /** Records the Web Animations the animator plays on `el` (jsdom has none). */
  function recordAnimations(el: HTMLElement): Played[] {
    const played: Played[] = [];
    el.animate = vi.fn((keyframes, options) => {
      played.push({
        keyframes: keyframes as Keyframe[],
        options: options as KeyframeAnimationOptions,
      });
      return {cancel: vi.fn(), startTime: 0} as unknown as Animation;
    });
    return played;
  }
  /** The travel (px) a played animation has at `ms` after its start. */
  function travelAt(animation: Played, ms: number): number {
    const duration = animation.options.duration as number;
    const frames = animation.keyframes.map(frame => ({
      t: (frame.offset as number) * duration,
      y: Number.parseFloat(String(frame.translate).split(' ')[1]),
    }));
    for (let i = 1; i < frames.length; i++) {
      if (ms <= frames[i].t) {
        const a = frames[i - 1];
        const b = frames[i];
        return a.y + ((b.y - a.y) * (ms - a.t)) / (b.t - a.t);
      }
    }
    return frames[frames.length - 1].y;
  }

  it('springs to the detent on the slow-release spring, handed the finger velocity', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    // 600 px/s, released at 60: lands on the 200 detent (sheetRelease).
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 100});
    lift(hook, 60, 102, t);
    expect(played).toHaveLength(1);
    const curve = solveSpring(toSpring(springs.sheetDetent), {
      from: 60,
      to: 200,
      velocity: 600,
    });
    // On the closed-form spring, at every keyframe ...
    for (const {t: ms, value} of keyframesUntil(played[0], translateYOf, 400)) {
      expect(value).toBeCloseTo(curve.value(ms / 1000), 1);
    }
    // ... which is the spring handed the finger's 600 px/s (M3): one
    // started at rest would trail it by more than 5 px 16 ms in.
    const atRest = solveSpring(toSpring(springs.sheetDetent), {
      from: 60,
      to: 200,
      velocity: 0,
    });
    expect(travelAt(played[0], 16) - atRest.value(0.016)).toBeGreaterThan(5);
    // Composited: keyframes played linearly on one Web Animation, so the
    // main thread is not involved.
    expect(played[0].options).toMatchObject({easing: 'linear'});
    // The inline style holds what is on screen while the spring runs, and the
    // end is written when it retires.
    expect(travel(t)).toBe(60);
    expect(translateYOf(played[0].keyframes.at(-1) as Keyframe)).toBe(200);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(travel(t)).toBe(200);
  });

  it('takes a fast release on the 80 % damped spring', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    // A fast throw down (|v| ≥ sheet.release.fastSpeed) from the top: a
    // flick, to the next detent down (200); 58 px + 1308 px/s × 0.1 s
    // projects to 189, nearest that detent too.
    const speed = sheet.release.fastSpeed + 300;
    const to = speed * 0.044;
    stream(hook, t, {from: 0, to, t0: 0, t1: 44});
    lift(hook, to, 45, t);
    expect(hook.result.current.settledOffset).toBe(200);
    const from = travelAt(played.at(-1) as Played, 0);
    const curve = solveSpring(toSpring(springs.sheetReleaseFast), {
      from,
      to: 200,
      velocity: speed,
    });
    for (const {t: ms, value} of keyframesUntil(
      played.at(-1) as Played,
      translateYOf,
      200,
    )) {
      expect(value).toBeCloseTo(curve.value(ms / 1000), 1);
    }
  });

  it('lets a finger catch the settling sheet where the curve has it, without a jump', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 100});
    lift(hook, 60, 102, t);
    const curve = solveSpring(toSpring(springs.sheetDetent), {
      from: 60,
      to: 200,
      velocity: 600,
    });
    act(() => {
      vi.advanceTimersByTime(80);
    });
    const onScreen = curve.value(0.08);
    // The finger lands 80 ms into the settle and holds still.
    press(hook, 500, 1000, t);
    expect(hook.result.current.isDragging).toBe(true);
    expect(liveOffset(hook)).toBeCloseTo(onScreen, 0);
    expect(travel(t)).toBeCloseTo(onScreen, 0);
    // And it drags from there: 20px up, less the pan's threshold.
    move(hook, 480, 1050, t);
    expect(liveOffset(hook)).toBeCloseTo(onScreen - (20 - PAN_THRESHOLD), 0);
  });

  it('on iOS, turns text selection and the callout off on the whole sheet while a finger holds or drags it, and back on at the lift', () => {
    // iOS WebKit fires no selectstart for a long-press selection (iOS 26.2
    // simulator), so only user-select refuses one there, and only on the whole
    // sheet: on the element under the finger alone, the long press selected a
    // word beside it (4 of 4 takes).
    stubIosIdiom();
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    t.style.setProperty('user-select', 'text');
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 100});
    expect(t.style.getPropertyValue('user-select')).toBe('none');
    lift(hook, 60, 102, t);
    expect(t.style.getPropertyValue('user-select')).toBe('text');
    act(() => {
      vi.advanceTimersByTime(80);
    });
    // A finger catches it mid-settle and holds still: off at the touch-down,
    // before a long press would select, ...
    press(hook, 500, 1000, t);
    expect(hook.result.current.isDragging).toBe(true);
    expect(t.style.getPropertyValue('user-select')).toBe('none');
    // ... and the sheet's own value is back when it lets go.
    lift(hook, 500, 1600, t);
    expect(t.style.getPropertyValue('user-select')).toBe('text');
  });

  it('on iOS, also locks a checkbox, radio or switch input under the finger that drags or catches the sheet (spec:AST-094 FR41)', () => {
    // WebKit's own stylesheet makes every input selectable, out of reach of
    // the sheet's lock, so the input under the finger is locked itself.
    stubIosIdiom();
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    handleOf(t).appendChild(toggle);
    attach(hook, t);
    // A drag that begins on it.
    act(() => {
      touchEvent('touchstart', toggle, [{id: 901, x: 50, y: 0}], 0);
    });
    for (let i = 1; i <= 6; i += 1) {
      act(() => {
        touchEvent('touchmove', toggle, [{id: 901, x: 50, y: i * 10}], i * 16);
      });
    }
    expect(hook.result.current.isDragging).toBe(true);
    expect(toggle.style.getPropertyValue('user-select')).toBe('none');
    act(() => {
      touchEvent('touchend', toggle, [{id: 901, x: 50, y: 60}], 100);
    });
    expect(toggle.style.getPropertyValue('user-select')).toBe('');
    act(() => {
      vi.advanceTimersByTime(80);
    });
    // A finger that lands on it and catches the settling sheet.
    act(() => {
      touchEvent('touchstart', toggle, [{id: 902, x: 50, y: 500}], 1000);
    });
    expect(hook.result.current.isDragging).toBe(true);
    expect(toggle.style.getPropertyValue('user-select')).toBe('none');
    // And it stays locked as that finger drags the sheet on.
    for (let i = 1; i <= 6; i += 1) {
      act(() => {
        touchEvent(
          'touchmove',
          toggle,
          [{id: 902, x: 50, y: 500 + i * 10}],
          1000 + i * 16,
        );
      });
      expect(toggle.style.getPropertyValue('user-select')).toBe('none');
    }
    act(() => {
      touchEvent('touchend', toggle, [{id: 902, x: 50, y: 560}], 1600);
    });
    expect(toggle.style.getPropertyValue('user-select')).toBe('');
  });

  it("on iOS, also locks a checkbox in the sheet's content under the finger that pulls or catches the sheet (spec:AST-094 FR41)", () => {
    // The content's pans bring no lock of their own to the gesture host, so
    // the sheet's drag lock takes the touch's target itself.
    stubIosIdiom();
    const {hook} = setup({snapHeights: () => [200]});
    const body = makeScroller({
      scrollTop: 0,
      clientHeight: 200,
      scrollHeight: 800,
    });
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    body.appendChild(toggle);
    attach(hook, sheetOf(body));
    // A pull down that begins on it, at the content's top.
    act(() => {
      touchEvent('touchstart', toggle, [{id: 911, x: 50, y: 300}], 0);
    });
    for (let i = 1; i <= 6; i += 1) {
      act(() => {
        touchEvent(
          'touchmove',
          toggle,
          [{id: 911, x: 50, y: 300 + i * 10}],
          i * 16,
        );
      });
    }
    expect(hook.result.current.isDragging).toBe(true);
    expect(toggle.style.getPropertyValue('user-select')).toBe('none');
    act(() => {
      touchEvent('touchend', toggle, [{id: 911, x: 50, y: 360}], 100);
    });
    expect(toggle.style.getPropertyValue('user-select')).toBe('');
    act(() => {
      vi.advanceTimersByTime(80);
    });
    // A finger that lands on it and catches the settling sheet.
    act(() => {
      touchEvent('touchstart', toggle, [{id: 912, x: 50, y: 400}], 1000);
    });
    expect(hook.result.current.isDragging).toBe(true);
    expect(toggle.style.getPropertyValue('user-select')).toBe('none');
    act(() => {
      touchEvent('touchend', toggle, [{id: 912, x: 50, y: 400}], 1600);
    });
    expect(toggle.style.getPropertyValue('user-select')).toBe('');
  });

  it('elsewhere, cancels the selection a finger holding or dragging the sheet would start, and changes no style', () => {
    stubCoarsePointer();
    vi.stubGlobal('CSS', {supports: () => false, escape: (v: string) => v});
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    const row = document.createElement('span');
    t.appendChild(row);
    t.style.setProperty('user-select', 'text');
    // A long press on the row: Chromium fires `selectstart` there first.
    const longPressSelects = () => {
      const event = new Event('selectstart', {bubbles: true, cancelable: true});
      row.dispatchEvent(event);
      return !event.defaultPrevented;
    };
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 100});
    // The pan began: a long press selects nothing, and the lock wrote no
    // style, which would repaint the whole sheet at the catch and again at the
    // lift.
    expect(longPressSelects()).toBe(false);
    expect(t.style.getPropertyValue('user-select')).toBe('text');
    expect(t.style.getPropertyValue('-webkit-user-select')).toBe('');
    expect(row.getAttribute('style')).toBeNull();
    lift(hook, 60, 102, t);
    expect(longPressSelects()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(80);
    });
    // A finger catches it mid-settle and holds still: refused from the
    // touch-down, before a long press would select, until it lets go.
    press(hook, 500, 1000, t);
    expect(hook.result.current.isDragging).toBe(true);
    expect(longPressSelects()).toBe(false);
    expect(t.style.getPropertyValue('user-select')).toBe('text');
    lift(hook, 500, 1600, t);
    expect(longPressSelects()).toBe(true);
  });

  it('leaves text selection to the browser for a finger where the primary pointer is fine (spec:AST-094 FR19, spec:AST-017 FR59)', () => {
    // A touchscreen laptop: a finger drags the handle through the
    // recognizers (its pointerdown first, then its touches), and selection
    // and the callout stay the browser's, as the gesture host keeps them for
    // every contact where the primary pointer is fine.
    stubPointer({coarse: false});
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    t.style.setProperty('user-select', 'text');
    const longPressSelects = () => {
      const event = new Event('selectstart', {bubbles: true, cancelable: true});
      t.dispatchEvent(event);
      return !event.defaultPrevented;
    };
    attach(hook, t);
    act(() => {
      mouseEvent('pointerdown', handleOf(t), 0, 0, 0, 'touch');
      touchEvent('touchstart', handleOf(t), [{id: 72, x: 50, y: 0}], 0);
      for (const [y, time] of [
        [20, 33],
        [40, 66],
        [60, 100],
      ]) {
        mouseEvent('pointermove', handleOf(t), y, time, 0, 'touch');
        touchEvent('touchmove', handleOf(t), [{id: 72, x: 50, y}], time);
      }
    });
    expect(hook.result.current.isDragging).toBe(true);
    expect(t.style.getPropertyValue('user-select')).toBe('text');
    expect(longPressSelects()).toBe(true);
    act(() => {
      touchEvent('touchend', handleOf(t), [{id: 72, x: 50, y: 60}], 102);
      mouseEvent('pointerup', handleOf(t), 60, 102, 0, 'touch');
    });
    expect(t.style.getPropertyValue('user-select')).toBe('text');
  });

  it('carries a drag-dismissed sheet off screen on the release spring, for the host to wait on', async () => {
    // A host that closes when asked.
    const onDismiss = vi.fn();
    const snapHeights = () => [200];
    const hook = renderHook(() => {
      const [isOpen, setIsOpen] = useState(true);
      return useSheetGestures({
        isOpen,
        snapHeights,
        onDismiss: () => {
          onDismiss();
          setIsOpen(false);
        },
      });
    });
    const t = makeTarget();
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 150, t0: 0, t1: 100}); // 1500 px/s
    lift(hook, 150, 102, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    const exit = hook.result.current.gestureExitRef.current;
    expect(exit).not.toBeNull();
    // Rested at the open detent, so the resting transform is none.
    expect(exit?.transform).toBe('none');
    // The inline style holds what is on screen while the spring runs, and the
    // end is written when it retires: no frame shows where it is going. The
    // played curve ends gone, the sheet's whole 400px below where it rests
    // open.
    expect(travel(t)).toBe(150);
    expect(translateYOf(played[0].keyframes.at(-1) as Keyframe)).toBe(400);
    const curve = solveSpring(toSpring(springs.sheetDismissSwipe), {
      from: 150,
      to: 400,
      velocity: 1500,
    });
    expect(travelAt(played[0], 50)).toBeCloseTo(curve.value(0.05), 1);
    // The exit ends when the spring lands, and the end is written then.
    vi.advanceTimersByTime(2000);
    await expect(exit?.finished).resolves.toBe(true);
    expect(travel(t)).toBe(400);
  });

  it('keeps a fast throw onto the tallest detent within the reserve below the screen', () => {
    const {hook} = setup({
      snapHeights: () => [200],
      offscreenBlockEndInset: 48,
    });
    const t = makeTarget();
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 150, t0: 0, t1: 600});
    // Thrown back up at 3000 px/s, released 5 px below fully open.
    stream(hook, t, {from: 150, to: 5, t0: 600, t1: 648});
    lift(hook, 5, 650, t);
    expect(hook.result.current.settledOffset).toBe(0);
    const release = played.at(-1) as Played;
    // The sheet extends 48 px below the screen: it never rises past that.
    for (let ms = 0; ms <= 600; ms += 4) {
      expect(travelAt(release, ms)).toBeGreaterThanOrEqual(-48.5);
    }
  });

  it('keeps a finger let go above fully open, still moving up, within the reserve below the screen', () => {
    const {hook} = setup({
      snapHeights: () => [200],
      offscreenBlockEndInset: 48,
    });
    const t = makeTarget();
    const played = recordAnimations(t);
    down(hook, 400, 0, t);
    // Up past fully open until the band holds the sheet at the 48 px wall,
    // the finger still moving up at 1500 px/s when it lifts.
    stream(hook, t, {from: 400, to: 100, t0: 0, t1: 200});
    expect(liveOffset(hook)).toBe(-48);
    lift(hook, 100, 201, t);
    expect(hook.result.current.settledOffset).toBe(0);
    const release = played.at(-1) as Played;
    for (let ms = 0; ms <= 600; ms += 4) {
      expect(travelAt(release, ms)).toBeGreaterThanOrEqual(-48.5);
    }
  });

  it('plays the measured fast release whatever a `--motion-…` variable says, within the reserve (spec:AST-094 FR4 names no sheet role)', () => {
    // A theme scope that sets the fast release's variable to a bouncier
    // spring: the sheet's springs are not theme roles, so the release plays
    // the measured spring and the overshoot cap holds on it.
    const scope = document.createElement('div');
    scope.setAttribute('data-astryx-theme', 'bouncy-release');
    const plain = document.createElement('div');
    document.body.append(scope, plain);
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      // Custom properties inherit: anything inside the scope reads its value.
      (element: Element, pseudo?: string | null) =>
        scope.contains(element)
          ? ({
              getPropertyValue: (name: string) =>
                name === '--motion-springs-sheet-release-fast'
                  ? '0.5s 0.6'
                  : '',
            } as CSSStyleDeclaration)
          : computed(element, pseudo),
    );
    // Each throw on its own stretch of the clock: the gesture host reads
    // event times, so the second throw starts after the first.
    const throwIn = (parent: HTMLElement, at: number): Played => {
      const {hook} = setup({
        snapHeights: () => [200],
        offscreenBlockEndInset: 48,
      });
      const t = makeTarget();
      parent.append(t);
      const played = recordAnimations(t);
      down(hook, 0, at, t);
      stream(hook, t, {from: 0, to: 150, t0: at, t1: at + 600});
      // Thrown back up at 3000 px/s, released 5 px below fully open.
      stream(hook, t, {from: 150, to: 5, t0: at + 600, t1: at + 648});
      lift(hook, 5, at + 650, t);
      expect(hook.result.current.settledOffset).toBe(0);
      return played.at(-1) as Played;
    };
    const themed = throwIn(scope, 0);
    const measured = throwIn(plain, 10_000);
    for (let ms = 0; ms <= 600; ms += 4) {
      expect(travelAt(themed, ms)).toBeCloseTo(travelAt(measured, ms), 6);
      expect(travelAt(themed, ms)).toBeGreaterThanOrEqual(-48.5);
    }
  });

  it('settles a drag dismissal as unfinished when the sheet unmounts mid-exit', async () => {
    const snapHeights = () => [200];
    // A host that closes when asked, as the sheet's own host does.
    const hook = renderHook(() => {
      const [isOpen, setIsOpen] = useState(true);
      return useSheetGestures({
        isOpen,
        snapHeights,
        onDismiss: () => setIsOpen(false),
      });
    });
    const t = makeTarget();
    recordAnimations(t);
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 150, t0: 0, t1: 100}); // 1500 px/s
    lift(hook, 150, 102, t);
    const exit = hook.result.current.gestureExitRef.current;
    expect(exit).not.toBeNull();
    // Unmounted before the spring lands: its timer must not finish it.
    hook.unmount();
    vi.advanceTimersByTime(2000);
    await expect(exit?.finished).resolves.toBe(false);
  });

  it('springs back to the detent when the host keeps a drag-dismissed sheet open', () => {
    // A controlled host that does not close: isOpen stays true.
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 150, t0: 0, t1: 100});
    lift(hook, 150, 102, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // The commit after the request finds the sheet still open.
    expect(hook.result.current.gestureExitRef.current).toBeNull();
    expect(travel(t)).toBe(0);
    land();
    expect(travel(t)).toBe(0);
    expect(hook.result.current.settledOffset).toBe(0);
  });

  it('cross-fades a release under reduced motion: no spring, 200 ms or less (design:reduced-motion DR2)', () => {
    stubPointer({coarse: true, reducedMotion: true});
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 100});
    lift(hook, 60, 102, t);
    expect(hook.result.current.settledOffset).toBe(200);
    // The sheet fades; nothing runs longer than the record's 200 ms.
    expect(played.some(a => changedProperties(a).includes('opacity'))).toBe(
      true,
    );
    for (const animation of played) {
      expect(settledMs(animation)).toBeLessThanOrEqual(200.5);
    }
  });

  it('fades a drag-dismissed sheet out in place under reduced motion', () => {
    stubPointer({coarse: true, reducedMotion: true});
    const snapHeights = () => [200];
    const hook = renderHook(() => {
      const [isOpen, setIsOpen] = useState(true);
      return useSheetGestures({
        isOpen,
        snapHeights,
        onDismiss: () => setIsOpen(false),
      });
    });
    const t = makeTarget();
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 150, t0: 0, t1: 100});
    lift(hook, 150, 102, t);
    expect(hook.result.current.gestureExitRef.current).not.toBeNull();
    const fade = played.find(a => changedProperties(a).includes('opacity'));
    expect(fade).toBeDefined();
    // Fades out where it is, within 200 ms.
    expect(Number((fade as Played).keyframes[0].opacity)).toBeCloseTo(1, 2);
    expect(settledMs(fade as Played)).toBeLessThanOrEqual(200.5);
    for (const animation of played) {
      expect(settledMs(animation)).toBeLessThanOrEqual(200.5);
    }
  });

  it('keeps the theme timing under a mouse, without the velocity hand-off', () => {
    stubPointer({coarse: false});
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    // What the panel's stylesheet gives the sheet's transform.
    t.style.transitionProperty = 'transform, opacity';
    t.style.transitionDuration = '410ms, 410ms';
    t.style.transitionTimingFunction =
      'cubic-bezier(0.24, 1, 0.4, 1), cubic-bezier(0.24, 1, 0.4, 1)';
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    // 200 px/s, under the slowest projected speed (250): the release keeps
    // the stop nearest where it was let go, the top (spec:AST-094 FR36).
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 300});
    lift(hook, 60, 302, t);
    expect(played).toHaveLength(1);
    // 410 ms of curve, then the animator's end-state hold.
    expect((played[0].options.duration as number) - END_HOLD_MS).toBeCloseTo(
      410,
      0,
    );
    // The theme's easing from 60 to the top, whatever the pointer's speed.
    const ease = (p: number) => {
      // cubic-bezier(0.24, 1, 0.4, 1), by bisection on x.
      const bez = (a: number, b: number, u: number) =>
        3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (bez(0.24, 0.4, mid) < p) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return bez(1, 1, (lo + hi) / 2);
    };
    for (const {t: ms, value} of keyframesUntil(played[0], translateYOf, 409)) {
      expect(value).toBeCloseTo(60 - 60 * ease(ms / 410), 1);
    }
    // The inline style holds what is on screen while the curve runs, and the
    // end is written when it retires.
    expect(travel(t)).toBe(60);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(travel(t)).toBe(0);
  });

  /** A finger on Android: coarse, in an engine without `-webkit-touch-callout`. One touch model: it gets what a finger on iOS gets. */
  function stubAndroidFinger({reducedMotion = false} = {}) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches:
          query.includes('pointer: coarse') ||
          (reducedMotion && query.includes('prefers-reduced-motion')),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal('CSS', {supports: () => false, escape: (v: string) => v});
  }

  it("takes UIKit's rule and spring under a finger on Android too (one touch model)", () => {
    stubAndroidFinger();
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    t.style.transitionProperty = 'transform';
    t.style.transitionDuration = '410ms';
    t.style.transitionTimingFunction = 'cubic-bezier(0.24, 1, 0.4, 1)';
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    // 600 px/s over 100 px: UIKit's rule lands on 200 (100 + 0.1 × 600 =
    // 160), where today's would project past the dismiss line.
    stream(hook, t, {from: 0, to: 100, t0: 0, t1: 167});
    lift(hook, 100, 169, t);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(200);
    // On the slow-release spring, not the theme's 410 ms curve.
    expect(played).toHaveLength(1);
    const curve = solveSpring(toSpring(springs.sheetDetent), {
      from: 100,
      to: 200,
      velocity: 600,
    });
    expect(travelAt(played[0], 100)).toBeCloseTo(curve.value(0.1), 0);
  });

  it('cross-fades a touch release on Android under reduced motion, 200 ms or less (DR2)', () => {
    stubAndroidFinger({reducedMotion: true});
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    t.style.transitionProperty = 'transform';
    t.style.transitionDuration = '410ms';
    t.style.transitionTimingFunction = 'ease';
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    // 500 px/s to 150 px: UIKit's rule lands on 200 (150 + 0.1 × 500).
    stream(hook, t, {from: 0, to: 150, t0: 0, t1: 300});
    lift(hook, 150, 302, t);
    expect(hook.result.current.settledOffset).toBe(200);
    expect(played.some(a => changedProperties(a).includes('opacity'))).toBe(
      true,
    );
    for (const animation of played) {
      expect(settledMs(animation)).toBeLessThanOrEqual(200.5);
    }
  });

  it('lands a mouse release at once under reduced motion (DR3)', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    t.style.transitionProperty = 'transform';
    t.style.transitionDuration = '410ms';
    t.style.transitionTimingFunction = 'ease';
    const played = recordAnimations(t);
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 300});
    lift(hook, 60, 302, t);
    // 200 px/s: the stop nearest where it was let go (spec:AST-094 FR36).
    expect(hook.result.current.settledOffset).toBe(0);
    // Nothing animates: every played value holds still.
    for (const animation of played) {
      expect(changedProperties(animation)).toEqual([]);
    }
  });

  it('fades a finger release under reduced motion with a fine primary pointer too (DR2)', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const {hook} = setup({snapHeights: () => [200]});
    // A finger on a touchscreen whose primary pointer is fine: the
    // recognizers take it (spec:AST-094 FR19), its pointerdown first, then
    // its touches.
    const sheet = makeTarget();
    attach(hook, sheet);
    sheet.style.transitionProperty = 'transform';
    sheet.style.transitionDuration = '410ms';
    sheet.style.transitionTimingFunction = 'ease';
    const played = recordAnimations(sheet);
    const fire = (
      type: 'pointerdown' | 'pointermove' | 'pointerup',
      y: number,
      time: number,
    ) => {
      const finger = [{id: 73, x: 50, y}];
      if (type === 'pointerdown') {
        mouseEvent(type, handleOf(sheet), y, time, 0, 'touch');
        touchEvent('touchstart', handleOf(sheet), finger, time);
      } else if (type === 'pointermove') {
        mouseEvent(type, handleOf(sheet), y, time, 0, 'touch');
        touchEvent('touchmove', handleOf(sheet), finger, time);
      } else {
        touchEvent('touchend', handleOf(sheet), finger, time);
        mouseEvent(type, handleOf(sheet), y, time, 0, 'touch');
      }
    };
    // 150 px down, then still before the lift (on the page clock): it
    // settles on the 200 px detent.
    const t0 = performance.now();
    act(() => fire('pointerdown', 0, t0));
    for (const [y, dt] of [
      [75, 100],
      [150, 200],
    ]) {
      act(() => {
        vi.advanceTimersByTime(100);
        fire('pointermove', y, t0 + dt);
      });
    }
    expect(hook.result.current.isDragging).toBe(true);
    act(() => {
      vi.advanceTimersByTime(150);
      fire('pointerup', 150, t0 + 350);
    });
    expect(hook.result.current.settledOffset).toBe(200);
    // The release fades, though the primary pointer is fine: a finger
    // started it.
    expect(played.some(a => changedProperties(a).includes('opacity'))).toBe(
      true,
    );
    for (const animation of played) {
      expect(settledMs(animation)).toBeLessThanOrEqual(200.5);
    }
  });

  it('leaves a drag-dismissed sheet to the host exit under a mouse, from where it was', () => {
    stubPointer({coarse: false});
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    t.style.transitionProperty = 'transform';
    t.style.transitionDuration = '410ms';
    t.style.transitionTimingFunction = 'ease';
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 150, t0: 0, t1: 100});
    lift(hook, 150, 102, t);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(hook.result.current.gestureExitRef.current).toBeNull();
    // The travel is folded into the transform the host's exit runs from.
    expect(t.style.transform).toBe('translateY(150px)');
    expect(travel(t)).toBe(0);
  });

  it('reads touch velocity from the touch events, however late they are handled', () => {
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const el = makeScroller({
      scrollTop: 0,
      clientHeight: 200,
      scrollHeight: 800,
    });
    attach(hook, sheetOf(el));
    const touch = (
      type: 'touchstart' | 'touchmove' | 'touchend',
      y: number,
      timeStamp: number,
    ) => {
      touchEvent(type, el, [{id: 1, x: 0, y}], timeStamp);
    };
    // A pull down at 1800 px/s, every event delivered in one late batch:
    // 170 px of travel past the pan's threshold, projected 180 px further,
    // past halfway to gone.
    act(() => {
      touch('touchstart', 0, 0);
      for (let i = 1; i <= 6; i++) {
        touch('touchmove', i * 30, (i * 100) / 6);
      }
      touch('touchend', 180, 101);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('useSheetGestures: the dim follows the sheet', () => {
  // A finger: the release runs on UIKit's springs and the dim follows the
  // sheet (releaseMotion.ts); under a mouse, today's dim.
  beforeEach(() => stubIosIdiom());

  interface Played {
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions & {pseudoElement?: string};
    cancel: ReturnType<typeof vi.fn>;
  }
  function recordAnimations(el: HTMLElement): Played[] {
    const played: Played[] = [];
    el.animate = vi.fn((keyframes, options) => {
      const cancel = vi.fn();
      played.push({
        keyframes: keyframes as Keyframe[],
        options: options as Played['options'],
        cancel,
      });
      return {cancel, startTime: 0} as unknown as Animation;
    });
    return played;
  }
  /** A played property's value `ms` after its start. */
  function valueAt(
    animation: Played,
    ms: number,
    read: (frame: Keyframe) => number,
  ): number {
    const duration = animation.options.duration as number;
    const frames = animation.keyframes.map(frame => ({
      t: (frame.offset as number) * duration,
      v: read(frame),
    }));
    for (let i = 1; i < frames.length; i++) {
      if (ms <= frames[i].t) {
        const a = frames[i - 1];
        const b = frames[i];
        return a.v + ((b.v - a.v) * (ms - a.t)) / (b.t - a.t);
      }
    }
    return frames[frames.length - 1].v;
  }
  const travelOf = (frame: Keyframe) =>
    Number.parseFloat(String(frame.translate).split(' ')[1]);
  const opacityOf = (frame: Keyframe) => Number(frame.opacity);
  // A 400px sheet with a 200px stop: offsets [0, 200], gone at 400. UIKit's
  // dim is full at the shortest detent and above, linear to clear at gone.
  const dimAt = (offset: number) =>
    Math.min(1, Math.max(0, (400 - offset) / (400 - 200)));

  /** A sheet target inside a modal dialog, whose ::backdrop is the scrim. */
  function inDialog() {
    const dialog = document.createElement('dialog');
    const target = makeTarget();
    dialog.appendChild(target);
    document.body.appendChild(dialog);
    return {dialog, target};
  }

  it('clears the dim at the dismissed position, linear from the shortest detent', () => {
    const onScrimOpacity = vi.fn();
    const {hook} = setup({snapHeights: () => [200], onScrimOpacity});
    const t = makeTarget();
    down(hook, 0, 0, t);
    for (const y of [150, 200, 250, 300, 380]) {
      move(hook, y, y, t);
      expect(Number(onScrimOpacity.mock.calls.at(-1)?.[0])).toBeCloseTo(
        dimAt(y),
        9,
      );
    }
  });

  it("pins the host's easing for the gesture and hands it back when the sheet lands", async () => {
    const onScrimOpacity = vi.fn();
    const onScrimTracking = vi.fn();
    const {hook} = setup({
      snapHeights: () => [200],
      onScrimOpacity,
      onScrimTracking,
    });
    const {target} = inDialog();
    recordAnimations(target);
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 290, t0: 0, t1: 600});
    // Pinned from the drag's start, its first move.
    expect(onScrimTracking.mock.calls).toEqual([[true]]);
    restAt(hook, 290, 650, target);
    lift(hook, 290, 800, target);
    // Still the release's: the sheet is on its way to the 200 detent.
    expect(onScrimTracking.mock.calls).toEqual([[true]]);
    land();
    // The spring's end resolves on a microtask.
    await Promise.resolve();
    expect(onScrimTracking.mock.calls).toEqual([[true], [false]]);
    expect(onScrimOpacity).toHaveBeenLastCalledWith(1);
  });

  it('plays the dim on the backdrop in lockstep with the release', () => {
    const {hook} = setup({
      snapHeights: () => [200],
      onScrimOpacity: vi.fn(),
      onScrimTracking: vi.fn(),
    });
    const {dialog, target} = inDialog();
    const sheetAnimations = recordAnimations(target);
    const backdrop = recordAnimations(dialog);
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 290, t0: 0, t1: 600});
    restAt(hook, 290, 650, target);
    lift(hook, 290, 800, target);
    expect(hook.result.current.settledOffset).toBe(200);
    const sheetAnimation = sheetAnimations.at(-1) as Played;
    const dim = backdrop.at(-1) as Played;
    expect(dim.options.pseudoElement).toBe('::backdrop');
    // Each moment's dim is the one for where the sheet is at that moment.
    for (const ms of [0, 16, 50, 100, 200, 300]) {
      const offset = valueAt(sheetAnimation, ms, travelOf);
      expect(valueAt(dim, ms, opacityOf)).toBeCloseTo(dimAt(offset), 2);
    }
    expect(valueAt(dim, 0, opacityOf)).toBeCloseTo(dimAt(290), 2);
  });

  it("plays no dim on a backdrop that isn't the visible scrim, and still releases the sheet", () => {
    // A sheet stacked above another: the stack's one visible backdrop is the
    // other's, and this one's stays transparent.
    const {hook} = setup({
      snapHeights: () => [200],
      onScrimOpacity: vi.fn(),
      onScrimTracking: vi.fn(),
      isScrimShown: () => false,
    });
    const {dialog, target} = inDialog();
    const sheetAnimations = recordAnimations(target);
    const backdrop = recordAnimations(dialog);
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 290, t0: 0, t1: 600});
    restAt(hook, 290, 650, target);
    lift(hook, 290, 800, target);
    expect(hook.result.current.settledOffset).toBe(200);
    expect(sheetAnimations.length).toBeGreaterThan(0);
    expect(backdrop).toEqual([]);
  });

  it('hands the dim back unpinned when the sheet closes during a release, writing nothing over the close', () => {
    const onScrimOpacity = vi.fn();
    const onScrimTracking = vi.fn();
    const snapHeights = () => [200];
    const hook = renderHook(
      ({isOpen}: {isOpen: boolean}) =>
        useSheetGestures({
          isOpen,
          snapHeights,
          onDismiss: vi.fn(),
          onScrimOpacity,
          onScrimTracking,
        }),
      {initialProps: {isOpen: true}},
    );
    const {dialog, target} = inDialog();
    recordAnimations(target);
    const backdrop = recordAnimations(dialog);
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 290, t0: 0, t1: 600});
    restAt(hook, 290, 650, target);
    lift(hook, 290, 800, target);
    const dim = backdrop.at(-1) as Played;
    expect(onScrimTracking).toHaveBeenLastCalledWith(true);
    // Closed (Escape, back, isOpen false) before the spring lands.
    act(() => {
      vi.advanceTimersByTime(60);
    });
    const writes = onScrimOpacity.mock.calls.length;
    hook.rerender({isOpen: false});
    // At once: the release's dim stops and the host's easing is back.
    expect(onScrimTracking).toHaveBeenLastCalledWith(false);
    expect(dim.cancel).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // The landing writes nothing over the host's close.
    expect(onScrimOpacity.mock.calls.length).toBe(writes);
  });

  it('lets a finger catch the dim where it is', () => {
    const onScrimOpacity = vi.fn();
    const {hook} = setup({
      snapHeights: () => [200],
      onScrimOpacity,
      onScrimTracking: vi.fn(),
    });
    const {dialog, target} = inDialog();
    recordAnimations(target);
    const backdrop = recordAnimations(dialog);
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 290, t0: 0, t1: 600});
    restAt(hook, 290, 650, target);
    lift(hook, 290, 800, target);
    const dim = backdrop.at(-1) as Played;
    // 60 ms into the settle a finger lands on the sheet.
    act(() => {
      vi.advanceTimersByTime(60);
    });
    const expected = valueAt(dim, 60, opacityOf);
    press(hook, 250, 900, target);
    expect(dim.cancel).toHaveBeenCalled();
    const caught = Number(onScrimOpacity.mock.calls.at(-1)?.[0]);
    expect(caught).toBeGreaterThan(dimAt(290));
    expect(caught).toBeLessThan(1);
    expect(caught).toBeCloseTo(expected, 1);
  });

  it("lands a release onto the peek on the peek's lighter scrim, in lockstep", () => {
    // A 400px sheet with a 300px stop and an 80px peek: offsets [0, 100, 320].
    // The dim is full down to the 100 stop, thins to the peek's floor (0.3)
    // at 320, and stays there.
    const {hook} = setup({
      snapHeights: () => [300, 80],
      onScrimOpacity: vi.fn(),
      onScrimTracking: vi.fn(),
    });
    const {dialog, target} = inDialog();
    const sheetAnimations = recordAnimations(target);
    const backdrop = recordAnimations(dialog);
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 300, t0: 0, t1: 600});
    restAt(hook, 300, 650, target);
    lift(hook, 300, 800, target);
    expect(hook.result.current.settledOffset).toBe(320);
    const peekDim = (offset: number) =>
      offset <= 100
        ? 1
        : offset >= 320
          ? 0.3
          : 1 - (0.7 * (offset - 100)) / 220;
    const sheetAnimation = sheetAnimations.at(-1) as Played;
    const dim = backdrop.at(-1) as Played;
    for (const ms of [0, 16, 50, 100, 200, 300]) {
      const offset = valueAt(sheetAnimation, ms, travelOf);
      expect(valueAt(dim, ms, opacityOf)).toBeCloseTo(peekDim(offset), 2);
    }
    expect(valueAt(dim, dim.options.duration as number, opacityOf)).toBeCloseTo(
      0.3,
      2,
    );
  });

  it('fades the dim to its end with the release under reduced motion, 200 ms or less', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches:
          query.includes('pointer: coarse') ||
          query.includes('prefers-reduced-motion'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const {hook} = setup({
      snapHeights: () => [200],
      onScrimOpacity: vi.fn(),
      onScrimTracking: vi.fn(),
    });
    const {dialog, target} = inDialog();
    recordAnimations(target);
    const backdrop = recordAnimations(dialog);
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 290, t0: 0, t1: 600});
    restAt(hook, 290, 650, target);
    lift(hook, 290, 800, target);
    expect(hook.result.current.settledOffset).toBe(200);
    const dim = backdrop.at(-1) as Played;
    // From the dim where the finger left it to the detent's, within 200 ms.
    expect(valueAt(dim, 0, opacityOf)).toBeCloseTo(dimAt(290), 2);
    expect(settledMs(dim)).toBeLessThanOrEqual(200.5);
    expect(valueAt(dim, 200, opacityOf)).toBeCloseTo(dimAt(200), 2);
  });

  it('follows the sheet under a finger on Android too (one touch model)', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('pointer: coarse'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal('CSS', {supports: () => false, escape: (v: string) => v});
    const onScrimTracking = vi.fn();
    const {hook} = setup({
      snapHeights: () => [200],
      onScrimOpacity: vi.fn(),
      onScrimTracking,
    });
    const {dialog, target} = inDialog();
    recordAnimations(target);
    const backdrop = recordAnimations(dialog);
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 290, t0: 0, t1: 600});
    restAt(hook, 290, 650, target);
    lift(hook, 290, 800, target);
    // Pinned, and the release's dim played on the backdrop, as on iOS.
    expect(onScrimTracking).toHaveBeenCalledWith(true);
    const dim = backdrop.at(-1) as Played;
    expect(dim.options.pseudoElement).toBe('::backdrop');
    expect(valueAt(dim, 0, opacityOf)).toBeCloseTo(dimAt(290), 2);
  });

  it.each([['a mouse', {coarse: false}]])(
    "maps the dim under %s as a finger's, clear only once gone (one release rule, spec:AST-094 FR36); the host eases it",
    (_, {coarse}) => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
          matches: coarse && query.includes('pointer: coarse'),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      );
      vi.stubGlobal('CSS', {supports: () => false, escape: (v: string) => v});
      const onScrimOpacity = vi.fn();
      const onScrimTracking = vi.fn();
      const {hook} = setup({
        snapHeights: () => [200],
        onScrimOpacity,
        onScrimTracking,
      });
      const {dialog, target} = inDialog();
      const played = recordAnimations(dialog);
      down(hook, 0, 0, target);
      // 40 px below the 200 px detent, of the 200 px to gone: the dim is
      // 80 % there, as a finger's, since a still release dismisses only past
      // halfway (a dim cleared 40 % below the detent let the sheet spring
      // back under a clear backdrop).
      move(hook, 240, 500, target);
      expect(onScrimOpacity).toHaveBeenLastCalledWith(expect.closeTo(0.8, 9));
      restAt(hook, 240, 600, target);
      up(hook, 240, 1000, target);
      // Never pinned, and no dim played on the backdrop: the host's own
      // easing carries it, as today.
      expect(onScrimTracking).not.toHaveBeenCalled();
      expect(played).toHaveLength(0);
      expect(onScrimOpacity).toHaveBeenLastCalledWith(1);
    },
  );
});

describe('useSheetGestures: a finger on the drawn sheet during a release', () => {
  // WebKit (iOS Safari 26.2) hit-tests an element a compositor animation is
  // moving at its un-animated position: a touch on the moving sheet arrives
  // on whatever sat there when the release began (here, the dialog: the
  // scrim). The gesture host asks the engine what is drawn under the finger
  // instead (jsdom has no hit test: `elementFromPoint` answers from the
  // drawn sheet's box), and the sheet's catch takes the touch there.
  beforeEach(() => stubIosIdiom());
  afterEach(() => {
    delete (document as {elementFromPoint?: unknown}).elementFromPoint;
  });
  /** The engine's hit test: the handle inside the drawn sheet, else the scrim. */
  function hitTest(dialog: HTMLElement, target: HTMLElement, drawnTop: number) {
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: (_x: number, y: number) =>
        y >= drawnTop && y <= drawnTop + 400 ? handleOf(target) : dialog,
    });
  }

  interface Played {
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
    cancel: ReturnType<typeof vi.fn>;
  }
  function recordAnimations(el: HTMLElement): Played[] {
    const played: Played[] = [];
    el.animate = vi.fn((keyframes, options) => {
      const cancel = vi.fn();
      played.push({
        keyframes: keyframes as Keyframe[],
        options: options as KeyframeAnimationOptions,
        cancel,
      });
      return {cancel, startTime: 0} as unknown as Animation;
    });
    return played;
  }
  function travelAt(animation: Played, ms: number): number {
    const duration = animation.options.duration as number;
    const frames = animation.keyframes.map(frame => ({
      t: (frame.offset as number) * duration,
      v: Number.parseFloat(String(frame.translate).split(' ')[1]),
    }));
    for (let i = 1; i < frames.length; i++) {
      if (ms <= frames[i].t) {
        const a = frames[i - 1];
        const b = frames[i];
        return a.v + ((b.v - a.v) * (ms - a.t)) / (b.t - a.t);
      }
    }
    return frames[frames.length - 1].v;
  }
  // After the release (its lift at 800 ms), 16 ms apart.
  let dialogClock = 1000;
  beforeEach(() => {
    dialogClock = 1000;
  });
  function touchOnDialog(
    dialog: HTMLElement,
    type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
    y: number,
    id = 7,
  ): Event {
    dialogClock += 16;
    return touchEvent(type, dialog, [{id, x: 100, y}], dialogClock);
  }
  /** A 400px sheet whose layout box starts 300px down, in a modal dialog, released toward its 200px stop. */
  function releasing() {
    const {hook} = setup({
      snapHeights: () => [200],
      onScrimOpacity: vi.fn(),
    });
    const dialog = document.createElement('dialog');
    const target = makeTarget();
    for (const [key, value] of Object.entries({
      offsetTop: 300,
      offsetLeft: 0,
      offsetWidth: 400,
      offsetHeight: 400,
      offsetParent: null,
    })) {
      Object.defineProperty(target, key, {value, configurable: true});
    }
    dialog.appendChild(target);
    document.body.appendChild(dialog);
    const sheetAnimations = recordAnimations(target);
    recordAnimations(dialog);
    attach(hook, target);
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 290, t0: 0, t1: 600});
    restAt(hook, 290, 650, target);
    lift(hook, 290, 800, target);
    const release = sheetAnimations.at(-1) as Played;
    act(() => {
      vi.advanceTimersByTime(60);
    });
    // Where the sheet is drawn 60 ms into its release.
    const y = travelAt(release, 60);
    return {hook, dialog, target, release, y, drawnTop: 300 + y};
  }

  it('catches the sheet at touch-down when the touch lands on the scrim inside the drawn sheet', () => {
    const {hook, dialog, target, release, y, drawnTop} = releasing();
    hitTest(dialog, target, drawnTop);
    expect(hook.result.current.settledOffset).toBe(200);
    act(() => {
      touchOnDialog(dialog, 'touchstart', drawnTop + 20);
    });
    // Caught where it is drawn: the release is abandoned in place.
    expect(release.cancel).toHaveBeenCalled();
    expect(hook.result.current.activeOffsetRef.current).toBeCloseTo(y, 0);
    // The finger drives it from there.
    act(() => {
      touchOnDialog(dialog, 'touchmove', drawnTop + 40);
    });
    // 20px of travel, past the pan's threshold.
    expect(hook.result.current.activeOffsetRef.current).toBeCloseTo(
      y + 20 - PAN_THRESHOLD,
      0,
    );
    act(() => {
      touchOnDialog(dialog, 'touchend', drawnTop + 40);
    });
    // Released from where the finger left it. (A drag sends no click; a
    // caught tap's is the gesture host's: it clicks what the finger touched
    // and swallows the engine's late click on the stale target.)
    expect(hook.result.current.isDragging).toBe(false);
  });

  it('leaves a touch above the drawn sheet to the scrim', () => {
    const {hook, dialog, target, release, drawnTop} = releasing();
    hitTest(dialog, target, drawnTop);
    act(() => {
      touchOnDialog(dialog, 'touchstart', drawnTop - 30);
      touchOnDialog(dialog, 'touchend', drawnTop - 30);
    });
    expect(release.cancel).not.toHaveBeenCalled();
    const click = new MouseEvent('click', {bubbles: true, cancelable: true});
    dialog.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(hook.result.current.settledOffset).toBe(200);
  });

  it('leaves touches alone when nothing travels', () => {
    const {hook} = setup({snapHeights: () => [200]});
    const dialog = document.createElement('dialog');
    const target = makeTarget();
    Object.defineProperty(target, 'offsetHeight', {value: 400});
    dialog.appendChild(target);
    document.body.appendChild(dialog);
    attach(hook, target);
    act(() => {
      touchOnDialog(dialog, 'touchstart', 10);
      touchOnDialog(dialog, 'touchend', 10);
    });
    const click = new MouseEvent('click', {bubbles: true, cancelable: true});
    dialog.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(hook.result.current.activeOffsetRef.current).toBe(0);
  });
});

describe('useSheetGestures: the release storyboards (interactive-transition driver)', () => {
  // Frame-by-frame values of each release: the sheet's travel and the dim on
  // the ::backdrop, every 20 ms, against a fixture recorded from the release
  // code before it moved onto the interactive-transition driver
  // (motion/interactive.ts). UPDATE_STORYBOARDS=1 rewrites the fixture.
  interface Played {
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions & {pseudoElement?: string};
  }
  /** Per scenario: every curve played on the sheet and on its ::backdrop, sampled. */
  type Storyboard = Record<string, {sheet: number[][]; backdrop: number[][]}>;
  const FIXTURE = join(__dirname, '__fixtures__/release-storyboards.json');
  const STEP_MS = 20;
  const SPAN_MS = 800;
  const recorded: Storyboard = {};

  function recordAnimations(el: HTMLElement): Played[] {
    const played: Played[] = [];
    el.animate = vi.fn((keyframes, options) => {
      played.push({
        keyframes: keyframes as Keyframe[],
        options: options as Played['options'],
      });
      return {cancel: vi.fn(), startTime: 0} as unknown as Animation;
    });
    return played;
  }
  function valueAt(
    animation: Played,
    ms: number,
    read: (frame: Keyframe) => number,
  ): number {
    const duration = animation.options.duration as number;
    const frames = animation.keyframes.map(frame => ({
      t: (frame.offset as number) * duration,
      v: read(frame),
    }));
    for (let i = 1; i < frames.length; i++) {
      if (ms <= frames[i].t) {
        const a = frames[i - 1];
        const b = frames[i];
        return b.t > a.t ? a.v + ((b.v - a.v) * (ms - a.t)) / (b.t - a.t) : b.v;
      }
    }
    return frames[frames.length - 1].v;
  }
  const travelOf = (frame: Keyframe) =>
    Number.parseFloat(String(frame.translate ?? '0px 0px').split(' ')[1]);
  const opacityOf = (frame: Keyframe) => Number(frame.opacity);
  const samples = (animation: Played, read: (f: Keyframe) => number) =>
    Array.from(
      {length: SPAN_MS / STEP_MS + 1},
      (_, i) => Math.round(valueAt(animation, i * STEP_MS, read) * 1000) / 1000,
    );
  // A curve, not a one-step write: more than two keyframes.
  const curves = (played: Played[]) =>
    played.filter(p => p.keyframes.length > 2);
  const readOf = (animation: Played) =>
    animation.keyframes[0].translate != null ? travelOf : opacityOf;

  function scenario(
    name: string,
    gesture: (hook: Hook, target: HTMLElement) => void,
    {pointer = 'touch'}: {pointer?: 'touch' | 'mouse' | 'touch-rm'} = {},
  ) {
    it(name, () => {
      if (pointer === 'mouse') {
        vi.stubGlobal(
          'matchMedia',
          vi.fn(() => ({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          })),
        );
      } else {
        stubIosIdiom({reducedMotion: pointer === 'touch-rm'});
      }
      const {hook} = setup({
        snapHeights: () => [200],
        onScrimOpacity: vi.fn(),
        onScrimTracking: vi.fn(),
      });
      const dialog = document.createElement('dialog');
      const target = makeTarget();
      dialog.appendChild(target);
      document.body.appendChild(dialog);
      if (pointer === 'mouse') {
        // The theme timing a mouse release reads off the stylesheet, set as
        // longhands: the test DOM does not expand the `transition` shorthand,
        // so with it the release read no duration and played no curve.
        target.style.transitionProperty = 'transform';
        target.style.transitionDuration = '410ms';
        target.style.transitionTimingFunction = 'cubic-bezier(0.2, 0, 0, 1)';
      }
      const sheet = recordAnimations(target);
      const backdrop = recordAnimations(dialog);
      gesture(hook, target);
      // Every scenario plays a curve on the sheet: a storyboard with none
      // could not fail.
      expect(curves(sheet).length).toBeGreaterThan(0);
      recorded[name] = {
        sheet: curves(sheet).map(animation =>
          samples(animation, readOf(animation)),
        ),
        backdrop: curves(backdrop).map(animation =>
          samples(animation, opacityOf),
        ),
      };
      dialog.remove();
    });
  }

  // A slow drag from tall to 2/3 of the way to the 200 detent: settles there.
  scenario('slow settle onto the detent', (hook, target) => {
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 140, t0: 0, t1: 700});
    restAt(hook, 140, 720, target);
    up(hook, 140, 760, target);
  });
  // A throw: past 1008 px/s, the flick branch onto the next detent.
  scenario('flick onto the next detent', (hook, target) => {
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 80, t0: 0, t1: 60});
    up(hook, 80, 62, target);
  });
  // Below the 200 detent and back: the dim rides the spring back.
  scenario('spring back from below the detent', (hook, target) => {
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 290, t0: 0, t1: 600});
    restAt(hook, 290, 650, target);
    up(hook, 290, 800, target);
  });
  // A flick down from the 200 detent: the release carries it off screen.
  scenario('flick dismissal', (hook, target) => {
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 200, t0: 0, t1: 600});
    restAt(hook, 200, 650, target);
    up(hook, 200, 800, target);
    land();
    down(hook, 200, 2000, target);
    stream(hook, target, {from: 200, to: 300, t0: 2000, t1: 2060});
    up(hook, 300, 2062, target);
  });
  // A moderate throw up onto the tallest detent: the overshoot cap.
  scenario('throw up onto the tallest detent', (hook, target) => {
    down(hook, 0, 0, target);
    stream(hook, target, {from: 0, to: 200, t0: 0, t1: 600});
    restAt(hook, 200, 650, target);
    up(hook, 200, 800, target);
    land();
    down(hook, 200, 2000, target);
    stream(hook, target, {from: 200, to: 120, t0: 2000, t1: 2080});
    up(hook, 120, 2082, target);
  });
  // A mouse: today's rule on the theme's timing.
  scenario(
    'mouse release on the theme timing',
    (hook, target) => {
      down(hook, 0, 0, target);
      stream(hook, target, {from: 0, to: 140, t0: 0, t1: 700});
      restAt(hook, 140, 720, target);
      up(hook, 140, 760, target);
    },
    {pointer: 'mouse'},
  );
  // Reduced motion under a finger: the release cross-fades in place.
  scenario(
    'reduced-motion release',
    (hook, target) => {
      down(hook, 0, 0, target);
      stream(hook, target, {from: 0, to: 140, t0: 0, t1: 700});
      restAt(hook, 140, 720, target);
      up(hook, 140, 760, target);
    },
    {pointer: 'touch-rm'},
  );

  afterAll(async () => {
    if (process.env.UPDATE_STORYBOARDS === '1') {
      // Written as the repository formats JSON, so the fixture stays stable.
      const {format, resolveConfig} = await import('prettier');
      const options = (await resolveConfig(FIXTURE)) ?? {};
      mkdirSync(dirname(FIXTURE), {recursive: true});
      writeFileSync(
        FIXTURE,
        await format(JSON.stringify(recorded), {...options, parser: 'json'}),
      );
    }
  });

  it('matches the storyboards recorded before the driver (within 0.5 px and 0.005 opacity)', () => {
    if (process.env.UPDATE_STORYBOARDS === '1') {
      // Recording: afterAll writes the fixture from this run.
      return;
    }
    // A missing fixture fails: the proof is against curves recorded before
    // the move, never against this run's own.
    expect(
      existsSync(FIXTURE),
      'the storyboard fixture is missing (UPDATE_STORYBOARDS=1 records it)',
    ).toBe(true);
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Storyboard;
    expect(Object.keys(recorded).sort()).toEqual(Object.keys(fixture).sort());
    for (const [name, before] of Object.entries(fixture)) {
      const after = recorded[name];
      for (const layer of ['sheet', 'backdrop'] as const) {
        expect(after[layer].length, `${name}: ${layer} curves`).toBe(
          before[layer].length,
        );
        before[layer].forEach((curve, k) => {
          // Travel in px, opacity in 0–1.
          const tolerance =
            Math.max(...curve.map(Math.abs)) > 1.5 ? 0.5 : 0.005;
          curve.forEach((value, i) => {
            expect(
              Math.abs(after[layer][k][i] - value),
              `${name}: ${layer} curve ${k} at ${i * STEP_MS} ms`,
            ).toBeLessThanOrEqual(tolerance);
          });
        });
      }
    }
  });
});

describe("useSheetGestures: the handle's pan", () => {
  // A fine primary pointer: today's release rule, on the pan's velocity.
  function stubFinePointer() {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  }

  it('moves the sheet by the travel past the pan threshold, as UIKit reports it', () => {
    asFinger();
    const {hook} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    press(hook, 0, 0, t);
    // Within the threshold the pan has not begun: the sheet stays put.
    move(hook, 6, 16, t);
    expect(hook.result.current.isDragging).toBe(false);
    expect(liveOffset(hook)).toBe(0);
    // Past it the sheet follows the finger, less the 10 px before the pan
    // began (UIPanGestureRecognizer's translation leaves that travel out).
    move(hook, 30, 32, t);
    expect(hook.result.current.isDragging).toBe(true);
    expect(liveOffset(hook)).toBe(30 - PAN_THRESHOLD);
  });

  it("keeps a mouse's throw through a stop shorter than 40 ms (one release velocity for every pointer, spec:AST-100 FR4)", () => {
    stubFinePointer();
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    asMouse();
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 40}); // 1500 px/s ...
    lift(hook, 60, 70, t); // ... 30 ms still, then the release
    // Still a 1500 px/s flick: on to the next detent.
    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(200);
  });

  it('throws nothing for a mouse held still for longer than 40 ms before the release (spec:AST-100 FR2)', () => {
    stubFinePointer();
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    asMouse();
    const {hook, onDismiss} = setup({snapHeights: () => [200]});
    const t = makeTarget();
    down(hook, 0, 0, t);
    stream(hook, t, {from: 0, to: 60, t0: 0, t1: 40}); // 1500 px/s ...
    lift(hook, 60, 95, t); // ... 55 ms still, then the release
    // A still pointer reads 0: 60 px stays short of the dismiss line, and the
    // sheet returns to its detent.
    expect(onDismiss).not.toHaveBeenCalled();
    expect(hook.result.current.settledOffset).toBe(0);
  });
});

describe("useSheetGestures: the body's pull at the content's edge", () => {
  /** A finger on the body's list, scrolled to `scrollTop`, before the sheet mounts. */
  function pullOn(scrollTop: number) {
    // A coarse primary pointer before the sheet mounts (the gesture host
    // attaches its recognizers only there, spec:AST-094 FR19).
    stubCoarsePointer();
    const {hook} = setup({snapHeights: () => [200]});
    const body = makeScroller({
      scrollTop,
      clientHeight: 200,
      scrollHeight: 800,
    });
    attach(hook, sheetOf(body));
    return {hook, body, touch: fingers()};
  }

  it("holds a slow pull at the content's top from its first move, so the list never rubber-bands, and still begins the pan at 10 px (FR19, DEC-18)", () => {
    const {hook, body, touch} = pullOn(0);
    let first: Event | undefined;
    let second: Event | undefined;
    let claim: Event | undefined;
    act(() => {
      touch(body, 'touchstart', 100);
      first = touch(body, 'touchmove', 103);
      second = touch(body, 'touchmove', 106);
    });
    // The list is at its top and the finger pulls away from it: the moves the
    // browser would rubber-band are held from the first one, before the pan
    // begins at its 10 px (FR17).
    expect(first?.defaultPrevented).toBe(true);
    expect(second?.defaultPrevented).toBe(true);
    expect(hook.result.current.isDragging).toBe(false);
    act(() => {
      claim = touch(body, 'touchmove', 115);
    });
    expect(claim?.defaultPrevented).toBe(true);
    expect(hook.result.current.isDragging).toBe(true);
    expect(liveOffset(hook)).toBe(15 - PAN_THRESHOLD);
    act(() => {
      touch(body, 'touchend', 115);
    });
  });

  it('never holds a real scroll: a list that can still scroll that way keeps every move', () => {
    const {hook, body, touch} = pullOn(120);
    const moves: (Event | undefined)[] = [];
    act(() => {
      touch(body, 'touchstart', 100);
      for (const y of [103, 106, 115, 130]) {
        moves.push(touch(body, 'touchmove', y));
      }
    });
    expect(moves.map(move => move?.defaultPrevented)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(hook.result.current.isDragging).toBe(false);
    act(() => {
      touch(body, 'touchend', 130);
    });
  });

  it("leaves a first move toward the content to the browser, even at the list's top", () => {
    const {hook, body, touch} = pullOn(0);
    let first: Event | undefined;
    act(() => {
      touch(body, 'touchstart', 100);
      first = touch(body, 'touchmove', 97);
    });
    expect(first?.defaultPrevented).toBe(false);
    expect(hook.result.current.isDragging).toBe(false);
    act(() => {
      touch(body, 'touchend', 97);
    });
  });
});
