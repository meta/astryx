// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentedGlide.test.ts
 * @input GestureHost on jsdom, the animated-layout module and a recording
 *   stand-in for Element.animate. The test mimics iOS WebKit's hit testing:
 *   `elementFromPoint` answers where each row's glide started. A style write
 *   on the row moves that answer to where the row is drawn
 * @output A tap on a row that a glide moves away from its start reaches that
 *   row's recognizer, not the row that started under the finger. With the
 *   correction off, the row that started there takes it
 * @position Unit tests of animatedLayout's glides in the presented hit
 *   testing of GestureHost.ts (motion/presentation.ts); the iOS Simulator
 *   proves the real engine
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createAnimatedLayout,
  reportLayoutChange,
} from '../../motion/animatedLayout';
import {GestureHost} from '../GestureHost';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {ManualClock} from './harness';
import {coarsePrimaryPointer} from './pointerQuery';

interface Played {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: {startTime: number | null};
}

const originalAnimate = Element.prototype.animate;
let played: Played[];
let cleanups: (() => void)[];

beforeEach(() => {
  played = [];
  cleanups = [coarsePrimaryPointer()];
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ) {
    const animation = {
      startTime: null as number | null,
      cancel: vi.fn(),
      addEventListener() {},
    };
    played.push({
      element: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      animation,
    });
    return animation as unknown as Animation;
  };
});

afterEach(() => {
  Element.prototype.animate = originalAnimate;
  for (const cleanup of cleanups) {
    cleanup();
  }
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
  Reflect.deleteProperty(document, 'elementsFromPoint');
  document.body.innerHTML = '';
});

/** The y of a `translate` keyframe, in px. */
const yOf = (frame: Keyframe | undefined) =>
  Number(/(-?[\d.e+-]+)px$/.exec(String(frame?.translate ?? ''))?.[1] ?? 0);

function touch(
  type: 'touchstart' | 'touchend',
  target: EventTarget,
  at: {x: number; y: number},
  time: number,
): void {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const contact = {identifier: 1, clientX: at.x, clientY: at.y, target};
  Object.defineProperty(event, 'changedTouches', {value: [contact]});
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [contact],
  });
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
}

/**
 * Three 60 px rows under an element that opens 120 px, so the rows glide
 * down two rows. Each row has a tap recognizer. Hit tests answer as iOS
 * WebKit does: at each row's glide start, until a style write on the row.
 */
async function mount(presentedHitTesting: 'always' | 'never') {
  document.body.innerHTML =
    '<div id="area"><div id="changed"></div><div id="a"></div><div id="b"></div><div id="c"></div></div>';
  const area = document.getElementById('area') as HTMLElement;
  const changed = document.getElementById('changed') as HTMLElement;
  const rows = ['a', 'b', 'c'].map(
    id => document.getElementById(id) as HTMLElement,
  );
  let opened = 0;
  vi.spyOn(area, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, 400, 600),
  );
  vi.spyOn(changed, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, 400, opened),
  );
  rows.forEach((row, index) =>
    vi
      .spyOn(row, 'getBoundingClientRect')
      .mockImplementation(() => new DOMRect(0, opened + index * 60, 400, 60)),
  );
  const host = new GestureHost(document, {
    clock: new ManualClock(),
    presentedHitTesting,
  });
  const taps: string[] = [];
  for (const row of rows) {
    const tap = new TapGestureRecognizer({name: row.id});
    tap.addTransitionListener((current, _from, to) => {
      if (to === 'ended') {
        taps.push(current.name ?? '');
      }
    });
    cleanups.push(host.attach(row, tap));
  }
  const report = reportLayoutChange(
    createAnimatedLayout(() => area),
    () => changed,
  );
  report.measureBefore();
  opened = 120;
  report.animate();
  await Promise.resolve();
  await Promise.resolve();
  // Each glide at the frame where half of its way is left: row b is drawn
  // over the box where row c started.
  const glides = rows.map(row => {
    const glide = played.find(p => p.element === row) as Played;
    const last = glide.keyframes.length - 1;
    const half = glide.keyframes.findIndex(frame => yOf(frame) >= -60);
    glide.animation.startTime =
      performance.now() - (Number(glide.options.duration) * half) / last;
    return glide;
  });
  const drawnY = (glide: Played, time = performance.now()) => {
    const progress =
      (time - Number(glide.animation.startTime)) /
      Number(glide.options.duration);
    return yOf(
      glide.keyframes[Math.round(progress * (glide.keyframes.length - 1))],
    );
  };
  // Where the engine hit-tests each row: its glide's start until a style
  // write on it, then where it was drawn at that write.
  const resolved = new Map<Element, {write: string; y: number}>();
  const hitY = (index: number) => {
    const row = rows[index];
    const write = row.style.getPropertyValue('--astryx-presented');
    if (write !== '' && resolved.get(row)?.write !== write) {
      resolved.set(row, {write, y: drawnY(glides[index])});
    }
    return resolved.get(row)?.y ?? yOf(glides[index].keyframes[0]);
  };
  const stack = (x: number, y: number): Element[] => [
    ...rows.filter((_, index) => {
      const top = 120 + index * 60 + hitY(index);
      return y >= top && y < top + 60;
    }),
    area,
    document.body,
  ];
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: stack,
  });
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: (x: number, y: number) => stack(x, y)[0],
  });
  // A row's centre where its glide draws it at `time`.
  const rowCentre = (index: number, time: number) => ({
    x: 200,
    y: 120 + index * 60 + drawnY(glides[index], time) + 30,
  });
  return {rows, taps, rowCentre, stack};
}

describe('a tap on a row an animatedLayout glide moves (iOS WebKit hit-tests it at the glide start)', () => {
  it('reaches the row drawn under the finger', async () => {
    const {taps, rowCentre, stack} = await mount('always');
    // The touch lands now, on the clock the host reads, where row b is drawn.
    const at = performance.now();
    const onB = rowCentre(1, at);
    // The engine sends the touch to the row that started under the finger.
    const native = stack(onB.x, onB.y)[0];
    expect((native as HTMLElement).id).toBe('c');
    touch('touchstart', native, onB, at);
    touch('touchend', native, onB, at + 80);
    expect(taps).toEqual(['b']);
  });

  it('goes to the row that started there with the correction off', async () => {
    const {taps, rowCentre, stack} = await mount('never');
    const at = performance.now();
    const onB = rowCentre(1, at);
    const native = stack(onB.x, onB.y)[0];
    touch('touchstart', native, onB, at);
    touch('touchend', native, onB, at + 80);
    expect(taps).toEqual(['c']);
  });
});
