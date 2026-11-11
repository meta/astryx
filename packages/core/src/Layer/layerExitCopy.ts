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

import {
  inertCopy,
  isCopyable,
  keepInherited,
  restoreScrollOffsets,
} from '../motion/transientCopy';
import {settledBox} from './settledBox';
import {sharedWeakMap} from '../utils/sharedRealm';

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

/** The outermost layer around `element` in its own tree, if any. */
function outermostLayer(element: HTMLElement): HTMLElement | null {
  let outer: HTMLElement | null = null;
  for (
    let node = element.parentElement;
    node != null;
    node = node.parentElement
  ) {
    if (node.matches('[popover], dialog')) {
      outer = node;
    }
  }
  return outer;
}

/** Each layer's copy: placing another for the same layer replaces it. */
const copies = sharedWeakMap<HTMLElement, HTMLElement>(
  'layer/layer-exit-copy/copies',
  1,
);

/**
 * Shows the copies of layers inside `element` again, so they stay above the
 * copy just shown for it. Those layers were drawn above it. They are found
 * in `element` itself, so no closed layer is kept here once it is gone.
 */
function raiseInnerCopies(element: HTMLElement): void {
  const inner: HTMLElement[] = [];
  for (const layer of element.querySelectorAll<HTMLElement>(
    '[popover], dialog',
  )) {
    const copy = copies.get(layer);
    if (copy?.isConnected === true && copy.matches(':popover-open')) {
      inner.push(layer);
    }
  }
  // Outer layers first, so the innermost copy ends on top.
  inner.sort((a, b) => (a.contains(b) ? -1 : b.contains(a) ? 1 : 0));
  for (const layer of inner) {
    const copy = copies.get(layer);
    if (copy != null) {
      copy.hidePopover();
      copy.showPopover();
      restoreScrollOffsets(copy);
    }
  }
}

/** A duration list with any part above zero. */
const hasDuration = (value: string): boolean =>
  value.split(',').some(part => parseFloat(part) > 0);

/**
 * Where `element` is laid out, in viewport px, fractions kept. It is the box
 * without the transform a presentation in progress draws it with; the copy
 * carries that transform itself.
 */
function layoutBox(element: HTMLElement): LayerExitBox {
  const {left, top, width, height} = settledBox(element);
  return {left, top, width, height};
}

/**
 * Copies `element` into a static box where it is drawn, marked with
 * `attribute`. It inserts the copy after the outermost layer around the
 * element, or after the element when no layer encloses it. It shows the copy
 * in the top layer. Returns null where there is no top layer to show it in (no
 * popover API). It also returns null for content past the copy cap, or
 * holding a canvas that reads back empty. The close is then immediate.
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
 * Its descendants' keyframe animations do not start again. A layer has one
 * copy: placing another for the same layer takes the previous one away.
 *
 * It is shown only in the top layer, as a manual popover, so a clipping,
 * transformed or sticky ancestor neither cuts nor moves it. A fixed box or a
 * larger `z-index` is no substitute. Where the browser refuses the show
 * during the closing popover's own toggle (Chromium 150 and later), the copy
 * waits, hidden. It shows once the toggle is over: after the script that
 * closed the layer or, failing that, in the next frame before it paints. Its
 * owner animates it and removes it when its exit ends; nothing on the
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
  // Past the copy cap there is no copy, so the close is immediate.
  if (!isCopyable(element)) {
    return null;
  }
  const box = layoutBox(element);
  const copy = inertCopy(element);
  if (copy == null) {
    return null;
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
  const layerStyle = view.getComputedStyle(element);
  if (hasDuration(layerStyle.getPropertyValue('transition-duration'))) {
    style.setProperty('transition', 'none');
  }
  // A cloned descendant restarts its keyframes from the first frame, and a
  // transition with a starting style replays its entry. Stop both;
  // `commitPresented` already wrote what running ones held.
  const liveNodes = element.querySelectorAll('*');
  copy.querySelectorAll('*').forEach((node, index) => {
    const live = liveNodes[index];
    if (
      live == null ||
      !(node instanceof view.HTMLElement || node instanceof view.SVGElement)
    ) {
      return;
    }
    const liveStyle = view.getComputedStyle(live);
    const name = liveStyle.getPropertyValue('animation-name');
    if (name !== '' && name !== 'none') {
      node.style.setProperty('animation-name', 'none');
    }
    if (hasDuration(liveStyle.getPropertyValue('transition-duration'))) {
      node.style.setProperty('transition', 'none');
    }
  });
  // The layer's own overflow, so a layer that scrolls its content keeps its
  // clip. A popover's user-agent style scrolls as well.
  style.setProperty('overflow-x', layerStyle.getPropertyValue('overflow-x'));
  style.setProperty('overflow-y', layerStyle.getPropertyValue('overflow-y'));
  // A layer inside another layer that closes in the same step would leave its
  // copy inside a hidden box. The copy goes after the outermost one, with
  // what it inherited where it was.
  const outer = outermostLayer(element);
  if (outer?.parentElement == null) {
    element.after(copy);
  } else {
    // keepInherited reads the host's style, so it runs before the insertion:
    // no style read follows that write.
    keepInherited(copy, outer.parentElement);
    outer.after(copy);
  }
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
    raiseInnerCopies(element);
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
