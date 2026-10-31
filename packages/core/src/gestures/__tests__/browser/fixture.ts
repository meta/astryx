// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file fixture.ts
 * @input Nothing: bundled by esbuild and injected into a blank page
 * @output A page of gesture hosts (a horizontal pan inside a scroller, a tap
 *   target, a long press, a pinch, a sheet body that hands its scroll to a
 *   pan, a passive control: a press consumer under `pan-y` with no
 *   recognizer, pans and a long press under narrower author `touch-action`
 *   values, and leading screen-edge pans on an edge-zone strip and on a wider
 *   element, left to right and right to left) that records every recognizer
 *   transition, every consumer event and every click on `window.__gestures`
 * @position Browser fixture of gestures.interaction.browser.spec.ts;
 *   test-only
 */

import {getGestureHost} from '../../GestureHost';
import type {GestureRecognizer} from '../../GestureRecognizer';
import {LongPressGestureRecognizer} from '../../LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../../PanGestureRecognizer';
import {PinchGestureRecognizer} from '../../PinchGestureRecognizer';
import {ScreenEdgePanGestureRecognizer} from '../../ScreenEdgePanGestureRecognizer';
import {TapGestureRecognizer} from '../../TapGestureRecognizer';

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
    /** The page-level (document and window) listeners now added, by type. */
    __pageListeners: Map<string, number>;
    /** The page-level listener types the attachments below added. */
    __attachListeners: string[];
  }
}

window.__gestures = [];

// Every touch listener added to an element with an id, as the engine sees
// it: which elements make a scroll wait for the page.
window.__listeners = [];
// And every listener on the document or the window, added and removed: what
// gesture work costs the page between presses (spec:AST-094 FR24).
window.__pageListeners = new Map();
const isPage = (target: EventTarget) =>
  target === document || target === window;
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
  if (isPage(this) && listener != null) {
    window.__pageListeners.set(
      type,
      (window.__pageListeners.get(type) ?? 0) + 1,
    );
  }
  addListener.call(this, type, listener, options);
};
const removeListener = EventTarget.prototype.removeEventListener;
EventTarget.prototype.removeEventListener = function (
  this: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject | null,
  options?: boolean | EventListenerOptions,
) {
  if (isPage(this) && listener != null) {
    window.__pageListeners.set(
      type,
      (window.__pageListeners.get(type) ?? 0) - 1,
    );
  }
  removeListener.call(this, type, listener, options);
};

document.body.style.margin = '0';
document.body.innerHTML = `
  <div id="page" style="font: 14px sans-serif">
    <div id="scroller" style="height: 240px; overflow-y: auto; overscroll-behavior: contain; background: #eef">
      <div style="height: 40px">scroller</div>
      <div id="hpan" style="height: 140px; background: #ccd">
        <button id="hbutton" style="width: 200px; height: 80px; margin: 30px">button</button>
      </div>
      <div id="scrollRow" style="height: 60px; background: #ece; touch-action: none">row (a press in the scroller)</div>
      <div style="height: 1200px">content</div>
    </div>
    <div id="tapper" style="height: 60px; background: #efe">tap</div>
    <div id="presser" style="height: 60px; background: #fee">press</div>
    <div id="pinchable" style="height: 160px; background: #ffe">pinch</div>
    <div id="sheetBody" style="height: 240px; overflow-y: auto; overscroll-behavior: contain; background: #eee">
      <div style="height: 1200px">sheet content</div>
    </div>
    <div id="passive" style="height: 60px; background: #dfd; touch-action: pan-y pinch-zoom">passive control</div>
    <div id="card" style="height: 80px; background: #def">card (swipe up)</div>
    <style>
      .author-none { touch-action: none; }
      .author-pan-y { touch-action: pan-y; }
      .author-pinch-zoom { touch-action: pinch-zoom; }
      .author-pan-xy { touch-action: pan-x pan-y; }
    </style>
    <div id="authorNone" class="author-none" style="height: 60px; background: #fdd">author none</div>
    <div id="authorPanY" class="author-pan-y" style="height: 60px; background: #dfd">author pan-y</div>
    <div id="authorPinchZoom" class="author-pinch-zoom" style="height: 60px; background: #ffd">author pinch-zoom</div>
    <div id="authorPanXY" class="author-pan-xy" style="height: 60px; background: #ddf">author pan-x pan-y</div>
    <div id="inlinePanXY" style="height: 60px; background: #fdf; touch-action: pan-x pan-y">inline pan-x pan-y</div>
    <div id="edgeZone" style="width: 40px; height: 120px; background: #fcf">edge</div>
    <div id="edgeWide" style="width: 200px; height: 120px; overflow-x: auto; background: #cff">
      <div style="width: 800px; height: 100px">wider than the band</div>
    </div>
    <div dir="rtl">
      <div id="edgeZoneRtl" style="width: 40px; height: 120px; background: #fcf">edge</div>
      <div id="edgeWideRtl" style="width: 200px; height: 120px; overflow-x: auto; background: #cff">
        <div style="width: 800px; height: 100px">wider than the band</div>
      </div>
    </div>
    <div style="height: 1600px">page</div>
    <div id="passiveEnd" style="height: 60px; background: #dfd; touch-action: pan-y pinch-zoom">passive control at the page's end</div>
  </div>`;

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found == null) {
    throw new Error(`missing #${id}`);
  }
  return found;
}

const beforeAttach = new Map(window.__pageListeners);
const host = getGestureHost(document);

function record(recognizer: GestureRecognizer, extra: () => Partial<Entry>) {
  recognizer.addTransitionListener((current, _from, to) => {
    window.__gestures.push({
      name: current.name,
      state: to,
      time: current.arena?.now() ?? performance.now(),
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
});
record(sheet, () => ({y: sheet.translation().y}));
host.attach(element('sheetBody'), sheet);

// A one-way pan over the scrollable page, as a toast's upward swipe is: it
// claims its touch as it begins, at UIKit's 10 pt (spec:AST-094 FR19).
const card = new PanGestureRecognizer({name: 'card', direction: 'up'});
record(card, () => ({x: card.translation().x, y: card.translation().y}));
host.attach(element('card'), card);

// Narrower author touch-action (spec:AST-094 FR18, DEC-8): the host's value
// is the derived one intersected with the author's, never wider.
const authorNone = new LongPressGestureRecognizer({name: 'authorNone'});
record(authorNone, () => ({}));
host.attach(element('authorNone'), authorNone);
for (const id of [
  'authorPanY',
  'authorPinchZoom',
  'authorPanXY',
  'inlinePanXY',
]) {
  const pan = new PanGestureRecognizer({name: id, direction: 'horizontal'});
  record(pan, () => ({x: pan.translation().x}));
  host.attach(element(id), pan);
}

// Leading screen-edge pans (FR18, DEC-13): on an edge-zone strip within the
// 40.2 px band and on an element reaching beyond it, left to right and, with
// the leading edge on the right, right to left.
for (const id of ['edgeZone', 'edgeWide', 'edgeZoneRtl', 'edgeWideRtl']) {
  const edge = new ScreenEdgePanGestureRecognizer({
    name: id,
    edges: ['leading'],
  });
  record(edge, () => ({x: edge.translation().x}));
  host.attach(element(id), edge);
}

// A control with no recognizer of its own (no blocking listener): only a
// press consumer, under pan-y, as a passive switch is.
const passiveEvent = (state: string) =>
  window.__gestures.push({name: 'passive', state, time: performance.now()});
host.attachConsumer(element('passive'), {
  touchBegan: () => passiveEvent('began'),
  touchMoved: () => passiveEvent('moved'),
  touchEnded: () => passiveEvent('ended'),
  touchCancelled: () => passiveEvent('cancelled'),
});

// The same control at the very end of the page, where a page scrolled to its
// end has no room to scroll on: what ends its press is the signal FR20
// counts there.
const passiveEndEvent = (state: string) =>
  window.__gestures.push({name: 'passiveEnd', state, time: performance.now()});
host.attachConsumer(element('passiveEnd'), {
  touchBegan: () => passiveEndEvent('began'),
  touchMoved: () => passiveEndEvent('moved'),
  touchEnded: () => passiveEndEvent('ended'),
  touchCancelled: () => passiveEndEvent('cancelled'),
});
// Which browser signal arrives, in order with the presses it ends: on the
// window, whose capture listeners run before the host's on the document.
addListener.call(
  window,
  'pointercancel',
  event => {
    if ((event as PointerEvent).pointerType === 'touch') {
      window.__gestures.push({
        name: 'dom:pointercancel',
        state: 'dom',
        time: performance.now(),
      });
    }
  },
  true,
);

// The fixture's own loggers go around the count of page listeners.
// A press consumer inside the scroller, as a list row is: a scroll of the
// scroller takes its press only once the finger has moved the take distance
// (FR20). `touch-action: none` keeps the browser's own pan out of it, so the
// only scroll is the one the test makes.
const rowEvent = (state: string) =>
  window.__gestures.push({name: 'scrollRow', state, time: performance.now()});
host.attachConsumer(element('scrollRow'), {
  touchBegan: () => rowEvent('began'),
  touchMoved: () => rowEvent('moved'),
  touchEnded: () => rowEvent('ended'),
  touchCancelled: () => rowEvent('cancelled'),
});

for (const type of ['click', 'mousedown']) {
  addListener.call(
    document,
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

window.__attachListeners = [...window.__pageListeners]
  .filter(([type, count]) => count > (beforeAttach.get(type) ?? 0))
  .map(([type]) => type)
  .sort();
