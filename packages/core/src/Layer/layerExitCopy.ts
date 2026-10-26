// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file layerExitCopy.ts
 * @input A layer's popover element as it closes
 * @output Exports `placeLayerExitCopy`: a static, inert copy of the layer put
 *   where the layer is drawn, in the top layer, for a touch presentation's
 *   close to play on, and `LayerExitBox`
 * @position Layer runtime helper for a touch presentation that animates a
 *   popover out: the one exit copy a layer may have
 *   (architecture:layer-runtime INV13, architecture:component-style-authoring
 *   INV7)
 *
 * The browser hides a popover the moment it closes (a pick, Escape, its own
 * light dismiss), so a close that has to stay on screen plays on a copy taken
 * as the popover closes: same place, same size, same inherited theme, and the
 * same look, values its running animations hold included (a clone keeps only
 * inline styles, and a compositor curve holds its value outside them). It is
 * laid out on the layer's own box and carries the transform the layer was
 * drawn with, so a copy taken mid-entrance holds where it was drawn. The copy
 * has no ids, no form names and no form owner (a cloned checked radio would
 * otherwise take the live group's selection, and a named field would
 * submit), is `inert` and hidden from assistive technology, and takes no
 * pointer events. Embedded content (an iframe, an object or embed, media, a
 * canvas) stands in the copy as an empty box of its size: a deep copy would
 * load or play it again (an iframe navigates, autoplay restarts, a canvas
 * comes back blank). A layer has one copy: placing another for the same layer
 * takes the previous one away; other layers' copies stay.
 *
 * It is shown only in the top layer, as a manual popover, so a clipping,
 * transformed or sticky ancestor neither cuts nor moves it; a fixed box or a
 * larger `z-index` is no substitute (spec:AST-027 FR8). Where the browser
 * refuses the show during the closing popover's own toggle (Android Chromium
 * 158: "Invalid to show a popover during another show operation"), the copy
 * waits, hidden, and shows once the toggle is over: after the script that
 * closed the layer or, failing that, in the next frame before it paints. A
 * browser without the popover API, or one that still refuses, gets no copy,
 * and the close is immediate. Its owner animates it and removes it when its
 * spring settles; nothing on the main thread runs per frame while it moves.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/layerExitCopy.test.ts
 * - /packages/core/src/Layer/__tests__/layerExitCopy.interaction.browser.spec.ts
 * - /docs/architecture/layer-runtime.md
 */

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

/** Each layer's copy: placing another for the same layer replaces it. */
/** The elements a `<form>` can own; `form=""` matches no form's id. */
const FORM_CONTROLS =
  'button, fieldset, input, object, output, select, textarea';

const copies = new WeakMap<HTMLElement, HTMLElement>();

/** A length in px, or 0. */
const px = (value: string): number => parseFloat(value) || 0;

/**
 * Where `element` is laid out, in viewport px: its box without the transform
 * a presentation in progress draws it with (the copy carries that transform
 * itself). A popover's layer is fixed in the top layer, so its offset box is
 * in viewport px.
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

/** Content a deep copy would load or play again. */
const EMBEDDED_CONTENT = 'iframe, object, embed, video, audio, canvas';

/**
 * An empty box standing where embedded content was drawn: the copied node's
 * classes and inline style, sized to the live node's box, with nothing in it.
 */
function emptyBox(
  copied: HTMLElement,
  live: HTMLElement | undefined,
  view: Window,
): HTMLElement {
  const box = copied.ownerDocument.createElement('span');
  box.className = copied.className;
  const inline = copied.getAttribute('style');
  if (inline != null) {
    box.setAttribute('style', inline);
  }
  const display = live == null ? 'inline' : view.getComputedStyle(live).display;
  box.style.setProperty(
    'display',
    display === 'inline' || display === '' ? 'inline-block' : display,
  );
  box.style.setProperty('box-sizing', 'border-box');
  box.style.setProperty('width', `${live?.offsetWidth ?? 0}px`);
  box.style.setProperty('height', `${live?.offsetHeight ?? 0}px`);
  return box;
}

/**
 * Copies `element` into a static box where it is drawn, marked with
 * `attribute`, inserts it right after the element and shows it in the top
 * layer. The copy keeps the element's scroll positions and presented look.
 * Returns null where there is no top layer to show it in (no popover API):
 * the close is then immediate.
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
  const copy = element.cloneNode(true) as HTMLElement;
  copy.removeAttribute('id');
  for (const node of copy.querySelectorAll('[id]')) {
    node.removeAttribute('id');
  }
  // Out of every form and radio group: a cloned checked radio with the live
  // group's name would take its selection, and a named field would submit.
  for (const node of copy.querySelectorAll('[name], [form]')) {
    node.removeAttribute('name');
    node.removeAttribute('form');
  }
  // The copy stands right after the layer, which renders inline by default,
  // so a layer inside a `<form>` would leave the copy's controls owned by
  // that form while it closes: a cloned empty `required` field makes the
  // form invalid and blocks its submit. `form=""` matches no form's id, so
  // each cloned control has no owner wherever the copy stands.
  for (const node of copy.querySelectorAll(FORM_CONTROLS)) {
    node.setAttribute('form', '');
  }
  copy.setAttribute(attribute, '');
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('inert', '');
  copy.setAttribute('popover', 'manual');
  const {style} = copy;
  for (const property of LIVE_ONLY_PROPERTIES) {
    style.removeProperty(property);
  }
  commitPresented(element, copy);
  // On the layer's box: in the top layer the viewport is its containing
  // block. No alignment against an anchor or the viewport (a phone menu
  // centered on its trigger with `anchor-center` would otherwise shift it),
  // and the UA's popover inset would over-constrain the box (and win in RTL).
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
  style.setProperty('pointer-events', 'none');
  style.setProperty('animation-name', 'none');
  style.setProperty('overflow', 'visible');
  // Scrolled content stays where it was scrolled to, once the copy is shown
  // (a hidden box keeps no scroll position).
  const scrolled: [Element, number, number][] = [];
  const sources = element.querySelectorAll('*');
  const targets = copy.querySelectorAll('*');
  sources.forEach((source, index) => {
    const target = targets[index];
    if (target != null && (source.scrollTop !== 0 || source.scrollLeft !== 0)) {
      scrolled.push([target, source.scrollTop, source.scrollLeft]);
    }
  });
  // Embedded content would load or play again in a deep copy (an iframe
  // navigates, autoplay media restarts, a canvas comes back blank): each one
  // stands as an empty box of the same size where it was drawn.
  const liveEmbeds = element.querySelectorAll<HTMLElement>(EMBEDDED_CONTENT);
  copy
    .querySelectorAll<HTMLElement>(EMBEDDED_CONTENT)
    .forEach((node, index) => {
      node.replaceWith(emptyBox(node, liveEmbeds[index], view));
    });
  element.after(copy);
  copies.set(element, copy);
  const show = (): boolean => {
    try {
      copy.showPopover();
    } catch {
      return false;
    }
    for (const [target, top, left] of scrolled) {
      target.scrollTop = top;
      target.scrollLeft = left;
    }
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
