// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyboardTarget.ts
 * @input The keyboard module's reports and focus claim, the layout guide,
 *   rideKeyboard and the shared animator
 * @output The keyboard targets: their registry, followKeyboard for a docked
 *   or scrolling target, and keepFieldAboveKeyboard, a covered field's path.
 *   Also followsKeyboard, the touch gate, and deliverTap, a tap's delivery.
 *   Each scroll a reveal makes goes back when the keyboard goes
 * @position Keyboard module, internal to core. useMobileKeyboard calls it.
 *
 * SYNC: When modified, update /packages/core/src/keyboard/README.md
 */

import {animatorFor, type Animator} from '../motion/animator';
import {reducedMotionFade} from '../motion/reducedMotion';
import {isCoarsePointer} from '../utils/coarsePointer';
import {getTouches, subscribeInput} from '../utils/inputStream';
import {layoutViewportHeight} from '../utils/layoutViewport';
import {nearestScroller, scrollingAncestor} from '../utils/scrollingAncestor';
import {sharedWeakMap, sharedWeakSet} from '../utils/sharedRealm';
import {isIosWebKit} from '../utils/touchQueries';
import {
  KEYBOARD_EPSILON,
  claimTapFocus,
  findTextEntryControl,
  focusAtPoint,
  getKeyboardHeight,
  getResizedRoom,
  getResizedRoomWidth,
  isFingerOnScreen,
  isKeyboardMeasurable,
  isTextEntryControl,
  panVisualViewportTo,
  refuseFocusReveal,
  subscribeKeyboardHeight,
  watchRevealPan,
} from './keyboardHeight';
import {
  bringsUpKeyboard,
  getKeyboardLayoutGuide,
  hidesField,
  keyboardProfileOf,
} from './keyboardLayoutGuide';
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

/**
 * Chrome on Android pans the page itself if the keyboard still covers the
 * focused field about 100 to 170 ms after the report. A field a fraction of a
 * pixel under the keyboard's top still counts as covered. So a show sets the
 * field this far above that top at once, CSS px, and only the rest rides.
 */
export const FIELD_CLEARANCE_AT_REPORT = 4;

// Targets that keep their own fields above the keyboard. A field inside one
// moves nothing itself, so nothing moves twice.
const targets = sharedWeakSet<Element>('keyboard/keyboard-target/targets', 1);

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
const riddenAnimators = sharedWeakMap<HTMLElement, Animator>(
  'keyboard/keyboard-target/ridden-animators',
  1,
);

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

function scrollBy(
  scroller: Element,
  distance: number,
  win: Window,
  behavior: ScrollBehavior = 'instant',
): void {
  // An explicit 'instant' also overrides a scroller's own smooth
  // `scroll-behavior`.
  const doc = scroller.ownerDocument;
  if (scroller === (doc.scrollingElement ?? doc.documentElement)) {
    win.scrollBy({top: distance, behavior});
  } else if (typeof scroller.scrollBy === 'function') {
    scroller.scrollBy({top: distance, behavior});
  } else {
    scroller.scrollTop += distance;
  }
}

function scrollRangeOf(scroller: Element, win: Window): number {
  const doc = scroller.ownerDocument;
  const view =
    scroller === (doc.scrollingElement ?? doc.documentElement)
      ? layoutViewportHeight(win)
      : scroller.clientHeight;
  return Math.max(0, scroller.scrollHeight - view);
}

// Whether a reveal for a keyboard rises on the browser's smooth scroll. On
// iOS, the browser runs no reveal after Core takes the focus. Its first report
// comes as the keyboard starts to slide, so the field rises beside it. Chrome
// on Android checks the field in the resize's own commit, where a smooth
// scroll would leave it covered. There, and under Reduce Motion, the field
// moves at once.
function risesSmoothly(field: Element): boolean {
  return (
    isIosWebKit(field.ownerDocument.defaultView) &&
    reducedMotionFade(field) == null
  );
}

// The band a field must be in. It is inside its scroller's box and the
// viewport, and `offset` above the keyboard while one shows. A move not yet
// written shifts the scroller by `shift`. Where the browser shrank the layout
// viewport for the keyboard (`resized`), the keyboard's top is that viewport's
// bottom.
function bandOf(
  scroller: Element,
  height: number,
  offset: number,
  win: Window,
  shift = 0,
  resized = false,
): {top: number; bottom: number} {
  const doc = scroller.ownerDocument;
  const keyboardTop = layoutViewportHeight(win) - height;
  let top = 0;
  let bottom =
    height > KEYBOARD_EPSILON || resized ? keyboardTop - offset : keyboardTop;
  if (scroller !== (doc.scrollingElement ?? doc.documentElement)) {
    const box = scroller.getBoundingClientRect();
    top = Math.max(top, box.top + shift);
    bottom = Math.min(bottom, box.bottom + shift);
  }
  return {top, bottom};
}

// How far `field` sits outside its band (see bandOf). A move not yet written
// shifts the field and its scroller by `shift`.
function revealDistance(
  field: Element,
  scroller: Element,
  height: number,
  offset: number,
  win: Window,
  shift = 0,
  resized = false,
): number {
  const band = bandOf(scroller, height, offset, win, shift, resized);
  const box = field.getBoundingClientRect();
  return distanceIntoBand(
    box.top + shift,
    box.bottom + shift,
    band.top,
    band.bottom,
  );
}

// Whether `field` lies wholly in its band. A band too short for the field
// holds none of it, as when a scroll area sits under the keyboard. A scroll of
// `scroller` not yet drawn moves the field by `fieldShift`.
function sitsInBand(
  field: Element,
  scroller: Element,
  height: number,
  offset: number,
  win: Window,
  resized = false,
  fieldShift = 0,
): boolean {
  const band = bandOf(scroller, height, offset, win, 0, resized);
  const box = field.getBoundingClientRect();
  return (
    box.top + fieldShift >= band.top - KEYBOARD_EPSILON &&
    box.bottom + fieldShift <= band.bottom + KEYBOARD_EPSILON
  );
}

// Scrolls `field` into its band with its nearest scroller, the document
// included. Nothing else moves: a scroller that cannot scroll far enough
// leaves the rest of the field covered. A scroll for a keyboard goes back
// when the keyboard goes. Only a scroll that places the field rises (see
// risesSmoothly), unless `canRise` is false. Returns the part of the scroll
// not yet drawn.
function reveal(
  field: Element,
  scroller: Element,
  height: number,
  offset: number,
  win: Window,
  resized = false,
  canRise = true,
): number {
  const distance = revealDistance(
    field,
    scroller,
    height,
    offset,
    win,
    0,
    resized,
  );
  if (Math.abs(distance) <= KEYBOARD_EPSILON) {
    return 0;
  }
  const now = scrollTopOf(scroller, win);
  const target = Math.min(
    Math.max(now + distance, 0),
    scrollRangeOf(scroller, win),
  );
  const rises =
    canRise &&
    height > KEYBOARD_EPSILON &&
    Math.abs(target - now - distance) <= KEYBOARD_EPSILON &&
    sitsInBand(field, scroller, height, offset, win, resized, -distance) &&
    risesSmoothly(field);
  // A rise still on its way extends Core's own scroll.
  const before = keyboardScrollTarget(scroller, win) ?? now;
  scrollBy(scroller, distance, win, rises ? 'smooth' : 'instant');
  if (height > KEYBOARD_EPSILON || resized) {
    noteKeyboardScroll(scroller, before, win, rises ? target : undefined);
  }
  return rises ? target - scrollTopOf(scroller, win) : 0;
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
 * the page. A pan made at the last height goes back at the next height's
 * report. The caller's own pan is the new rest once reported (`expectPan`):
 * its report comes after the call returns.
 * Feed `report` each keyboard height the module reports; `owns` says whether a
 * focused element is one this watch keeps in place. `documentScrollIsReveal`
 * is watchRevealPan's option of that name.
 */
export function watchPans(
  win: Window,
  owns: (focused: Element) => boolean,
  documentScrollIsReveal = false,
): {
  report(height: number): void;
  expectPan(top: number): void;
  stop(): void;
} {
  const watch = watchRevealPan(win, {owns, documentScrollIsReveal});
  let lastHeight = getKeyboardHeight(win);
  let ownPanTop: number | null = null;
  return {
    report(height: number): void {
      const top = win.visualViewport?.offsetTop ?? 0;
      if (height !== lastHeight) {
        if (
          ownPanTop == null &&
          lastHeight > KEYBOARD_EPSILON &&
          watch.isRevealPan(height)
        ) {
          watch.putBack();
        }
        lastHeight = height;
        watch.report();
      } else if (
        ownPanTop != null &&
        Math.abs(top - ownPanTop) <= KEYBOARD_EPSILON
      ) {
        ownPanTop = null;
        watch.report();
      } else if (watch.isRevealPan(height)) {
        watch.putBack();
      }
    },
    expectPan(top: number): void {
      ownPanTop = top;
    },
    stop: () => watch.stop(),
  };
}

type PanWatch = ReturnType<typeof watchPans>;

// Pans the visual viewport until `field` sits `offset` above the keyboard,
// within the keyboard's room and never past the field's top. Returns whether
// the field is clear. In Safari a document scroll reaches that room first.
function panIntoView(
  field: Element,
  offset: number,
  win: Window,
  pans: PanWatch,
): boolean {
  const viewport = win.visualViewport;
  if (viewport == null) {
    return false;
  }
  const box = field.getBoundingClientRect();
  const need = box.bottom + offset - (viewport.offsetTop + viewport.height);
  if (need <= KEYBOARD_EPSILON) {
    return true;
  }
  const room = layoutViewportHeight(win) - viewport.offsetTop - viewport.height;
  const pan = Math.min(need, room, box.top - viewport.offsetTop);
  if (pan <= KEYBOARD_EPSILON) {
    return false;
  }
  const top = viewport.offsetTop + pan;
  pans.expectPan(top);
  panVisualViewportTo(win, top);
  return pan >= need - KEYBOARD_EPSILON;
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
  const stopScrollBack = claimKeyboardScrollBack(win);
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
    stopScrollBack();
    unregister();
  };
}

// Who reveals a field its scroller cannot place. 'document': the document,
// then a pan. 'fixed': the same, with a scroll that moves nothing undone.
// 'keep': nobody, since the scroller holds every field it reveals.
type UnplacedField = 'document' | 'fixed' | 'keep';

// Reveals the focused field `field()` returns through `scroller` when the
// keyboard's height changes, now, and when focus moves into `region` with the
// keyboard already up. Returns the call that stops it.
function revealWithKeyboard(
  region: Element,
  field: () => Element | null,
  scroller: Element,
  offset: number,
  win: Window,
  unplaced: UnplacedField = 'keep',
  resizedRoom: () => number = () => 0,
): () => void {
  // Unless `unplaced` is 'keep', the document reveals a field its scroller
  // leaves covered, and a pan takes the rest where the document cannot reach.
  const doc = scroller.ownerDocument;
  const root = doc.scrollingElement ?? doc.documentElement;
  let isPlaced = true;
  // A long press focuses with the finger still down. The show's first reveal
  // runs all the same. A show is a keyboard height or, under
  // resizes-content, a room.
  let hasRevealed = false;
  // The input stream's touch-start count at the last reveal. The press that
  // focused the field started before it, so it holds no report. Gboard can
  // report a 48 px keyboard first, then its full height, while that press is
  // still down.
  let startsAtReveal = 0;
  const revealNow = (height: number) => {
    const focused = field();
    if (focused == null) {
      return;
    }
    const resized = resizedRoom() > 0;
    hasRevealed = height > KEYBOARD_EPSILON || resized;
    startsAtReveal = getTouches(win).starts;
    const rising = reveal(focused, scroller, height, offset, win, resized);
    if (unplaced === 'keep') {
      return;
    }
    isPlaced =
      rising !== 0 ||
      sitsInBand(focused, scroller, height, offset, win, resized);
    if (isPlaced || (height <= KEYBOARD_EPSILON && !resized)) {
      return;
    }
    if (unplaced === 'document') {
      if (
        scroller !== root &&
        reveal(focused, root, height, offset, win, resized) !== 0
      ) {
        isPlaced = true;
        return;
      }
    } else {
      // Safari runs no reveal after Core takes the focus. Its document scroll
      // moves a fixed container too, as a visual-viewport offset while its
      // keyboard shows. Where the scroll moves nothing, Core scrolls back.
      const top = focused.getBoundingClientRect().top;
      const scrollY = win.scrollY;
      reveal(focused, root, height, offset, win, resized, false);
      if (
        Math.abs(focused.getBoundingClientRect().top - top) <= KEYBOARD_EPSILON
      ) {
        const scrolled = win.scrollY - scrollY;
        if (scrolled !== 0) {
          const before = win.scrollY;
          win.scrollBy({top: -scrolled, behavior: 'instant'});
          noteKeyboardScroll(root, before, win);
        }
      }
    }
    // Chrome scrolls the document only within its range. The pan takes the
    // rest at once, so Chrome's own pan finds the field clear.
    isPlaced = panIntoView(focused, offset, win, pans);
  };
  const pans = watchPans(win, focused => focused === field() && isPlaced);
  // A report within a pixel of the last height is a pan, a scroll or a
  // zoom's rounding, so the field stays. After the show's first reveal, a
  // report during a press that began after that reveal moves nothing, as
  // when Firefox's toolbar hides in a drag. Under
  // `interactive-widget=resizes-content` the height stays 0 and the layout
  // viewport shrinks instead. The field then takes its place above the new
  // bottom in the report's own frame, so the browser's own focus scroll finds
  // it in view.
  let lastHeight = getKeyboardHeight(win);
  let lastRoom = resizedRoom();
  const isLaterPressDown = () =>
    isFingerOnScreen(win) && getTouches(win).starts !== startsAtReveal;
  const stopReports = subscribeKeyboardHeight(win, event => {
    if (event.type === 'viewport') {
      const room = resizedRoom();
      if (
        Math.abs(event.height - lastHeight) > KEYBOARD_EPSILON ||
        Math.abs(room - lastRoom) > KEYBOARD_EPSILON
      ) {
        lastHeight = event.height;
        lastRoom = room;
        if (!hasRevealed || !isLaterPressDown()) {
          revealNow(event.height);
        }
      }
      pans.report(event.height);
    }
  });
  const onFocusIn = () => {
    stopKeyboardScrollBack(win);
    revealNow(getKeyboardHeight(win));
  };
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

// The move that sets the focused field in `target` FIELD_CLEARANCE_AT_REPORT
// px above a keyboard `height` px tall, or null with no field to clear.
function clearanceAtReport(
  target: HTMLElement,
  animator: Animator,
  height: number,
  win: Window,
): number | null {
  const field = focusedFieldIn(target);
  if (field == null) {
    return null;
  }
  const need = coveredBy(
    restingBottom(field, animator),
    height,
    FIELD_CLEARANCE_AT_REPORT,
    win,
  );
  return need > 0 ? -need : null;
}

// The ride that moves each target. A new ride on the same target takes over,
// whether the old one still rides or waits for the keyboard to go. So two never
// move one target, and the one taken over never moves it again.
const currentRides = sharedWeakMap<HTMLElement, () => void>(
  'keyboard/keyboard-target/current-rides',
  1,
);

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
  // The guide runs only in Chrome, whose own reveal of a field in the target
  // also scrolls the page behind it.
  const pans = watchPans(
    win,
    focused => target.contains(focused),
    guide != null,
  );
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
        // On a show, the field is set just above the keyboard's top at once,
        // so Chrome's own pan finds it clear. Only the rest rides.
        const atReport =
          transition.kind === 'show'
            ? clearanceAtReport(target, animator, height, win)
            : null;
        if (atReport != null && y < atReport && atReport < animator.get('y')) {
          animator.set({y: atReport});
        }
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
  // Every viewport report feeds the pan watch, so a pan the browser still
  // makes is put back. Without the guide, the report also places the target.
  stopReports = subscribeKeyboardHeight(win, event => {
    if (event.type === 'viewport') {
      if (guide == null) {
        placeOnNextFrame(null);
      }
      pans.report(event.height);
    }
  });
  if (guide != null) {
    stopGuide = guide.subscribe(placeOnNextFrame);
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

// Whether `scroller`, in a fixed container the app positions, can bring
// `field` into its band. It must scroll the field up to the scroller's own
// top, since a scroller does not gain the range it lacks at its end yet. With
// the keyboard up, its box must also leave the field room above the keyboard.
function canBringUp(
  field: Element,
  scroller: Element,
  offset: number,
  win: Window,
): boolean {
  const range =
    scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
  const box = field.getBoundingClientRect();
  if (
    range <
    box.top - scroller.getBoundingClientRect().top - KEYBOARD_EPSILON
  ) {
    return false;
  }
  const height = getKeyboardHeight(win);
  if (height <= KEYBOARD_EPSILON) {
    return true;
  }
  const band = bandOf(scroller, height, offset, win);
  return band.bottom - band.top >= box.height - KEYBOARD_EPSILON;
}

// The placement of `field` when it gains focus. A docked container rides.
// Page content reveals the field through its nearest scroller. A fixed
// container the app positions reveals it through a scroller in it that can
// bring it up. Null keeps the browser's reveal: inside a keyboard target, on a
// page with nothing to scroll, or with no such scroller.
function placementOf(
  field: HTMLElement,
  offset: number,
  win: Window,
): {ride: HTMLElement} | {reveal: Element; unplaced: UnplacedField} | null {
  if (isInsideKeyboardTarget(field)) {
    return null;
  }
  const container = fixedContainerOf(field);
  if (container === 'floating' || container === 'fills-viewport') {
    return revealWithin(field, nearestFixedAncestor(field), offset, win);
  }
  if (container == null) {
    // A page with nothing to scroll keeps the browser's own reveal: a claim
    // there would leave the field under the keyboard in Safari.
    const scroller = nearestScroller(field);
    // In the page, the document reveals a field its scroll area cannot place.
    return scroller.scrollHeight > scroller.clientHeight
      ? {reveal: scroller, unplaced: 'document'}
      : null;
  }
  // A bar the app positions with its own `translate` does not ride: the ride
  // would replace that translate.
  const view = field.ownerDocument.defaultView;
  return view != null && hasOwnTranslate(container.docked, view)
    ? revealWithin(field, container.docked, offset, win)
    : {ride: container.docked};
}

// A reveal by the scroller between `field` and the fixed `container` the app
// positions, or null when no scroller there can bring the field up.
function revealWithin(
  field: HTMLElement,
  container: HTMLElement | null,
  offset: number,
  win: Window,
): {reveal: Element; unplaced: UnplacedField} | null {
  const scroller =
    container == null ? null : scrollingAncestor(field, container);
  return scroller == null || !canBringUp(field, scroller, offset, win)
    ? null
    : {reveal: scroller, unplaced: 'fixed'};
}

/**
 * Keeps `field` above the on-screen keyboard until the returned call. On focus,
 * `placementOf` decides who moves it. A claimed focus move or tap arrives
 * without the browser's reveal. Where no placement fits, the browser's own
 * reveal stays.
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
  const stopScrollBack = claimKeyboardScrollBack(win);
  // The module keeps the tallest root box per window, so a later shrink reads
  // as room.
  const resizedRoom = () => getResizedRoom(win);
  const stopClaim = refuseFocusReveal(doc, {
    claim: destination =>
      destination === field && placementOf(field, offset, win) != null
        ? field
        : null,
  });
  // A first tap moves focus from nothing, so no blur claims it.
  const stopTaps = claimTapFocus(field, {
    claim: () =>
      doc.activeElement !== field && placementOf(field, offset, win) != null
        ? field
        : null,
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
    const placement = placementOf(field, offset, win);
    if (placement == null) {
      return;
    }
    stopKeyboardScrollBack(win);
    stopSession =
      'ride' in placement
        ? rideWithKeyboard(placement.ride, offset, win, false)
        : revealWithKeyboard(
            field,
            () => (doc.activeElement === field ? field : null),
            placement.reveal,
            offset,
            win,
            placement.unplaced,
            resizedRoom,
          );
  };
  const onBlur = () => {
    stopSession?.();
    stoppedSession = stopSession ?? stoppedSession;
    stopSession = null;
  };
  field.addEventListener('focus', onFocus);
  field.addEventListener('blur', onBlur);
  // A field that has focus before this path attaches, as with `hasAutoFocus`,
  // gets no later focus event. Its session starts here.
  if (doc.activeElement === field) {
    onFocus();
  }
  return () => {
    field.removeEventListener('focus', onFocus);
    field.removeEventListener('blur', onBlur);
    stopSession?.(true);
    stoppedSession?.(true);
    stopSession = null;
    stoppedSession = null;
    stopTaps();
    stopClaim();
    stopScrollBack();
  };
}

// The scroll back: each scroll Core makes for the keyboard goes back when the
// keyboard goes.

interface AddedScroll {
  /** Where the scroller was before Core's first scroll. */
  from: number;
  /** Where Core left it, or null once anyone else scrolled it. */
  at: number | null;
  /** Whether the scroll back runs from the blur, so the report moves nothing. */
  isBack: boolean;
}

// Every copy of Core shares these stores, so one scroll back runs per page.
const addedScrolls = sharedWeakMap<Window, Map<Element, AddedScroll>>(
  'keyboard/keyboard-target/scroll-back-added-scrolls',
  1,
);
const stopsOf = sharedWeakMap<Window, () => void>(
  'keyboard/keyboard-target/scroll-back-stops',
  1,
);
const foldWaitsOf = sharedWeakMap<Window, () => void>(
  'keyboard/keyboard-target/scroll-back-fold-waits',
  1,
);
const claimants = sharedWeakMap<Window, number>(
  'keyboard/keyboard-target/scroll-back-claimants',
  1,
);

/**
 * Counts a field that keeps itself above `win`'s keyboard until the returned
 * call. Once no such field is left, nothing is put back: its page is gone.
 */
function claimKeyboardScrollBack(win: Window): () => void {
  claimants.set(win, (claimants.get(win) ?? 0) + 1);
  let isClaimed = true;
  return () => {
    if (!isClaimed) {
      return;
    }
    isClaimed = false;
    const left = (claimants.get(win) ?? 1) - 1;
    claimants.set(win, left);
    if (left === 0) {
      stopsOf.get(win)?.();
      foldWaitsOf.get(win)?.();
    }
  };
}

function isRoot(scroller: Element): boolean {
  const doc = scroller.ownerDocument;
  return scroller === (doc.scrollingElement ?? doc.documentElement);
}

/** How far `scroller` is scrolled; for the root, the document's scroll. */
function scrollTopOf(scroller: Element, win: Window): number {
  return isRoot(scroller) ? win.scrollY : scroller.scrollTop;
}

function scrollTopTo(
  scroller: Element,
  top: number,
  behavior: ScrollBehavior,
  win: Window,
): void {
  if (isRoot(scroller)) {
    win.scrollTo({top, behavior});
  } else if (typeof scroller.scrollTo === 'function') {
    scroller.scrollTo({top, behavior});
  } else {
    scroller.scrollTop = top;
  }
}

/**
 * Records that Core scrolled `scroller` from `before` to `after`, to keep a
 * field above the keyboard. `after` is where a smooth scroll is headed, and
 * where the scroller is now for any other. When the keyboard goes, the
 * scroller goes back to where it was before Core's first scroll. A scroller
 * anyone else scrolls meanwhile keeps that scroll.
 */
function noteKeyboardScroll(
  scroller: Element,
  before: number,
  win: Window,
  after = scrollTopOf(scroller, win),
): void {
  const now = after;
  const added = addedScrolls.get(win)?.get(scroller);
  if (added == null) {
    if (Math.abs(now - before) >= 0.5) {
      const scrolls = addedScrolls.get(win) ?? watchKeyboardGo(win);
      scrolls.set(scroller, {from: before, at: now, isBack: false});
    }
  } else if (
    added.at != null &&
    Math.abs(before - added.at) <= KEYBOARD_EPSILON
  ) {
    added.at = now;
  } else {
    added.at = null;
  }
}

/**
 * Where Core's own scroll of `scroller` is headed, while the scroller lies on
 * its way there, as during a smooth rise. Null for a scroller Core did not
 * scroll, or one moved off that way.
 */
function keyboardScrollTarget(scroller: Element, win: Window): number | null {
  const added = addedScrolls.get(win)?.get(scroller);
  if (added?.at == null) {
    return null;
  }
  const now = scrollTopOf(scroller, win);
  const low = Math.min(added.from, added.at) - KEYBOARD_EPSILON;
  const high = Math.max(added.from, added.at) + KEYBOARD_EPSILON;
  return now >= low && now <= high ? added.at : null;
}

// The scroll back starts at the keyboard's report that it has gone, with no
// room left from a page the browser shrank for it. Safari on iOS sends that
// report about half a second after the blur that closes the keyboard, once
// the keyboard is down. There the scroll back starts at that blur, beside the
// keyboard's slide, and the report ends the watch. A change of the viewport's
// width, as when the phone turns, ends the watch. Nothing goes back: a scroll
// recorded at one width does not apply at another.
function watchKeyboardGo(win: Window): Map<Element, AddedScroll> {
  const scrolls = new Map<Element, AddedScroll>();
  const width = getResizedRoomWidth(win);
  const stopReports = subscribeKeyboardHeight(win, event => {
    if (event.type !== 'viewport') {
      return;
    }
    if (getResizedRoomWidth(win) !== width) {
      scrolls.clear();
      end();
    } else if (
      event.height <= KEYBOARD_EPSILON &&
      getResizedRoom(win) <= KEYBOARD_EPSILON
    ) {
      end();
      scrollBack(win, scrolls);
    }
  });
  let settle: number | null = null;
  const stopBlurs = isIosWebKit(win.document.defaultView) ? watchBlurs() : [];
  function watchBlurs(): (() => void)[] {
    return [
      // Heard so the stream counts the fingers on the screen.
      subscribeInput(win, 'touchstart', () => {}),
      subscribeInput(win, 'touchend', () => {}),
      subscribeInput(win, 'touchcancel', () => {}),
      subscribeInput(win, 'focusout', () => {
        if (settle != null) {
          win.clearTimeout(settle);
        }
        // Focus lands after the event. A field, or a frame or a shadow root
        // that may hold one, then keeps the keyboard up. A finger on the
        // screen can be a tap that brings it back, so the report decides.
        settle = win.setTimeout(() => {
          settle = null;
          const active = win.document.activeElement;
          if (
            getTouches(win).fingers === 0 &&
            (active == null ||
              (!bringsUpKeyboard(active) && !hidesField(active)))
          ) {
            scrollBackAtBlur(win, scrolls);
          }
        }, 0);
      }),
    ];
  }
  function end() {
    stopReports();
    for (const stop of stopBlurs) {
      stop();
    }
    if (settle != null) {
      win.clearTimeout(settle);
      settle = null;
    }
    addedScrolls.delete(win);
    stopsOf.delete(win);
  }
  addedScrolls.set(win, scrolls);
  stopsOf.set(win, end);
  return scrolls;
}

// Each scroller Core left where it put it heads back now, on the browser's
// own smooth scroll. A focus that brings the keyboard back stops it first
// (stopKeyboardScrollBack). Under Reduce Motion, the scroll waits for the
// report and lands at once.
function scrollBackAtBlur(
  win: Window,
  scrolls: Map<Element, AddedScroll>,
): void {
  for (const [scroller, added] of scrolls) {
    if (
      added.at == null ||
      reducedMotionFade(scroller) != null ||
      Math.abs(scrollTopOf(scroller, win) - added.at) > KEYBOARD_EPSILON
    ) {
      continue;
    }
    added.at = added.from;
    added.isBack = true;
    scrollTopTo(scroller, added.from, 'smooth', win);
  }
}

/**
 * Stops a scroll back that runs from the blur, where each scroller is now. A
 * field that gains focus during the keyboard's slide calls it before its
 * reveal, so the reveal goes on from there as Core's own scroll. The instant
 * scroll also ends a scroll back that a touch held, which Safari would run
 * after the field is placed.
 */
function stopKeyboardScrollBack(win: Window): void {
  for (const [scroller, added] of addedScrolls.get(win) ?? []) {
    if (!added.isBack) {
      continue;
    }
    const top = scrollTopOf(scroller, win);
    scrollTopTo(scroller, top, 'instant', win);
    added.at = top;
    added.isBack = false;
  }
}

// The browser's own smooth scroll carries the scroll back. iOS Safari applies
// a scripted scroll a frame late, so a scroll set each frame jitters there. A
// touch stops that scroll, so a person's scroll stands. Under Reduce Motion, or
// in a theme that reduces motion for everyone, the scroll lands at once.
function scrollBack(win: Window, scrolls: Map<Element, AddedScroll>): void {
  for (const [scroller, {from, at, isBack}] of scrolls) {
    if (at == null || isBack || !scroller.isConnected) {
      continue;
    }
    const top = scrollTopOf(scroller, win);
    if (Math.abs(top - at) <= KEYBOARD_EPSILON) {
      scrollTopTo(scroller, from, scrollBackBehavior(scroller), win);
    } else if (isRoot(scroller) && Math.abs(top - from) <= KEYBOARD_EPSILON) {
      awaitFoldedReveal(win, scroller, from, at);
    }
  }
  scrolls.clear();
}

function scrollBackBehavior(scroller: Element): ScrollBehavior {
  return reducedMotionFade(scroller) == null ? 'smooth' : 'instant';
}

// Firefox for Android can carry the reveal's document scroll as a visual-
// viewport offset. It then shows the document where it was before the
// reveal, and turns the offset back into a document scroll after the hide
// report. The scroll back waits for that one document scroll.
const FOLD_WAIT_MS = 1000;

// The first document scroll decides: one that lands where Core left the
// document is the browser's own, and the scroll back follows it. A touch, a
// keyboard that comes back, the field's page going, or the wait's end puts
// nothing back.
function awaitFoldedReveal(
  win: Window,
  scroller: Element,
  from: number,
  at: number,
): void {
  const doc = win.document;
  const stopScroll = subscribeInput(win, 'scroll', event => {
    if (event.target !== doc && event.target !== win) {
      return;
    }
    stop();
    if (Math.abs(scrollTopOf(scroller, win) - at) <= KEYBOARD_EPSILON) {
      scrollTopTo(scroller, from, scrollBackBehavior(scroller), win);
    }
  });
  const stopTouch = subscribeInput(win, 'touchstart', () => stop());
  const stopKeyboard = subscribeKeyboardHeight(win, event => {
    if (
      event.type === 'viewport' &&
      (event.height > KEYBOARD_EPSILON ||
        getResizedRoom(win) > KEYBOARD_EPSILON)
    ) {
      stop();
    }
  });
  const timer = win.setTimeout(stop, FOLD_WAIT_MS);
  foldWaitsOf.get(win)?.();
  foldWaitsOf.set(win, stop);
  function stop() {
    win.clearTimeout(timer);
    stopScroll();
    stopTouch();
    stopKeyboard();
    if (foldWaitsOf.get(win) === stop) {
      foldWaitsOf.delete(win);
    }
  }
}
