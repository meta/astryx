// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file scrollLockTouchGuard.ts
 * @input The node under a finger and the pan's direction, while a scroll lock
 *   holds the page; the native-scroll probe's edge test (gestures/nativeScroll)
 * @output isPanAbsorbedBeforePage and isPageZoomedIn, for the page hold
 * @position Internal hook utility; gestures/pageHold calls it for
 *   useScrollLock.
 */

// iOS Safari scrolls an `overflow: hidden` page under a finger.
// The page hold cancels each pan that would reach the page. This walk decides
// which pans those are. A scroller that can move in the pan's direction takes
// the pan. A scroller at its edge that contains its overscroll also takes it.
// The walk follows flat-tree parents. It ends at a top-layer or fixed-position
// element, whose containing block is the viewport, so its untaken pans go to
// the page.

import {canElementScroll} from '../gestures/nativeScroll';
import {parentAcrossShadow} from '../utils/flatTree';

/**
 * Whether `element` itself takes a pan. It does when it can still scroll that
 * way, or when its `overscroll-behavior` contains the overscroll at its edge.
 */
function takesPan(
  element: Element,
  style: CSSStyleDeclaration,
  isVertical: boolean,
  dx: number,
  dy: number,
): boolean {
  const x = isVertical ? 0 : dx;
  const y = isVertical ? dy : 0;
  if (canElementScroll(element, x, y)) {
    return true;
  }
  // A scroller at its edge can still move the other way. A box that does not
  // scroll, or whose content fits, cannot. Its pan goes on along the chain.
  if (!canElementScroll(element, -x, -y)) {
    return false;
  }
  const behavior = isVertical
    ? style.overscrollBehaviorY
    : style.overscrollBehaviorX;
  return behavior === 'contain' || behavior === 'none';
}

/**
 * Whether `element` is in the state that a pseudo-class names (`:modal`,
 * `:popover-open`). An engine without the pseudo-class has no element in that
 * state. Its `matches` throws on the selector, so the engine is not asked.
 * Other errors surface.
 */
function isInState(element: Element, pseudoClass: string): boolean {
  const css = element.ownerDocument.defaultView?.CSS;
  return (
    typeof css?.supports === 'function' &&
    css.supports(`selector(${pseudoClass})`) &&
    element.matches(pseudoClass)
  );
}

/**
 * Whether a pan that `element` does not take goes to the viewport, not to its
 * DOM parent. The browser chains scrolling along containing blocks. A
 * top-layer element (an open modal dialog or popover) or a fixed-position one
 * has the viewport as its containing block. So a Dialog inside a scrolling
 * container gives an untaken pan to the page.
 */
function chainsToViewport(
  element: Element,
  style: CSSStyleDeclaration,
): boolean {
  return (
    style.position === 'fixed' ||
    isInState(element, ':modal') ||
    isInState(element, ':popover-open')
  );
}

/**
 * Whether the page is pinch-zoomed in (`visualViewport.scale > 1`). A
 * one-finger drag then pans the zoomed view, which a zoomed-in reader needs
 * around an open overlay. The value is read per touch, so a pinch during the
 * lock counts from the next drag.
 */
export function isPageZoomedIn(doc: Document): boolean {
  return (doc.defaultView?.visualViewport?.scale ?? 1) > 1;
}

/**
 * Whether `element` is a native control that takes a finger's drag itself. A
 * range input moves its thumb, so the drag never reaches the page.
 */
function takesDragItself(element: Element): boolean {
  // `:disabled` also covers a slider inside a disabled fieldset.
  return element.matches('input[type="range"]:not(:disabled)');
}

/**
 * Whether a scroller in the scroll chain of `target` takes a pan of (`dx`,
 * `dy`) before the page does.
 */
export function isPanAbsorbedBeforePage(
  target: EventTarget | null,
  dx: number,
  dy: number,
): boolean {
  if (!(target instanceof Node)) {
    return false;
  }
  const doc = target.ownerDocument ?? document;
  const view = doc.defaultView;
  if (view == null) {
    return false;
  }
  const isVertical = Math.abs(dy) >= Math.abs(dx);
  for (
    let node: Node | null = target;
    node != null;
    node = parentAcrossShadow(node)
  ) {
    if (!(node instanceof Element)) {
      continue;
    }
    if (takesDragItself(node)) {
      return true;
    }
    if (
      node === doc.documentElement ||
      node === doc.body ||
      node === doc.scrollingElement
    ) {
      break;
    }
    const style = view.getComputedStyle(node);
    if (takesPan(node, style, isVertical, dx, dy)) {
      return true;
    }
    if (chainsToViewport(node, style)) {
      break;
    }
  }
  return false;
}
