// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Open overlays, drawn for reading what they paint.
 *
 * A layer (a tooltip, a popover, a menu, a selector's list) renders on the
 * server as a marker alone and mounts once that marker's ref runs, so the
 * server markup holds none of them. Drawn again with React DOM in the small
 * document charts draw in (charts.mjs), with the few browser calls a layer
 * makes standing in, an overlay the page shows open mounts; a popup that a
 * press opens (a menu's button, a selector's field, a submenu's row), a
 * typed letter opens (a typeahead) or a right click opens (a context menu) is
 * opened in turn, and each one's markup is kept. The document answers as a
 * desktop window with a mouse does.
 *
 * A page can also ask for one part to be drawn open in its own place (the
 * theme sheet does, for its overlays section): it writes the marker
 * {@link layerPlaceholder} gives through the global the worker installs, and
 * the worker puts the part there, drawn, with each overlay it opened after it.
 *
 * @position foundation/render — used by page-worker.mjs and by pages the
 *   theme editor writes (_catalog.mjs)
 */

import {PICTURE_WINDOW} from './picture-window.mjs';
import {promisify} from 'node:util';
import {chartDocument} from './charts.mjs';

/**
 * Give this thread the document a layer mounts in: the chart document, with
 * the calls a layer makes as it opens and places itself (a box to anchor
 * to, the popover methods, its animations) standing in.
 * @returns {Promise<void>}
 */
export async function layerDocument() {
  await chartDocument();
  const g = /** @type {any} */ (globalThis);
  const proto = g.window.Element.prototype;
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
  };
  // A box where it sits: a layer opens only beside an anchor that has one.
  proto.getClientRects = function () {
    return [{...rect, right: 1, bottom: 1, width: 1, height: 1}];
  };
  // The box a layer opens at (a context menu opens at the pointer, measured
  // from it).
  proto.getBoundingClientRect ??= function () {
    return {...rect, right: 1, bottom: 1, width: 1, height: 1};
  };
  proto.showPopover = function () {
    this.__astryxPopoverOpen = true;
  };
  proto.hidePopover = function () {
    this.__astryxPopoverOpen = false;
  };
  proto.togglePopover = function () {
    this.__astryxPopoverOpen = !this.__astryxPopoverOpen;
  };
  proto.getAnimations = () => [];
  // A dialog shown open, as a browser marks one.
  const dialog = g.window.HTMLDialogElement?.prototype;
  if (dialog) {
    dialog.show ??= function () {
      this.setAttribute('open', '');
    };
    dialog.showModal ??= dialog.show;
    dialog.close ??= function () {
      this.removeAttribute('open');
    };
  }
  // The window a picture is taken in: a desktop's, with a fine pointer that
  // hovers. A part that asks about the pointer (a submenu flies out beside a
  // mouse and drills in under a finger) draws as it does there.
  g.window.matchMedia = g.matchMedia = (/** @type {string} */ query) => ({
    matches: desktopMatches(query),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  // A field a component focuses or selects in (a typeahead's text).
  for (const name of ['HTMLInputElement', 'HTMLTextAreaElement']) {
    const field = g.window[name]?.prototype;
    if (!field) continue;
    field.setSelectionRange ??= function () {};
    field.setRangeText ??= function () {};
    field.select ??= function () {};
  }
  proto.scrollIntoView = () => {};
  const matches = proto.matches;
  proto.matches = function (/** @type {string} */ selector) {
    if (String(selector).includes(':popover-open'))
      return this.__astryxPopoverOpen === true;
    try {
      return matches.call(this, selector);
    } catch {
      // A selector this document cannot read (a pseudo-class of the browser's
      // own) matches nothing.
      return false;
    }
  };
  g.document.getAnimations = () => [];
  // The DOM classes a component checks against by name (an `instanceof
  // Element` before it measures), as a browser gives them.
  for (const name of [
    'Node',
    'Element',
    'HTMLElement',
    'HTMLInputElement',
    'HTMLSelectElement',
    'HTMLTextAreaElement',
    'HTMLIFrameElement',
    'Event',
    'CustomEvent',
    'KeyboardEvent',
    'MouseEvent',
    'FocusEvent',
  ]) {
    if (g.window[name]) g[name] ??= g.window[name];
  }
  // A class a component checks against that this document never makes (a
  // shadow root): nothing in it is one.
  for (const name of ['ShadowRoot']) g[name] ??= g.window[name] ?? class {};
  for (const name of ['MutationObserver', 'IntersectionObserver']) {
    g[name] ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
    g.window[name] ??= g[name];
  }
}

/** The pointer of the window a picture is taken in. */
const DESKTOP_POINTER = Object.freeze({
  pointer: 'fine',
  'any-pointer': 'fine',
  hover: 'hover',
  'any-hover': 'hover',
});

/** CSS pixels in an em or a rem, at the browser's default font size. */
const EM_PX = 16;

/**
 * A length in a media query, in CSS pixels; NaN for one it cannot read.
 * @param {string} text
 * @returns {number}
 */
function mediaLength(text) {
  const m = /^\s*(-?[\d.]+)\s*(px|r?em)?\s*$/i.exec(text);
  if (!m) return NaN;
  return Number(m[1]) * (m[2] && /em/i.test(m[2]) ? EM_PX : 1);
}

/**
 * Whether one feature of a media query holds in the picture's window: its
 * width and height (with min- and max-, or a range), its orientation, and a
 * mouse for the pointer. Any other feature holds, as in the chart document
 * (no motion).
 * @param {string} feature what the parentheses hold
 * @returns {boolean}
 */
function featureHolds(feature) {
  const {width, height} = PICTURE_WINDOW;
  /** @type {Record<string, number>} */
  const size = {width, height};
  const plain = /^\s*([a-z-]+)\s*(?::\s*(.*?))?\s*$/i.exec(feature);
  if (plain) {
    const [, name, value] = plain;
    const pointer = /** @type {Record<string, string>} */ (DESKTOP_POINTER)[
      name
    ];
    if (pointer != null) return value == null || value.trim() === pointer;
    if (name === 'orientation')
      return (
        value == null ||
        value.trim() === (width >= height ? 'landscape' : 'portrait')
      );
    const dim = /^(min-|max-)?(width|height)$/.exec(name);
    if (!dim) return true;
    if (value == null) return true;
    const at = mediaLength(value);
    if (Number.isNaN(at)) return true;
    const own = size[dim[2]];
    return dim[1] === 'min-'
      ? own >= at
      : dim[1] === 'max-'
        ? own <= at
        : own === at;
  }
  // A range: `width < 640px`, `640px <= width`, `400px < width <= 700px`.
  const parts = feature.split(/(<=|>=|<|>|=)/).map(x => x.trim());
  const at = parts.findIndex(x => x === 'width' || x === 'height');
  if (at < 0) return true;
  const own = size[parts[at]];
  /** @param {number} a @param {string} op @param {number} b */
  const holds = (a, op, b) =>
    op === '<'
      ? a < b
      : op === '<='
        ? a <= b
        : op === '>'
          ? a > b
          : op === '>='
            ? a >= b
            : a === b;
  let ok = true;
  if (at >= 2) {
    const v = mediaLength(parts[at - 2]);
    if (!Number.isNaN(v)) ok &&= holds(v, parts[at - 1], own);
  }
  if (at + 2 < parts.length) {
    const v = mediaLength(parts[at + 2]);
    if (!Number.isNaN(v)) ok &&= holds(own, parts[at + 1], v);
  }
  return ok;
}

/**
 * Whether a media query matches in the window a picture is taken in
 * (PICTURE_WINDOW, a desktop's, with a mouse): each comma-separated query
 * matches when its media type is the screen's and every feature holds
 * (featureHolds); `not` turns it round.
 * @param {string} query
 * @returns {boolean}
 */
export function desktopMatches(query) {
  return String(query)
    .split(',')
    .some(part => {
      const type = /^\s*(?:not\s+|only\s+)?([a-z]+)\s*(?:and\b|$)/i.exec(
        part,
      )?.[1];
      const screen = type == null || !/^(print|speech)$/i.test(type);
      const all =
        screen &&
        [...part.matchAll(/\(([^()]*)\)/g)].every(([, feature]) =>
          featureHolds(feature),
        );
      return /^\s*not\s/.test(part) ? !all : all;
    });
}

/**
 * The markup of each overlay the drawn page shows open, then of each popup
 * its controls open: a press on each collapsed control that opens one, then
 * on each one an opened overlay holds (a submenu's row), and a typed letter
 * in each combobox field that a press leaves closed. A drawing that opened
 * nothing and holds a layer is right-clicked (a context menu). Each overlay
 * is kept once, as it was when it opened.
 * @param {any} host the element the page was drawn in
 * @param {(fn: () => void) => void} flushSync
 * @returns {Promise<string[]>}
 */
export async function openLayerMarkup(host, flushSync) {
  const g = /** @type {any} */ (globalThis);
  const tick = settled;
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  const keep = () => {
    for (const layer of g.document.querySelectorAll(
      '[data-astryx-layer-root]',
    )) {
      const html = layer.outerHTML;
      if (!seen.has(html)) {
        seen.add(html);
        out.push(html);
      }
    }
  };
  /** @param {any} target @param {string} type @param {Record<string, unknown>} [init] */
  const send = (target, type, init = {}) => {
    const event = new g.window.Event(type, {bubbles: true, cancelable: true});
    Object.assign(event, init);
    try {
      flushSync(() => target.dispatchEvent(event));
    } catch {
      // An event this document cannot carry through React leaves the control
      // as it was.
    }
  };
  await tick();
  keep();
  const CLOSED =
    '[aria-haspopup][aria-expanded="false"], [role="combobox"][aria-expanded="false"]';
  /** Each control pressed once. @type {Set<any>} */
  const pressed = new Set();
  // The part's own controls first, then each one an opened overlay holds (a
  // menu's submenu row), pressed while the overlay that holds it is open.
  /** @type {any[]} */
  const queue = [...host.querySelectorAll(CLOSED)];
  let nested = 0;
  while (queue.length) {
    const control = queue.shift();
    if (pressed.has(control) || !control.isConnected) continue;
    pressed.add(control);
    // A press outside an open auto popover closes it, as a browser's light
    // dismiss does: a part shows the popup its last control opened (a date
    // and time field's time list, not its calendar too).
    for (const layer of g.document.querySelectorAll(
      '[data-astryx-layer-root][popover="auto"]',
    ))
      if (layer.__astryxPopoverOpen === true && !layer.contains(control)) {
        layer.hidePopover();
        for (const type of ['beforetoggle', 'toggle'])
          send(layer, type, {oldState: 'open', newState: 'closed'});
      }
    // A press, up to the event that opens it: a control that opens on
    // pointer down would close again on the click that follows.
    for (const type of [
      'pointerdown',
      'mousedown',
      // A press focuses what it presses (a time field lists its times as it
      // takes focus).
      'focusin',
      'pointerup',
      'mouseup',
      'click',
    ]) {
      send(control, type, {button: 0, pointerType: 'mouse', detail: 1});
      if (control.getAttribute('aria-expanded') === 'true') break;
    }
    // A popup that shows itself once its layer mounts says so a task later.
    await tick();
    if (
      control.getAttribute('aria-expanded') !== 'true' &&
      control.tagName === 'INPUT'
    ) {
      // Typed as a person types: through the field's own value setter, so
      // React sees a value it did not set itself and calls the change
      // handler (a typeahead searches).
      Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(control),
        'value',
      )?.set?.call(control, 'a');
      send(control, 'input');
    }
    await tick();
    keep();
    if (control.getAttribute('aria-expanded') === 'true')
      for (const layer of g.document.querySelectorAll(
        '[data-astryx-layer-root]',
      ))
        if (layer.__astryxPopoverOpen === true) {
          const inside = [...layer.querySelectorAll(CLOSED)].filter(
            (/** @type {any} */ c) => !pressed.has(c),
          );
          nested += inside.length;
          if (nested <= MOST_NESTED) queue.unshift(...inside);
        }
  }
  // A part that opened nothing on a press and holds a layer (a context
  // menu's area) is right-clicked on its innermost first element, so the
  // event passes every element around it, as a person's right click does.
  let target = host.firstElementChild;
  while (target?.firstElementChild) target = target.firstElementChild;
  if (!out.length && target && host.querySelector('template')) {
    send(target, 'contextmenu', {button: 2, clientX: 1, clientY: 1});
    await tick();
    keep();
  }
  return out;
}

/**
 * Wait until React has run the tasks it queued. React finishes an update in
 * tasks of its own: a layer opens in one, then reads its anchor and renders
 * again in the next. A timer alone can fire before them on a busy machine,
 * and a read then holds a layer between two renders. So after a timer this
 * waits, one immediate at a time, until no immediate is left queued (React
 * queues its tasks so), which costs nothing on a settled page.
 * @returns {Promise<void>}
 */
export async function settled() {
  await new Promise(resolve => setTimeout(resolve, 0));
  for (let i = 0; i < SETTLE_TURNS && queued > 0; i++)
    await new Promise(resolve => nativeImmediate(resolve));
}

/** The most controls inside opened overlays one drawing presses, so menus nested deep stop there. */
const MOST_NESTED = 24;

/** The most turns a read waits for the queued immediates to run. */
const SETTLE_TURNS = 50;

/** The immediates queued in this thread and not yet run, a read's own left out. */
let queued = 0;
const nativeImmediate = globalThis.setImmediate;
const nativeClearImmediate = globalThis.clearImmediate;
const COUNTED = Symbol.for('astryx.render.counted-immediate');

/**
 * Count each immediate queued in this thread from now on, so a read knows
 * when React has no task left: call it before React loads, which keeps the
 * setImmediate it finds.
 */
export function countQueuedImmediates() {
  const g = /** @type {any} */ (globalThis);
  if (g.setImmediate[COUNTED]) return;
  /** @param {(...args: any[]) => void} fn @param {...any} args */
  const counted = (fn, ...args) => {
    queued++;
    let ran = false;
    const settle = () => {
      if (!ran) {
        ran = true;
        queued--;
      }
    };
    const handle = nativeImmediate(() => {
      settle();
      fn(...args);
    });
    /** @type {any} */ (handle)[COUNTED] = settle;
    return handle;
  };
  counted[COUNTED] = true;
  const custom = /** @type {any} */ (nativeImmediate)[promisify.custom];
  if (custom) /** @type {any} */ (counted)[promisify.custom] = custom;
  g.setImmediate = counted;
  g.clearImmediate = (/** @type {any} */ handle) => {
    handle?.[COUNTED]?.();
    return nativeClearImmediate(handle);
  };
}

/** The global the render worker installs for parts a page shows open in place. SYNC: page-worker.mjs assigns it by this name. */
export const LAYER_GLOBAL = '__astryxRenderLayer';

/** Where a part drawn open goes in the server markup. */
export const LAYER_PLACEHOLDER =
  /<astryx-layer data-layer="(\d+)"><\/astryx-layer>/g;

/**
 * The marker for the part at `index`, which the worker replaces with the
 * part drawn open in place (its overlays after it).
 * @param {number} index
 */
export function layerPlaceholder(index) {
  return `<astryx-layer data-layer="${index}"></astryx-layer>`;
}
