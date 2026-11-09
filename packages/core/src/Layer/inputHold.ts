// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file inputHold.ts
 * @input A layer root, what ends its hold (a promise or an animator handle),
 *   and the hold's scope
 * @output holdInput, holdsTouch, isInHeldLayer and isInputShield: input held
 *   away from a layer while it presents or dismisses
 * @position The Layer module's one input hold, for components whose layer
 *   presents under a finger
 *
 * SYNC: When modified, update inputHold.test.tsx,
 * __tests__/inputHold.interaction.browser.spec.ts and the holdInput callers.
 */

import {
  containsAlongFlatTree,
  deepActiveElement,
  parentAcrossShadow,
} from '../utils/flatTree';
import {
  getDownPresses,
  getLastMousePoint,
  getLastPointerType,
  subscribeInput,
  type MousePoint,
} from '../utils/inputStream';
import {isDocument, isElement, isHTMLElement, isNode} from '../utils/nodeType';
import {realmValue, sharedKey} from '../utils/sharedRealm';

/**
 * What a hold does. `'viewport'` and `'layer'` add one shield over the whole
 * viewport. `'layer'` also makes the layer's content inert and moves focus
 * out of it. `'surface'` shields only the layer's own box, and the page
 * around it stays live.
 */
export type InputHoldScope = 'viewport' | 'layer' | 'surface';

/** What ends a hold: a promise, or an animator handle (its `finished`). */
export type InputHoldEnd =
  PromiseLike<unknown> | {readonly finished: PromiseLike<unknown>};

export interface InputHoldOptions {
  /** The hold ends when this settles. */
  until: InputHoldEnd;
  /**
   * `'viewport'` while presenting, `'layer'` while dismissing, `'surface'`
   * while a non-modal layer presents.
   */
  scope: InputHoldScope;
}

interface HeldLayer {
  viewport: number;
  layer: number;
  surface: number;
  shield: HTMLElement | null;
  /** Whether the shield covers the viewport, or only the layer's box. */
  isShieldFull: boolean;
  /** The content a dismissal made inert, and whether each was already. */
  inertContent: Map<Element, boolean> | null;
  /**
   * The pointer ids of the finger and pen presses that were down when the
   * full shield came up. The shield leaves each one open where the stream
   * last heard it, until its press ends.
   */
  pressOpenings: Set<number>;
}

/** A document while any of its layers is held. */
interface HeldDocument {
  /** Its held layers, oldest first. */
  readonly layers: Set<Element>;
}

/** A document's press hold, while its window listeners are on. */
interface PressHold {
  /** New presses are held again (a layer is held). */
  hold: () => void;
  /** No new press is held; held ones are followed to their end. */
  release: () => void;
  /** Whether the press with this pointer id is held to its end. */
  holds: (pointerId: number) => boolean;
}

// Registered, so the gesture host sees the layer holds of a swizzled copy as
// it does the package's.
const {held, heldDocuments, pressHolds, liveShields} = realmValue(
  sharedKey('layer/input-hold', 1),
  () => ({
    held: new WeakMap<Element, HeldLayer>(),
    heldDocuments: new WeakMap<Document, HeldDocument>(),
    pressHolds: new WeakMap<Document, PressHold>(),
    liveShields: new WeakSet<Node>(),
  }),
);

/** Whether the shared input stream last delivered a mouse's pointer event. */
function isMouseLast(doc: Document | null): boolean {
  const view = doc?.defaultView;
  return view != null && getLastPointerType(view) === 'mouse';
}

/**
 * Whether `node` is the shield of a live hold. A hit test that must see past
 * held input takes the first element of `elementsFromPoint` that is not one.
 */
export function isInputShield(node: Node | null): boolean {
  return node != null && liveShields.has(node);
}

/**
 * Whether `target` is inside a held layer. It walks the flat tree as the
 * gesture host does: a slotted node goes to its slot, and a shadow root to
 * its host.
 */
export function isInHeldLayer(target: Node | null): boolean {
  for (
    let node: Node | null = target;
    node != null;
    node = parentAcrossShadow(node)
  ) {
    if (isElement(node) && held.has(node)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the gesture host holds `target` away for the current pointer. A
 * dismissing layer holds every pointer. A presenting layer holds every
 * pointer but a mouse, which keeps today's behavior. The host asks this for
 * every touch. So this module imports nothing from gestures/, and a
 * root-entry component can hold its layer without gesture code. With nothing
 * held, this answers false.
 */
export function holdsTouch(target: Node): boolean {
  const doc = isDocument(target) ? target : target.ownerDocument;
  // The gesture host asks for every touch: with nothing held, answer at once.
  if (doc == null || !heldDocuments.has(doc)) {
    return false;
  }
  // What lands on a shield is held, a mouse's press included.
  if (isInputShield(target)) {
    return true;
  }
  let isHeld = false;
  for (
    let node: Node | null = target;
    node != null;
    node = parentAcrossShadow(node)
  ) {
    const state = isElement(node) ? held.get(node) : undefined;
    if (state != null) {
      if (state.layer > 0) {
        return true;
      }
      isHeld = true;
    }
  }
  return isHeld && !isMouseLast(doc);
}

/**
 * Starts holding `layer`. A document's first held layer turns its press hold
 * on, with one stream subscription per event type, however many layers are
 * held. The hold subscribes to nothing while nothing is held.
 */
function startHolding(layer: Element): void {
  const doc = layer.ownerDocument;
  let state = heldDocuments.get(doc);
  if (state == null) {
    state = {layers: new Set()};
    heldDocuments.set(doc, state);
  }
  state.layers.add(layer);
  pressHoldFor(doc)?.hold();
}

/** Stops holding `layer`; after the document's last one, ends its holding. */
function stopHolding(layer: Element): void {
  heldDocuments.get(layer.ownerDocument)?.layers.delete(layer);
  liveLayers(layer.ownerDocument);
}

/**
 * The document's held layers still in it, oldest first. A layer that has
 * left the document holds nothing more. When none is left, `holdsTouch`
 * answers false and the press hold takes no new press. Its subscriptions end
 * once the presses it holds have ended.
 */
function liveLayers(doc: Document): Element[] {
  const state = heldDocuments.get(doc);
  if (state == null) {
    return [];
  }
  for (const layer of state.layers) {
    if (!layer.isConnected) {
      state.layers.delete(layer);
    }
  }
  if (state.layers.size > 0) {
    return [...state.layers];
  }
  heldDocuments.delete(doc);
  pressHolds.get(doc)?.release();
  return [];
}

const SWALLOWED = [
  'pointerdown',
  'pointerup',
  'touchstart',
  'touchend',
  'mousedown',
  'mouseup',
  'click',
  'contextmenu',
] as const;

const swallow = (event: Event) => {
  // A touch's start stays uncancelled: cancelling it would cancel the page's
  // pinch-zoom too. The shield's `touch-action: pinch-zoom` keeps a finger
  // from panning. A tap's mouse events and click land on the shield, which
  // swallows them.
  if (event.cancelable && event.type !== 'touchstart') {
    event.preventDefault();
  }
  event.stopPropagation();
};

/**
 * A transparent cover inside `layer`: of the viewport from the top layer
 * (`isFull`), or of the layer's own box alone. Because the cover is inside
 * the layer, a tap on it lands in the layer, and a light-dismissing layer
 * stays open.
 */
function addShield(layer: Element, isFull: boolean): HTMLElement {
  const shield = layer.ownerDocument.createElement('div');
  if (isFull) {
    shield.setAttribute('popover', 'manual');
  }
  shield.setAttribute('aria-hidden', 'true');
  Object.assign(shield.style, {
    position: isFull ? 'fixed' : 'absolute',
    inset: '0',
    width: isFull ? '100vw' : '100%',
    height: isFull ? '100vh' : '100%',
    // Above the layer's own content.
    zIndex: isFull ? 'auto' : '2147483647',
    maxWidth: 'none',
    maxHeight: 'none',
    margin: '0',
    padding: '0',
    border: '0',
    background: 'transparent',
    overflow: 'hidden',
    touchAction: 'pinch-zoom',
    // These two inherited properties decide hit-testing. A layer root can opt
    // out of hits, as a full-viewport layer does when a backdrop child takes
    // them. Inherited from such a root, they would let a held tap fall through
    // to the page.
    pointerEvents: 'auto',
    visibility: 'visible',
  });
  for (const type of SWALLOWED) {
    shield.addEventListener(type, swallow, {capture: true, passive: false});
  }
  layer.append(shield);
  liveShields.add(shield);
  if (isFull && typeof shield.showPopover === 'function') {
    try {
      shield.showPopover();
    } catch {
      // Not connected, or popovers unsupported: the shield still covers
      // what it can as a fixed element.
    }
  }
  return shield;
}

const MOUSE_OPENING_HALF_SIDE_PX = 2;

interface Opening {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The square opening around each point. Two openings that overlap become one
 * box that covers both: under the nonzero rule, the overlap of two openings
 * drawn the same way round would count twice and close again.
 */
function openings(points: ReadonlyArray<MousePoint>): Opening[] {
  const boxes: Opening[] = [];
  for (const {x, y} of points) {
    let box: Opening = {
      left: x - MOUSE_OPENING_HALF_SIDE_PX,
      right: x + MOUSE_OPENING_HALF_SIDE_PX,
      top: y - MOUSE_OPENING_HALF_SIDE_PX,
      bottom: y + MOUSE_OPENING_HALF_SIDE_PX,
    };
    for (let index = boxes.length - 1; index >= 0; index--) {
      const other = boxes[index];
      if (
        box.left < other.right &&
        other.left < box.right &&
        box.top < other.bottom &&
        other.top < box.bottom
      ) {
        box = {
          left: Math.min(box.left, other.left),
          right: Math.max(box.right, other.right),
          top: Math.min(box.top, other.top),
          bottom: Math.max(box.bottom, other.bottom),
        };
        boxes.splice(index, 1);
        index = boxes.length;
      }
    }
    boxes.push(box);
  }
  return boxes;
}

/**
 * Leaves the mouse a way through a presentation's shield that takes hits.
 * The browser hit-tests a press before any script reads its pointer. So a
 * mouse that has not moved since a finger raised the shield would press the
 * shield. A full shield leaves open the point where the stream last heard
 * the mouse. A shield over the layer's box alone stops taking hits, because
 * the box moves with the layer's entrance. A finger's press there is still
 * held, because the press hold judges each press by its own pointer. A
 * full shield also leaves open each finger or pen press that was down before
 * it came up (see `openToEarlierPresses`). A dismissal's shield keeps every
 * hit.
 */
function openToMouse(state: HeldLayer, doc: Document): void {
  const {shield} = state;
  if (shield == null) {
    return;
  }
  const view = doc.defaultView;
  const mouse = view == null ? null : getLastMousePoint(view);
  const downPresses = view == null ? null : getDownPresses(view);
  const presses: MousePoint[] = [];
  if (state.isShieldFull && downPresses != null) {
    for (const pointerId of state.pressOpenings) {
      const point = downPresses.get(pointerId);
      if (point != null) {
        presses.push(point);
      }
    }
  }
  if (
    (mouse == null && presses.length === 0) ||
    state.layer > 0 ||
    shield.style.pointerEvents === 'none'
  ) {
    shield.style.removeProperty('clip-path');
    return;
  }
  if (!state.isShieldFull) {
    shield.style.pointerEvents = 'none';
    return;
  }
  // The viewport, then each opening drawn the other way round. The nonzero
  // rule leaves the openings out, and a clipped-out area takes no hits.
  const outline = ['0 0', '100% 0', '100% 100%', '0 100%'];
  for (const {left, right, top, bottom} of openings(
    mouse == null ? presses : [mouse, ...presses],
  )) {
    outline.push(
      `0 ${top}px`,
      `${left}px ${top}px`,
      `${left}px ${bottom}px`,
      `${right}px ${bottom}px`,
      `${right}px ${top}px`,
      `0 ${top}px`,
    );
  }
  shield.style.clipPath = `polygon(${outline.join(', ')})`;
}

/**
 * Leaves an opening in a presentation's full shield at each finger or pen
 * press that went down before the shield came up. WebKit hit-tests the lift
 * of such a press again, even with pointer capture, and the lift would land
 * on the shield, inside the layer: a light-dismissing popover would stay
 * open. Through the opening, the lift reaches what is under it, so light
 * dismiss runs as with no hold. A press the press hold holds started during
 * an earlier hold, and gets no opening.
 */
function openToEarlierPresses(state: HeldLayer, doc: Document): void {
  const view = doc.defaultView;
  if (view == null) {
    return;
  }
  const pressHold = pressHolds.get(doc);
  for (const pointerId of getDownPresses(view).keys()) {
    if (pressHold?.holds(pointerId) !== true) {
      state.pressOpenings.add(pointerId);
    }
  }
}

/**
 * Holds input away from `layer` until `until` settles. Returns the release
 * (idempotent), for a hold that ends early. Holds on one layer stack, and
 * the layer comes back when the last one ends. Each event is judged by its
 * own pointer, never by the primary pointer. So a mouse on a touch screen
 * keeps its clicks during a presentation.
 */
export function holdInput(
  layer: Element,
  {until, scope}: InputHoldOptions,
): () => void {
  let state = held.get(layer);
  if (state == null) {
    state = {
      viewport: 0,
      layer: 0,
      surface: 0,
      shield: null,
      isShieldFull: false,
      inertContent: null,
      pressOpenings: new Set(),
    };
    held.set(layer, state);
  }
  startHolding(layer);
  const isFull = scope !== 'surface';
  const raisesFullShield =
    isFull && (state.shield == null || !state.isShieldFull);
  if (state.shield != null && isFull && !state.isShieldFull) {
    // A surface hold's shield gives way to one over the viewport.
    liveShields.delete(state.shield);
    state.shield.remove();
    state.shield = null;
  }
  if (state.shield == null) {
    state.isShieldFull = isFull || state.viewport + state.layer > 0;
    state.shield = addShield(layer, state.isShieldFull);
    // A presentation lets a mouse through from the start when the stream's
    // last pointer was a mouse. A press where the mouse rests then acts.
    if (scope !== 'layer' && isMouseLast(layer.ownerDocument)) {
      state.shield.style.pointerEvents = 'none';
    }
  }
  if (scope === 'viewport') {
    state.viewport += 1;
  } else if (scope === 'surface') {
    state.surface += 1;
  } else {
    state.layer += 1;
    // A dismissal's shield takes every hit, a mouse's included.
    state.shield.style.pointerEvents = 'auto';
    if (state.layer === 1) {
      state.inertContent = makeContentInert(layer, state.shield);
    }
  }
  if (raisesFullShield) {
    openToEarlierPresses(state, layer.ownerDocument);
  }
  openToMouse(state, layer.ownerDocument);
  let isReleased = false;
  const release = () => {
    if (isReleased) {
      return;
    }
    isReleased = true;
    const current = held.get(layer);
    if (current == null) {
      return;
    }
    if (scope === 'viewport') {
      current.viewport -= 1;
    } else if (scope === 'surface') {
      current.surface -= 1;
    } else {
      current.layer -= 1;
      if (current.layer === 0 && current.inertContent != null) {
        restoreInert(current.inertContent);
        current.inertContent = null;
      }
    }
    if (
      current.viewport === 0 &&
      current.layer === 0 &&
      current.surface === 0
    ) {
      if (current.shield != null) {
        liveShields.delete(current.shield);
        current.shield.remove();
      }
      held.delete(layer);
      stopHolding(layer);
    }
  };
  const end = 'finished' in until ? until.finished : until;
  void Promise.resolve(end).then(release, release);
  return release;
}

const HELD_POINTERS: ReadonlySet<string> = new Set(['touch', 'pen']);

/**
 * How long after a held press ends its click and compatibility mouse events
 * still count as its own (WebKit sends them after `touchend`).
 */
const CLICK_WINDOW_MS = 800;

/** How long a held press is followed past the hold's end, at most. */
const STRAY_PRESS_MS = 10_000;

const POINTER_EVENTS = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
] as const;
const TOUCH_EVENTS = [
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel',
] as const;
const PRESS_EVENTS = [
  'mousedown',
  'mouseup',
  'click',
  'auxclick',
  'dblclick',
  'contextmenu',
] as const;

/** The document's press hold, turned on if it is off. */
function pressHoldFor(doc: Document): PressHold | null {
  let hold = pressHolds.get(doc) ?? null;
  if (hold == null) {
    hold = createPressHold(doc);
    if (hold != null) {
      pressHolds.set(doc, hold);
    }
  }
  return hold;
}

/**
 * Holds each finger or pen press that lands in `doc`'s window while any of
 * its layers is held. Each press is held to its own end, even past the
 * hold's end. A moving mouse passes through a presentation's shield. The
 * hold hears input through the shared input stream, before its other
 * subscribers, and stops each held event there. So no document or element
 * listener hears it, and neither does press feedback or the gesture host.
 * There is one per document. Its subscriptions end once nothing is held and
 * the held presses and their clicks have ended.
 */
function createPressHold(doc: Document): PressHold | null {
  const view = doc.defaultView;
  if (view == null) {
    return null;
  }
  /** Whether a new press is held: until the release. */
  let isHolding = true;
  let isListening = true;
  /** The held presses still down, by pointer id and by touch identifier. */
  const pointers = new Set<number>();
  const touches = new Set<number>();
  /** Whose press the next click is: a held one's, or any other's. */
  let lastPress: 'held' | 'free' | null = null;
  /** Until when a click with no pointer type is a held press's. */
  let clickUntil = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const now = () => view.performance.now();
  const isPressDown = () => pointers.size > 0 || touches.size > 0;

  const swallow = (event: Event) => {
    if (event.cancelable) {
      event.preventDefault();
    }
    event.stopImmediatePropagation();
  };

  /** After the release: stops once the last held press and its click end. */
  const settle = () => {
    if (isHolding || !isListening) {
      return;
    }
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    if (isPressDown()) {
      timer = setTimeout(stop, STRAY_PRESS_MS);
      return;
    }
    const wait = clickUntil - now();
    if (wait > 0) {
      timer = setTimeout(stop, wait);
    } else {
      stop();
    }
  };

  /** Whether a layer is still held (one that left the document is not). */
  const holdsNewPress = () => {
    if (isHolding) {
      liveLayers(doc);
    }
    return isHolding;
  };

  /**
   * Whether a new press that lands on `target` is held. While a layer is held
   * over the viewport, a press anywhere is held. While a layer is held only
   * to its box (a `'surface'` hold), only a press on the layer is held. The
   * page around it stays live.
   */
  const holdsPressAt = (target: EventTarget | null) => {
    if (!holdsNewPress()) {
      return false;
    }
    for (const layer of liveLayers(doc)) {
      const state = held.get(layer);
      if (state == null) {
        continue;
      }
      if (state.viewport > 0 || state.layer > 0) {
        return true;
      }
      if (
        state.surface > 0 &&
        isNode(target) &&
        containsAlongFlatTree(layer, target)
      ) {
        return true;
      }
    }
    return false;
  };

  const pressEnded = () => {
    clickUntil = now() + CLICK_WINDOW_MS;
    settle();
  };

  /** A shield takes hits for a finger or a pen, not for a moving mouse. */
  const followPointer = (pointerType: string) => {
    for (const layer of liveLayers(doc)) {
      const state = held.get(layer);
      if (state?.shield == null) {
        continue;
      }
      const value =
        pointerType === 'mouse' && state.layer === 0 ? 'none' : 'auto';
      if (state.shield.style.pointerEvents !== value) {
        state.shield.style.pointerEvents = value;
      }
      openToMouse(state, doc);
    }
  };

  /**
   * A held press that landed past the shield, which had let a mouse through,
   * is captured to the shield. Its release then stays the hold's, and a
   * light-dismissing layer stays open. A synthetic press has no active
   * pointer to capture, so `setPointerCapture` throws NotFoundError. Its
   * events are swallowed all the same.
   */
  const captureToShield = (event: PointerEvent) => {
    if (!event.isTrusted) {
      return;
    }
    const top = liveLayers(doc).at(-1);
    const shield = top == null ? null : held.get(top)?.shield;
    if (shield == null || isInputShield(event.target as Node | null)) {
      return;
    }
    shield.setPointerCapture(event.pointerId);
  };

  /**
   * An earlier press's opening follows it, and closes when it ends. The
   * stream has already recorded the event's point when the hold hears it.
   */
  const followEarlierPress = (event: PointerEvent) => {
    const {pointerId, type} = event;
    for (const layer of liveLayers(doc)) {
      const state = held.get(layer);
      if (state == null || !state.pressOpenings.has(pointerId)) {
        continue;
      }
      if (type === 'pointerup' || type === 'pointercancel') {
        state.pressOpenings.delete(pointerId);
      }
      openToMouse(state, doc);
    }
  };

  const onPointer = (event: Event): boolean => {
    const {pointerId, pointerType, type} = event as PointerEvent;
    if (
      HELD_POINTERS.has(pointerType) &&
      type !== 'pointerdown' &&
      !pointers.has(pointerId)
    ) {
      followEarlierPress(event as PointerEvent);
    }
    // A finger or a pen raises the shields. Only a mouse that moves with no
    // button down lowers them. So a mouse press that began on a shield stays
    // the shield's to its end. Otherwise its click would go to the two
    // targets' common ancestor, a dialog that reads it as a backdrop click.
    const isFollowed = HELD_POINTERS.has(pointerType)
      ? type === 'pointerdown' || type === 'pointermove'
      : pointerType === 'mouse' &&
        type === 'pointermove' &&
        (event as PointerEvent).buttons === 0;
    if (isFollowed && holdsNewPress()) {
      followPointer(pointerType);
    }
    if (type === 'pointerdown') {
      if (!HELD_POINTERS.has(pointerType) || !holdsPressAt(event.target)) {
        // A mouse's press, or one after the hold: its click is its own, and a
        // held press with its id ended unheard.
        pointers.delete(pointerId);
        lastPress = 'free';
        clickUntil = -Infinity;
        settle();
        return false;
      }
      pointers.add(pointerId);
      lastPress = 'held';
      captureToShield(event as PointerEvent);
    } else if (!pointers.has(pointerId)) {
      return false;
    }
    // Canceling the press keeps the browser from sending its compatibility
    // mouse events, and with them a focus move.
    swallow(event);
    if (type === 'pointerup' || type === 'pointercancel') {
      pointers.delete(pointerId);
      pressEnded();
    }
    return true;
  };

  const onTouch = (event: Event): boolean => {
    const {changedTouches, touches: down, type} = event as TouchEvent;
    const changed = Array.from(changedTouches);
    if (type === 'touchstart') {
      // A held touch that the screen no longer has ended unheard. Its target,
      // the shield, left the document at the release, so its end reached no
      // listener here.
      const live = new Set(Array.from(down, touch => touch.identifier));
      for (const identifier of touches) {
        if (!live.has(identifier)) {
          touches.delete(identifier);
        }
      }
      const heldTouches = changed.filter(touch => holdsPressAt(touch.target));
      if (heldTouches.length === 0) {
        // A touch after the hold, or one beside a layer held only to its
        // box, is a new one, whatever its identifier.
        for (const touch of changed) {
          touches.delete(touch.identifier);
        }
        lastPress = 'free';
        clickUntil = -Infinity;
        settle();
        return false;
      }
      for (const touch of heldTouches) {
        touches.add(touch.identifier);
      }
      lastPress = 'held';
      // Never canceled: canceling a touch's start would cancel the page's
      // pinch-zoom with it.
      event.stopImmediatePropagation();
      return true;
    }
    if (!changed.some(touch => touches.has(touch.identifier))) {
      return false;
    }
    if (type === 'touchmove') {
      event.stopImmediatePropagation();
      // One finger pans nothing; two still zoom the page.
      if (down.length === 1 && event.cancelable) {
        event.preventDefault();
      }
      return true;
    }
    // A canceled end sends no click and no compatibility mouse events.
    swallow(event);
    for (const touch of changed) {
      touches.delete(touch.identifier);
    }
    pressEnded();
    return true;
  };

  const onPress = (event: Event): boolean => {
    // A click a key or assistive technology sends counts no press.
    if ((event as MouseEvent).detail === 0) {
      return false;
    }
    // A click that names its pointer is judged by that pointer. A
    // compatibility mouse event, or a click sent as a plain mouse event,
    // belongs to the last press.
    const {pointerType} = event as Partial<PointerEvent>;
    const isHeldPress =
      lastPress === 'held' &&
      (pointerType == null ||
        pointerType === '' ||
        HELD_POINTERS.has(pointerType));
    if (isHeldPress && (isPressDown() || now() <= clickUntil)) {
      swallow(event);
      return true;
    }
    return false;
  };

  function stop(): void {
    if (!isListening) {
      return;
    }
    isListening = false;
    if (pressHolds.get(doc) === pressHold) {
      pressHolds.delete(doc);
    }
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    for (const unsubscribe of unsubscribers.splice(0)) {
      unsubscribe();
    }
  }

  // A touch's start and cancel are never canceled, so their subscriptions
  // keep the stream passive for them. The hold hears each event first, so a
  // held one reaches no other subscriber: press feedback and the gesture host
  // never hear it.
  const unsubscribers = [
    ...POINTER_EVENTS.map(type =>
      subscribeInput(view, type, onPointer, {cancels: true, first: true}),
    ),
    ...TOUCH_EVENTS.map(type =>
      subscribeInput(view, type, onTouch, {
        cancels: type === 'touchmove' || type === 'touchend',
        first: true,
      }),
    ),
    ...PRESS_EVENTS.map(type =>
      subscribeInput(view, type, onPress, {cancels: true, first: true}),
    ),
  ];

  const pressHold: PressHold = {
    hold() {
      isHolding = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
    release() {
      if (!isHolding) {
        return;
      }
      isHolding = false;
      settle();
    },
    holds: pointerId => pointers.has(pointerId),
  };
  return pressHold;
}

/**
 * Makes the layer's content inert, except the shield, and moves focus out of
 * it. An element that turns inert while focused keeps its focus and its key
 * activation. Enter and Space still click such a button until the engine's
 * focus fixup runs, if it runs. Blurring it leaves focus on the document, as
 * that fixup does. The layer element itself stays live. An inert subtree is
 * no hit target, so the shield inside the layer still catches every hit.
 */
function makeContentInert(
  layer: Element,
  shield: Element,
): Map<Element, boolean> {
  const content = new Map<Element, boolean>();
  for (const child of layer.children) {
    if (child !== shield) {
      content.set(child, child.hasAttribute('inert'));
      child.setAttribute('inert', '');
    }
  }
  const focused = deepActiveElement(layer.ownerDocument);
  if (
    isHTMLElement(focused) &&
    [...content.keys()].some(child => containsAlongFlatTree(child, focused))
  ) {
    focused.blur();
  }
  return content;
}

function restoreInert(content: Map<Element, boolean>): void {
  for (const [element, wasInert] of content) {
    if (!wasInert) {
      element.removeAttribute('inert');
    }
  }
}
