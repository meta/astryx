// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayout.firstFrame.test.ts
 * @input vitest (jsdom), the animated-layout module, and a stand-in for
 *   Element.animate. Its engine runs a pending play task early, on the
 *   timeline time from before a long task. The test runs each frame by hand
 * @output Checks that a motion made from rest starts at the first frame drawn
 *   after its task, though the engine ran its pending play task first. A
 *   pause before that frame keeps the motion paused. A change made while a
 *   motion runs starts at the change
 * @position Testing; the browser proofs and the device takes prove the real
 *   engines
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createAnimatedLayout, playLayoutFrames} from './animatedLayout';

/** The stand-in's state for one animation, as the Web Animations model keeps it. */
interface Stub {
  readonly element: Element;
  readonly duration: number;
  startTime: number | null;
  /** The current time while paused or play-pending. */
  holdTime: number | null;
  /** A pending play task. */
  pending: boolean;
  isCancelled: boolean;
  fill: FillMode;
  animation?: Animation;
}

let stubs: Stub[] = [];
/** The document timeline's time, ms. */
let timeline = 1000;
/** The page's clock, ms. */
let clock = 1000;
let frameCallbacks: FrameRequestCallback[] = [];
const originalAnimate = Element.prototype.animate;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  stubs = [];
  timeline = 1000;
  clock = 1000;
  frameCallbacks = [];
  Object.defineProperty(document, 'timeline', {
    configurable: true,
    get: () => ({currentTime: timeline}),
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  });
  Element.prototype.animate = function (
    this: Element,
    _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ) {
    const timing = options as KeyframeAnimationOptions;
    // A new animation that plays is play-pending, at current time 0.
    const stub: Stub = {
      element: this,
      duration: Number(timing.duration),
      startTime: null,
      holdTime: 0,
      pending: true,
      isCancelled: false,
      fill: timing.fill ?? 'auto',
    };
    stubs.push(stub);
    const currentTime = () =>
      stub.holdTime ??
      (stub.startTime == null ? null : timeline - stub.startTime);
    const animation = {
      get startTime() {
        return stub.startTime;
      },
      // A set start time ends the hold and cancels the pending play task.
      set startTime(value: number | null) {
        stub.startTime = value;
        stub.holdTime = null;
        stub.pending = false;
      },
      get currentTime() {
        return currentTime();
      },
      get pending() {
        return stub.pending;
      },
      get playState() {
        if (stub.isCancelled) {
          return 'idle';
        }
        if (!stub.pending && stub.startTime == null) {
          return 'paused';
        }
        return Number(currentTime()) >= stub.duration ? 'finished' : 'running';
      },
      pause() {
        stub.holdTime = currentTime();
        stub.startTime = null;
        stub.pending = false;
      },
      cancel() {
        stub.isCancelled = true;
        stub.startTime = null;
        stub.holdTime = null;
        stub.pending = false;
      },
      addEventListener() {},
      effect: {
        getTiming: () => ({fill: stub.fill, duration: stub.duration}),
        updateTiming(next: OptionalEffectTiming) {
          if (next.fill != null) {
            stub.fill = next.fill;
          }
        },
      },
    } as unknown as Animation;
    stub.animation = animation;
    return animation;
  };
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  Element.prototype.animate = originalAnimate;
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function setup() {
  document.body.innerHTML = `
    <div id="area"><p id="first">First</p><p id="second">Second</p></div>`;
  const area = document.getElementById('area') as HTMLElement;
  return {
    handle: createAnimatedLayout(() => area),
    first: document.getElementById('first') as HTMLElement,
    second: document.getElementById('second') as HTMLElement,
  };
}

/**
 * Runs one frame at `frameTime` as WebKit can after a long task. First the
 * engine runs each pending play task on the timeline time it still holds.
 * Then the frame callbacks run, on the frame's own time.
 */
function runFrame(frameTime: number) {
  const held = timeline;
  for (const stub of stubs) {
    if (stub.pending) {
      stub.startTime = held - (stub.holdTime ?? 0);
      stub.holdTime = null;
      stub.pending = false;
    }
  }
  timeline = frameTime;
  clock = frameTime;
  const callbacks = frameCallbacks;
  frameCallbacks = [];
  for (const callback of callbacks) {
    callback(frameTime);
  }
}

const fade = (p: number): Keyframe => ({opacity: p});

describe('spec:AST-105 FR3, FR4: a motion made from rest starts at its first frame', () => {
  it('starts at the first frame after a long task, though the engine ran its pending play task first, on the time from before the task', () => {
    const {handle, first} = setup();
    playLayoutFrames(handle, [{element: first, frames: fade}]);
    // The rest of the task runs for 300 ms. The timeline still reads the
    // frame before it.
    clock = 1300;
    runFrame(1300);
    const [stub] = stubs;
    expect(stub.startTime).toBe(1300);
    expect(stub.animation?.currentTime).toBe(0);
  });

  it('keeps a motion that code paused before its first frame paused', () => {
    const {handle, first} = setup();
    playLayoutFrames(handle, [{element: first, frames: fade}]);
    const [stub] = stubs;
    stub.animation?.pause();
    runFrame(1016);
    expect(stub.animation?.playState).toBe('paused');
    expect(stub.startTime).toBeNull();
  });

  it('starts a change made while a motion runs at the change, with no hold', () => {
    const {handle, first, second} = setup();
    playLayoutFrames(handle, [{element: first, frames: fade}]);
    runFrame(1016);
    expect(stubs[0].animation?.playState).toBe('running');
    // 84 ms into that motion, a second change.
    timeline = 1100;
    clock = 1100;
    playLayoutFrames(handle, [{element: second, frames: fade}]);
    expect(stubs[1].startTime).toBe(1100);
  });
});
