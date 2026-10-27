// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextRequest.test.ts
 * @input attachContextRequest on elements of a document whose gesture host
 *   is driven by synthetic touch, pointer, contextmenu and key events
 * @output Tests for spec:AST-094 FR43's shared context request: one request
 *   per gesture from a long press, a right click, or Shift+F10 and the
 *   context-menu key, reporting which input made it; the hold loses to a
 *   claim already made; a hold-repeat control keeps its own; a right click or
 *   a ctrl-click starts no press
 * @position Unit tests of packages/core/src/gestures/contextRequest.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {attachContextRequest, type ContextRequest} from '../contextRequest';
import {GestureHost} from '../GestureHost';
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {PressTracker} from '../PressTracker';
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

  it('leaves a control that keeps its press for a hold-repeat its own long press, right click and Shift+F10', () => {
    const {row, stepper} = mount(
      '<div id="row">Row <button id="stepper">+</button></div>',
    );
    const seen = requests(row);
    detachers.push(
      host.attachConsumer(
        stepper,
        new PressTracker({getBounds: () => null, keepsTouch: true}),
      ),
    );
    touch('touchstart', stepper, {id: 1, x: 5, y: 5}, 0);
    host.arena.advanceTime(700);
    touch('touchend', stepper, {id: 1, x: 5, y: 5}, 800, true);
    const right = contextmenu(stepper, {x: 5, y: 5, pointerType: 'mouse'});
    expect(right.defaultPrevented).toBe(false);
    stepper.focus();
    key(stepper, {key: 'F10', shiftKey: true});
    expect(seen).toEqual([]);
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
