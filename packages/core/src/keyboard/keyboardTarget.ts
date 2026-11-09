// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyboardTarget.ts
 * @input The keyboard module's reports and focus claim, the layout guide,
 *   rideKeyboard and the shared animator
 * @output The keyboard targets: their registry, followKeyboard for a docked
 *   or scrolling target, and keepFieldAboveKeyboard, a covered field's path.
 *   Also followsKeyboard, the touch gate, and deliverTap, a tap's delivery
 * @position Keyboard module, internal to core. useMobileKeyboard calls it.
 *
 * SYNC: When modified, update /packages/core/src/keyboard/README.md
 */

import {animatorFor, type Animator} from '../motion/animator';
import {isCoarsePointer} from '../utils/coarsePointer';
import {subscribeInput} from '../utils/inputStream';
import {layoutViewportHeight} from '../utils/layoutViewport';
import {nearestScroller, scrollingAncestor} from '../utils/scrollingAncestor';
import {
  KEYBOARD_EPSILON,
  claimTapFocus,
  findTextEntryControl,
  focusAtPoint,
  getKeyboardHeight,
  isKeyboardMeasurable,
  isTextEntryControl,
  refuseFocusReveal,
  subscribeKeyboardHeight,
  watchRevealPan,
} from './keyboardHeight';
import {getKeyboardLayoutGuide, keyboardProfileOf} from './keyboardLayoutGuide';
import type {KeyboardTransition} from './keyboardModel';
import {distanceIntoBand} from './revealBand';
import {rideKeyboard} from './rideKeyboard';

/**
 * How a target keeps a focused field above the keyboard: `'reveal'` scrolls
 * the field into place, and `'ride'` moves the target with the keyboard.
 */
export type KeyboardMove = 'reveal' | 'ride';

/**
 * The gap a field keeps above the keyboard's top edge, CSS px: the same
 * clearance a layer keeps above the keyboard.
 */
export const FIELD_OFFSET = 10;

// Targets that keep their own fields above the keyboard. A field inside one
// moves nothing itself, so nothing moves twice.
const targets = new WeakSet<Element>();

/** Registers `element` as a keyboard target until the returned call. */
export function registerKeyboardTarget(element: Element): () => void {
  targets.add(element);
  return () => {
    targets.delete(element);
  };
}

export {nearestScroller};

/** Whether a registered target holds `element`. */
export function isInsideKeyboardTarget(element: Element): boolean {
  for (
    let node = element.parentElement;
    node != null;
    node = node.parentElement
  ) {
    if (targets.has(node)) {
      return true;
    }
  }
  return false;
}

// The element's bottom edge where layout puts it, without the ride's move.
function restingBottom(element: Element, animator: Animator): number {
  return element.getBoundingClientRect().bottom - animator.get('y');
}

/**
 * How far a ride has moved `element` from where its layout puts it, as the
 * page draws it now, CSS px. Reading the style creates no animator.
 */
export function drawnOffsetOf(element: Element): number {
  const view = element.ownerDocument.defaultView;
  const translate = view?.getComputedStyle(element).translate ?? '';
  return parseFloat(translate.split(' ')[1] ?? '') || 0;
}

/** Where an element sits among fixed containers (see fixedContainerOf). */
export type FixedContainer =
  {docked: HTMLElement} | 'fills-viewport' | 'floating' | null;

/**
 * How the nearest fixed-position ancestor of `element` meets the keyboard. It
 * is docked when its layout puts its bottom at the layout viewport's bottom
 * edge. It can also fill the viewport, as a dialog does, or float above the
 * bottom edge. Null with no fixed ancestor, as in page content.
 */
export function fixedContainerOf(element: Element): FixedContainer {
  const view = element.ownerDocument.defaultView;
  const node = nearestFixedAncestor(element);
  if (view == null || node == null) {
    return null;
  }
  const dock = dockOf(node, view);
  return dock === 'docked' ? {docked: node} : dock;
}

function nearestFixedAncestor(element: Element): HTMLElement | null {
  const view = element.ownerDocument.defaultView;
  if (view == null) {
    return null;
  }
  for (
    let node = element.parentElement;
    node != null;
    node = node.parentElement
  ) {
    if (view.getComputedStyle(node).position === 'fixed') {
      return node;
    }
  }
  return null;
}

// How far the element's own `transform` moves it down, CSS px: the
// translation of its computed matrix. An app may lift its bar this way.
function transformOffsetOf(element: Element, view: Window): number {
  const transform = view.getComputedStyle(element).transform;
  const matrix = /^matrix(3d)?\(([^)]*)\)$/.exec(transform);
  if (matrix == null) {
    return 0;
  }
  const values = (matrix[2] ?? '').split(',').map(Number);
  const y = matrix[1] == null ? values[5] : values[13];
  return y != null && Number.isFinite(y) ? y : 0;
}

// How a fixed-position `node` meets the keyboard, by its layout box: without
// the ride's translate or any transform the app sets on it.
function dockOf(
  node: HTMLElement,
  view: Window,
): 'docked' | 'fills-viewport' | 'floating' {
  const viewportBottom = layoutViewportHeight(view);
  const box = node.getBoundingClientRect();
  if (box.height >= viewportBottom - KEYBOARD_EPSILON) {
    return 'fills-viewport';
  }
  const bottom =
    box.bottom - drawnOffsetOf(node) - transformOffsetOf(node, view);
  return Math.abs(viewportBottom - bottom) <= KEYBOARD_EPSILON
    ? 'docked'
    : 'floating';
}

// The animator each ridden target moves with. A translate it draws is the
// ride's, not the app's.
const riddenAnimators = new WeakMap<HTMLElement, Animator>();

// Whether the app positions `node` with its own `translate`, such as `-50% 0`
// to centre it. A translate the ride draws is not the app's.
function hasOwnTranslate(node: HTMLElement, view: Window): boolean {
  const translate = view.getComputedStyle(node).translate;
  if (translate === '' || translate === 'none') {
    return false;
  }
  const ride = riddenAnimators.get(node);
  return ride == null || ride.get('y') === 0;
}

const POSITION_PROPERTIES = new Set([
  'transform',
  'translate',
  'top',
  'bottom',
  'inset',
  'inset-block',
  'inset-block-start',
  'inset-block-end',
]);

const KEYFRAME_FIELDS = new Set([
  'offset',
  'computedOffset',
  'easing',
  'composite',
]);

// The CSS properties a running animation changes, in their CSS names.
function animatedProperties(animation: Animation): string[] {
  if ('transitionProperty' in animation) {
    return [String(animation.transitionProperty)];
  }
  const effect = animation.effect;
  if (effect == null || !('getKeyframes' in effect)) {
    return [];
  }
  const names = new Set<string>();
  for (const frame of (effect as KeyframeEffect).getKeyframes()) {
    for (const key of Object.keys(frame)) {
      if (!KEYFRAME_FIELDS.has(key)) {
        names.add(key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`));
      }
    }
  }
  return [...names];
}

// Whether the app is moving `node` itself right now with a CSS transition or
// animation on its position. A script animation is not seen: an app that moves
// its bar from script keeps it clear with its own `translate`. On a target the
// ride moves, a transition of `translate` alone is the ride's. The target's
// `transition` starts it when the ride writes the property. The app sets no
// `translate` on a target the ride moves.
function isMovedByApp(node: HTMLElement): boolean {
  if (typeof node.getAnimations !== 'function') {
    return false;
  }
  const isRidden = riddenAnimators.has(node);
  return node.getAnimations().some(animation => {
    if (animation.playState !== 'running') {
      return false;
    }
    const isTransition = 'transitionProperty' in animation;
    if (!isTransition && !('animationName' in animation)) {
      return false;
    }
    const properties = animatedProperties(animation);
    if (
      isRidden &&
      isTransition &&
      properties.every(property => property === 'translate')
    ) {
      return false;
    }
    return properties.some(property => POSITION_PROPERTIES.has(property));
  });
}

function isDockedContainer(node: HTMLElement): boolean {
  const view = node.ownerDocument.defaultView;
  return (
    view != null &&
    view.getComputedStyle(node).position === 'fixed' &&
    dockOf(node, view) === 'docked'
  );
}

/**
 * The fixed container docked at the viewport's bottom edge that holds
 * `element`, or null. A container that fills the viewport or floats above
 * the bottom edge is never one.
 */
export function dockedAncestor(element: Element): HTMLElement | null {
  const container = fixedContainerOf(element);
  return container != null && typeof container === 'object'
    ? container.docked
    : null;
}

/**
 * How far a bottom edge at `bottom` sits under the keyboard's top, plus
 * `offset`, CSS px; 0 when it clears it. An overlap under one CSS px is the
 * viewport's rounding, not an obstruction.
 */
export function coveredBy(
  bottom: number,
  height: number,
  offset: number,
  win: Window,
): number {
  const covered = bottom + offset - (layoutViewportHeight(win) - height);
  return height > 0 && covered > KEYBOARD_EPSILON ? covered : 0;
}

// The lift of a ridden target. A Core host (`isHostOwned`) clears the keyboard
// with a focused field inside, the field `offset` above it. An app's docked
// container moves only by the part of it the keyboard still covers. That part
// is measured after any lift the app gives it. So a bar the app already moves
// with the keyboard is not moved again. It is not moved at all once its layout
// leaves the bottom edge. Nor is it moved while the app runs its own CSS
// transition or animation on its position. When a field outside has focus, the
// target rests under the keyboard, so it never covers that field. When focus
// left for nothing, a lifted target rides down with the keyboard, and one at
// rest stays there.
function liftFor(
  target: HTMLElement,
  animator: Animator,
  height: number,
  offset: number,
  win: Window,
  isHostOwned: boolean,
): number {
  // An app's bar it is moving itself is left to the app, never lifted twice.
  if (!isHostOwned && (!isDockedContainer(target) || isMovedByApp(target))) {
    return 0;
  }
  const targetCovered = coveredBy(
    restingBottom(target, animator),
    height,
    0,
    win,
  );
  const field = focusedFieldIn(target);
  if (field != null) {
    if (!isHostOwned) {
      return targetCovered;
    }
    const fieldCovered = coveredBy(
      restingBottom(field, animator),
      height,
      offset,
      win,
    );
    return Math.max(targetCovered, fieldCovered);
  }
  if (isTextEntryControl(target.ownerDocument.activeElement)) {
    return 0;
  }
  return animator.get('y') < 0 ? targetCovered : 0;
}

// Scrolls `scroller` by `distance` px, up or down, at once. A smooth scroll
// would leave the field covered when Chrome checks it.
function scrollBy(scroller: Element, distance: number, win: Window): void {
  const doc = scroller.ownerDocument;
  if (scroller === (doc.scrollingElement ?? doc.documentElement)) {
    win.scrollBy({top: distance, behavior: 'instant'});
  } else {
    scroller.scrollTop += distance;
  }
}

// How far `field` sits outside the band it must be in. The band is inside its
// scroller's box and the viewport, and `offset` above the keyboard while one
// shows. A move not yet written shifts the field and its scroller by `shift`.
function revealDistance(
  field: Element,
  scroller: Element,
  height: number,
  offset: number,
  win: Window,
  shift = 0,
): number {
  const doc = field.ownerDocument;
  const keyboardTop = layoutViewportHeight(win) - height;
  let safeTop = 0;
  let safeBottom =
    height > KEYBOARD_EPSILON ? keyboardTop - offset : keyboardTop;
  if (scroller !== (doc.scrollingElement ?? doc.documentElement)) {
    const box = scroller.getBoundingClientRect();
    safeTop = Math.max(safeTop, box.top + shift);
    safeBottom = Math.min(safeBottom, box.bottom + shift);
  }
  const box = field.getBoundingClientRect();
  return distanceIntoBand(
    box.top + shift,
    box.bottom + shift,
    safeTop,
    safeBottom,
  );
}

// Scrolls `field` into its band with its nearest scroller, the document
// included. Nothing else moves: a scroller that cannot scroll far enough
// leaves the rest of the field covered.
function reveal(
  field: Element,
  scroller: Element,
  height: number,
  offset: number,
  win: Window,
): void {
  const distance = revealDistance(field, scroller, height, offset, win);
  if (Math.abs(distance) > KEYBOARD_EPSILON) {
    scrollBy(scroller, distance, win);
  }
}

// Focuses the tapped field without the browser's reveal, then raises the
// tap's click. The claimed tap's cancelled `touchend` raises none, and a
// caller's `onClick` still runs once. The click is synthetic: its `isTrusted`
// is false. Like a real tap's click in Chrome and Safari, it is a touch
// `PointerEvent`, or a `MouseEvent` where no `PointerEvent` exists.
export function deliverTap(
  control: HTMLElement,
  x: number,
  y: number,
  touch: {screenX: number; screenY: number; identifier: number},
): void {
  focusAtPoint(control, x, y);
  // The field's own window's constructors, as a click in a frame has.
  const view = control.ownerDocument.defaultView;
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    detail: 1,
    clientX: x,
    clientY: y,
    screenX: touch.screenX,
    screenY: touch.screenY,
  };
  const PointerClick = view?.PointerEvent;
  const click =
    typeof PointerClick === 'function'
      ? new PointerClick('click', {
          ...init,
          pointerType: 'touch',
          isPrimary: true,
          pointerId: touch.identifier,
        })
      : new (view?.MouseEvent ?? MouseEvent)('click', init);
  control.dispatchEvent(click);
}

/**
 * Puts back a pan the browser makes on its own after a keyboard report. This
 * happens, for example, after a focus no claim saw: a script's `focus()` while
 * nothing has focus. The field sits in place already, so the pan only displaces
 * the page. Feed `report` each keyboard height the module reports; `owns`
 * says whether a focused element is one this watch keeps in place.
 */
export function watchPans(
  win: Window,
  owns: (focused: Element) => boolean,
): {report(height: number): void; stop(): void} {
  const watch = watchRevealPan(win, {owns});
  let lastHeight = getKeyboardHeight(win);
  return {
    report(height: number): void {
      if (height !== lastHeight) {
        lastHeight = height;
        watch.report();
      } else if (watch.isRevealPan(height)) {
        watch.putBack();
      }
    },
    stop: () => watch.stop(),
  };
}

function focusedFieldIn(target: Element): HTMLElement | null {
  const active = target.ownerDocument.activeElement;
  return active != null &&
    active !== target &&
    target.contains(active) &&
    isTextEntryControl(active)
    ? active
    : null;
}

/**
 * Whether `win` keeps fields above a keyboard at all: a top-level document
 * whose visual viewport shrinks for the keyboard, under a coarse primary
 * pointer.
 */
export function followsKeyboard(win: Window | null): win is Window {
  return win != null && isKeyboardMeasurable(win) && isCoarsePointer(win);
}

/** How followKeyboard moves its target. */
export interface FollowKeyboardOptions {
  move: KeyboardMove;
  /** The gap kept between the focused field and the keyboard, CSS px. */
  offset: number;
}

/**
 * Keeps the focused field inside `target` above the keyboard until the
 * returned call. `'ride'` moves `target` with the keyboard, on its slide
 * where the browser reports one. `'reveal'` scrolls the field into place in
 * `target`, a scroller. The target claims focus moves into its fields, so the
 * browser never pans the page to them, and it registers as a keyboard target.
 *
 * @example
 * ```
 * const stop = followKeyboard(dock, {move: 'ride', offset: FIELD_OFFSET});
 * ```
 */
export function followKeyboard(
  target: HTMLElement,
  {move, offset}: FollowKeyboardOptions,
): () => void {
  const doc = target.ownerDocument;
  const win = doc.defaultView;
  if (!followsKeyboard(win)) {
    return () => {};
  }
  const unregister = registerKeyboardTarget(target);
  const stopClaim = refuseFocusReveal(doc, {
    claim: destination =>
      destination instanceof win.HTMLElement &&
      destination !== target &&
      target.contains(destination) &&
      isTextEntryControl(destination)
        ? destination
        : null,
  });
  // A first tap moves focus from nothing, so no blur claims it. The tap
  // route focuses the field itself, without the browser's reveal.
  const stopTaps = claimTapFocus(target, {
    claim: touched => {
      const control = findTextEntryControl(touched, target);
      return control != null && control !== doc.activeElement ? control : null;
    },
    deliver: deliverTap,
  });
  const stopMoving: (isFinal?: boolean) => void =
    move === 'ride'
      ? rideWithKeyboard(target, offset, win, true)
      : revealWithKeyboard(
          target,
          () => focusedFieldIn(target),
          target,
          offset,
          win,
        );
  return () => {
    stopMoving(true);
    stopTaps();
    stopClaim();
    unregister();
  };
}

// Reveals the focused field `field()` returns through `scroller` when the
// keyboard's height changes, now, and when focus moves into `region` with the
// keyboard already up. Returns the call that stops it.
function revealWithKeyboard(
  region: Element,
  field: () => Element | null,
  scroller: Element,
  offset: number,
  win: Window,
): () => void {
  const revealNow = (height: number) => {
    const focused = field();
    if (focused != null) {
      reveal(focused, scroller, height, offset, win);
    }
  };
  const pans = watchPans(win, focused => focused === field());
  // A report within a pixel of the last height comes from a pan, a scroll or
  // a zoom's rounding. The field stays where the person put it.
  let lastHeight = getKeyboardHeight(win);
  const stopReports = subscribeKeyboardHeight(win, event => {
    if (event.type === 'viewport') {
      if (Math.abs(event.height - lastHeight) > KEYBOARD_EPSILON) {
        lastHeight = event.height;
        revealNow(event.height);
      }
      pans.report(event.height);
    }
  });
  const onFocusIn = () => revealNow(getKeyboardHeight(win));
  region.addEventListener('focusin', onFocusIn);
  revealNow(getKeyboardHeight(win));
  return () => {
    stopReports();
    pans.stop();
    region.removeEventListener('focusin', onFocusIn);
  };
}

// Whether `container`'s drawn box is taller than the room above a keyboard
// `height` px tall. A move to the keyboard's top would then push it off the
// top.
function exceedsRoom(
  container: HTMLElement,
  height: number,
  win: Window,
): boolean {
  return (
    height > KEYBOARD_EPSILON &&
    container.getBoundingClientRect().height >
      layoutViewportHeight(win) - height + KEYBOARD_EPSILON
  );
}

// The focused text field in `container` and its scroller there, or null
// when no field inside has focus or no scroller sits between them.
function focusedScrollerIn(
  container: HTMLElement,
): {field: Element; scroller: Element} | null {
  const field = focusedFieldIn(container);
  const scroller = field == null ? null : scrollingAncestor(field, container);
  return field == null || scroller == null ? null : {field, scroller};
}

// The lift of a container taller than the room above the keyboard with no
// scroller around its focused field. It lifts only as far as that field needs
// to sit `offset` above the keyboard. It never lifts past the container's own
// overlap, so a field near its top stays on screen. It keeps liftFor's guards:
// a container that left the bottom edge or that the app is moving gets none.
// When focus left for nothing it never rises and rides down as the keyboard
// goes.
function fieldLift(
  target: HTMLElement,
  animator: Animator,
  height: number,
  offset: number,
  win: Window,
): number {
  if (!isDockedContainer(target) || isMovedByApp(target)) {
    return 0;
  }
  const overlap = coveredBy(restingBottom(target, animator), height, 0, win);
  const field = focusedFieldIn(target);
  if (field == null) {
    // A text field outside has focus: the container rests under the keyboard.
    return isTextEntryControl(target.ownerDocument.activeElement)
      ? 0
      : Math.min(Math.max(0, -animator.get('y')), overlap);
  }
  const need = coveredBy(restingBottom(field, animator), height, offset, win);
  return Math.min(need, overlap);
}

// The ride that moves each target. A new ride on the same target takes over,
// whether the old one still rides or waits for the keyboard to go. So two never
// move one target, and the one taken over never moves it again.
const currentRides = new WeakMap<HTMLElement, () => void>();

// Rides `target` with the keyboard until the returned call (see liftFor).
// `isHostOwned` is true for a Core host's own element, and false for an app's
// docked container. Where the guide publishes the keyboard's slide, the
// target moves on it; elsewhere it takes each report's place. A blur's stop
// waits for the keyboard to go, so the target never drops under a keyboard
// still showing. A final stop, on detach, returns it at once.
function rideWithKeyboard(
  target: HTMLElement,
  offset: number,
  win: Window,
  isHostOwned: boolean,
): (isFinal?: boolean) => void {
  currentRides.get(target)?.();
  const animator = animatorFor(target);
  riddenAnimators.set(target, animator);
  const guide =
    keyboardProfileOf(win) === 'chromium' ? getKeyboardLayoutGuide(win) : null;
  // A ride moves the target while it rides or waits for the keyboard to go.
  // Once it ends, by itself or by a takeover, it never moves the target.
  let state: 'riding' | 'waiting' | 'ended' = 'riding';
  let stopReports: (() => void) | null = null;
  let stopGuide: (() => void) | null = null;
  const pans = watchPans(win, focused => target.contains(focused));
  let frame = 0;
  let pendingSlide: KeyboardTransition | null = null;
  const end = () => {
    state = 'ended';
    stopReports?.();
    stopGuide?.();
    stopReports = null;
    stopGuide = null;
    pans.stop();
    stopFocusIns();
    if (frame !== 0) {
      win.cancelAnimationFrame(frame);
      frame = 0;
    }
    if (currentRides.get(target) === end) {
      currentRides.delete(target);
    }
  };
  currentRides.set(target, end);
  const place = (height: number, transition: KeyboardTransition | null) => {
    if (state === 'ended') {
      return;
    }
    // An app's container taller than the room above the keyboard never rides
    // the whole overlap. A scroller in it reveals the focused field instead.
    // With none, it rides only as far as that field needs.
    const isTooTall = !isHostOwned && exceedsRoom(target, height, win);
    const inside = isTooTall ? focusedScrollerIn(target) : null;
    const lift = !isTooTall
      ? liftFor(target, animator, height, offset, win, isHostOwned)
      : inside == null
        ? fieldLift(target, animator, height, offset, win)
        : 0;
    // Rest is y 0, never -0, so the animator releases its translate there.
    const y = lift > 0 ? -lift : 0;
    // Every box is read before anything is written. The scroller moves with
    // the container, so the reveal measures the field where the move leaves
    // it.
    const revealBy =
      inside == null
        ? 0
        : revealDistance(
            inside.field,
            inside.scroller,
            height,
            offset,
            win,
            y - animator.get('y'),
          );
    if (inside != null && Math.abs(revealBy) > KEYBOARD_EPSILON) {
      scrollBy(inside.scroller, revealBy, win);
    }
    if (y !== 0 || animator.get('y') !== 0) {
      if (transition == null) {
        animator.set({y});
      } else {
        rideKeyboard(animator, {y}, transition);
      }
    }
    // The target is now at rest, or rides there on the keyboard's slide, so
    // a stopped ride only stops listening. A set here would cut the slide.
    if (state === 'waiting' && height <= KEYBOARD_EPSILON) {
      end();
    }
  };
  // A report, a slide or a focus move places the target on the next frame, once
  // every listener of that event has run. An app that moves its own bar in its
  // listener has moved it by then. So the lift measures only what the keyboard
  // still covers, and never stacks on the app's.
  const placeOnNextFrame = (slide: KeyboardTransition | null) => {
    if (slide != null) {
      pendingSlide = slide;
    }
    if (frame !== 0) {
      return;
    }
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      const next = pendingSlide;
      pendingSlide = null;
      place(next?.to ?? guide?.inset ?? getKeyboardHeight(win), next);
    });
  };
  if (guide != null) {
    stopGuide = guide.subscribe(placeOnNextFrame);
  } else {
    stopReports = subscribeKeyboardHeight(win, event => {
      if (event.type === 'viewport') {
        placeOnNextFrame(null);
        pans.report(event.height);
      }
    });
  }
  // A field gaining focus with the keyboard up places the target. A blur to
  // nothing waits for the keyboard's own report or slide, so the target rides
  // down from where it is.
  const stopFocusIns = subscribeInput(win, 'focusin', () =>
    placeOnNextFrame(null),
  );
  placeOnNextFrame(null);
  return (isFinal = false) => {
    if (state === 'ended') {
      return;
    }
    if (isFinal || getKeyboardHeight(win) <= KEYBOARD_EPSILON) {
      end();
      if (animator.get('y') !== 0) {
        animator.set({y: 0});
      }
    } else {
      state = 'waiting';
    }
  };
}

/** How keepFieldAboveKeyboard keeps its field clear. */
export interface KeepFieldAboveKeyboardOptions {
  /** The gap kept between the field and the keyboard, CSS px. */
  offset?: number;
}

// The placement of `field` when it gains focus. A docked container rides.
// Page content, or a fixed container the app positions, reveals the field
// through a scroller. Null keeps the browser's reveal: inside a keyboard
// target, or with no such scroller.
function placementOf(
  field: HTMLElement,
): {ride: HTMLElement} | {reveal: Element} | null {
  if (isInsideKeyboardTarget(field)) {
    return null;
  }
  const container = fixedContainerOf(field);
  if (container === 'floating' || container === 'fills-viewport') {
    return revealWithin(field, nearestFixedAncestor(field));
  }
  if (container == null) {
    // A page with nothing to scroll keeps the browser's own reveal: a claim
    // there would leave the field under the keyboard.
    const scroller = nearestScroller(field);
    return scroller.scrollHeight > scroller.clientHeight
      ? {reveal: scroller}
      : null;
  }
  // A bar the app positions with its own `translate` does not ride: the ride
  // would replace that translate.
  const view = field.ownerDocument.defaultView;
  return view != null && hasOwnTranslate(container.docked, view)
    ? revealWithin(field, container.docked)
    : {ride: container.docked};
}

// A reveal by the scroller between `field` and the fixed `container` the app
// positions, or null when no scroller sits between them.
function revealWithin(
  field: HTMLElement,
  container: HTMLElement | null,
): {reveal: Element} | null {
  const scroller =
    container == null ? null : scrollingAncestor(field, container);
  return scroller == null ? null : {reveal: scroller};
}

/**
 * A field's own path until the returned call. When the field gains focus, it
 * decides where it is. Docked at the viewport's bottom, its fixed container
 * moves up by the part of it the keyboard still covers. In scrolling content,
 * its nearest scroller, the document included, brings it into view, above the
 * keyboard while one shows. A docked container taller than the room above the
 * keyboard never rides its whole overlap. Its scroller there brings the field
 * up instead, and with none it rides only as far as the field needs. A fixed
 * container the app positions fills the viewport, floats above the bottom edge,
 * or sets its own `translate`. In one, a scroller between the field and the
 * container brings it up. A focus move or a tap into the field arrives without
 * the browser's reveal there, so the page never pans for it. Inside a keyboard
 * target, or in such a container with no scroller around the field, the path
 * does nothing and the browser's own reveal stays.
 *
 * @example
 * ```
 * const stop = keepFieldAboveKeyboard(input);
 * ```
 */
export function keepFieldAboveKeyboard(
  field: HTMLElement,
  {offset = FIELD_OFFSET}: KeepFieldAboveKeyboardOptions = {},
): () => void {
  const doc = field.ownerDocument;
  const win = doc.defaultView;
  if (!followsKeyboard(win)) {
    return () => {};
  }
  const stopClaim = refuseFocusReveal(doc, {
    claim: destination =>
      destination === field && placementOf(field) != null ? field : null,
  });
  // A first tap moves focus from nothing, so no blur claims it.
  const stopTaps = claimTapFocus(field, {
    claim: () =>
      doc.activeElement !== field && placementOf(field) != null ? field : null,
    deliver: deliverTap,
  });
  let stopSession: ((isFinal?: boolean) => void) | null = null;
  // A ride a blur stopped can still wait for the keyboard to go; a detach
  // ends it at once.
  let stoppedSession: ((isFinal?: boolean) => void) | null = null;
  const onFocus = () => {
    // A claimed focus move raises a second focus event; the session stands.
    if (stopSession != null) {
      return;
    }
    const placement = placementOf(field);
    if (placement == null) {
      return;
    }
    stopSession =
      'ride' in placement
        ? rideWithKeyboard(placement.ride, offset, win, false)
        : revealWithKeyboard(
            field,
            () => (doc.activeElement === field ? field : null),
            placement.reveal,
            offset,
            win,
          );
  };
  const onBlur = () => {
    stopSession?.();
    stoppedSession = stopSession ?? stoppedSession;
    stopSession = null;
  };
  field.addEventListener('focus', onFocus);
  field.addEventListener('blur', onBlur);
  return () => {
    field.removeEventListener('focus', onFocus);
    field.removeEventListener('blur', onBlur);
    stopSession?.(true);
    stoppedSession?.(true);
    stopSession = null;
    stoppedSession = null;
    stopTaps();
    stopClaim();
  };
}
