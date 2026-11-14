// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Open overlays, drawn for reading what they paint.
 *
 * A layer (a tooltip, a popover, a menu, a selector's list) renders on the
 * server as a marker alone and mounts once that marker's ref runs, so the
 * server markup holds none of them. Drawn again with React DOM in the small
 * document charts draw in (charts.mjs), with the few browser calls a layer
 * makes standing in, an overlay the page shows open mounts; a popup that a
 * press opens (a menu's button, a selector's field) or a typed letter opens
 * (a typeahead) is opened in turn, and each one's markup is kept.
 *
 * @position foundation/render — used by page-worker.mjs
 */

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
  const rect = {x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0};
  // A box where it sits: a layer opens only beside an anchor that has one.
  proto.getClientRects = function () {
    return [{...rect, right: 1, bottom: 1, width: 1, height: 1}];
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
    if (String(selector).includes(':popover-open')) return this.__astryxPopoverOpen === true;
    try {
      return matches.call(this, selector);
    } catch {
      // A selector this document cannot read (a pseudo-class of the browser's
      // own) matches nothing.
      return false;
    }
  };
  g.document.getAnimations = () => [];
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

/**
 * The markup of each overlay the drawn page shows open, then of each popup
 * its controls open: a press on each collapsed control that opens one, and a
 * typed letter in each combobox field that a press leaves closed. Each
 * overlay is kept once, as it was when it opened.
 * @param {any} host the element the page was drawn in
 * @param {(fn: () => void) => void} flushSync
 * @returns {Promise<string[]>}
 */
export async function openLayerMarkup(host, flushSync) {
  const g = /** @type {any} */ (globalThis);
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  const keep = () => {
    for (const layer of g.document.querySelectorAll('[data-astryx-layer-root]')) {
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
  const controls = [...host.querySelectorAll('[aria-haspopup][aria-expanded="false"], [role="combobox"][aria-expanded="false"]')];
  for (const control of controls) {
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
      send(control, type, {button: 0, pointerType: 'mouse', detail: 1});
    if (control.getAttribute('aria-expanded') !== 'true' && control.tagName === 'INPUT') {
      control.value = 'a';
      send(control, 'input');
    }
    await tick();
    keep();
  }
  return out;
}
