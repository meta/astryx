// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextRequest.test.ts
 * @input attachContextRequest on elements of a document, with synthetic
 *   touch, pointer, contextmenu and key events driving its gesture host
 * @output Tests for the shared context request. One request comes per
 *   gesture, from a long press, a right click, or Shift+F10 and the
 *   context-menu key, naming its input. The hold loses to a claim already
 *   made, a hold-repeat control keeps its own, and a right click or a
 *   ctrl-click starts no press. Nested requests in two copies of Core
 *   answer once.
 * @position Unit tests of packages/core/src/gestures/contextRequest.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {attachContextRequest, type ContextRequest} from '../contextRequest';
import {GestureHost} from '../GestureHost';
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {createPressTracker} from '../PressTracker';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {ManualClock, RecordingConsumer} from './harness';

let clock: ManualClock;
let host: GestureHost;
let detachers: (() => void)[];
let coarse = true;

function touch(
  type: string,
  target: EventTarget,
  contact: {id: number; x: number; y: number},
  time: number,
  isLift = false,
): Event {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const entry = {
    identifier: contact.id,
    clientX: contact.x,
    clientY: contact.y,
    target,
  };
  Object.defineProperty(event, 'changedTouches', {value: [entry]});
  Object.defineProperty(event, 'touches', {value: isLift ? [] : [entry]});
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
  return event;
}

function pointer(
  type: string,
  target: EventTarget,
  init: {
    pointerType: string;
    x: number;
    y: number;
    button?: number;
    buttons?: number;
    ctrlKey?: boolean;
    time: number;
  },
): Event {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 1,
    pointerType: init.pointerType,
    clientX: init.x,
    clientY: init.y,
    button: init.button ?? 0,
    buttons: init.buttons ?? 0,
    ctrlKey: init.ctrlKey ?? false,
  });
  Object.defineProperty(event, 'timeStamp', {value: init.time});
  target.dispatchEvent(event);
  return event;
}

/** A context menu event as the browser fires it: from a button, or a key. */
function contextmenu(
  target: EventTarget,
  init: {x: number; y: number; pointerType?: string; button?: number},
): MouseEvent {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: init.x,
    clientY: init.y,
    button: init.button ?? 2,
  });
  if (init.pointerType != null) {
    Object.defineProperty(event, 'pointerType', {value: init.pointerType});
  }
  target.dispatchEvent(event);
  return event;
}

function key(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function mount(html: string): Record<string, HTMLElement> {
  document.body.innerHTML = html;
  const elements: Record<string, HTMLElement> = {};
  for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
    elements[element.id] = element;
  }
  return elements;
}

function requests(element: Element, options = {}) {
  const seen: ContextRequest[] = [];
  detachers.push(
    attachContextRequest(
      element,
      {onRequest: request => seen.push(request), ...options},
      host,
    ),
  );
  return seen;
}

beforeEach(() => {
  clock = new ManualClock();
  coarse = true;
  host = new GestureHost(document, {
    clock,
    isPrimaryPointerCoarse: () => coarse,
  });
  detachers = [];
});

afterEach(() => {
  for (const detach of detachers.splice(0)) {
    detach();
  }
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('attachContextRequest (spec:AST-094 FR43)', () => {
  it('makes one request from a right click, at the pointer, and keeps the browser menu off', () => {
    coarse = false;
    const {row} = mount('<div id="row" tabindex="0">Row</div>');
    const seen = requests(row);
    const event = contextmenu(row, {x: 30, y: 12, pointerType: 'mouse'});
    expect(event.defaultPrevented).toBe(true);
    expect(seen).toEqual([
      expect.objectContaining({
        kind: 'pointer',
        pointerType: 'mouse',
        point: {x: 30, y: 12},
      }),
    ]);
  });

  it('makes one request from Shift+F10 and from the context-menu key, with no point, and none from the context menu event the key also fires', () => {
    const {row} = mount('<div id="row" tabindex="0">Row</div>');
    const seen = requests(row);
    row.focus();
    const shiftF10 = key(row, {key: 'F10', shiftKey: true});
    expect(shiftF10.defaultPrevented).toBe(true);
    const follower = contextmenu(row, {x: 0, y: 0, button: 0});
    expect(follower.defaultPrevented).toBe(true);
    clock.time = 2000;
    key(row, {key: 'ContextMenu'});
    expect(seen.map(request => [request.kind, request.point])).toEqual([
      ['keyboard', null],
      ['keyboard', null],
    ]);
  });

  it("makes one request from a held Shift+F10: its repeats make none, and the key's late menu event is still its echo", () => {
    const {card, row} = mount(
      '<div id="card">Card <div id="row" tabindex="0">Row</div></div>',
    );
    const outer = requests(card);
    const seen = requests(row);
    row.focus();
    key(row, {key: 'F10', shiftKey: true});
    // The key auto-repeats past the echo window.
    for (let time = 100; time <= 1200; time += 100) {
      clock.time = time;
      const repeat = key(row, {key: 'F10', shiftKey: true, repeat: true});
      expect(repeat.defaultPrevented).toBe(true);
    }
    const follower = contextmenu(row, {x: 0, y: 0, button: 0});
    expect(follower.defaultPrevented).toBe(true);
    expect({inner: seen.map(request => request.kind), outer}).toEqual({
      inner: ['keyboard'],
      outer: [],
    });
  });

  it('reports a hold that requests: committed as it requests, then ended at its lift', () => {
    const {row} = mount('<div id="row">Row</div>');
    const log: string[] = [];
    requests(row, {
      onRequest: () => log.push('request'),
      onHold: (phase: string) => log.push(phase),
    });
    touch('touchstart', row, {id: 1, x: 20, y: 10}, 0);
    host.arena.advanceTime(600);
    expect(log).toEqual(['committed', 'request']);
    touch('touchend', row, {id: 1, x: 20, y: 10}, 700, true);
    expect(log).toEqual(['committed', 'request', 'ended']);
  });

  it('reports nothing of a hold whose request is disabled before it begins', () => {
    const {row} = mount('<div id="row">Row</div>');
    let isEnabled = true;
    const log: string[] = [];
    requests(row, {
      isEnabled: () => isEnabled,
      onRequest: () => log.push('request'),
      onHold: (phase: string) => log.push(phase),
    });
    touch('touchstart', row, {id: 1, x: 20, y: 10}, 0);
    // A menu turns disabled during the hold.
    isEnabled = false;
    host.arena.advanceTime(600);
    touch('touchend', row, {id: 1, x: 20, y: 10}, 700, true);
    expect(log).toEqual([]);
  });

  it('makes one request from a finger held still, at the hold, and none from the browser menu that hold also fires', () => {
    const {row} = mount('<div id="row">Row</div>');
    const seen = requests(row);
    touch('touchstart', row, {id: 1, x: 20, y: 10}, 0);
    // Android fires its own context menu during the hold.
    const native = contextmenu(row, {x: 20, y: 10, pointerType: 'touch'});
    expect(native.defaultPrevented).toBe(true);
    expect(seen).toEqual([]);
    host.arena.advanceTime(600);
    expect(seen).toEqual([
      expect.objectContaining({
        kind: 'hold',
        pointerType: 'touch',
        point: {x: 20, y: 10},
      }),
    ]);
    touch('touchend', row, {id: 1, x: 20, y: 10}, 700, true);
    expect(seen).toHaveLength(1);
  });

  it('takes a pen held still too, and no mouse held still', () => {
    const {row} = mount('<div id="row">Row</div>');
    const seen = requests(row);
    pointer('pointerdown', row, {
      pointerType: 'pen',
      x: 20,
      y: 10,
      buttons: 1,
      time: 0,
    });
    host.arena.advanceTime(600);
    pointer('pointerup', row, {pointerType: 'pen', x: 20, y: 10, time: 700});
    expect(seen.map(request => [request.kind, request.pointerType])).toEqual([
      ['hold', 'pen'],
    ]);
    pointer('pointerdown', row, {
      pointerType: 'mouse',
      x: 20,
      y: 10,
      buttons: 1,
      time: 2000,
    });
    host.arena.advanceTime(2600);
    pointer('pointerup', row, {pointerType: 'mouse', x: 20, y: 10, time: 2700});
    expect(seen).toHaveLength(1);
  });

  it("makes one request from a pen held still, and none from the browser menu that pen's hold also fires, during it or at the lift", () => {
    const {row} = mount('<div id="row">Row</div>');
    const seen = requests(row);
    pointer('pointerdown', row, {
      pointerType: 'pen',
      x: 20,
      y: 10,
      buttons: 1,
      time: 0,
    });
    host.arena.advanceTime(600);
    const during = contextmenu(row, {x: 20, y: 10, pointerType: 'pen'});
    pointer('pointerup', row, {pointerType: 'pen', x: 20, y: 10, time: 700});
    // Windows fires a pen's press-and-hold menu at the lift.
    const atLift = contextmenu(row, {x: 20, y: 10, pointerType: 'pen'});
    expect(during.defaultPrevented).toBe(true);
    expect(atLift.defaultPrevented).toBe(true);
    expect(seen.map(request => [request.kind, request.pointerType])).toEqual([
      ['hold', 'pen'],
    ]);
  });

  it("makes a request from a pen's barrel right click right after a tap: only a hold's lift refuses that pen's menu", () => {
    const {row} = mount('<div id="row">Row</div>');
    const seen = requests(row);
    pointer('pointerdown', row, {
      pointerType: 'pen',
      x: 20,
      y: 10,
      buttons: 1,
      time: 0,
    });
    pointer('pointerup', row, {pointerType: 'pen', x: 20, y: 10, time: 100});
    host.arena.advanceTime(300);
    const right = contextmenu(row, {x: 20, y: 10, pointerType: 'pen'});
    expect(right.defaultPrevented).toBe(true);
    expect(seen.map(request => [request.kind, request.pointerType])).toEqual([
      ['pointer', 'pen'],
    ]);
  });

  it("makes a request from a pen's barrel right click right after a tap on a hold-repeat control: a kept tap is no hold", () => {
    const {row, stepper} = mount(
      '<div id="row">Row <button id="stepper">+</button></div>',
    );
    const seen = requests(row);
    detachers.push(
      host.attachConsumer(
        stepper,
        createPressTracker({getBounds: () => null, keepsTouch: true}),
      ),
    );
    pointer('pointerdown', stepper, {
      pointerType: 'pen',
      x: 5,
      y: 5,
      buttons: 1,
      time: 0,
    });
    pointer('pointerup', stepper, {pointerType: 'pen', x: 5, y: 5, time: 100});
    host.arena.advanceTime(300);
    const right = contextmenu(stepper, {x: 5, y: 5, pointerType: 'pen'});
    expect(right.defaultPrevented).toBe(true);
    expect(seen.map(request => [request.kind, request.pointerType])).toEqual([
      ['pointer', 'pen'],
    ]);
  });

  it("makes a request from a pen's barrel right click right after a drag past the long press's tolerance: a drag is no hold", () => {
    const {row} = mount('<div id="row">Row</div>');
    const seen = requests(row);
    pointer('pointerdown', row, {
      pointerType: 'pen',
      x: 20,
      y: 10,
      buttons: 1,
      time: 0,
    });
    pointer('pointermove', row, {
      pointerType: 'pen',
      x: 60,
      y: 10,
      buttons: 1,
      time: 100,
    });
    host.arena.advanceTime(600);
    pointer('pointerup', row, {pointerType: 'pen', x: 60, y: 10, time: 600});
    host.arena.advanceTime(800);
    const right = contextmenu(row, {x: 60, y: 10, pointerType: 'pen'});
    expect(right.defaultPrevented).toBe(true);
    expect(seen.map(request => [request.kind, request.pointerType])).toEqual([
      ['pointer', 'pen'],
    ]);
  });

  it("makes a request from a pen's barrel right click right after a tap on a double-tap target: a lifted pen is not down", () => {
    const {row, target} = mount(
      '<div id="row">Row <span id="target">x</span></div>',
    );
    const seen = requests(row);
    detachers.push(
      host.attach(
        target,
        new TapGestureRecognizer({name: 'double', numberOfTapsRequired: 2}),
      ),
    );
    pointer('pointerdown', target, {
      pointerType: 'pen',
      x: 5,
      y: 5,
      buttons: 1,
      time: 0,
    });
    pointer('pointerup', target, {pointerType: 'pen', x: 5, y: 5, time: 80});
    // The double tap still waits on the lifted pen.
    host.arena.advanceTime(150);
    const right = contextmenu(target, {x: 5, y: 5, pointerType: 'pen'});
    expect(right.defaultPrevented).toBe(true);
    expect(seen.map(request => [request.kind, request.pointerType])).toEqual([
      ['pointer', 'pen'],
    ]);
  });

  it('makes no request for a finger that lifts before the hold or travels past its tolerance', () => {
    const {row} = mount('<div id="row">Row</div>');
    const seen = requests(row);
    touch('touchstart', row, {id: 1, x: 20, y: 10}, 0);
    touch('touchend', row, {id: 1, x: 20, y: 10}, 200, true);
    touch('touchstart', row, {id: 2, x: 20, y: 10}, 1000);
    touch('touchmove', row, {id: 2, x: 20, y: 40}, 1100);
    host.arena.advanceTime(1700);
    expect(seen).toEqual([]);
  });

  it('loses the hold to a claim already made on the finger, refusing that hold the browser menu too; a right click there still requests', () => {
    const {row, handle} = mount(
      '<div id="row">Row <span id="handle">≡</span></div>',
    );
    const seen = requests(row);
    // A reorder handle's own hold claims the finger first.
    const reorder = new LongPressGestureRecognizer({
      name: 'reorder',
      minimumPressDuration: 150,
    });
    detachers.push(host.attach(handle, reorder));
    touch('touchstart', handle, {id: 1, x: 5, y: 5}, 0);
    host.arena.advanceTime(200);
    expect(reorder.state).toBe('began');
    host.arena.advanceTime(900);
    const native = contextmenu(handle, {x: 5, y: 5, pointerType: 'touch'});
    expect(native.defaultPrevented).toBe(true);
    touch('touchend', handle, {id: 1, x: 5, y: 5}, 1000, true);
    expect(seen).toEqual([]);
    coarse = false;
    host.update(handle);
    contextmenu(handle, {x: 5, y: 5, pointerType: 'mouse'});
    expect(seen.map(request => request.kind)).toEqual(['pointer']);
  });

  it("leaves a control that keeps its press for a hold-repeat only its hold: its right click and Shift+F10 reach the row's context request", () => {
    const {row, stepper} = mount(
      '<div id="row">Row <button id="stepper">+</button></div>',
    );
    const seen = requests(row);
    detachers.push(
      host.attachConsumer(
        stepper,
        createPressTracker({getBounds: () => null, keepsTouch: true}),
      ),
    );
    touch('touchstart', stepper, {id: 1, x: 5, y: 5}, 0);
    host.arena.advanceTime(700);
    touch('touchend', stepper, {id: 1, x: 5, y: 5}, 800, true);
    // The hold is the stepper's repeat: no request.
    expect(seen).toEqual([]);
    const right = contextmenu(stepper, {x: 5, y: 5, pointerType: 'mouse'});
    expect(right.defaultPrevented).toBe(true);
    host.arena.advanceTime(2000);
    stepper.focus();
    key(stepper, {key: 'F10', shiftKey: true});
    expect(seen.map(request => request.kind)).toEqual(['pointer', 'keyboard']);
  });

  it("refuses a pen's own menu during and right after a hold another participant keeps: a pen held on a stepper, or on a handle whose own hold claims first", () => {
    const {row, stepper, handle} = mount(
      '<div id="row">Row <button id="stepper">+</button><span id="handle">≡</span></div>',
    );
    const seen = requests(row);
    detachers.push(
      host.attachConsumer(
        stepper,
        createPressTracker({getBounds: () => null, keepsTouch: true}),
      ),
    );
    // A reorder handle's own hold claims the pen first.
    const reorder = new LongPressGestureRecognizer({
      name: 'reorder',
      minimumPressDuration: 150,
    });
    detachers.push(host.attach(handle, reorder));
    let time = 0;
    for (const target of [stepper, handle]) {
      pointer('pointerdown', target, {
        pointerType: 'pen',
        x: 5,
        y: 5,
        buttons: 1,
        time,
      });
      host.arena.advanceTime(700);
      time += 700;
      const during = contextmenu(target, {x: 5, y: 5, pointerType: 'pen'});
      pointer('pointerup', target, {pointerType: 'pen', x: 5, y: 5, time});
      // Windows fires a pen's press-and-hold menu at the lift.
      const atLift = contextmenu(target, {x: 5, y: 5, pointerType: 'pen'});
      expect(during.defaultPrevented).toBe(true);
      expect(atLift.defaultPrevented).toBe(true);
      host.arena.advanceTime(2000);
      time += 2000;
    }
    expect(seen.map(request => [request.kind, request.pointerType])).toEqual(
      [],
    );
  });

  it('answers a right click or Shift+F10 inside nested requests once, at the innermost, as a hold resolves to one', () => {
    const {card, row} = mount(
      '<div id="card">Card <div id="row" tabindex="0">Row</div></div>',
    );
    const outer = requests(card);
    const inner = requests(row);
    contextmenu(row, {x: 5, y: 5, pointerType: 'mouse'});
    host.arena.advanceTime(1000);
    row.focus();
    key(row, {key: 'F10', shiftKey: true});
    expect(inner.map(request => request.kind)).toEqual(['pointer', 'keyboard']);
    expect(outer).toEqual([]);
    // On the card itself, the card answers.
    host.arena.advanceTime(1000);
    contextmenu(card, {x: 1, y: 1, pointerType: 'mouse'});
    expect(outer.map(request => request.kind)).toEqual(['pointer']);
  });

  it('answers a right click inside nested requests from two copies of Core once, at the innermost', async () => {
    vi.resetModules();
    const copy = await import('../contextRequest');
    expect(copy.attachContextRequest).not.toBe(attachContextRequest);
    const {card, row} = mount(
      '<div id="card">Card <div id="row">Row</div></div>',
    );
    const outer: ContextRequest[] = [];
    detachers.push(
      copy.attachContextRequest(
        card,
        {onRequest: request => outer.push(request)},
        host,
      ),
    );
    const inner = requests(row);
    contextmenu(row, {x: 5, y: 5, pointerType: 'mouse'});
    expect(inner.map(request => request.kind)).toEqual(['pointer']);
    expect(outer).toEqual([]);
  });

  it("refuses a menu event as a finger's only for a finger down inside its element: a right click while a finger rests on another gesture still requests", () => {
    const {row, other} = mount(
      '<div id="row">Row</div><div id="other">Other</div>',
    );
    const seen = requests(row);
    detachers.push(
      host.attach(other, new LongPressGestureRecognizer({name: 'elsewhere'})),
    );
    touch('touchstart', other, {id: 1, x: 5, y: 40}, 0);
    host.arena.advanceTime(100);
    const right = contextmenu(row, {x: 5, y: 5, pointerType: 'mouse'});
    expect(right.defaultPrevented).toBe(true);
    expect(seen.map(request => [request.kind, request.pointerType])).toEqual([
      ['pointer', 'mouse'],
    ]);
    touch('touchend', other, {id: 1, x: 5, y: 40}, 200, true);
  });

  it('starts no press for a right click or a ctrl-click on macOS', () => {
    coarse = false;
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const {row} = mount('<div id="row">Row</div>');
    const consumer = new RecordingConsumer();
    detachers.push(host.attachConsumer(row, consumer));
    requests(row);
    pointer('pointerdown', row, {
      pointerType: 'mouse',
      x: 5,
      y: 5,
      button: 2,
      buttons: 2,
      time: 0,
    });
    pointer('pointerup', row, {
      pointerType: 'mouse',
      x: 5,
      y: 5,
      button: 2,
      time: 80,
    });
    pointer('pointerdown', row, {
      pointerType: 'mouse',
      x: 5,
      y: 5,
      buttons: 1,
      ctrlKey: true,
      time: 500,
    });
    pointer('pointerup', row, {
      pointerType: 'mouse',
      x: 5,
      y: 5,
      ctrlKey: true,
      time: 580,
    });
    expect(consumer.events).toEqual([]);
  });

  it('listens on its own element only while enabled, and stops at detach', () => {
    coarse = false;
    const {row} = mount('<div id="row" tabindex="0">Row</div>');
    const added = vi.spyOn(row, 'addEventListener');
    const removed = vi.spyOn(row, 'removeEventListener');
    const viewAdded = vi.spyOn(window, 'addEventListener');
    const docAdded = vi.spyOn(document, 'addEventListener');
    let isEnabled = false;
    const seen: ContextRequest[] = [];
    const detach = attachContextRequest(
      row,
      {onRequest: request => seen.push(request), isEnabled: () => isEnabled},
      host,
    );
    expect(added).not.toHaveBeenCalled();
    contextmenu(row, {x: 5, y: 5, pointerType: 'mouse'});
    expect(seen).toEqual([]);
    detach();
    isEnabled = true;
    const detach2 = attachContextRequest(
      row,
      {onRequest: request => seen.push(request), isEnabled: () => isEnabled},
      host,
    );
    // The hold's press listener and its blocking touchmove, which FR24
    // counts outside the one-listener budget (FR19), beside the menu's two.
    expect(added.mock.calls.map(call => call[0]).sort()).toEqual([
      'contextmenu',
      'keydown',
      'pointerdown',
      'touchmove',
    ]);
    expect(
      [...viewAdded.mock.calls, ...docAdded.mock.calls].map(call => call[0]),
    ).toEqual([]);
    detach2();
    expect(removed.mock.calls.map(call => call[0]).sort()).toEqual([
      'contextmenu',
      'keydown',
      'pointerdown',
      'touchmove',
    ]);
  });
});
