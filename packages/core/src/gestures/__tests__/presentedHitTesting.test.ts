// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentedHitTesting.test.ts
 * @input GestureHost on jsdom with WebKit's iOS hit testing mimicked:
 *   `elementFromPoint`, `elementsFromPoint` and `getBoundingClientRect`
 *   answer where a compositor animation started while a registered offset
 *   draws the sheet elsewhere (motion/presentation.ts)
 * @output A finger on the drawn sheet reaches the sheet, not the scrim under
 *   its start, and its tap clicks the drawn button once (the engine's click
 *   cancelled, a late one swallowed); a finger where the sheet was but is no
 *   longer drawn reaches what is drawn there; press bounds follow the drawn
 *   box; nothing changes with the gate off or nothing moving
 * @position Unit tests of the presented hit testing in
 *   packages/core/src/gestures/GestureHost.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {registerPresentedOffset} from '../../motion/presentation';
import {GestureHost} from '../GestureHost';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {ManualClock} from './harness';
import {coarsePrimaryPointer} from './pointerQuery';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const rect = ({left, top, right, bottom}: Box): DOMRect => ({
  left,
  top,
  right,
  bottom,
  x: left,
  y: top,
  width: right - left,
  height: bottom - top,
  toJSON: () => ({}),
});

function touch(
  type: 'touchstart' | 'touchend',
  target: EventTarget,
  at: {x: number; y: number},
  time: number,
): Event {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const contact = {identifier: 1, clientX: at.x, clientY: at.y, target};
  Object.defineProperty(event, 'changedTouches', {value: [contact]});
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [contact],
  });
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
  return event;
}

let clock: ManualClock;
let cleanups: (() => void)[];
let scrim: HTMLElement;
let sheet: HTMLElement;
let done: HTMLElement;
let clicks: string[];
/** Where the engine hit-tests the sheet, relative to its start, px. */
let resolvedY: number;

/**
 * A sheet whose animation started at `sheetBox` and is drawn `drawnY` px
 * from it, with a Done button at its top right, over a full-page scrim. Hit
 * tests answer where the engine last resolved the sheet, as iOS WebKit does
 * mid-animation: at the start until a style write (the registry's
 * `resolve`) moves it to where the sheet is drawn.
 */
function mount(sheetBox: Box, drawnY: number): void {
  document.body.innerHTML =
    '<div id="scrim"></div><div id="sheet"><button id="done">Done</button></div>';
  scrim = document.getElementById('scrim') as HTMLElement;
  sheet = document.getElementById('sheet') as HTMLElement;
  done = document.getElementById('done') as HTMLElement;
  resolvedY = 0;
  const moved = (box: Box): Box => ({
    ...box,
    top: box.top + resolvedY,
    bottom: box.bottom + resolvedY,
  });
  const doneBox: Box = {
    left: 300,
    top: sheetBox.top + 10,
    right: 380,
    bottom: sheetBox.top + 50,
  };
  const inside = (box: Box, x: number, y: number) =>
    x >= box.left && x < box.right && y >= box.top && y < box.bottom;
  vi.spyOn(sheet, 'getBoundingClientRect').mockImplementation(() =>
    rect(moved(sheetBox)),
  );
  vi.spyOn(done, 'getBoundingClientRect').mockImplementation(() =>
    rect(moved(doneBox)),
  );
  const stack = (x: number, y: number): Element[] => [
    ...(inside(moved(doneBox), x, y) ? [done] : []),
    ...(inside(moved(sheetBox), x, y) ? [sheet] : []),
    scrim,
    document.body,
    document.documentElement,
  ];
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: stack,
  });
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: (x: number, y: number) => stack(x, y)[0],
  });
  for (const [name, element] of [
    ['scrim', scrim],
    ['done', done],
  ] as const) {
    element.addEventListener('click', () => clicks.push(name));
  }
  cleanups.push(
    registerPresentedOffset(sheet, {
      offset: () => ({x: 0, y: drawnY - resolvedY}),
      resolve: () => {
        resolvedY = drawnY;
      },
    }),
  );
}

// A phone: the host attaches only where the primary pointer is coarse.
let restorePointer: () => void;
beforeEach(() => {
  restorePointer = coarsePrimaryPointer();
});
afterEach(() => {
  restorePointer();
});

beforeEach(() => {
  clock = new ManualClock();
  cleanups = [];
  clicks = [];
});

afterEach(() => {
  for (const cleanup of cleanups) {
    cleanup();
  }
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementsFromPoint');
  Reflect.deleteProperty(document, 'elementFromPoint');
  document.body.innerHTML = '';
});

function host(presentedHitTesting: 'always' | 'never' = 'always') {
  const gestures = new GestureHost(document, {clock, presentedHitTesting});
  const scrimTap = new TapGestureRecognizer({name: 'scrim'});
  const sheetDrag = new PanGestureRecognizer({
    name: 'sheet',
    direction: 'down',
  });
  cleanups.push(
    gestures.attach(scrim, scrimTap),
    gestures.attach(sheet, sheetDrag),
  );
  return {gestures, scrimTap, sheetDrag};
}

describe('presented hit testing (iOS WebKit hit-tests compositor motion at layout)', () => {
  it('sends a finger on the drawn sheet to the sheet, and clicks the drawn button once', () => {
    // Presenting: the sheet started below the screen, where iOS still
    // hit-tests it, and is drawn 544 px higher.
    mount({left: 0, top: 844, right: 390, bottom: 1244}, -544);
    const {gestures, scrimTap, sheetDrag} = host();
    const onDone = {x: 340, y: 330};
    // The engine hit the scrim, under the drawn button at the sheet's start.
    touch('touchstart', scrim, onDone, 0);
    expect(sheetDrag.numberOfTouches).toBe(1);
    expect(scrimTap.numberOfTouches).toBe(0);
    const end = touch('touchend', scrim, onDone, 80);
    expect(end.defaultPrevented).toBe(true);
    expect(clicks).toEqual(['done']);
    // The engine's own click, however late, is swallowed by the shared
    // click guard: one activation.
    const late = () => {
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
      });
      scrim.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(late()).toBe(true);
    expect(clicks).toEqual(['done']);
    // One click only: the guard is spent.
    expect(late()).toBe(false);
  });

  it('sends a finger where the sheet is going, but not yet drawn, to what is drawn there', () => {
    // Dismissing: the sheet started on screen, where iOS still hit-tests it,
    // and is drawn 544 px lower.
    mount({left: 0, top: 300, right: 390, bottom: 700}, 544);
    const {scrimTap, sheetDrag} = host();
    const point = {x: 340, y: 330};
    // The engine hit the button where it started.
    touch('touchstart', done, point, 0);
    expect(scrimTap.numberOfTouches).toBe(1);
    expect(sheetDrag.numberOfTouches).toBe(0);
    touch('touchend', done, point, 80);
    expect(clicks).not.toContain('done');
  });

  it('gives press trackers the drawn box, before and after a touch resolves the sheet', () => {
    mount({left: 0, top: 844, right: 390, bottom: 1244}, -544);
    const {gestures} = host();
    const drawn = {left: 300, top: 310, right: 380, bottom: 350};
    expect(gestures.presentedRect(done)).toMatchObject(drawn);
    touch('touchstart', scrim, {x: 340, y: 330}, 0);
    expect(resolvedY).toBe(-544);
    expect(gestures.presentedRect(done)).toMatchObject(drawn);
    touch('touchend', scrim, {x: 340, y: 330}, 80);
    expect(
      new GestureHost(document, {presentedHitTesting: 'never'}).presentedRect(
        done,
      ),
    ).toMatchObject({top: 310, bottom: 350});
  });

  it("keeps a blocking touchmove on the document only while an element a claiming recognizer lives in is moving: Safari honours one only when registered before the touch, on the engine's own target (spec:AST-094 FR19)", () => {
    document.body.innerHTML =
      '<div id="moving"><div id="body"></div></div><div id="still"></div>';
    const moving = document.getElementById('moving') as HTMLElement;
    const body = document.getElementById('body') as HTMLElement;
    const still = document.getElementById('still') as HTMLElement;
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const blocking = (calls: unknown[][]) =>
      calls.filter(
        ([type, , options]) =>
          type === 'touchmove' &&
          typeof options === 'object' &&
          options != null &&
          (options as AddEventListenerOptions).passive === false,
      ).length;
    const gestures = new GestureHost(document, {
      clock,
      presentedHitTesting: 'always',
    });
    cleanups.push(
      gestures.attach(body, new PanGestureRecognizer({direction: 'down'})),
      gestures.attach(still, new TapGestureRecognizer()),
    );
    expect(blocking(add.mock.calls)).toBe(0);
    // A tap target moving claims nothing while the finger moves: no listener.
    const stopStill = registerPresentedOffset(still, {
      offset: () => ({x: 0, y: 30}),
      resolve: () => {},
    });
    expect(blocking(add.mock.calls)).toBe(0);
    stopStill();
    // The sheet the pan lives in moves: the document blocks until it stops.
    const stop = registerPresentedOffset(moving, {
      offset: () => ({x: 0, y: 40}),
      resolve: () => {},
    });
    expect(blocking(add.mock.calls)).toBe(1);
    stop();
    expect(
      remove.mock.calls.filter(([type]) => type === 'touchmove').length,
    ).toBeGreaterThan(0);
    expect(blocking(add.mock.calls)).toBe(1);
  });

  it('changes nothing with the gate off or nothing moving', () => {
    mount({left: 0, top: 844, right: 390, bottom: 1244}, -544);
    const off = host('never');
    touch('touchstart', scrim, {x: 340, y: 330}, 0);
    expect(off.scrimTap.numberOfTouches).toBe(1);
    expect(off.sheetDrag.numberOfTouches).toBe(0);
    expect(resolvedY).toBe(0);
    touch('touchend', scrim, {x: 340, y: 330}, 80);
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
    const still = host('always');
    touch('touchstart', scrim, {x: 340, y: 330}, 200);
    expect(still.scrimTap.numberOfTouches).toBe(1);
    expect(still.sheetDrag.numberOfTouches).toBe(0);
    touch('touchend', scrim, {x: 340, y: 330}, 280);
  });
});
