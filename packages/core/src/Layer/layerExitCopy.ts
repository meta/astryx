// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file layerExitCopy.ts
 * @input A layer's popover element as it closes, and Core's shared inert copy
 *   (motion/transientCopy.ts)
 * @output Exports `placeLayerExitCopy`, a static, inert copy of the layer in
 *   the top layer for a touch presentation's close to play on, and
 *   `LayerExitBox`
 * @position Layer runtime helper for a touch presentation that animates a
 *   popover out: the one exit copy a layer may have
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/layerExitCopy.test.ts
 * - /packages/core/src/Layer/__tests__/layerExitCopy.interaction.browser.spec.ts
 * - /docs/architecture/layer-runtime.md
 */

import {inertCopy, restoreScrollOffsets} from '../motion/transientCopy';

/** A box in viewport px. */
export interface LayerExitBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Properties a running animation may hold, which the copy takes from what
 * the layer presents.
 */
const PRESENTED_PROPERTIES = [
  'translate',
  'rotate',
  'scale',
  'transform',
  'transform-origin',
  'opacity',
] as const;

/** Inline properties the copy must not keep from the live layer. */
const LIVE_ONLY_PROPERTIES = [
  'position-anchor',
  'position-area',
  'position-try-fallbacks',
  'inset',
  'right',
  'bottom',
  'scale',
  'opacity',
  'transition',
] as const;

/**
 * Writes onto `copy` what `element` and its subtree present through running
 * animations: the copy starts as the layer looks, not as its inline styles
 * say.
 */
function commitPresented(element: HTMLElement, copy: HTMLElement): void {
  const view = element.ownerDocument.defaultView;
  if (view == null || typeof element.getAnimations !== 'function') {
    return;
  }
  const animated = new Set<Element>();
  for (const animation of element.getAnimations({subtree: true})) {
    const effect = animation.effect as KeyframeEffect | null;
    if (effect?.target != null && effect.pseudoElement == null) {
      animated.add(effect.target);
    }
  }
  if (animated.size === 0) {
    return;
  }
  const sources = [element, ...element.querySelectorAll('*')];
  const copies = [copy, ...copy.querySelectorAll('*')];
  sources.forEach((source, index) => {
    const target = copies[index];
    if (!animated.has(source) || !(target instanceof view.Element)) {
      return;
    }
    const computed = view.getComputedStyle(source);
    const {style} = target as HTMLElement;
    for (const property of PRESENTED_PROPERTIES) {
      style.setProperty(property, computed.getPropertyValue(property));
    }
  });
}

/** The properties that move a box without moving its layout. */
const TRANSFORM_PROPERTIES = [
  'transform',
  'translate',
  'scale',
  'rotate',
] as const;

/** The elements a `<form>` can own; `form=""` matches no form's id. */
const FORM_CONTROLS =
  'button, fieldset, input, object, output, select, textarea';

/** Each layer's copy: placing another for the same layer replaces it. */
const copies = new WeakMap<HTMLElement, HTMLElement>();

/** A length in px, or 0. */
const px = (value: string): number => parseFloat(value) || 0;

/**
 * Where `element` is laid out, in viewport px. It is the box without the
 * transform a presentation in progress draws it with; the copy carries that
 * transform itself. A popover's layer is fixed in the top layer, so its
 * offset box is in viewport px.
 */
function layoutBox(element: HTMLElement, view: Window): LayerExitBox {
  const style = view.getComputedStyle(element);
  const isTransformed = TRANSFORM_PROPERTIES.some(property => {
    const value = style.getPropertyValue(property);
    return value !== '' && value !== 'none';
  });
  if (!isTransformed) {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }
  // The used width and height keep their fractions, where the offset size
  // rounds (a copy narrower by a fraction could wrap its text differently).
  const isBorderBox = style.getPropertyValue('box-sizing') === 'border-box';
  const width = px(style.getPropertyValue('width'));
  const height = px(style.getPropertyValue('height'));
  return {
    left: element.offsetLeft,
    top: element.offsetTop,
    width:
      width === 0
        ? element.offsetWidth
        : isBorderBox
          ? width
          : width +
            px(style.getPropertyValue('padding-left')) +
            px(style.getPropertyValue('padding-right')) +
            px(style.getPropertyValue('border-left-width')) +
            px(style.getPropertyValue('border-right-width')),
    height:
      height === 0
        ? element.offsetHeight
        : isBorderBox
          ? height
          : height +
            px(style.getPropertyValue('padding-top')) +
            px(style.getPropertyValue('padding-bottom')) +
            px(style.getPropertyValue('border-top-width')) +
            px(style.getPropertyValue('border-bottom-width')),
  };
}

/**
 * Copies `element` into a static box where it is drawn, marked with
 * `attribute`. It inserts the copy right after the element and shows it in
 * the top layer. Returns null where there is no top layer to show it in (no
 * popover API): the close is then immediate.
 *
 * The browser hides a popover the moment it closes (a pick, Escape, its own
 * light dismiss). A close that has to stay on screen plays on this copy,
 * taken as the popover closes. It has the same place, size, inherited theme
 * and look, values its running animations hold included. A clone keeps only
 * inline styles, and a compositor curve holds its value outside them. It is
 * laid out on the layer's own box and carries the transform the layer was
 * drawn with. So a copy taken mid-entrance holds where it was drawn. It
 * keeps the layer's overflow and every scroll position, the layer's own
 * included.
 *
 * It is Core's shared inert copy (`inertCopy`). It has no ids, test ids, form
 * names or label targets, and no form owner. A cloned checked radio then
 * cannot take the live group's selection, and a named field cannot submit.
 * It is `inert`, hidden from assistive technology, and out of pointer reach.
 * Its frames and media load nothing, and a canvas shows its pixels. Content
 * holding a canvas that reads back empty gets no copy: the close is then
 * immediate. Its descendants' keyframe animations do not start again. A
 * layer has one copy: placing another for the same layer takes the previous
 * one away.
 *
 * It is shown only in the top layer, as a manual popover, so a clipping,
 * transformed or sticky ancestor neither cuts nor moves it. A fixed box or a
 * larger `z-index` is no substitute. Where the browser refuses the show
 * during the closing popover's own toggle (Android Chromium 158), the copy
 * waits, hidden. It shows once the toggle is over: after the script that
 * closed the layer or, failing that, in the next frame before it paints. Its
 * owner animates it and removes it when its spring settles; nothing on the
 * main thread runs per frame while it moves.
 */
export function placeLayerExitCopy(
  element: HTMLElement,
  attribute: string,
): HTMLElement | null {
  const view = element.ownerDocument.defaultView;
  if (view == null || typeof element.showPopover !== 'function') {
    return null;
  }
  // One copy per layer: a close during a close replaces it.
  copies.get(element)?.remove();
  const box = layoutBox(element, view);
  const copy = inertCopy(element);
  if (copy == null) {
    // A canvas reads back empty: no copy, so the close is immediate.
    return null;
  }
  // The copy stands right after the layer, which renders inline by default.
  // Inside a `<form>`, the form would own the copy's controls while it
  // closes. A cloned empty `required` field would then make the form invalid
  // and block its submit. `form=""` matches no form's id, so each cloned
  // control has no owner wherever the copy stands.
  for (const node of copy.querySelectorAll(FORM_CONTROLS)) {
    node.setAttribute('form', '');
  }
  // A form-associated custom element joins a form as a native control does,
  // and `form=""` takes it out the same way.
  const registry = view.customElements;
  for (const node of copy.querySelectorAll('*')) {
    const definition = node.localName.includes('-')
      ? (registry?.get(node.localName) as
          {formAssociated?: boolean} | undefined)
      : undefined;
    if (definition?.formAssociated === true) {
      node.setAttribute('form', '');
    }
  }
  copy.setAttribute(attribute, '');
  copy.setAttribute('popover', 'manual');
  const {style} = copy;
  for (const property of LIVE_ONLY_PROPERTIES) {
    style.removeProperty(property);
  }
  commitPresented(element, copy);
  // On the layer's box: in the top layer the viewport is its containing
  // block. No alignment against an anchor or the viewport: a phone menu
  // centered on its trigger with `anchor-center` would otherwise shift. The
  // UA's popover inset would over-constrain the box, and win in RTL.
  style.setProperty('position', 'fixed');
  style.setProperty('margin', '0');
  style.setProperty('left', `${box.left}px`);
  style.setProperty('top', `${box.top}px`);
  style.setProperty('right', 'auto');
  style.setProperty('bottom', 'auto');
  style.setProperty('width', `${box.width}px`);
  style.setProperty('height', `${box.height}px`);
  style.setProperty('box-sizing', 'border-box');
  style.setProperty('justify-self', 'normal');
  style.setProperty('align-self', 'normal');
  style.setProperty('animation-name', 'none');
  // A descendant with keyframes would play them again in the copy, from the
  // start: it keeps the values they presented instead. Nothing is written
  // where no keyframes are set.
  const liveNodes = element.querySelectorAll('*');
  copy.querySelectorAll('*').forEach((node, index) => {
    const live = liveNodes[index];
    if (
      live == null ||
      !(node instanceof view.HTMLElement || node instanceof view.SVGElement)
    ) {
      return;
    }
    const name = view.getComputedStyle(live).getPropertyValue('animation-name');
    if (name !== '' && name !== 'none') {
      node.style.setProperty('animation-name', 'none');
    }
  });
  // The layer's own overflow, so a layer that scrolls its content keeps its
  // clip. A popover's user-agent style scrolls as well.
  const layerStyle = view.getComputedStyle(element);
  style.setProperty('overflow-x', layerStyle.getPropertyValue('overflow-x'));
  style.setProperty('overflow-y', layerStyle.getPropertyValue('overflow-y'));
  element.after(copy);
  copies.set(element, copy);
  const show = (): boolean => {
    try {
      copy.showPopover();
    } catch {
      return false;
    }
    // A hidden box keeps no scroll position, so scrolled content, the layer's
    // own included, goes back where it was once the copy is shown.
    restoreScrollOffsets(copy);
    return true;
  };
  const giveUp = () => {
    copy.remove();
    if (copies.get(element) === copy) {
      copies.delete(element);
    }
  };
  if (!show()) {
    // Refused during the closing popover's toggle: hidden until it is over.
    view.queueMicrotask(() => {
      if (!copy.isConnected || show()) {
        return;
      }
      view.requestAnimationFrame(() => {
        if (copy.isConnected && !show()) {
          giveUp();
        }
      });
    });
  }
  return copy;
}
