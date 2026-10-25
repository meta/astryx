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
import {PinchGestureRecognizer} from '../../PinchGestureRecognizer';
import {TapGestureRecognizer} from '../../TapGestureRecognizer';
import {internals} from '../../recognizerInternals';

interface Entry {
  name: string;
  state: string;
  time: number;
  x?: number;
  y?: number;
  scale?: number;
  handoff?: boolean;
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
  }
}

window.__gestures = [];

// Every touch listener added to an element with an id, as the engine sees
// it: which elements make a scroll wait for the page.
window.__listeners = [];
const addListener = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (
  this: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject | null,
  options?: boolean | AddEventListenerOptions,
) {
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
    <div id="card" style="height: 80px; background: #def">card (swipe up)</div>
    <div id="cardLate" style="height: 80px; background: #fed">card, claims only when it begins</div>
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
  scrollHandoff: true,
});
record(sheet, () => ({
  y: sheet.translation().y,
  handoff: sheet.isHandoff,
}));
host.attach(element('sheetBody'), sheet);

// A one-way pan over the scrollable page, as a toast's upward swipe is: it
// claims its direction from 5 px, before WebKit's scroll at 10–11 px.
const card = new PanGestureRecognizer({name: 'card', direction: 'up'});
record(card, () => ({x: card.translation().x, y: card.translation().y}));
host.attach(element('card'), card);
// The same pan claiming only when it begins at 10 px, for comparison.
const cardLate = new PanGestureRecognizer({
  name: 'cardLate',
  direction: 'up',
  claimDistance: null,
});
record(cardLate, () => ({
  x: cardLate.translation().x,
  y: cardLate.translation().y,
}));
host.attach(element('cardLate'), cardLate);

// A control with no recognizer of its own (no blocking listener): only a
// press consumer, under pan-y, as a passive switch is.
const passiveEvent = (state: string) =>
  window.__gestures.push({name: 'passive', state, time: performance.now()});
host.attach(
  element('slider'),
  new PanGestureRecognizer({
    name: 'slider',
    direction: 'horizontal',
    preventsTextSelection: true,
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
