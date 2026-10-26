// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file fixture.ts
 * @input Nothing: bundled by esbuild and injected into a blank page
 * @output A page of gesture hosts (a horizontal pan inside a scroller, a tap
 *   target, a long press, a pinch, a sheet body that hands its scroll to a
 *   pan, a passive control: a press consumer under `pan-y` with no
 *   recognizer) that records every recognizer transition, every consumer
 *   event and every click on `window.__gestures`
 * @position Browser fixture of gestures.chromium.spec.ts; test-only
 */

import {getGestureHost} from '../../GestureHost';
import type {GestureRecognizer} from '../../GestureRecognizer';
import {LongPressGestureRecognizer} from '../../LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../../PanGestureRecognizer';
import {lockSelection} from '../../selectionLock';
import {PinchGestureRecognizer} from '../../PinchGestureRecognizer';
import {PressTracker} from '../../PressTracker';
import {TapGestureRecognizer} from '../../TapGestureRecognizer';
import {internals} from '../../recognizerInternals';

interface Entry {
  name: string;
  state: string;
  time: number;
  x?: number;
  y?: number;
  scale?: number;
  beganAt?: number | null;
  startedAt?: number;
}

interface ListenerEntry {
  id: string;
  type: string;
  passive: boolean | null;
}

declare global {
  interface Window {
    __gestures: Entry[];
    __listeners: ListenerEntry[];
    /** Every touch listener added to the document or the window, by type. */
    __pageTouchListeners: string[];
    /**
     * The same, as the page left them once loaded: the test driver adds its
     * own window listeners when it first runs a script.
     */
    __pageTouchListenersAtLoad: string[];
  }
}

window.__gestures = [];

// Every touch listener added to an element with an id, as the engine sees
// it: which elements make a scroll wait for the page.
window.__listeners = [];
window.__pageTouchListeners = [];
const addListener = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (
  this: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject | null,
  options?: boolean | AddEventListenerOptions,
) {
  if ((this === document || this === window) && type.startsWith('touch')) {
    window.__pageTouchListeners.push(type);
  }
  if (this instanceof Element && this.id !== '' && type.startsWith('touch')) {
    window.__listeners.push({
      id: this.id,
      type,
      passive: typeof options === 'object' ? (options.passive ?? null) : null,
    });
  }
  addListener.call(this, type, listener, options);
};

document.body.style.margin = '0';
document.body.innerHTML = `
  <div id="page" style="font: 14px sans-serif">
    <div id="scroller" style="height: 240px; overflow-y: auto; overscroll-behavior: contain; background: #eef">
      <div style="height: 40px">scroller</div>
      <div id="hpan" style="height: 140px; background: #ccd">
        <button id="hbutton" style="width: 200px; height: 80px; margin: 30px">button</button>
      </div>
      <div style="height: 1200px">content</div>
    </div>
    <div id="tapper" style="height: 60px; background: #efe">tap</div>
    <div id="presser" style="height: 60px; background: #fee">press</div>
    <div id="pinchable" style="height: 160px; background: #ffe">pinch</div>
    <div id="sheetBody" style="height: 240px; overflow-y: auto; overscroll-behavior: contain; background: #eee">
      <div style="height: 1200px">sheet content</div>
    </div>
    <div id="passive" style="height: 60px; background: #dfd; touch-action: pan-y pinch-zoom">passive control</div>
    <div id="slider" style="height: 60px; background: #fdf">slider: a pan that turns selection off</div>
    <div id="checkRow" style="height: 60px; background: #eef">checkbox row <input id="check" type="checkbox" style="width: 40px; height: 40px"></div>
    <div id="switchRow" style="height: 60px; background: #efe">switch: a drag that turns selection off <input id="switchInput" type="checkbox" style="width: 40px; height: 40px"></div>
    <div id="card" style="height: 80px; background: #def">card (swipe up)</div>
    <div id="onePan" style="height: 160px; background: #dde">one-finger pan</div>
    <div id="kept" style="height: 80px; background: #ede">kept press (a stepper's hold)</div>
    <div id="plainArea" style="height: 160px; background: #eed">plain area</div>
    <div id="feed" style="height: 240px; overflow-y: auto; overscroll-behavior: contain; background: #efe">
      <div id="feedRow" style="height: 80px; background: #cfc">feed row (tap)</div>
      <div style="height: 1200px">feed content</div>
    </div>
    <div style="height: 1600px">page</div>
  </div>`;

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found == null) {
    throw new Error(`missing #${id}`);
  }
  return found;
}

const host = getGestureHost(document);

function record(recognizer: GestureRecognizer, extra: () => Partial<Entry>) {
  recognizer.addTransitionListener((current, _from, to) => {
    window.__gestures.push({
      name: current.name,
      state: to,
      time: internals(current).arena?.now() ?? performance.now(),
      ...(to === 'possible' || to === 'failed' ? {} : extra()),
    });
  });
}

const hpan = new PanGestureRecognizer({name: 'hpan', direction: 'horizontal'});
record(hpan, () => ({x: hpan.translation().x, y: hpan.translation().y}));
host.attach(element('hpan'), hpan);

const tap = new TapGestureRecognizer({name: 'tap'});
record(tap, () => ({}));
host.attach(element('tapper'), tap);

// A row in a scroller: a scroll the page makes under a still finger keeps
// its tap; a drag that scrolls the feed takes it.
const feedTap = new TapGestureRecognizer({name: 'feedTap'});
record(feedTap, () => ({}));
host.attach(element('feedRow'), feedTap);

const press = new LongPressGestureRecognizer({name: 'press'});
record(press, () => ({
  beganAt: press.beganAt,
  startedAt: press.trackedTouches[0]?.startTime,
}));
host.attach(element('presser'), press);

const pinch = new PinchGestureRecognizer({name: 'pinch'});
const pinchPan = new PanGestureRecognizer({
  name: 'pinchPan',
  maximumNumberOfTouches: 2,
});
pinch.recognizeSimultaneouslyWith(pinchPan);
record(pinch, () => ({scale: pinch.scale}));
record(pinchPan, () => ({x: pinchPan.translation().x}));
host.attach(element('pinchable'), pinch);
host.attach(element('pinchable'), pinchPan);

const sheet = new PanGestureRecognizer({
  name: 'sheet',
  direction: 'down',
  scrollEdge: true,
});
record(sheet, () => ({y: sheet.translation().y}));
host.attach(element('sheetBody'), sheet);

// A one-way pan over the scrollable page, as a toast's upward swipe is: it
// claims its touch as it begins, at UIKit's 10 pt (spec:AST-094 FR19).
const card = new PanGestureRecognizer({name: 'card', direction: 'up'});
record(card, () => ({x: card.translation().x, y: card.translation().y}));
host.attach(element('card'), card);

// A control with no recognizer of its own (no blocking listener): only a
// press consumer, under pan-y, as a passive switch is.
const passiveEvent = (state: string) =>
  window.__gestures.push({name: 'passive', state, time: performance.now()});
host.attach(
  element('slider'),
  new PanGestureRecognizer({
    name: 'slider',
    direction: 'horizontal',
    selectionLock: lockSelection,
  }),
);

host.attach(
  element('switchRow'),
  new PanGestureRecognizer({
    name: 'switchRow',
    direction: 'horizontal',
    selectionLock: lockSelection,
  }),
);

host.attachConsumer(element('checkRow'), {
  touchBegan: () => {},
  touchMoved: () => {},
  touchEnded: () => {},
  touchCancelled: () => {},
});

host.attachConsumer(element('passive'), {
  touchBegan: () => passiveEvent('began'),
  touchMoved: () => passiveEvent('moved'),
  touchEnded: () => passiveEvent('ended'),
  touchCancelled: () => passiveEvent('cancelled'),
});

// A one-finger pan: a second finger before any claim fails it.
const onePan = new PanGestureRecognizer({
  name: 'onePan',
  maximumNumberOfTouches: 1,
});
record(onePan, () => ({
  x: onePan.translation().x,
  y: onePan.translation().y,
}));
host.attach(element('onePan'), onePan);

// A control that keeps its press through a drag, as a stepper's hold does.
const keptEvent = (state: string) =>
  window.__gestures.push({name: 'kept', state, time: performance.now()});
host.attachConsumer(
  element('kept'),
  new PressTracker({
    getBounds: () => element('kept').getBoundingClientRect(),
    keepsTouch: true,
    onControlEvent: event => keptEvent(event),
    onHighlightChange: isHighlighted =>
      keptEvent(isHighlighted ? 'highlight' : 'unhighlight'),
  }),
);

// A scroll lock's page hold, held on demand: every one-finger pan would
// scroll the page.
(window as unknown as {__holdPage: () => () => void}).__holdPage = () =>
  host.holdPageScroll(() => true);

for (const type of ['click', 'mousedown']) {
  document.addEventListener(
    type,
    event => {
      const target = event.target as HTMLElement | null;
      window.__gestures.push({
        name: `${type}:${target?.id ?? ''}`,
        state: 'dom',
        time: event.timeStamp,
      });
    },
    true,
  );
}

window.__pageTouchListenersAtLoad = [...window.__pageTouchListeners];
