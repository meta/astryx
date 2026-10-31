// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file GestureHost.ts
 * @input DOM touch, pointer, click, contextmenu, scroll and focus events of
 *   one document; elements with recognizers and consumers attached
 * @output Exports GestureHost (the DOM side of the gesture system) and
 *   getGestureHost (one host per document)
 * @position Browser adapter of packages/core/src/gestures: turns real events
 *   into GestureArena input, and carries out what the arena decides
 *
 * FOR EVERY POINTER
 *
 * - Recognizers and press consumers attach for a mouse, a pen and a finger
 *   alike (`spec:AST-094` FR43, FR19). Where the primary pointer is coarse
 *   the host listens while something enabled could take a touch. Where it
 *   is fine, each element with an enabled recognizer or consumer keeps one
 *   passive `pointerdown` listener and the page has none; a press on it (a
 *   mouse's primary button, a pen, or a finger, whose `pointerdown` comes
 *   before its `touchstart`) installs the host's page listeners, which go
 *   once that press's contacts end and the arena has decided them, a tap
 *   that waits on a double tap included (FR24). After the last detach the
 *   host holds nothing: no listener, note, frame or timer (releaseWhenIdle).
 *   Under every pointer, an element whose recognizer claims a moving finger
 *   also keeps its blocking `touchmove`, a listener FR24 counts apart from
 *   the press's one.
 * - A press consumer takes a mouse press as a press (DEC-21): PressTracker's
 *   fine-pointer profile paints at once and brakes no scroll (FR11).
 * - The host follows the query (a tablet docking or undocking a mouse):
 *   turning fine cancels every touch in flight.
 * - `perEventPointer` (AttachOptions), from before FR43, changes nothing.
 *
 * INPUT CHANNELS
 *
 * - Fingers begin and end with Touch Events: they are the only cancelable
 *   channel (a pointer event's preventDefault cannot stop a scroll or a
 *   click), they keep arriving after the browser takes a pan (which a
 *   watcher following the scroll to the lift needs, `spec:AST-094` FR20,
 *   DEC-7), and every event lists all the fingers at once. A
 *   finger's movement is sampled from ONE channel: its `pointermove`s, once
 *   its pointerdown has paired with its touchstart (by target and
 *   position), since Chromium sends no `touchmove` until a finger has
 *   travelled about 16 px while a tap fails and a pan begins at 10; touch
 *   events sample only a finger no pointer event reported. The other
 *   channel keeps its control duties but feeds no sample.
 * - A finger's events go to the element it landed on even after that
 *   element leaves the document, and then never reach the document. Each
 *   tracked finger's target therefore gets its own listeners, and a finger
 *   the events say is no longer down is cancelled, so a re-rendered or
 *   removed target never strands a gesture.
 * - Mice and pens come from Pointer Events, with coalesced samples for
 *   velocity. A pen on an iPad also produces `stylus` touches; those are left
 *   to the pointer path, except that a claimed pen's stylus moves are
 *   cancelled as a finger's.
 * - `pointercancel` on a finger is the browser saying it took that finger
 *   for its own pan or zoom; so is a `touchmove` that can no longer be
 *   cancelled where `touch-action` let the browser pan, and a scroll above
 *   the touch.
 *
 * FINGERS
 *
 * - The host keeps one record of where each finger on the screen landed
 *   (`fingersDown()`). Finger scrolls (fingerScroll.ts) read it, and a
 *   scroll lock's page hold (pageHold.ts) asks which touches a recognizer
 *   owns; both live in their own modules, so a page that needs neither
 *   never ships them.
 *
 * TOUCHES ON MOVING ELEMENTS
 *
 * - iOS WebKit hit-tests an element a compositor animation moves where the
 *   animation started. There, at touch-down, the host resolves the moving
 *   elements (motion/presentation.ts: one style write each) and asks the
 *   engine again, so a contact goes to what is drawn under it; press
 *   trackers read `presentedRect`, and a retargeted tap clicks what it
 *   touched once, with the engine's own click cancelled or swallowed.
 *
 * WHAT THE BROWSER IS TOLD
 *
 * - Each element gets the `touch-action` its recognizers leave the browser
 *   (touchAction.ts), never wider than the element's own value (a caller's
 *   explicit `touch-action` stays in force), set inline when they attach and
 *   restored when they detach.
 * - While a finger or a pen is down, text selection and the touch callout
 *   are off only where the hold does something (`spec:AST-094` FR41): on the
 *   elements of recognizers that bring a `selectionLock`, and on a non-text
 *   input under the finger inside them (WebKit's own style makes every
 *   input selectable); restored when the contact ends. A finger or a pen
 *   takes it under any primary pointer; a mouse never does (`spec:AST-017`
 *   FR59).
 * - Each element with a recognizer that can claim a touch while it moves (a
 *   pan, a swipe, a long press that then drags, a pinch) gets a
 *   NON-passive `touchmove` listener that cancels the event only while a
 *   recognizer owns one of its touches (a pan claims when it begins, at
 *   UIKit's 10 pt, `spec:AST-094` FR17). Nothing else is ever cancelled, so a
 *   touch nobody claims scrolls exactly as it would without the system. The
 *   known cost: a scroll that BEGINS on such an element waits for a busy main
 *   thread (measured in iOS Safari; a passive listener would hand every
 *   diagonal to the scroll instead). Elements whose recognizers only claim
 *   at the lift (taps), recognizers that never claim (`claimsTouches` false)
 *   and press consumers get no blocking listener, and the listener a
 *   finger's target gets at touch-down is passive for them too, so a scroll
 *   starting on them never waits.
 * - The browser took a finger on `pointercancel`, on its first uncancelable
 *   `touchmove` where it could pan, or on a scroll above it once the finger
 *   has travelled the slop; a scroll under a finger that has not moved is
 *   the page's own and leaves the touch alone.
 * - A lift whose click must not happen cancels its `touchend` (no click, no
 *   compatibility mouse events) and arms the shared click guard
 *   (utils/clickGuard.ts, the menu press model's too) for the browser's next
 *   click; a click held for a recognizer that may still recognize is
 *   replayed if they all fail. Keyboard and assistive-technology clicks
 *   (`detail === 0`) always pass.
 * - A `contextmenu` while a recognizer owns a touch is cancelled, so a long
 *   press never also opens the browser's menu.
 * - When the app loses focus (a window blur, a hidden page), every touch in
 *   flight is cancelled, as in UIKit; a finger the browser keeps alive lifts
 *   on nothing: its `touchend` is cancelled (`spec:AST-094` FR28).
 *
 * SSR-safe: nothing touches `window` or `document` until something attaches.
 *
 * SYNC: When modified, update GestureHost.test.ts and README.md.
 */

import {isRtlElement} from '../hooks/isRtlElement';
import {
  presentedElements,
  presentedOffsetOf,
  resolvePresented,
  watchPresentedElements,
} from '../motion/presentation';
import {UIKIT_PRESS, UIKIT_TAP} from '../motion/uikit/gestures';
import {
  browserClock,
  GestureArena,
  type ArenaBeganInput,
  type ClickDisposition,
  type GestureArenaOptions,
  type GestureClock,
} from './GestureArena';
import type {GestureRecognizer, SelectionLock} from './GestureRecognizer';
import type {PressBounds} from './PressTracker';
import type {PanGestureRecognizer} from './PanGestureRecognizer';
import {createNativeScrollProbe, parentAcrossShadow} from './nativeScroll';
import {containsAlongFlatTree} from '../utils/flatTree';
import {isIosWebKit} from '../utils/touchQueries';
import {
  type WheelBoundary,
  type WheelSegment,
  WheelSegmenter,
} from './wheelSegmenter';
import {
  gestureHostStyle,
  type GestureHostStyle,
  intersectTouchAction,
} from './touchAction';
import {
  markTouchAction,
  TOUCH_ACTION_ATTRIBUTE,
  unmarkTouchAction,
} from './touchActionRule';
import type {ScreenEdgePanGestureRecognizer} from './ScreenEdgePanGestureRecognizer';
import type {
  GestureEnvironment,
  GestureTouch,
  PointerKind,
  ScrollType,
  TouchBeganInput,
  TouchConsumer,
  TouchInput,
  TouchSample,
} from './types';
import {internals} from './recognizerInternals';
import {
  armClickGuard,
  disarmClickGuard,
  withoutClickGuard,
} from '../utils/clickGuard';
import {subscribeInput} from '../utils/inputStream';
import {isPrimaryClick} from '../utils/primaryClick';
import {locksSelectionFor} from '../utils/selectionLock';
import {isCoarsePointer, watchCoarsePointer} from '../utils/coarsePointer';
import {gestureHosts} from './hostRegistry';

interface Registration {
  readonly recognizers: GestureRecognizer[];
  consumer: TouchConsumer | null;
  /**
   * Where fingers come from their pointer events, whether the element
   * carries the host's blocking `touchend` handler, which cancels a claimed
   * finger's lift (`spec:AST-094` FR21).
   */
  hasTouchEndListener: boolean;
  /** Whether the element carries the host's shared blocking touchmove handler. */
  hasTouchMoveListener: boolean;
  /** Whether the element carries the host's wheel handler (FR43). */
  hasWheelListener: boolean;
  /** Inline values the host replaced, to restore on detach. */
  readonly savedStyle: Map<string, string>;
  /**
   * What the element's own stylesheet gives it, read in a frame for the
   * derived value the host marked then: `null` where the host's rule is in
   * force (the author sets nothing else); the host never allows more than
   * the author does. `null` before the read.
   */
  authorTouchAction: {derived: string; author: string | null} | null;
  manageStyle: boolean;
  /** An action group (`family:action-groups` FR5). */
  actionGroup: boolean;
  /** The attachments that asked for the action group; it lasts while one does. */
  actionGroupAsks: number;
}

export interface GestureHostOptions {
  /** The arena's clock; tests pass a manual one. */
  clock?: GestureClock;
  /**
   * Where fingers come from: Touch Events where the browser has them
   * (`auto`), or Pointer Events only.
   */
  inputMode?: 'auto' | 'pointer-events';
  /** Every recognizer transition, for debugging and tests. */
  onTransition?: GestureArenaOptions['onTransition'];
  /**
   * Send a contact to what is drawn while a compositor animation moves an
   * element (motion/presentation.ts): `auto` where the engine hit-tests such
   * an element where its animation started (iOS WebKit); `always` or
   * `never` for tests. @default 'auto'
   */
  presentedHitTesting?: 'auto' | 'always' | 'never';
  /**
   * Whether the primary pointer is coarse (a phone, a tablet). Gestures
   * attach for every pointer (`spec:AST-094` FR43); where it is fine, an
   * element that uses a gesture keeps one passive `pointerdown` listener
   * (beside a claiming recognizer's blocking `touchmove`, FR19) and the
   * page's listeners last only a press (FR24).
   * @default `(pointer: coarse)` on the document's window
   */
  isPrimaryPointerCoarse?: () => boolean;
}

export interface AttachOptions {
  /**
   * Let the host set the element's styles: its `touch-action`, and the
   * selection and callout lock a hold that does something keeps while it is
   * held (`spec:AST-094` FR41). With false the caller keeps both.
   * @default true
   */
  manageStyle?: boolean;
  /**
   * Accepted and ignored: every attachment reads each event's pointer
   * (`spec:AST-094` FR43). Kept so callers written before FR43 compile.
   * @deprecated
   */
  perEventPointer?: boolean;
  /**
   * The element is an action group, sibling actions a held pointer slides
   * across (`family:action-groups` FR5). It is served like every
   * attachment, for every pointer (`spec:AST-094` FR43). @default false
   */
  actionGroup?: boolean;
}

const STYLE_PROPERTIES: Record<keyof GestureHostStyle, string> = {
  touchAction: 'touch-action',
  WebkitTouchCallout: '-webkit-touch-callout',
  WebkitUserSelect: '-webkit-user-select',
  userSelect: 'user-select',
};

/**
 * A CSS-wide keyword, which names no touch-action of its own: the value in
 * force resolves it (`initial` and `unset` to `auto`, `inherit` to the
 * parent's).
 */
function isCssWideKeyword(value: string): boolean {
  return CSS_WIDE_KEYWORDS.has(value.trim().toLowerCase());
}

const CSS_WIDE_KEYWORDS: ReadonlySet<string> = new Set([
  'initial',
  'inherit',
  'unset',
  'revert',
  'revert-layer',
]);

/**
 * Run `task` in the next frame, before it paints: a read there styles what
 * the frame must style anyway, and its writes are what the frame shows.
 */
function inNextFrame(view: Window | null, task: () => void): () => void {
  if (view != null && typeof view.requestAnimationFrame === 'function') {
    const frame = view.requestAnimationFrame(task);
    return () => view.cancelAnimationFrame(frame);
  }
  const timeout = setTimeout(task, 0);
  return () => clearTimeout(timeout);
}

/** An armed press tracker's own element listeners: they never cancel. */
const PASSIVE_CAPTURE = {capture: true, passive: true} as const;

/**
 * Whether a recognizer can take a touch while it moves, and so needs the
 * blocking `touchmove` listener that stops the browser's pan. A tap claims
 * only at the lift (it fails once the finger travels), so it needs none.
 */
function claimsWhileMoving(recognizer: GestureRecognizer): boolean {
  return (
    recognizer.claimsTouches &&
    internals(recognizer).acceptsTouchInput &&
    internals(recognizer).family !== 'tap'
  );
}

/**
 * Whether a recognizer takes a contact that comes with Touch Events and a
 * long press's contextmenu: a finger's or a pen's. A scroll-only recognizer
 * (`allowedPointerTypes: []`) and a mouse-only one take neither.
 */
function takesTouchContacts(recognizer: GestureRecognizer): boolean {
  const types = recognizer.allowedPointerTypes;
  return types == null || types.has('touch') || types.has('pen');
}

/**
 * A pan (or a pan subclass), told apart by its family rather than its class,
 * so a page that constructs no pan never ships PanGestureRecognizer.
 */
function isPanRecognizer(
  recognizer: GestureRecognizer,
): recognizer is PanGestureRecognizer {
  return internals(recognizer).family === 'pan';
}

/**
 * A screen-edge pan, told apart by its kind (architecture:react-component-runtime
 * INV13), so the host can report its layout changes without importing it.
 */
function asScreenEdgePan(
  recognizer: GestureRecognizer,
): ScreenEdgePanGestureRecognizer | null {
  return recognizer.kind === 'screenEdgePan'
    ? (recognizer as ScreenEdgePanGestureRecognizer)
    : null;
}

type StylusTouch = Touch & {touchType?: string};

function hasStylusTouch(event: TouchEvent): boolean {
  return touchesOf(event.changedTouches).some(
    touch => (touch as StylusTouch).touchType === 'stylus',
  );
}

interface PlacedContact {
  readonly x: number;
  readonly y: number;
  readonly target: unknown;
}

/**
 * How long a claimed finger's lift waits for its `touchend`, ms. The touchend
 * follows its pointerup in the same frame; a browser that sends pointer events
 * alone for a finger never sends it, and the record goes.
 */
const CLAIMED_LIFT_MS = 500;

/** At most this many claimed lifts wait for their `touchend` at once (FR24). */
const CLAIMED_LIFT_LIMIT = 8;

/** A touchstart and a pointerdown describe one finger: same target, same spot. */
function isSamePlace(a: PlacedContact, b: PlacedContact): boolean {
  return (
    a.target === b.target &&
    Math.abs(a.x - b.x) <= 1 &&
    Math.abs(a.y - b.y) <= 1
  );
}

function isPointerKind(type: string): type is PointerKind {
  return type === 'touch' || type === 'mouse' || type === 'pen';
}

/**
 * What an event, or one of its touches, landed on. Inside an open shadow root
 * the document's listeners see the shadow host, in `event.target` and in a
 * touch's `target` alike, while the composed path starts at the element
 * itself. A touch whose target is not the event's (another finger) keeps its
 * own.
 */
function landedOn(
  event: Event,
  retargeted: EventTarget | null = event.target,
): EventTarget | null {
  if (retargeted !== event.target) {
    return retargeted;
  }
  return event.composedPath()[0] ?? retargeted;
}

/**
 * How long after its last event a wheel gesture ends, ms: the web reports no
 * wheel phases, so a quiet wheel is a lifted one. Provisional (owner
 * question on `spec:AST-094` FR43).
 */
const WHEEL_END_MS = 100;
/**
 * How long after its last event a trackpad scroll that a pan follows
 * vertically ends, ms (a sheet's pull): a slow drag's stream pauses longer
 * than WHEEL_END_MS between events. Provisional (owner question on
 * `spec:AST-094` FR43).
 */
const WHEEL_FOLLOW_END_V_MS = 180;
/**
 * The same horizontally, ms (a pager's or a row's swipe), whose slow
 * swipes pause longer still. Provisional (owner question on FR43).
 */
const WHEEL_FOLLOW_END_MS = 220;
/** A line-mode wheel's line, px, as the platforms scroll it. */
const WHEEL_LINE_PX = 40;
/** The span a ctrl-wheel pinch's two contacts start at, px. */
const WHEEL_PINCH_SPAN = 100;

/** A wheel gesture: the contacts it drives in the arena, or none where the page keeps it. */
interface WheelGesture {
  readonly kind: 'pan' | 'pinch';
  /** A mouse wheel's notches, or a trackpad's continuous scroll. */
  readonly scrollType: ScrollType;
  readonly ids: ReadonlyArray<number>;
  /** A pan's contact, or a pinch's center. */
  x: number;
  y: number;
  /** A pinch's span between its two contacts. */
  span: number;
  /** The latest wheel's time. */
  last: number;
  timer: unknown;
  /** The recognizers that took it; none where the page keeps it. */
  readonly takers: ReadonlyArray<GestureRecognizer>;
  /** A swipe its pans take as one step (`wheelStep`), not followed. */
  step?: WheelStep;
  /** The step's contact, begun only when the step commits. */
  stepBegin?: Omit<ArenaBeganInput, 'time'>;
  /** A trackpad scroll a pan follows, until its fingers lift. */
  follow?: WheelFollow;
}

/** A trackpad scroll a pan follows: where its fingers lift, and what waits until then. */
interface WheelFollow {
  /** The fingers lifted: the momentum after them never moves the pan. */
  lifted: boolean;
  /**
   * Shrinking deltas held until the splitter decides: the fingers' when
   * larger ones follow, the start of momentum when it reads the lift.
   */
  heldX: number;
  heldY: number;
  /** The time of the fingers' last move the pan took. */
  lastMove: number;
  /** The fingers' travel as of that move: the contact without any held delta. */
  trueX: number;
  trueY: number;
  /** Where the pan was shown at that move, which the undecided stretch moves on from. */
  baseX: number;
  baseY: number;
  /** The fingers' speed at that move, content px per ms. */
  speedX: number;
  speedY: number;
  /** How long after its last event it ends, ms. */
  readonly endMs: number;
}

/** One swipe taken as one step (`wheelStep`). */
interface WheelStep {
  readonly axis: 'x' | 'y';
  /** Travel so far along the axis, px (content direction). */
  travel: number;
  /** The swipe's direction once it has one. */
  sign: number;
  /** Whether the step was played and its contact ended. */
  committed: boolean;
  /** Travel back against the committed step, within this gesture. */
  back?: number;
  /** Whether the one step back to rest was played. */
  reversed?: boolean;
  /** Wheels seen; a step needs a stream (two or more). */
  count: number;
}

/** Travel along the axis that commits one step, px. */
const WHEEL_STEP_PX = 24;
/**
 * A slow swipe's stream has gaps longer than WHEEL_END_MS; travel
 * in the same direction carries across a gap this short, so a slow
 * continuous movement still commits.
 */
const WHEEL_STEP_CARRY_MS = 450;

/**
 * A provisional lead `debt` (what a followed pan shows past the fingers'
 * travel, or short of it) after a move of `moved`: half the move is
 * absorbed, so the pan keeps moving the way the fingers do.
 */
function absorbedDebt(debt: number, moved: number): number {
  return Math.sign(debt) * Math.max(0, Math.abs(debt) - Math.abs(moved) / 2);
}

/**
 * `target` where it is ahead of `shown` in the direction of `speed`, else
 * `shown`: a reconcile that never steps back.
 */
function ahead(shown: number, target: number, speed: number): number {
  return speed === 0 || (target - shown) * Math.sign(speed) > 0
    ? target
    : shown;
}

/**
 * A wheel's deltas in CSS px: a line is `WHEEL_LINE_PX`, a page the
 * viewport.
 */
function wheelPixels(
  wheel: WheelEvent,
  view: Window | null,
): {dx: number; dy: number} {
  if (wheel.deltaMode === 1) {
    return {dx: wheel.deltaX * WHEEL_LINE_PX, dy: wheel.deltaY * WHEEL_LINE_PX};
  }
  if (wheel.deltaMode === 2) {
    return {
      dx: wheel.deltaX * (view?.innerWidth ?? 0),
      dy: wheel.deltaY * (view?.innerHeight ?? 0),
    };
  }
  return {dx: wheel.deltaX, dy: wheel.deltaY};
}

/**
 * The web's best reading of what scrolled: a mouse wheel's notches
 * (`discrete`) or a trackpad's scroll (`continuous`). What it cannot tell
 * apart counts as a mouse wheel's, which a pan that takes only a trackpad's
 * scroll leaves to the page. A mouse wheel's: a line- or page-mode delta; a
 * pixel delta a hair off a whole pixel (a mouse wheel on Windows); a scroll
 * that carries no legacy `wheelDelta` (an engine that sends none); a delta
 * that is not a third of its legacy `wheelDelta`; or a 120 tick over a 40 px
 * delta. A trackpad's precise deltas, a third of their legacy `wheelDelta`
 * (Chromium and WebKit), are a trackpad's.
 */
function scrollTypeOf(wheel: WheelEvent): ScrollType {
  if (wheel.deltaMode !== 0) {
    return 'discrete';
  }
  const remainder = (value: number) => {
    const fraction = Math.abs(value - Math.round(value));
    return fraction > 0 && fraction < 0.01;
  };
  if (remainder(wheel.deltaX) || remainder(wheel.deltaY)) {
    return 'discrete';
  }
  const legacy = wheel as WheelEvent & {
    wheelDeltaX?: number;
    wheelDeltaY?: number;
  };
  if (
    typeof legacy.wheelDeltaY !== 'number' ||
    typeof legacy.wheelDeltaX !== 'number'
  ) {
    return 'discrete';
  }
  const precise = (delta: number, legacyDelta: number) =>
    delta === 0
      ? legacyDelta === 0
      : Math.abs(Math.abs(legacyDelta) - 3 * Math.abs(delta)) <=
        Math.max(1.5, 0.05 * Math.abs(delta) * 3);
  if (
    !precise(wheel.deltaY, legacy.wheelDeltaY) ||
    !precise(wheel.deltaX, legacy.wheelDeltaX)
  ) {
    return 'discrete';
  }
  const tick = (delta: number, legacyDelta: number) =>
    legacyDelta !== 0 && legacyDelta % 120 === 0 && delta % 40 === 0;
  return tick(wheel.deltaY, legacy.wheelDeltaY) ||
    tick(wheel.deltaX, legacy.wheelDeltaX)
    ? 'discrete'
    : 'continuous';
}

/** Whether a recognizer is a scroll-edge pan (`spec:AST-094` FR19). */
function isScrollEdgePan(recognizer: GestureRecognizer): boolean {
  return (recognizer as {scrollEdge?: boolean}).scrollEdge === true;
}

/** Whether a pan's `direction` takes a contact moving by (cx, cy). */
function panTakesMove(
  recognizer: GestureRecognizer,
  cx: number,
  cy: number,
): boolean {
  const direction = (recognizer as {direction?: string}).direction ?? 'any';
  const isHorizontal = Math.abs(cx) > Math.abs(cy);
  switch (direction) {
    case 'horizontal':
      return isHorizontal;
    case 'vertical':
      return !isHorizontal;
    case 'left':
      return isHorizontal && cx < 0;
    case 'right':
      return isHorizontal && cx > 0;
    case 'up':
      return !isHorizontal && cy < 0;
    case 'down':
      return !isHorizontal && cy > 0;
    default:
      return true;
  }
}

/** Whether `element` scrolls natively by `delta` along one axis now. */
function scrollsBy(
  element: Element,
  delta: number,
  isHorizontal: boolean,
  view: Window | null,
): boolean {
  if (delta === 0 || view == null) {
    return false;
  }
  const style = view.getComputedStyle(element);
  const overflow = isHorizontal ? style.overflowX : style.overflowY;
  if (overflow !== 'auto' && overflow !== 'scroll') {
    return false;
  }
  const room = isHorizontal
    ? element.scrollWidth - element.clientWidth
    : element.scrollHeight - element.clientHeight;
  if (room <= 0) {
    return false;
  }
  // Right to left, scrollLeft runs from 0 at the start to minus the
  // overflow, and a scroll right moves it toward 0. A scroller a pixel
  // short of either end, where Chromium stops one, is at that end.
  const isRtl = isHorizontal && isRtlElement(element as HTMLElement);
  const min = isRtl ? -room : 0;
  const max = isRtl ? 0 : room;
  const position = isHorizontal ? element.scrollLeft : element.scrollTop;
  return delta > 0 ? position < max - 1 : position > min + 1;
}

/**
 * An event's time on the arena's clock (`performance.now()`). Some engines
 * and DOM emulators stamp events in epoch milliseconds instead.
 */
function eventTime(event: Event): number {
  const time = event.timeStamp;
  if (
    time > 1e12 &&
    typeof performance !== 'undefined' &&
    performance.timeOrigin > 0
  ) {
    return time - performance.timeOrigin;
  }
  return time;
}

/** A touch list as an array; a synthetic event may carry none. */
function touchesOf(list: TouchList | null | undefined): Touch[] {
  return list == null ? [] : Array.from(list);
}

export class GestureHost {
  readonly arena: GestureArena;
  private readonly doc: Document;
  private readonly registry = new Map<Element, Registration>();
  /** Stops following the animator's moving elements (iOS WebKit only). */
  private stopWatchingMovers: (() => void) | null = null;
  /** Whether the document carries the blocking touchmove for a mover. */
  private isBlockingForMovers = false;
  /** Elements whose caller touch-action waits for a read after paint. */
  private readonly pendingCallerReads = new Set<HTMLElement>();
  private isCallerReadScheduled = false;
  /** Cancels the scheduled next-frame read (readCallerTouchActionInNextFrame). */
  private cancelCallerRead: (() => void) | null = null;
  /** The selection lock each contact holds, by host contact id. */
  private readonly lockedBy = new Map<number, () => void>();
  private readonly presentedHitTesting: 'auto' | 'always' | 'never';
  /**
   * Contacts sent to what is drawn instead of what the engine hit, by host
   * contact id, with where they landed (for their click).
   */
  private readonly retargeted = new Map<
    number,
    {x: number; y: number; target: EventTarget}
  >();
  /** Touch.identifier → arena id, for live fingers. */
  private readonly touchIds = new Map<number, number>();
  /**
   * Fingers cancelled because the app lost focus, kept until the browser
   * ends them: a browser that keeps such a touch alive must not let its
   * lift click (`spec:AST-094` FR28: nothing acts).
   */
  private readonly cancelledFingers = new Set<number>();
  /** Touch.identifier → the element the finger landed on. */
  private readonly touchTargets = new Map<number, EventTarget>();
  /**
   * Finger targets with listeners of their own: how many fingers each, and
   * how many of those a recognizer could claim while they move (only those
   * need the blocking `touchmove` listener).
   */
  private readonly watched = new Map<
    EventTarget,
    {count: number; blocking: number; claiming: number}
  >();
  /** Fingers whose target listener is the blocking one. */
  private readonly blockingFingers = new Set<number>();
  /**
   * Fingers a participant could claim (a recognizer that claims touches, or
   * a press consumer): only their target's `touchend` may need cancelling,
   * so a touch only watchers follow gets a passive one (`spec:AST-094`
   * FR20).
   */
  private readonly claimingFingers = new Set<number>();
  /** Touch events already handled (the document's and the target's listeners both see one). */
  private readonly processed = new WeakSet<Event>();
  /** pointerId → arena id, for live mouse and pen contacts. */
  private readonly pointerIds = new Map<number, number>();
  /**
   * The boxes the host watches for screen-edge pans (syncLayoutWatch): each
   * element with an enabled one, and the root for one whose band moves with
   * the viewport (spec:AST-094 FR18, FR19, DEC-22), and the one observer
   * that watches them.
   */
  private readonly layoutWatched = new Set<Element>();
  private layoutObserver: ResizeObserver | null = null;
  /** Fingers whose first uncancelable `touchmove` was already judged. */
  private readonly judgedUncancelable = new Set<number>();
  /**
   * A finger's pointerId → its arena id, once its pointerdown and its
   * touchstart are paired. Chromium sends no `touchmove` until a finger has
   * travelled its slop (about 16 px), but sends every `pointermove`, so a
   * paired finger is sampled from its pointer events (`pointerFed`); and its
   * `pointercancel` is the browser's claim of exactly that finger.
   */
  private readonly fingerPointers = new Map<number, number>();
  /** Finger pointerdowns still waiting for their touchstart. */
  private readonly pendingPointers = new Map<number, PlacedContact>();
  /**
   * Where fingers come from their pointer events, where claimed fingers
   * lifted and when: the `touchend` that follows each `pointerup` is
   * cancelled (FR21). A record no `touchend` consumed expires
   * (CLAIMED_LIFT_MS).
   */
  private readonly claimedLifts: (PlacedContact & {time: number})[] = [];
  /** The one timer that drops claimed lifts whose `touchend` never came. */
  private claimedLiftTimer: unknown = null;
  /** The arena's clock, which the claimed lifts' timer runs on too. */
  private readonly clock: GestureClock;
  /** Fingers still waiting for their pointerdown, by arena id. */
  private readonly unpairedTouches = new Map<number, PlacedContact>();
  private readonly isPrimaryPointerCoarse: () => boolean;
  /** Whether the host follows `(pointer: coarse)` (no read was passed). */
  private readonly followsPointer: boolean;
  /** The last sample fed per contact: a contact's time never runs back. */
  private readonly lastFed = new Map<number, TouchSample>();
  /**
   * Fingers whose samples come from their pointer events. A finger the
   * browser reports on both channels is sampled from ONE: the pointer
   * channel, where its pointerdown paired with its touchstart; touch events
   * sample only a finger no pointer event reported (no Pointer Events). The
   * other channel keeps its control duties (cancelling, claiming, the
   * browser's takeover) but never feeds a sample, so the two copies of one
   * move cannot both reach a velocity, however far apart they arrive.
   */
  private readonly pointerFed = new Set<number>();
  /** When a finger was last down or lifted, and where it landed. */
  private lastTouch: {readonly target: Node; readonly time: number} | null =
    null;
  /** Scrollers a recognizer is scrolling itself this frame (ownScroll). */
  private readonly ownedScrolls = new Map<Node, number>();
  /** Numbers each ownScroll call: only the newest one's timer clears it. */
  private ownScrollCalls = 0;
  /** Cancels each scroller's pending ownScroll frames. */
  private readonly ownScrollFrames = new Map<Node, () => void>();
  /** The last scroll a finger drove, and when. */
  private lastScroll: {readonly scroller: Node; readonly time: number} | null =
    null;
  /** Predicates that hold a touch's target away from every participant. */
  private readonly touchGates = new Set<(target: Node) => boolean>();
  /** Who keeps the listeners installed without a registration (retain). */
  private retainers = 0;
  /** Told after every touch event that changed the fingers on the screen. */
  private readonly fingerListeners = new Set<() => void>();
  /**
   * Where each finger now on the screen landed, from the last touch event's
   * `touches` (every finger, whether or not a recognizer tracks it).
   */
  private fingerTargets: ReadonlyArray<Node> = [];
  private nextId = 1;
  /** The wheel gesture in progress (FR43). */
  private wheel: WheelGesture | null = null;
  /** Whether the document routes every wheel to the live wheel gesture. */
  private isWheelLatched = false;
  /** Splits the wheel stream into gestures and reads a trackpad's lift. */
  private readonly segmenter = new WheelSegmenter();
  /** The latest wheel's segment. */
  private wheelSegment: WheelSegment | null = null;
  /** Why the current wheel gesture began. */
  private lastBoundary: WheelBoundary | null = null;
  /** The last committed step, so its slow continuation is absorbed. */
  private lastStep: {
    readonly axis: 'x' | 'y';
    readonly sign: number;
    last: number;
  } | null = null;
  /** An uncommitted step's travel, carried across a short gap. */
  private pendingStep: {
    readonly axis: 'x' | 'y';
    readonly travel: number;
    readonly count: number;
    readonly last: number;
  } | null = null;
  /** Wheels already taken: each element on the path with a listener hears one. */
  private readonly wheelsSeen = new WeakSet<Event>();
  private isInstalled = false;
  /**
   * Whether the primary pointer is coarse (`spec:AST-094` FR19), read when
   * something first attaches and kept current while anything is attached.
   */
  private isCoarse = false;
  private stopWatchingPointer: (() => void) | null = null;
  /** The input stream subscriptions while installed. */
  private unsubscribers: (() => void)[] = [];
  /**
   * Where the primary pointer is fine, each element that uses a gesture
   * listens for a press itself; the page's listeners last that press (FR24).
   */
  private readonly armedElements = new Map<Element, () => void>();
  private isArmedPress = false;
  /**
   * Whether the installed listeners include the cancelable ones (the
   * document's touchend, contextmenu and the window's click): only while a
   * participant that can claim is attached (`spec:AST-094` FR20).
   */
  private isClaimingInstalled = false;
  /** The input stream subscriptions syncClaimingListeners keeps. */
  private claimingUnsubscribers: (() => void)[] = [];
  private readonly inputMode: 'auto' | 'pointer-events';
  private usesTouchEvents = true;

  constructor(doc: Document, options: GestureHostOptions = {}) {
    this.doc = doc;
    this.inputMode = options.inputMode ?? 'auto';
    this.presentedHitTesting = options.presentedHitTesting ?? 'auto';
    const environment: GestureEnvironment = {
      viewportSize: () => ({
        width: doc.defaultView?.innerWidth ?? 0,
        height: doc.defaultView?.innerHeight ?? 0,
      }),
      // The writing direction through core's one helper.
      isRtl: view =>
        view instanceof Element && isRtlElement(view as HTMLElement),
      // A screen-edge pan tells a view within its edge band from any other
      // by its box (spec:AST-094 FR18).
      viewRect: view => {
        if (!(view instanceof Element)) {
          return null;
        }
        const {left, top, width, height} = view.getBoundingClientRect();
        return {left, top, width, height};
      },
    };
    this.clock = options.clock ?? browserClock;
    this.arena = new GestureArena({
      clock: this.clock,
      environment,
      onDeferredClick: (touch, allowed) => this.replayClick(touch, allowed),
      // A press whose decision waited on a timer (a tap waiting on a double
      // tap) ends here: an armed press stops listening (FR24).
      onIdle: () => this.releaseArmedPress(),
      onTransition: options.onTransition,
    });
    const view = doc.defaultView;
    // A test may pass its own read; otherwise the one coarse-pointer gate,
    // followed as it changes.
    this.followsPointer = options.isPrimaryPointerCoarse == null;
    this.isPrimaryPointerCoarse =
      options.isPrimaryPointerCoarse ?? (() => isCoarsePointer(view));
  }

  // --- Attachment ------------------------------------------------------------

  /** Attach a recognizer to an element. Returns the detach function. */
  attach(
    element: Element,
    recognizer: GestureRecognizer,
    options: AttachOptions = {},
  ): () => void {
    const registration = this.registrationFor(element);
    registration.manageStyle = options.manageStyle ?? registration.manageStyle;
    // An action group while any attachment asks, whatever their order.
    const asksForGroup = options.actionGroup === true;
    if (asksForGroup) {
      registration.actionGroupAsks += 1;
      registration.actionGroup = true;
    }
    recognizer.view = element;
    registration.recognizers.push(recognizer);
    recognizer.onEnabledChange = () => {
      this.refresh(element, registration);
      this.syncListeners();
    };
    const edgePan = asScreenEdgePan(recognizer);
    if (edgePan != null) {
      // A new answer may also move the band the pan watches onto or off the
      // right side, whose band moves with the viewport (an in-place switch
      // of direction): the layout watch follows (FR18, FR24, DEC-22).
      edgePan.onTouchBehaviorChange = () => {
        this.refresh(element, registration);
        this.syncLayoutWatch();
      };
    }
    this.refresh(element, registration);
    this.syncListeners();
    return () => {
      recognizer.onEnabledChange = null;
      if (asksForGroup) {
        registration.actionGroupAsks -= 1;
        registration.actionGroup = registration.actionGroupAsks > 0;
      }
      if (edgePan != null) {
        edgePan.onTouchBehaviorChange = null;
      }
      const index = registration.recognizers.indexOf(recognizer);
      if (index >= 0) {
        registration.recognizers.splice(index, 1);
      }
      // A recognizer whose view goes away mid-gesture is cancelled, as in
      // UIKit when a view leaves the window.
      if (recognizer.state !== 'possible' || recognizer.isInvolved()) {
        recognizer.cancel();
      }
      const wheel = this.wheel;
      if (
        wheel != null &&
        wheel.takers.includes(recognizer) &&
        !this.wheelHasTaker(wheel)
      ) {
        this.endWheel();
      }
      this.refresh(element, registration);
      // Even when the element keeps other attachments: one left disabled
      // keeps no listener or observer (FR24).
      this.syncListeners();
      this.cleanup(element, registration);
    };
  }

  /**
   * Watch the box of each element with an enabled screen-edge pan, and the
   * root's for a pan that watches the right side, whose band moves with the
   * viewport: a resize may move an element into or out of its edge band, and
   * the pan then measures again and re-derives the element's touch-action
   * (FR19). The host sets touch-action for every pointer (FR43), so it
   * watches under any primary pointer. One ResizeObserver serves every
   * element and goes with the last one, and no listener is added (FR24); an
   * engine without ResizeObserver keeps each pan's first measurement.
   */
  private syncLayoutWatch(): void {
    const wanted = new Set<Element>();
    let watchesViewport = false;
    for (const [element, registration] of this.registry) {
      for (const recognizer of registration.recognizers) {
        const edgePan = asScreenEdgePan(recognizer);
        if (edgePan != null && edgePan.isEnabled) {
          wanted.add(element);
          watchesViewport ||= edgePan.watchesViewport;
        }
      }
    }
    if (watchesViewport) {
      wanted.add(this.doc.documentElement);
    }
    for (const element of [...this.layoutWatched]) {
      if (!wanted.has(element)) {
        this.layoutObserver?.unobserve(element);
        this.layoutWatched.delete(element);
      }
    }
    if (wanted.size === 0) {
      this.layoutObserver?.disconnect();
      this.layoutObserver = null;
      return;
    }
    const view = this.doc.defaultView;
    if (
      this.layoutObserver == null &&
      view != null &&
      typeof view.ResizeObserver === 'function'
    ) {
      this.layoutObserver = new view.ResizeObserver(this.onLayoutChange);
      for (const element of this.layoutWatched) {
        this.layoutObserver.observe(element);
      }
    }
    for (const element of wanted) {
      if (!this.layoutWatched.has(element)) {
        this.layoutObserver?.observe(element);
        this.layoutWatched.add(element);
      }
    }
  }

  /** A watched box or the root resized: each enabled edge pan measures again. */
  private readonly onLayoutChange = (): void => {
    for (const registration of this.registry.values()) {
      for (const recognizer of registration.recognizers) {
        const edgePan = asScreenEdgePan(recognizer);
        if (edgePan != null && edgePan.isEnabled) {
          edgePan.layoutChanged();
        }
      }
    }
  };

  /** Attach the view-level touch consumer of an element (a pressable control). */
  attachConsumer(
    element: Element,
    consumer: TouchConsumer,
    _options: Pick<AttachOptions, 'perEventPointer'> = {},
  ): () => void {
    const registration = this.registrationFor(element);
    registration.consumer = consumer;
    this.refresh(element, registration);
    this.syncListeners();
    return () => {
      if (registration.consumer === consumer) {
        registration.consumer = null;
      }
      // A keepsTouch consumer's blocking touchmove goes with it, even while
      // the element keeps its recognizers.
      this.refresh(element, registration);
      // Even when the element keeps a recognizer: one left disabled keeps
      // no listener or observer (FR24).
      this.syncListeners();
      this.cleanup(element, registration);
    };
  }

  /**
   * @internal The document this host serves.
   */
  get document(): Document {
    return this.doc;
  }

  /**
   * @internal Whether a recognizer owns the touch with this Touch Events
   * `identifier`, so the browser must not pan it (pageHold.ts asks).
   */
  isTouchClaimed(identifier: number): boolean {
    const id = this.touchIds.get(identifier);
    return id != null && this.arena.isClaimed(id);
  }

  /**
   * An element's box where it is drawn: the box the engine reports, moved
   * by the compositor animations of it and its ancestors on engines that
   * report and hit-test those where they started (iOS WebKit). Elsewhere
   * `getBoundingClientRect` already reports the drawn box. Press trackers
   * read their bounds through it.
   */
  presentedRect(element: Element): PressBounds {
    const box = element.getBoundingClientRect();
    if (!this.hitTestsLayout()) {
      return box;
    }
    const {x, y} = presentedOffsetOf(element);
    if (x === 0 && y === 0) {
      return box;
    }
    return {
      left: box.left + x,
      top: box.top + y,
      right: box.right + x,
      bottom: box.bottom + y,
    };
  }

  /** Whether this engine hit-tests a compositor-moved element at layout. */
  private hitTestsLayout(): boolean {
    return (
      this.presentedHitTesting === 'always' ||
      (this.presentedHitTesting === 'auto' && isIosWebKit(this.doc.defaultView))
    );
  }

  /**
   * Where a contact lands among what is drawn. iOS WebKit hit-tests an
   * element that a compositor animation moves where the animation started:
   * a finger on a settling sheet lands on whatever sat under the sheet's
   * start (the scrim, which closes it), and a finger where the sheet was
   * lands on the sheet. UIKit keeps an interruptible animation hit-testable
   * where it is drawn (UIViewPropertyAnimator). The touch goes to what was
   * drawn under the finger when it landed (`time`, its event's timestamp),
   * even when a busy main thread hands it over later, and content that slid
   * under the finger since takes nothing (`spec:AST-094` FR11).
   */
  private presentedTarget(
    native: EventTarget | null,
    x: number,
    y: number,
    time: number,
  ): EventTarget | null {
    if (!this.hitTestsLayout()) {
      return native;
    }
    const movers = presentedElements().filter(element => {
      if (!element.isConnected || element.ownerDocument !== this.doc) {
        return false;
      }
      const {x: dx, y: dy} = presentedOffsetOf(element);
      return Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5;
    });
    if (movers.length === 0) {
      return native;
    }
    // One style write per mover makes the engine hit-test it where it is
    // drawn now; the hit test below flushes them. The engine then gets
    // z-order, pointer-events and clipping right, which no box math would.
    resolvePresented(movers);
    let hit = this.drawnAt(x, y);
    // A mover kept going while the touch waited for the main thread: what
    // was under the finger when it landed is now that far along. A timestamp
    // on another clock, or older than a second, is not corrected.
    const age = (this.doc.defaultView?.performance.now() ?? time) - time;
    if (age > 0 && age < 1000) {
      const movedSince = (mover: Element) => {
        const then = presentedOffsetOf(mover, time);
        return Math.abs(then.x) >= 0.5 || Math.abs(then.y) >= 0.5 ? then : null;
      };
      const now = hit;
      const under =
        now == null
          ? undefined
          : movers.find(mover => containsAlongFlatTree(mover, now));
      let landedOnMover = false;
      for (const mover of movers) {
        const then = movedSince(mover);
        if (then == null) {
          continue;
        }
        const landed = this.drawnAt(x - then.x, y - then.y);
        if (landed != null && containsAlongFlatTree(mover, landed)) {
          hit = landed;
          landedOnMover = true;
          break;
        }
      }
      // Content that slid under the finger after it landed takes nothing:
      // the touch goes to what was there, beneath it.
      if (!landedOnMover && under != null && movedSince(under) != null) {
        hit = this.drawnBeneath(x, y, movers);
      }
    }
    if (hit == null || hit === native) {
      return native;
    }
    const found = hit;
    const node = native instanceof Node ? native : null;
    const isAboutMover = movers.some(
      mover =>
        containsAlongFlatTree(mover, found) ||
        (node != null && containsAlongFlatTree(mover, node)),
    );
    return isAboutMover ? found : native;
  }

  /** What is drawn at a point beneath every mover. */
  private drawnBeneath(
    x: number,
    y: number,
    movers: ReadonlyArray<Element>,
  ): Element | null {
    if (typeof this.doc.elementsFromPoint !== 'function') {
      return null;
    }
    return (
      this.doc
        .elementsFromPoint(x, y)
        .find(
          element =>
            !movers.some(mover => containsAlongFlatTree(mover, element)),
        ) ?? null
    );
  }

  /** What is drawn at a point, inside open shadow roots too. */
  private drawnAt(x: number, y: number): Element | null {
    let hit = this.doc.elementFromPoint(x, y);
    // The document answers a shadow host for anything inside its open root:
    // descend to what is drawn there.
    while (hit?.shadowRoot != null) {
      const inner = hit.shadowRoot.elementFromPoint(x, y);
      if (inner == null || inner === hit) {
        break;
      }
      hit = inner;
    }
    return hit;
  }

  /** The browser took these touches (a scroll): no click of ours for them. */
  private browserTook(ids: ReadonlyArray<number>, time: number): void {
    for (const id of ids) {
      this.retargeted.delete(id);
    }
    this.arena.browserTookOver(ids, time);
  }

  /**
   * The click a retargeted tap earned, on what was drawn under the finger.
   * The engine's own click would hit the start position, so the caller
   * cancels it (or the click guard drops it, a late one included) and this one
   * is the tap's single activation.
   */
  private clickRetargeted(target: EventTarget, x: number, y: number): void {
    const view = this.doc.defaultView;
    if (!(target instanceof Element) || !target.isConnected || view == null) {
      return;
    }
    armClickGuard(this.doc);
    if (
      target instanceof view.HTMLElement &&
      target.matches('input, textarea, select, [contenteditable]')
    ) {
      target.focus();
    }
    withoutClickGuard(() =>
      target.dispatchEvent(
        new view.MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          composed: true,
          detail: 1,
          clientX: x,
          clientY: y,
        }),
      ),
    );
  }

  /**
   * Re-derive an element's styles and the host's listeners after its
   * recognizers' options or its consumer's enabled state changed.
   */
  update(element: Element): void {
    if (!this.followsPointer) {
      // A read passed in (a test's) is not followed: an update reads it again.
      this.isCoarse = this.isPrimaryPointerCoarse();
    }
    const registration = this.registry.get(element);
    if (registration != null) {
      this.refresh(element, registration);
    }
    this.syncListeners();
  }

  /**
   * The Pointer Events `pointerId` of a contact the arena tracks: a mouse's
   * or a pen's own, and for a finger driven by touch events the pointer its
   * touch was paired with (null before the pairing, or without Pointer
   * Events). It hands a held finger to code that follows pointers, as a
   * menu does when a long press turns into a press-drag selection.
   */
  pointerIdOf(touch: GestureTouch | number): number | null {
    const id = typeof touch === 'number' ? touch : touch.id;
    for (const [pointerId, arenaId] of this.fingerPointers) {
      if (arenaId === id) {
        return pointerId;
      }
    }
    for (const [pointerId, arenaId] of this.pointerIds) {
      if (arenaId === id) {
        return pointerId;
      }
    }
    return null;
  }

  /**
   * Whether a finger set a scroller containing `node` moving within the last
   * `window` ms. A touch there now brakes the scroll rather than pressing
   * whatever is under it: a native list highlights nothing for one.
   */
  isScrollBraking(
    node: Node,
    window: number = UIKIT_PRESS.scrollBrake.value,
  ): boolean {
    const last = this.lastScroll;
    return (
      last != null &&
      this.arena.now() - last.time < window &&
      containsAlongFlatTree(last.scroller, node)
    );
  }

  /**
   * @internal Keep the host's listeners installed until the returned
   * function runs, with no recognizer attached (fingerScroll.ts reads the
   * finger record meanwhile).
   */
  retain(): () => void {
    this.retainers += 1;
    // A watch is not an attach: no warning where the pointer is fine.
    this.watchPointer();
    this.syncListeners();
    let isRetained = true;
    return () => {
      if (!isRetained) {
        return;
      }
      isRetained = false;
      this.retainers -= 1;
      this.uninstallIfIdle();
    };
  }

  /**
   * @internal Call `listener` after each touch event the host hears, once
   * the finger record is up to date. Returns the unsubscribe.
   */
  onFingersChange(listener: () => void): () => void {
    this.fingerListeners.add(listener);
    return () => {
      this.fingerListeners.delete(listener);
    };
  }

  /** @internal Whether a finger that landed inside `node` is down now. */
  isFingerDownIn(node: Node): boolean {
    // Along the flat tree: a finger on content inside an open shadow root is
    // in the scroller around that root.
    return this.fingerTargets.some(target =>
      containsAlongFlatTree(node, target),
    );
  }

  private registrationFor(element: Element): Registration {
    this.watchPointer();
    let registration = this.registry.get(element);
    if (registration == null) {
      registration = {
        recognizers: [],
        consumer: null,
        hasTouchEndListener: false,
        hasTouchMoveListener: false,
        hasWheelListener: false,
        savedStyle: new Map(),
        authorTouchAction: null,
        manageStyle: true,
        actionGroup: false,
        actionGroupAsks: 0,
      };
      this.registry.set(element, registration);
    }
    return registration;
  }

  /** Whether anything attached could take input. */
  private needsInput(): boolean {
    return this.registry.size > 0 || this.retainers > 0;
  }

  private refresh(element: Element, registration: Registration): void {
    if (registration.manageStyle && element instanceof HTMLElement) {
      this.applyStyle(element, registration);
    }
    this.syncTouchMoveListener(element, registration);
  }

  /**
   * The element's blocking `touchmove`. For every pointer a claiming
   * recognizer keeps it: a finger's claim cancels its moves here (FR19), a
   * listener FR24 counts outside the one-listener budget a fine pointer's
   * element keeps for its press (syncArmed). A kept press needs it only
   * while a press is held: a phone's before every touch (Safari honours a
   * blocking listener only when registered before the touch began), a fine
   * pointer's only during an armed press, whose `pointerdown` comes before
   * the touch it brings (FR24).
   */
  private syncTouchMoveListener(
    element: Element,
    registration: Registration,
  ): void {
    // Where fingers come from their pointer events (Pointer Events input, or
    // a window with no ontouchstart), a claimed finger's touchend is not the
    // host's own document listener's to cancel, so the element cancels it
    // (FR21). Under a coarse pointer always: touch emulation turned on after
    // load hides ontouchstart yet sends touches. Under a fine one wherever
    // the browser sends Touch Events, as a touchscreen laptop does (FR43);
    // elsewhere no touchend ever comes, and the element keeps no listener
    // (FR24).
    const needsEndListener =
      this.readsFingersFromPointerEvents() &&
      (this.isCoarse || this.sendsTouchEvents()) &&
      registration.recognizers.some(
        recognizer =>
          recognizer.isEnabled && internals(recognizer).acceptsTouchInput,
      );
    if (needsEndListener && !registration.hasTouchEndListener) {
      element.addEventListener('touchend', this.onClaimedTouchEnd, {
        passive: false,
      });
      registration.hasTouchEndListener = true;
    } else if (!needsEndListener && registration.hasTouchEndListener) {
      element.removeEventListener('touchend', this.onClaimedTouchEnd);
      registration.hasTouchEndListener = false;
    }
    const needsListener =
      registration.recognizers.some(
        recognizer => recognizer.isEnabled && claimsWhileMoving(recognizer),
      ) ||
      (registration.consumer?.keepsTouch != null &&
        registration.consumer.isEnabled?.() !== false &&
        (this.isCoarse || this.isArmedPress));
    // The blocking listener sits on the element itself (FR19: a scroll that
    // starts elsewhere never waits on it), but every element shares the
    // host's one handler, which routes through the arena.
    if (needsListener && !registration.hasTouchMoveListener) {
      element.addEventListener('touchmove', this.onBlockingTouchMove, {
        passive: false,
      });
      registration.hasTouchMoveListener = true;
    } else if (!needsListener && registration.hasTouchMoveListener) {
      element.removeEventListener('touchmove', this.onBlockingTouchMove);
      registration.hasTouchMoveListener = false;
    }
    // Wheel and trackpad input, only where an enabled recognizer takes it
    // (FR43): a non-passive wheel listener makes the browser's scrolling over
    // the element wait for the main thread.
    const needsWheel = registration.recognizers.some(
      recognizer =>
        recognizer.isEnabled &&
        // A watcher never takes the wheel: the page keeps it (FR20, DEC-7).
        recognizer.claimsTouches &&
        recognizer.allowedScrollTypes.size > 0 &&
        // A wheel drives a pan or a pinch only.
        (internals(recognizer).family === 'pan' ||
          internals(recognizer).family === 'pinch'),
    );
    if (needsWheel && !registration.hasWheelListener) {
      element.addEventListener('wheel', this.onWheel, {passive: false});
      registration.hasWheelListener = true;
    } else if (!needsWheel && registration.hasWheelListener) {
      element.removeEventListener('wheel', this.onWheel);
      registration.hasWheelListener = false;
    }
  }

  private applyStyle(element: HTMLElement, registration: Registration): void {
    // A disabled recognizer leaves the browser everything (FR24).
    // Every pointer gets it: a touchscreen laptop's finger as a phone's (FR43).
    const active = registration.recognizers.filter(
      recognizer => recognizer.isEnabled,
    );
    let style: GestureHostStyle =
      active.length > 0 ? gestureHostStyle(active) : {};
    // A control that keeps its touch (a stepper's hold-repeat) takes taps in
    // quick succession: the browser's double-tap zoom goes, as for a tap
    // recognizer (`spec:AST-094` FR18), for every pointer (FR43).
    if (
      style.touchAction == null &&
      registration.consumer?.keepsTouch != null
    ) {
      style = {...style, touchAction: 'manipulation'};
    }
    for (const key of Object.keys(
      STYLE_PROPERTIES,
    ) as (keyof GestureHostStyle)[]) {
      const property = STYLE_PROPERTIES[key];
      let value = style[key];
      if (key === 'touchAction') {
        value = this.touchActionToWrite(element, registration, value);
      }
      if (value != null) {
        if (!registration.savedStyle.has(property)) {
          registration.savedStyle.set(
            property,
            element.style.getPropertyValue(property),
          );
        }
        element.style.setProperty(property, value);
      } else if (registration.savedStyle.has(property)) {
        const saved = registration.savedStyle.get(property) ?? '';
        registration.savedStyle.delete(property);
        if (saved === '') {
          element.style.removeProperty(property);
        } else {
          element.style.setProperty(property, saved);
        }
      }
    }
  }

  /**
   * The touch-action to write inline, if any. The author's value (a
   * trigger's own `touch-action: none`) stays in force and the host never
   * allows more (spec:AST-094 FR18, DEC-8):
   * - an inline value is the style's own, read with no recalc, and the host
   *   writes what both allow, inline; a CSS-wide keyword (`initial`,
   *   `inherit`, `unset`, `revert`, `revert-layer`) names no touch-action of
   *   its own, so it is read as an author rule is, as what it resolves to;
   * - otherwise the element is marked with the derived value, under a rule
   *   any author rule outranks, as the recognizer attaches: a subtree that
   *   mounts with it is styled once, never restyled for it in a later frame.
   *   The next frame reads what is in force, styles clean, and the host
   *   writes inline only what both allow where that is narrower than an
   *   author rule's value.
   */
  private touchActionToWrite(
    element: HTMLElement,
    registration: Registration,
    derived: string | undefined,
  ): string | undefined {
    if (derived == null) {
      unmarkTouchAction(element);
      registration.authorTouchAction = null;
      return undefined;
    }
    const property = STYLE_PROPERTIES.touchAction;
    const inline = registration.savedStyle.has(property)
      ? (registration.savedStyle.get(property) ?? '')
      : element.style.getPropertyValue(property);
    if (inline !== '' && !isCssWideKeyword(inline)) {
      unmarkTouchAction(element);
      return intersectTouchAction(derived, inline);
    }
    if (!markTouchAction(element, derived)) {
      // No document or shadow root to hold the rule (a detached element):
      // nothing is styled there, and the next frame looks again.
      this.readCallerTouchActionInNextFrame(element);
      return undefined;
    }
    const read = registration.authorTouchAction;
    if (read == null || read.derived !== derived) {
      // The rule is in force until the read: the derived value, or the
      // author's where the author sets one.
      this.readCallerTouchActionInNextFrame(element);
      return undefined;
    }
    if (read.author == null) {
      return undefined;
    }
    const both = intersectTouchAction(derived, read.author);
    return both === read.author ? undefined : both;
  }

  /**
   * Read the touch-action in force on each marked element in the next frame,
   * then apply its style again. Batched: one style read serves every pending
   * element, and the writes follow the reads. The host has written no
   * touch-action inline on them, so a value other than the mark is an author
   * rule's.
   */
  private readCallerTouchActionInNextFrame(element: HTMLElement): void {
    this.pendingCallerReads.add(element);
    if (this.isCallerReadScheduled) {
      return;
    }
    this.isCallerReadScheduled = true;
    this.cancelCallerRead = inNextFrame(this.doc.defaultView, () => {
      this.isCallerReadScheduled = false;
      this.cancelCallerRead = null;
      const pending: [HTMLElement, Registration][] = [];
      for (const candidate of this.pendingCallerReads) {
        const registration = this.registry.get(candidate);
        if (registration != null) {
          pending.push([candidate, registration]);
        }
      }
      this.pendingCallerReads.clear();
      const view = this.doc.defaultView;
      for (const [candidate, registration] of pending) {
        const derived = candidate.getAttribute(TOUCH_ACTION_ATTRIBUTE);
        if (derived == null || view == null) {
          continue;
        }
        const inForce = view.getComputedStyle(candidate).touchAction || 'auto';
        registration.authorTouchAction = {
          derived,
          author: inForce === derived ? null : inForce,
        };
      }
      for (const [candidate, registration] of pending) {
        this.applyStyle(candidate, registration);
      }
    });
  }

  private cleanup(element: Element, registration: Registration): void {
    if (registration.recognizers.length > 0 || registration.consumer != null) {
      // What stays may take nothing (only disabled recognizers): FR24.
      this.syncListeners();
      return;
    }
    if (registration.hasTouchEndListener) {
      element.removeEventListener('touchend', this.onClaimedTouchEnd);
      registration.hasTouchEndListener = false;
    }
    if (registration.hasTouchMoveListener) {
      element.removeEventListener('touchmove', this.onBlockingTouchMove);
    }
    if (registration.hasWheelListener) {
      element.removeEventListener('wheel', this.onWheel);
    }
    this.registry.delete(element);
    this.uninstallIfIdle();
  }

  /**
   * Listen only while something could take a touch now (`spec:AST-094`
   * FR24, FR43): where the primary pointer is coarse, an enabled recognizer
   * or consumer, or a finger-scroll watch; where it is fine, only during a
   * press an element armed (syncArmed). Otherwise no document listener is
   * registered, so an idle page and a disabled control pay nothing.
   */
  private syncListeners(): void {
    this.syncLayoutWatch();
    this.syncArmed();
    if (this.shouldListen()) {
      this.install();
      this.syncClaimingListeners();
    } else {
      this.uninstall();
    }
    this.syncMoverBlocking();
  }

  /**
   * Safari honours a blocking `touchmove` only where it was registered before
   * the touch began, on the engine's own target, and on iOS WebKit a finger
   * on an element a compositor animation moves lands, for the engine, on
   * whatever sits under the motion's start (see presentedTarget). So while an
   * element a recognizer that claims moving touches lives in (or around) is
   * moving, the document carries the blocking listener (`spec:AST-094`
   * FR19), and it comes off when the motion ends: only then does a scroll
   * starting anywhere wait on the main thread.
   */
  private syncMoverBlocking(): void {
    const isWatching = this.isInstalled && this.hitTestsLayout();
    if (isWatching && this.stopWatchingMovers == null) {
      this.stopWatchingMovers = watchPresentedElements(() =>
        this.syncMoverBlocking(),
      );
    } else if (!isWatching && this.stopWatchingMovers != null) {
      this.stopWatchingMovers();
      this.stopWatchingMovers = null;
    }
    const needed =
      isWatching &&
      presentedElements().some(mover =>
        this.hasClaimingRecognizerAround(mover),
      );
    if (needed === this.isBlockingForMovers) {
      return;
    }
    this.isBlockingForMovers = needed;
    if (needed) {
      this.doc.addEventListener('touchmove', this.onBlockingTouchMove, {
        passive: false,
      });
    } else {
      this.doc.removeEventListener('touchmove', this.onBlockingTouchMove);
    }
  }

  /** Whether a recognizer that claims moving touches lives in or around `mover`. */
  private hasClaimingRecognizerAround(mover: Element): boolean {
    if (!mover.isConnected || mover.ownerDocument !== this.doc) {
      return false;
    }
    for (const [element, registration] of this.registry) {
      if (
        (mover.contains(element) || element.contains(mover)) &&
        registration.recognizers.some(
          recognizer => recognizer.isEnabled && claimsWhileMoving(recognizer),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Where the primary pointer is fine, each element with an enabled
   * recognizer or press consumer listens for a press itself: one passive
   * `pointerdown` listener on the element. The host's page listeners come at
   * that press and go once its contacts end and the arena drops their last
   * record (onIdle: a decision that waited on a timer), so an idle page has none
   * (`spec:AST-094` FR24, FR43). A finger on a touchscreen whose primary
   * pointer is fine sends its `pointerdown` before its `touchstart`, so the
   * host hears both.
   */
  private syncArmed(): void {
    const wanted = new Set<Element>();
    if (!this.isCoarse) {
      for (const [element, registration] of this.registry) {
        const consumer = registration.consumer;
        if (
          registration.recognizers.some(
            recognizer =>
              recognizer.isEnabled &&
              // One that takes only scroll input has no press to arm.
              (recognizer.allowedPointerTypes == null ||
                recognizer.allowedPointerTypes.size > 0),
          ) ||
          (consumer != null && consumer.isEnabled?.() !== false)
        ) {
          wanted.add(element);
        }
      }
    }
    for (const [element, release] of this.armedElements) {
      if (!wanted.has(element)) {
        release();
        this.armedElements.delete(element);
      }
    }
    for (const element of wanted) {
      if (this.armedElements.has(element)) {
        continue;
      }
      element.addEventListener(
        'pointerdown',
        this.onArmedPress,
        PASSIVE_CAPTURE,
      );
      this.armedElements.set(element, () => {
        element.removeEventListener(
          'pointerdown',
          this.onArmedPress,
          PASSIVE_CAPTURE,
        );
      });
    }
    if (wanted.size === 0 && this.isArmedPress) {
      this.isArmedPress = false;
      this.syncKeptPresses();
    }
  }

  /** A press on an armed element, a mouse's primary button, a pen or a finger: listen for this press. */
  private readonly onArmedPress = (event: Event): void => {
    const press = event as PointerEvent;
    if (
      this.isInstalled ||
      !isPointerKind(press.pointerType) ||
      (press.pointerType !== 'touch' && !isPrimaryClick(press))
    ) {
      return;
    }
    this.isArmedPress = true;
    this.syncKeptPresses();
    this.install();
    // A finger's or a pen's press brings the cancelable touchend and the
    // contextmenu canceller, as wherever the host installs, so a claimed
    // lift clicks nothing and a claimed hold opens no browser menu (FR21). A
    // mouse's press needs neither.
    if (press.pointerType !== 'mouse') {
      this.syncClaimingListeners();
    }
    // The window's capture phase is over for this event: hand it on.
    this.onPointerDown(press);
  };

  /** A kept press's blocking `touchmove` follows the armed press (syncTouchMoveListener). */
  private syncKeptPresses(): void {
    for (const [element, registration] of this.registry) {
      if (registration.consumer?.keepsTouch != null) {
        this.syncTouchMoveListener(element, registration);
      }
    }
  }

  /** After a contact ends: an armed press that is over stops listening. */
  private releaseArmedPress(): void {
    if (!this.isArmedPress) {
      return;
    }
    queueMicrotask(() => {
      if (this.isArmedPress && this.arena.touches.length === 0) {
        this.isArmedPress = false;
        this.syncKeptPresses();
        this.syncListeners();
      }
    });
  }

  /** With nothing attached, stop listening and stop following the pointer. */
  private uninstallIfIdle(): void {
    this.syncListeners();
    if (this.registry.size === 0 && this.retainers === 0) {
      this.uninstall();
      this.stopWatchingPointer?.();
      this.stopWatchingPointer = null;
      this.releaseWhenIdle();
    }
  }

  /**
   * In the microtask after the last detach, unless something attached again
   * in the same task (a component that remounts mid-press keeps its notes):
   * nothing the host holds outlives it, no note and no pending frame or
   * timer (`spec:AST-094` FR24).
   */
  private releaseWhenIdle(): void {
    queueMicrotask(() => {
      if (this.registry.size > 0 || this.retainers > 0) {
        return;
      }
      this.cancelledFingers.clear();
      this.clearClaimedLifts();
      this.cancelCallerRead?.();
      this.cancelCallerRead = null;
      this.isCallerReadScheduled = false;
      this.pendingCallerReads.clear();
      for (const cancel of this.ownScrollFrames.values()) {
        cancel();
      }
      this.ownScrollFrames.clear();
      this.ownedScrolls.clear();
    });
  }

  /** Read the primary pointer, and follow it while anything is attached. */
  private watchPointer(): void {
    if (this.stopWatchingPointer != null) {
      return;
    }
    const view = this.doc.defaultView;
    this.isCoarse = this.isPrimaryPointerCoarse();
    this.stopWatchingPointer = this.followsPointer
      ? watchCoarsePointer(view, isCoarse => this.pointerChanged(isCoarse))
      : () => {};
  }

  /**
   * The primary pointer turned coarse or fine (a tablet docking a mouse):
   * install or remove everything, as if each attach happened now.
   */
  private pointerChanged(isCoarse: boolean): void {
    if (isCoarse === this.isCoarse) {
      return;
    }
    this.isCoarse = isCoarse;
    if (!isCoarse) {
      this.cancelEverything(this.arena.now());
    }
    for (const [element, registration] of this.registry) {
      this.refresh(element, registration);
    }
    this.syncListeners();
  }

  /**
   * Whether an enabled participant could claim a touch or cancel a lift: a
   * consumer, or a recognizer that claims touches and takes a finger or a
   * pen. With only watchers, or only scroll-only recognizers
   * (`allowedPointerTypes: []`), the host's listeners are all passive
   * (`spec:AST-094` FR20, FR24).
   */
  private hasClaimer(): boolean {
    for (const registration of this.registry.values()) {
      const consumer = registration.consumer;
      if (
        (consumer != null && consumer.isEnabled?.() !== false) ||
        registration.recognizers.some(
          recognizer =>
            recognizer.isEnabled &&
            recognizer.claimsTouches &&
            takesTouchContacts(recognizer),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Keeps the touchend cancelable, and the contextmenu subscription on,
   * only while a claimer is attached; with only watchers the touchend is
   * passive and the contextmenu is off. Clicks are the click guard's
   * (utils/clickGuard.ts), whose one listener a window gets only once a
   * gesture first arms it.
   */
  private syncClaimingListeners(): void {
    if (!this.isInstalled) {
      return;
    }
    const isClaiming = this.hasClaimer();
    if (isClaiming === this.isClaimingInstalled) {
      return;
    }
    const view = this.doc.defaultView;
    for (const unsubscribe of this.claimingUnsubscribers.splice(0)) {
      unsubscribe();
    }
    if (view != null) {
      if (this.inputMode === 'auto') {
        this.claimingUnsubscribers.push(
          subscribeInput(view, 'touchend', this.onTouchEnd, {
            cancels: isClaiming,
          }),
        );
      }
      if (isClaiming) {
        this.claimingUnsubscribers.push(
          subscribeInput(view, 'contextmenu', this.onContextMenu, {
            cancels: true,
          }),
        );
      }
    }
    this.isClaimingInstalled = isClaiming;
  }

  private shouldListen(): boolean {
    if (!this.needsInput()) {
      return false;
    }
    // A retainer (a finger-scroll watch) listens only where the pointer is
    // coarse: it follows a finger's scroll, which a fine pointer's page
    // leaves to the browser (FR24).
    if (this.isCoarse && this.retainers > 0) {
      return true;
    }
    let isUsed = false;
    for (const registration of this.registry.values()) {
      const consumer = registration.consumer;
      if (
        (consumer != null && consumer.isEnabled?.() !== false) ||
        registration.recognizers.some(recognizer => recognizer.isEnabled)
      ) {
        isUsed = true;
        break;
      }
    }
    // Where the primary pointer is fine, only while a press an element armed
    // is held (syncArmed, FR24, FR43).
    return isUsed && (this.isCoarse || this.isArmedPress);
  }

  // --- Listeners -------------------------------------------------------------

  private install(): void {
    this.watchPointer();
    if (!this.needsInput()) {
      return;
    }
    if (this.isInstalled) {
      return;
    }
    const view = this.doc.defaultView;
    this.isInstalled = true;
    this.usesTouchEvents =
      this.inputMode === 'auto' && view != null && 'ontouchstart' in view;
    if (view == null) {
      // A document without a window receives no input.
      return;
    }
    // The window's capture phase, through the shared input stream
    // (utils/inputStream.ts): ahead of any document listener, so an app's
    // window-capture stopPropagation, or a document-capture
    // stopImmediatePropagation registered first, no longer hides a touch
    // from the recognizers. A recognizer that must claim mid-gesture still
    // needs the touch to reach its element, where its blocking touchmove
    // sits. Only the listeners that cancel are non-passive, and only while a
    // claimer is attached (syncClaimingListeners); none of them is a
    // touchstart or touchmove, so none of them holds a scroll.
    this.unsubscribers = [
      // Pointer Events only: a finger comes from its pointer events alone. A
      // browser that has Touch Events still sends them for the same finger,
      // and reading both would track it twice (a long press needs one touch).
      ...(this.inputMode === 'auto'
        ? [
            subscribeInput(view, 'touchstart', this.onTouchStart),
            subscribeInput(view, 'touchmove', this.onTouchMove),
            subscribeInput(view, 'touchcancel', this.onTouchCancel),
          ]
        : []),
      subscribeInput(view, 'pointerdown', this.onPointerDown),
      subscribeInput(view, 'pointermove', this.onPointerMove),
      subscribeInput(view, 'pointerup', this.onPointerUp),
      subscribeInput(view, 'pointercancel', this.onPointerCancel),
      subscribeInput(view, 'scroll', this.onScroll),
      subscribeInput(view, 'visibilitychange', this.onVisibilityChange),
      // The window's own blur; an element's blur (a Node's) reaches the
      // window's capture phase too and means nothing here.
      subscribeInput(view, 'blur', event => {
        if (!(event.target instanceof view.Node)) {
          this.onBlur();
        }
      }),
    ];
    // Passive until a claimer is attached (syncClaimingListeners).
    this.isClaimingInstalled = false;
    this.claimingUnsubscribers =
      this.inputMode === 'auto'
        ? [subscribeInput(view, 'touchend', this.onTouchEnd)]
        : [];
  }

  private uninstall(): void {
    if (!this.isInstalled) {
      return;
    }
    this.isInstalled = false;
    // Unheard from here on: no fingers to keep.
    this.fingerTargets = [];
    this.isClaimingInstalled = false;
    for (const unsubscribe of [
      ...this.unsubscribers.splice(0),
      ...this.claimingUnsubscribers.splice(0),
    ]) {
      unsubscribe();
    }
    this.cancelEverything(this.arena.now());
    // A claimed lift's note stays: an armed press's listeners go in the
    // microtask after its pointerup, the touchend comes after that microtask
    // in the same task (iOS and WebKit), and the element's own listener still
    // takes it (noteClaimedLift).
    this.lastTouch = null;
    this.lastScroll = null;
  }

  // --- Hit path --------------------------------------------------------------

  /**
   * The recognizers on the path from `target` to the document, innermost
   * first, and (for a contact) its consumer: the innermost element with an
   * attached consumer.
   */
  private participantsAt(
    target: unknown,
    pointerType: PointerKind | null,
  ): {
    recognizers: GestureRecognizer[];
    consumer: TouchConsumer | null;
    consumerElement: Element | null;
  } {
    const recognizers: GestureRecognizer[] = [];
    let consumer: TouchConsumer | null = null;
    let consumerElement: Element | null = null;
    if (
      target instanceof Node &&
      [...this.touchGates].some(gate => gate(target))
    ) {
      return {recognizers, consumer, consumerElement};
    }
    let hasConsumerOwner = pointerType == null;
    for (
      let node: Node | null = target instanceof Node ? target : null;
      node != null;
      node = parentAcrossShadow(node)
    ) {
      if (!(node instanceof Element)) {
        continue;
      }
      const registration = this.registry.get(node);
      if (registration != null) {
        // Every pointer (`spec:AST-094` FR43), hover included.
        recognizers.push(...registration.recognizers);
      }
      if (hasConsumerOwner || pointerType == null) {
        continue;
      }
      // A press consumer takes every pointer's press, a mouse's too
      // (`spec:AST-094` FR43, DEC-21).
      if (registration?.consumer != null) {
        consumer = registration.consumer;
        consumerElement = node;
        hasConsumerOwner = true;
        continue;
      }
    }
    return {recognizers, consumer, consumerElement};
  }

  /**
   * Turn text selection and the touch callout off, for as long as this
   * finger or pen is down, only on the elements whose hold does something:
   * a long press's (a menu, a hold-repeat), those of recognizers created
   * with a `selectionLock` (a slider's thumb, a switch's drag, a tab bar's
   * zero-delay lens) and that of a press tracker created with one (a
   * stepper's hold-repeat). Anything whose hold does nothing, a plain
   * press-tracked control or row included, keeps the browser's long-press
   * selection (`spec:AST-094` FR41). Restored when the contact ends. Callers
   * lock for a finger or a pen under any primary pointer, never for a mouse
   * (locksSelectionFor), and only once the arena has admitted the contact:
   * `recognizers` and `consumer` are the ones that took it.
   */
  private lockSelection(
    id: number,
    recognizers: ReadonlyArray<GestureRecognizer>,
    target: EventTarget | null,
    consumer: TouchConsumer | null,
    consumerElement: Element | null,
  ): void {
    // Each recognizer whose hold does something brings its lock; the host
    // never imports one (a component without such a hold does not bundle
    // it). Only one that took this contact locks for it: a recognizer that
    // declined it (its pointer, or its own shouldReceiveTouch) has no hold
    // here.
    // An element attached with manageStyle: false keeps its own styles, the
    // lock included (AttachOptions.manageStyle).
    const managed = (element: Element) =>
      this.registry.get(element)?.manageStyle !== false;
    const byLock = new Map<SelectionLock, Set<Element>>();
    for (const recognizer of recognizers) {
      const lock = recognizer.selectionLock;
      if (
        lock != null &&
        recognizer.view instanceof Element &&
        managed(recognizer.view)
      ) {
        const elements = byLock.get(lock) ?? new Set<Element>();
        elements.add(recognizer.view);
        byLock.set(lock, elements);
      }
    }
    const consumerLock = consumer?.selectionLock;
    if (
      consumerLock != null &&
      consumerElement != null &&
      managed(consumerElement)
    ) {
      const elements = byLock.get(consumerLock) ?? new Set<Element>();
      elements.add(consumerElement);
      byLock.set(consumerLock, elements);
    }
    if (byLock.size > 0) {
      const undo = [...byLock].map(([lock, elements]) =>
        lock(elements, target),
      );
      this.lockedBy.set(id, () => {
        for (const release of undo) {
          release();
        }
      });
    }
  }

  /**
   * Wheel and trackpad input (`spec:AST-094` FR43). A wheel gesture drives
   * the recognizers that allow its scroll type as a contact moving with the
   * content: a pan's along its own axis, after every scroller between the
   * pointer and the pan's element can no longer scroll that way, as decided
   * at the gesture's first wheel; a pinch's (a ctrl-wheel, as a trackpad
   * pinches) as two contacts whose span follows exp(-deltaY / 100). A wheel
   * the page keeps is never prevented; one a recognizer takes always is. It
   * ends `WHEEL_END_MS` after its last wheel, at that wheel's time, so its
   * release keeps its velocity. A gesture a recognizer took is latched to it,
   * as a browser latches a scroller: while it lasts, the document hands this
   * every wheel first, wherever it lands, so a pan whose element moves from
   * under a still pointer keeps it (FR24: a page listener only during a
   * gesture).
   */
  private readonly onWheel = (event: Event): void => {
    const wheel = event as WheelEvent;
    if (this.wheelsSeen.has(wheel)) {
      return;
    }
    this.wheelsSeen.add(wheel);
    const time = eventTime(wheel);
    const kind = wheel.ctrlKey ? 'pinch' : 'pan';
    let gesture = this.wheel;
    if (
      gesture != null &&
      (gesture.kind !== kind ||
        time - gesture.last >=
          (gesture.step != null && !gesture.step.committed
            ? WHEEL_STEP_CARRY_MS
            : (gesture.follow?.endMs ?? WHEEL_END_MS)))
    ) {
      this.endWheel(time);
      gesture = null;
    }
    if (
      gesture != null &&
      gesture.ids.length > 0 &&
      gesture.step == null &&
      !this.wheelHasTaker(gesture)
    ) {
      // Every recognizer that took it has left (detached, disabled or
      // cancelled): the rest of the gesture is the page's.
      this.endWheel();
      gesture = {
        kind,
        scrollType: scrollTypeOf(wheel),
        ids: [],
        x: wheel.clientX,
        y: wheel.clientY,
        span: WHEEL_PINCH_SPAN,
        last: time,
        timer: null,
        takers: [],
      };
      this.wheel = gesture;
    }
    const {dx, dy} = wheelPixels(wheel, this.doc.defaultView);
    const horizontal =
      gesture?.step != null
        ? gesture.step.axis === 'x'
        : Math.abs(dx) > Math.abs(dy);
    const seg = this.segmenter.push(
      time,
      horizontal ? dx : dy,
      gesture?.step != null && !gesture.step.committed
        ? WHEEL_STEP_CARRY_MS
        : horizontal
          ? WHEEL_FOLLOW_END_MS
          : WHEEL_FOLLOW_END_V_MS,
    );
    this.wheelSegment = seg;
    if (seg.boundary != null) {
      this.lastBoundary = seg.boundary;
      if (gesture != null) {
        this.endWheel(time);
        gesture = null;
      }
    }
    if (gesture?.step?.committed && this.lastStep != null) {
      this.lastStep.last = time;
    }
    if (gesture == null) {
      gesture = this.beginWheel(wheel, kind, dx, dy, time);
      this.wheel = gesture;
      if (gesture.ids.length > 0) {
        this.latchWheel();
      }
    }
    gesture.last = time;
    if (gesture.timer != null) {
      this.clock.clearTimeout(gesture.timer);
    }
    // A step that has not committed yet waits out a slow swipe's gaps, so
    // its travel keeps adding up within one contact; a followed trackpad
    // scroll waits out a slow drag's.
    gesture.timer = this.clock.setTimeout(
      () => {
        this.segmenter.end();
        this.endWheel();
      },
      gesture.step != null && !gesture.step.committed
        ? WHEEL_STEP_CARRY_MS
        : (gesture.follow?.endMs ?? WHEEL_END_MS),
    );
    if (gesture.ids.length === 0) {
      return;
    }
    wheel.preventDefault();
    if (gesture.step) {
      this.stepWheel(gesture, gesture.step, dx, dy, time);
      return;
    }
    if (gesture.kind === 'pan' && gesture.follow) {
      const f = gesture.follow;
      if (f.lifted) {
        return;
      }
      if (this.wheelSegment?.liftNow === true) {
        // Momentum began: the fingers lifted before the held deltas. The pan
        // keeps the travel it showed through the undecided stretch and lets
        // go here, still moving at the fingers' speed, so its release carries
        // on from it; the rest of the momentum never moves the pan.
        this.followProvisionally(gesture, f, time);
        f.lifted = true;
        this.arena.ended([
          {id: gesture.ids[0], x: gesture.x, y: gesture.y, time},
        ]);
        return;
      }
      if (this.wheelSegment?.decaying === true) {
        // Undecided: the real deltas wait for the splitter while the
        // fingers' last speed carries the pan on.
        f.heldX += dx;
        f.heldY += dy;
        this.followProvisionally(gesture, f, time);
        return;
      }
      // The fingers' own delta; the held ones were theirs too. What the pan
      // shows ahead of their travel, or behind it, is absorbed by their moves
      // half a move at a time, so it never steps back and ends on their
      // travel.
      const beforeX = f.trueX - f.heldX;
      const beforeY = f.trueY - f.heldY;
      const debtX = absorbedDebt(gesture.x - beforeX, dx);
      const debtY = absorbedDebt(gesture.y - beforeY, dy);
      const trueX = beforeX - dx;
      const trueY = beforeY - dy;
      const elapsed = time - f.lastMove;
      if (elapsed > 0) {
        f.speedX = (trueX - f.trueX) / elapsed;
        f.speedY = (trueY - f.trueY) / elapsed;
      }
      f.trueX = trueX;
      f.trueY = trueY;
      f.heldX = 0;
      f.heldY = 0;
      f.lastMove = time;
      gesture.x = trueX + debtX;
      gesture.y = trueY + debtY;
      f.baseX = gesture.x;
      f.baseY = gesture.y;
      this.arena.moved([
        {id: gesture.ids[0], x: gesture.x, y: gesture.y, time},
      ]);
      return;
    }
    if (gesture.kind === 'pan') {
      gesture.x -= dx;
      gesture.y -= dy;
      this.arena.moved([
        {id: gesture.ids[0], x: gesture.x, y: gesture.y, time},
      ]);
    } else {
      gesture.span *= Math.exp(-dy / 100);
      this.arena.moved(this.pinchContacts(gesture, time));
    }
  };

  /**
   * Through the splitter's undecided stretch, a followed pan moves on from
   * where it was shown at the fingers' last move at their last speed, never
   * past what that speed projects for the time since.
   */
  private followProvisionally(
    gesture: WheelGesture,
    f: WheelFollow,
    time: number,
  ): void {
    const elapsed = Math.max(0, time - f.lastMove);
    const x = f.baseX + f.speedX * elapsed;
    const y = f.baseY + f.speedY * elapsed;
    if (x === gesture.x && y === gesture.y) {
      return;
    }
    gesture.x = x;
    gesture.y = y;
    this.arena.moved([{id: gesture.ids[0], x, y, time}]);
  }

  /**
   * A swipe its pans take as one step (`wheelStep`): its travel adds up, and
   * once it reaches WHEEL_STEP_PX over two wheels or more, the step plays a
   * short flick (two moves within 24 ms) and ends its contact, so the pan's
   * release settles one step. Within the same gesture the step can be undone
   * once, back to rest (an open row closes), and never past it.
   */
  private stepWheel(
    gesture: WheelGesture,
    s: WheelStep,
    dx: number,
    dy: number,
    time: number,
  ): void {
    if (s.committed) {
      // Undone once at most, back to rest; never past it to the other side.
      const back = s.axis === 'x' ? dx : dy;
      if (
        !s.reversed &&
        this.wheelSegment?.phase === 'finger' &&
        back !== 0 &&
        Math.sign(back) !== s.sign
      ) {
        s.back = (s.back ?? 0) + back;
        if (Math.abs(s.back) >= WHEEL_STEP_PX && gesture.stepBegin != null) {
          s.reversed = true;
          const sign = Math.sign(s.back);
          const id = this.nextId++;
          const at = (px: number) =>
            s.axis === 'x'
              ? {x: gesture.x - sign * px, y: gesture.y}
              : {x: gesture.x, y: gesture.y - sign * px};
          this.arena.began([
            {...gesture.stepBegin, id, x: gesture.x, y: gesture.y, time},
          ]);
          this.arena.moved([{id, ...at(12), time: time + 8}]);
          this.arena.moved([{id, ...at(52), time: time + 24}]);
          this.arena.ended([{id, ...at(52), time: time + 24}]);
        }
      }
      return;
    }
    const d = s.axis === 'x' ? dx : dy;
    s.travel += d;
    if (d !== 0) {
      s.sign = Math.sign(d);
    }
    s.count += 1;
    if (Math.abs(s.travel) < WHEEL_STEP_PX || s.count < 2) {
      return;
    }
    const begin = gesture.stepBegin;
    if (begin == null) {
      return;
    }
    s.committed = true;
    const sign = Math.sign(s.travel);
    const id = gesture.ids[0];
    const at = (px: number) =>
      s.axis === 'x'
        ? {x: gesture.x - sign * px, y: gesture.y}
        : {x: gesture.x, y: gesture.y - sign * px};
    this.pendingStep = null;
    this.lastStep = {axis: s.axis, sign, last: time};
    this.arena.began([{...begin, id, x: gesture.x, y: gesture.y, time}]);
    this.arena.moved([{id, ...at(12), time: time + 8}]);
    this.arena.moved([{id, ...at(52), time: time + 24}]);
    this.arena.ended([{id, ...at(52), time: time + 24}]);
  }

  /** Start a wheel gesture: who takes it, decided once, or nobody. */
  private beginWheel(
    wheel: WheelEvent,
    kind: 'pan' | 'pinch',
    dx: number,
    dy: number,
    time: number,
  ): WheelGesture {
    const type = scrollTypeOf(wheel);
    const kept: WheelGesture = {
      kind,
      scrollType: type,
      ids: [],
      x: wheel.clientX,
      y: wheel.clientY,
      span: WHEEL_PINCH_SPAN,
      last: time,
      timer: null,
      takers: [],
    };
    // A contact already down keeps its gesture; the wheel stays the page's.
    // So does a first wheel another handler already prevented, or one that
    // cannot be cancelled: no recognizer could take it from the page.
    if (
      this.arena.touches.length > 0 ||
      (dx === 0 && dy === 0) ||
      wheel.defaultPrevented ||
      !wheel.cancelable
    ) {
      return kept;
    }
    const view = this.doc.defaultView;
    const isHorizontal = Math.abs(dx) > Math.abs(dy);
    // Every scroller under the pointer, the page included, as a finger's
    // probe reads them, without touch-action, which a wheel ignores.
    // What the wheel landed on: at a shadow host's listener the event's
    // target is the host, and a scroller inside its tree must count.
    const target = landedOn(wheel);
    const scroll = createNativeScrollProbe(target, {
      readsTouchAction: false,
    });
    const takers: GestureRecognizer[] = [];
    for (
      let node: Node | null = target instanceof Node ? target : null;
      node != null;
      node = parentAcrossShadow(node)
    ) {
      if (!(node instanceof Element)) {
        continue;
      }
      for (const recognizer of this.registry.get(node)?.recognizers ?? []) {
        if (
          !recognizer.isEnabled ||
          !recognizer.claimsTouches ||
          !recognizer.allowedScrollTypes.has(type) ||
          internals(recognizer).family !== kind
        ) {
          continue;
        }
        if (
          kind === 'pan' &&
          (!panTakesMove(recognizer, -dx, -dy) ||
            this.scrollerTakes(target, node, dx, dy, isHorizontal, view) ||
            // A scroll-edge pan only past every scroller's edge (FR19).
            (isScrollEdgePan(recognizer) && scroll.canScroll(-dx, -dy)))
        ) {
          continue;
        }
        takers.push(recognizer);
      }
    }
    if (takers.length === 0) {
      return kept;
    }
    const base = {
      pointerType: 'mouse' as const,
      target,
      scroll,
      scrollType: type,
      recognizers: takers,
      consumer: null,
    };
    const ids =
      kind === 'pan' ? [this.nextId++] : [this.nextId++, this.nextId++];
    const gesture: WheelGesture = {...kept, ids, takers};
    if (kind === 'pan' && type === 'continuous') {
      gesture.follow = {
        lifted: false,
        heldX: 0,
        heldY: 0,
        lastMove: time,
        trueX: kept.x,
        trueY: kept.y,
        baseX: kept.x,
        baseY: kept.y,
        speedX: 0,
        speedY: 0,
        endMs: isHorizontal ? WHEEL_FOLLOW_END_MS : WHEEL_FOLLOW_END_V_MS,
      };
    }
    if (
      kind === 'pan' &&
      takers.every(
        recognizer => isPanRecognizer(recognizer) && recognizer.wheelStep,
      )
    ) {
      const carry =
        this.pendingStep != null &&
        this.pendingStep.axis === (isHorizontal ? 'x' : 'y') &&
        time - this.pendingStep.last <= WHEEL_STEP_CARRY_MS &&
        Math.sign(isHorizontal ? dx : dy) === Math.sign(this.pendingStep.travel)
          ? this.pendingStep
          : null;
      this.pendingStep = null;
      gesture.step = {
        axis: isHorizontal ? 'x' : 'y',
        travel: carry?.travel ?? 0,
        sign: 0,
        committed: false,
        count: carry?.count ?? 0,
      };
      const along = isHorizontal ? dx : dy;
      if (
        this.lastStep != null &&
        (this.lastBoundary == null || this.lastBoundary === 'idle') &&
        this.lastStep.axis === gesture.step.axis &&
        time - this.lastStep.last <= 400 &&
        Math.sign(along) === this.lastStep.sign &&
        Math.abs(along) < 6
      ) {
        // The slow tail of a swipe that already stepped: absorb it.
        gesture.step.committed = true;
        gesture.step.sign = this.lastStep.sign;
        this.lastStep.last = time;
      }
    }
    if (gesture.step) {
      // A step's contact begins only when it commits, so its flick's
      // velocity never spans a slow swipe's whole duration.
      gesture.stepBegin = {
        ...base,
        id: ids[0],
        x: wheel.clientX,
        y: wheel.clientY,
      };
      return gesture;
    }
    this.arena.began(
      kind === 'pan'
        ? [{...base, id: ids[0], x: wheel.clientX, y: wheel.clientY, time}]
        : this.pinchContacts(gesture, time).map(input => ({
            ...base,
            ...input,
          })),
    );
    // Every recognizer it was offered to may decline it (its own
    // shouldReceiveTouch): then nobody took the wheel, and it scrolls the
    // page from its first step, as with no gesture system.
    if (ids.every(id => this.arena.participantsOf(id).length === 0)) {
      this.arena.cancelled(ids, time);
      return kept;
    }
    return gesture;
  }

  /** Whether a scroller between `target` and `boundary` (both included) scrolls this wheel now. */
  private scrollerTakes(
    target: unknown,
    boundary: Element,
    dx: number,
    dy: number,
    isHorizontal: boolean,
    view: Window | null,
  ): boolean {
    for (
      let node: Node | null = target instanceof Node ? target : null;
      node != null;
      node = parentAcrossShadow(node)
    ) {
      if (
        node instanceof Element &&
        scrollsBy(node, isHorizontal ? dx : dy, isHorizontal, view)
      ) {
        return true;
      }
      if (node === boundary) {
        break;
      }
    }
    return false;
  }

  /** A ctrl-wheel pinch's two contacts, `span` apart around its center. */
  private pinchContacts(
    gesture: WheelGesture,
    time: number,
  ): {id: number; x: number; y: number; time: number}[] {
    return [
      {id: gesture.ids[0], x: gesture.x - gesture.span / 2, y: gesture.y, time},
      {id: gesture.ids[1], x: gesture.x + gesture.span / 2, y: gesture.y, time},
    ];
  }

  /** Whether a recognizer that took this wheel gesture still takes part in it. */
  private wheelHasTaker(gesture: WheelGesture): boolean {
    // A cancelled or failed recognizer keeps that state until its contacts
    // end, which a wheel gesture's do only here.
    return gesture.takers.some(recognizer => {
      const {state} = recognizer;
      return (
        recognizer.isEnabled &&
        (state === 'began' ||
          state === 'changed' ||
          (state === 'possible' && recognizer.isInvolved()))
      );
    });
  }

  /** Route every wheel on the page to the live wheel gesture, from its claim. */
  private latchWheel(): void {
    if (!this.isWheelLatched) {
      this.doc.addEventListener('wheel', this.onWheel, {
        capture: true,
        passive: false,
      });
      this.isWheelLatched = true;
    }
  }

  /**
   * End the wheel gesture in progress. On its own (its timer, a taker
   * leaving, a detach) it ends `WHEEL_END_MS` after its last wheel; an input
   * that ends it sooner (a press, the next gesture's first wheel) passes its
   * own time. Both are on the wheels' time base (eventTime), never the
   * host's clock, which need not share it.
   */
  private endWheel(endTime?: number): void {
    const gesture = this.wheel;
    if (gesture?.step && !gesture.step.committed && gesture.step.travel !== 0) {
      this.pendingStep = {
        axis: gesture.step.axis,
        travel: gesture.step.travel,
        count: gesture.step.count,
        last: gesture.last,
      };
    }
    if (this.isWheelLatched) {
      this.doc.removeEventListener('wheel', this.onWheel, {capture: true});
      this.isWheelLatched = false;
    }
    if (gesture == null) {
      return;
    }
    this.wheel = null;
    if (gesture.timer != null) {
      this.clock.clearTimeout(gesture.timer);
    }
    if (
      gesture.ids.length === 0 ||
      gesture.step != null ||
      gesture.follow?.lifted
    ) {
      return;
    }
    // Fingers that stop without a lift end on their travel where it runs
    // ahead of what the pan shows; what the undecided stretch showed past it
    // stays, as a step back would show.
    if (gesture.follow != null) {
      const f = gesture.follow;
      const x = ahead(gesture.x, f.trueX - f.heldX, f.speedX);
      const y = ahead(gesture.y, f.trueY - f.heldY, f.speedY);
      if (x !== gesture.x || y !== gesture.y) {
        gesture.x = x;
        gesture.y = y;
        this.arena.moved([{id: gesture.ids[0], x, y, time: gesture.last}]);
      }
    }
    // A trackpad's scroll releases at its last wheel, with its speed: its
    // momentum arrives as more wheel. A mouse wheel's notches release still,
    // past the velocity's stillness interval, so position alone decides
    // where a pan settles (the coordinator's ruling; FR43 is silent).
    // Never later than the input that ends it (a press, the next gesture's
    // first wheel): the arena's clock only moves forward, so a later stamp
    // would move that input's times too (FR16).
    const end = gesture.last + (gesture.follow?.endMs ?? WHEEL_END_MS);
    const time =
      endTime == null ? end : Math.max(gesture.last, Math.min(end, endTime));
    this.arena.ended(
      gesture.kind === 'pan'
        ? [{id: gesture.ids[0], x: gesture.x, y: gesture.y, time}]
        : this.pinchContacts(gesture, time),
    );
  }

  /** Undo `lockSelection` for a contact that ended; idempotent. */
  private unlockSelection(id: number): void {
    this.lockedBy.get(id)?.();
    this.lockedBy.delete(id);
  }

  // --- Touch events ----------------------------------------------------------

  /**
   * Hold touches away from every participant while `gate(target)` answers
   * true (a presentation running in a layer: its content takes no touch
   * until it settles). Returns the release.
   */
  addTouchGate(gate: (target: Node) => boolean): () => void {
    this.touchGates.add(gate);
    return () => {
      this.touchGates.delete(gate);
    };
  }

  /**
   * How many fingers are on the screen: the length of `touches` in the last
   * touch event the host's listeners heard (`touchstart`, `touchmove`,
   * `touchend`, `touchcancel`), whatever its target, so a finger on an
   * element with no recognizer counts too. 0 before any, and while no
   * listener is installed. A recognizer that must not begin under a second
   * finger reads it in `shouldBegin`.
   */
  fingersDown(): number {
    return this.fingerTargets.length;
  }

  /** Whether this event is new to the host (and mark it handled). */
  private takeEvent(event: Event): boolean {
    if (this.processed.has(event)) {
      return false;
    }
    this.processed.add(event);
    return true;
  }

  private readonly onTouchStart = (event: TouchEvent): void => {
    this.endWheel(eventTime(event));
    this.noteFingersDown(event);
    // Where the host reads a finger from its pointer events (no ontouchstart,
    // as after touch emulation turns on), its Touch Events would track it twice.
    if (!this.usesTouchEvents || !this.takeEvent(event)) {
      return;
    }
    if (this.fingerTargets.length > 1) {
      this.failUnclaimedLoneFingerPans();
    }
    const time = eventTime(event);
    const inputs: ArenaBeganInput[] = [];
    const untracked: TouchBeganInput[] = [];
    const stale: number[] = [];
    // Locked once the arena knows which recognizers took each finger.
    const toLock: {
      id: number;
      target: EventTarget | null;
      consumerElement: Element | null;
    }[] = [];
    for (const touch of touchesOf(event.changedTouches)) {
      if ((touch as StylusTouch).touchType === 'stylus') {
        continue;
      }
      // A finger number still tracked here began again: the touch it named
      // ended where no listener of ours could hear it.
      this.cancelledFingers.delete(touch.identifier);
      const previous = this.forgetFinger(touch.identifier);
      if (previous != null) {
        stale.push(previous);
      }
      const native =
        touch.target instanceof Node
          ? landedOn(event, touch.target)
          : landedOn(event);
      const target = this.presentedTarget(
        native,
        touch.clientX,
        touch.clientY,
        event.timeStamp,
      );
      const {recognizers, consumer, consumerElement} = this.participantsAt(
        target,
        'touch',
      );
      if (recognizers.length === 0 && consumer == null) {
        // Nothing here takes part: the touch stays the page's, but a
        // recognizer tracking another finger hears it began (a second
        // finger beside an open menu ends its press, spec:AST-094 FR28).
        untracked.push({
          id: this.nextId++,
          x: touch.clientX,
          y: touch.clientY,
          time,
          pointerType: 'touch',
          target,
        });
        continue;
      }
      const id = this.nextId++;
      this.touchIds.set(touch.identifier, id);
      if (locksSelectionFor('touch')) {
        toLock.push({id, target, consumerElement});
      }
      // The finger's events keep going to what the engine hit.
      this.watchTarget(
        touch.identifier,
        native,
        recognizers.some(claimsWhileMoving) || consumer?.keepsTouch != null,
        consumer != null ||
          recognizers.some(recognizer => recognizer.claimsTouches),
      );
      this.lastFed.set(id, {x: touch.clientX, y: touch.clientY, time});
      this.pairTouch(id, {x: touch.clientX, y: touch.clientY, target: native});
      if (target !== native && target != null) {
        this.retargeted.set(id, {x: touch.clientX, y: touch.clientY, target});
      }
      inputs.push({
        id,
        x: touch.clientX,
        y: touch.clientY,
        time,
        pointerType: 'touch',
        target,
        scroll: createNativeScrollProbe(target),
        recognizers,
        consumer,
      });
    }
    if (stale.length > 0) {
      this.arena.cancelled(stale, time);
    }
    this.arena.began(inputs);
    for (const {id, target, consumerElement} of toLock) {
      this.lockSelection(
        id,
        this.arena.participantsOf(id),
        target,
        this.arena.consumerOf(id) ?? null,
        consumerElement,
      );
    }
    for (const input of untracked) {
      this.arena.untrackedBegan(input);
    }
    // Stamped after the consumers judged the touch: the brake asks whether
    // an EARLIER finger is still driving a scroll.
    const landed = landedOn(event);
    if (landed instanceof Node) {
      this.lastTouch = {target: landed, time};
    }
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    this.noteFingersDown(event);
    // Where the host reads a finger from its pointer events (no ontouchstart,
    // as after touch emulation turns on), its Touch Events would track it twice.
    if (!this.usesTouchEvents || !this.takeEvent(event)) {
      return;
    }
    this.dropFingersNotDown(event);
    const time = eventTime(event);
    const ids: number[] = [];
    const inputs: TouchInput[] = [];
    for (const touch of touchesOf(event.changedTouches)) {
      const id = this.touchIds.get(touch.identifier);
      if (id == null) {
        continue;
      }
      ids.push(id);
      inputs.push({id, x: touch.clientX, y: touch.clientY, time});
    }
    if (inputs.length === 0) {
      return;
    }
    if (!event.cancelable) {
      // The browser no longer asks the page about these fingers. WebKit
      // stops asking when it takes the touch to pan (its pointercancel comes
      // with it); Chromium also stops after one unconsumed touchmove, even
      // when `touch-action` keeps it from panning the way the finger went (a
      // horizontal drag under pan-y). So a finger's FIRST uncancelable move
      // counts as the browser's claim only if the browser could pan along
      // the finger's main axis since touch-down; later ones add nothing, and
      // pointercancel or a scroll still report any real pan.
      const placed = new Map(inputs.map(input => [input.id, input]));
      const taken = ids.filter(id => {
        const touch = this.arena.getTouch(id);
        if (
          touch == null ||
          touch.takenByBrowser ||
          this.arena.isClaimed(id) ||
          touch.scroll?.allowsNativePan === false ||
          this.judgedUncancelable.has(id)
        ) {
          return false;
        }
        this.judgedUncancelable.add(id);
        const input = placed.get(id);
        if (input == null || touch.scroll == null) {
          return true;
        }
        const dx = input.x - touch.startX;
        const dy = input.y - touch.startY;
        return Math.abs(dx) >= Math.abs(dy)
          ? touch.scroll.canScroll(dx, 0)
          : touch.scroll.canScroll(0, dy);
      });
      if (taken.length > 0) {
        this.browserTook(taken, time);
      }
    }
    // A finger its pointer events sample is fed from there, never from here.
    this.feedMoves(inputs.filter(input => !this.pointerFed.has(input.id)));
  };

  /** The one blocking `touchmove` handler every claiming element shares. */
  private readonly onBlockingTouchMove = (event: Event): void => {
    this.cancelIfClaimed(event as TouchEvent);
  };

  /**
   * Cancel a `touchmove` while a recognizer owns one of its fingers. A touch
   * no recognizer owns keeps its moves (`spec:AST-094` FR19): nothing is
   * cancelled before a recognizer begins, or for a touch it does not track,
   * unless a recognizer holds that finger already (a scroll-edge pan pulling
   * away from an edge every scroller under it is at; FR19, DEC-18).
   */
  /**
   * Under `inputMode: 'pointer-events'` a finger comes from its pointer
   * events, so its touches carry no id of ours: the live finger it is, the
   * nearest pointer-fed finger on the same target. Its touchmoves can then
   * be cancelled once a recognizer claims it (`spec:AST-094` FR19, FR21).
   */
  private pointerFingerAt(touch: Touch): number | undefined {
    let best: GestureTouch | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const finger of this.arena.touches) {
      if (
        finger.pointerType !== 'touch' ||
        finger.phase === 'ended' ||
        finger.phase === 'cancelled' ||
        !(finger.target instanceof Node) ||
        !(touch.target instanceof Node) ||
        // Along the flat tree, both ways: the finger's target can be inside
        // an open shadow root while its touches reach the host retargeted.
        !(
          containsAlongFlatTree(finger.target, touch.target) ||
          containsAlongFlatTree(touch.target, finger.target)
        )
      ) {
        continue;
      }
      const d = Math.hypot(finger.x - touch.clientX, finger.y - touch.clientY);
      if (d < bestDistance) {
        best = finger;
        bestDistance = d;
      }
    }
    return best?.id;
  }

  /**
   * Cancel the `touchend` of a finger a recognizer owned when it lifted
   * (`inputMode: 'pointer-events'`): its `pointerup` came first, at the same
   * place on the same target (`spec:AST-094` FR21). Records older than
   * CLAIMED_LIFT_MS are dropped first: their touchend never came.
   */
  private readonly onClaimedTouchEnd = (event: Event): void => {
    const end = event as TouchEvent;
    const time = eventTime(end);
    for (let i = this.claimedLifts.length - 1; i >= 0; i--) {
      if (time - this.claimedLifts[i].time > CLAIMED_LIFT_MS) {
        this.claimedLifts.splice(i, 1);
      }
    }
    if (!end.cancelable || end.defaultPrevented) {
      return;
    }
    for (const touch of touchesOf(end.changedTouches)) {
      // As its pointer landed: inside an open shadow root this listener
      // sees the touch retargeted to the host.
      const index = this.claimedLifts.findIndex(lift =>
        isSamePlace(lift, {
          x: touch.clientX,
          y: touch.clientY,
          target: landedOn(end, touch.target),
        }),
      );
      if (index >= 0) {
        this.claimedLifts.splice(index, 1);
        if (this.claimedLifts.length === 0) {
          this.clearClaimedLifts();
        }
        end.preventDefault();
        return;
      }
    }
  };

  private cancelIfClaimed(event: TouchEvent): void {
    if (!event.cancelable || event.defaultPrevented) {
      return;
    }
    // Only the touches this move reports: another finger a recognizer owns
    // does not make this one its own.
    const moved = touchesOf(event.changedTouches);
    for (const touch of moved) {
      const id =
        this.touchIds.get(touch.identifier) ??
        // Where fingers come from pointer events (inputMode 'pointer-events',
        // or 'auto' with no ontouchstart), the touch is matched to its pointer.
        (this.usesTouchEvents ? undefined : this.pointerFingerAt(touch));
      if (
        id != null &&
        (this.arena.isClaimed(id) ||
          // A kept press keeps its finger under any pointer (FR11, DEC-21).
          this.arena.consumerOf(id)?.keepsTouch?.(id) === true ||
          // A recognizer that holds the finger before it begins: a
          // scroll-edge pan pulling away from an edge (FR19, DEC-18), only
          // while this is the one finger on the screen: with a second one
          // down anywhere, even off the recognizer's element, the moves stay
          // the browser's, for its pinch (FR10).
          (event.touches.length === 1 &&
            this.arena
              .participantsOf(id)
              .some(recognizer => internals(recognizer).keepsTouch(id))))
      ) {
        event.preventDefault();
        return;
      }
    }
    if (hasStylusTouch(event)) {
      for (const id of this.pointerIds.values()) {
        if (this.arena.isClaimed(id)) {
          // A pen whose pointer a recognizer owns: its stylus touches too,
          // never a finger no recognizer owns.
          event.preventDefault();
          return;
        }
      }
    }
  }

  private readonly onTouchEnd = (event: TouchEvent): void => {
    this.releaseArmedPress();
    this.noteFingersDown(event);
    // Where the host reads a finger from its pointer events (no ontouchstart,
    // as after touch emulation turns on), its Touch Events would track it twice.
    if (!this.usesTouchEvents || !this.takeEvent(event)) {
      return;
    }
    this.dropFingersNotDown(event);
    const time = eventTime(event);
    const inputs: TouchInput[] = [];
    const retargetedEnds: {
      id: number;
      landed: {x: number; y: number; target: EventTarget};
      x: number;
      y: number;
    }[] = [];
    let isRefused = false;
    for (const touch of touchesOf(event.changedTouches)) {
      if (this.cancelledFingers.delete(touch.identifier)) {
        isRefused = true;
        continue;
      }
      const tracked = this.touchIds.get(touch.identifier);
      const landed = tracked == null ? undefined : this.retargeted.get(tracked);
      const id = this.forgetFinger(touch.identifier);
      if (id == null) {
        continue;
      }
      inputs.push({id, x: touch.clientX, y: touch.clientY, time});
      if (landed != null) {
        retargetedEnds.push({id, landed, x: touch.clientX, y: touch.clientY});
      }
    }
    // The lift is when momentum starts: the clock the brake wants most.
    const landed = landedOn(event);
    if (landed instanceof Node) {
      this.lastTouch = {target: landed, time};
    }
    const dispositions =
      inputs.length > 0
        ? this.arena.ended(inputs)
        : new Map<number, ClickDisposition>();
    let cancelsClick = isRefused || needsSuppression(dispositions);
    // A tap sent to what is drawn: the engine's click would hit the layout
    // position, so it is cancelled and the tap clicks what it touched.
    for (const end of retargetedEnds) {
      if (this.clickRetargetedTap(end.landed, end, dispositions.get(end.id))) {
        cancelsClick = true;
      }
    }
    if (cancelsClick) {
      if (event.cancelable) {
        event.preventDefault();
      }
      armClickGuard(this.doc);
    }
  };

  /**
   * Clicks what a retargeted contact touched if it ended as a tap the
   * engine would click: nothing claimed it, the browser did not take it
   * (a taken contact is no longer retargeted), and the finger stayed within
   * a tap's movement. Returns whether it clicked.
   */
  private clickRetargetedTap(
    landed: {x: number; y: number; target: EventTarget} | undefined,
    end: {x: number; y: number},
    disposition: ClickDisposition | undefined,
  ): boolean {
    if (landed == null || disposition !== 'allow') {
      return false;
    }
    const moved = Math.hypot(end.x - landed.x, end.y - landed.y);
    if (moved > UIKIT_TAP.allowableMovement.value) {
      return false;
    }
    this.clickRetargeted(landed.target, end.x, end.y);
    return true;
  }

  private readonly onTouchCancel = (event: TouchEvent): void => {
    this.releaseArmedPress();
    this.noteFingersDown(event);
    // Where the host reads a finger from its pointer events (no ontouchstart,
    // as after touch emulation turns on), its Touch Events would track it twice.
    if (!this.usesTouchEvents || !this.takeEvent(event)) {
      return;
    }
    const listed = touchesOf(event.changedTouches);
    // A cancel that names no finger is the system taking them all.
    const identifiers =
      listed.length > 0
        ? listed.map(touch => touch.identifier)
        : [...this.touchIds.keys()];
    if (listed.length === 0) {
      this.cancelledFingers.clear();
    }
    for (const identifier of identifiers) {
      this.cancelledFingers.delete(identifier);
    }
    const ids: number[] = [];
    for (const identifier of identifiers) {
      const id = this.forgetFinger(identifier);
      if (id != null) {
        ids.push(id);
      }
    }
    if (ids.length > 0) {
      this.arena.cancelled(ids, eventTime(event));
    }
  };

  /** The target's own listeners, for a target that left the document. */
  private readonly onTargetTouchMove = (event: Event): void => {
    this.onTouchMove(event as TouchEvent);
    this.cancelIfClaimed(event as TouchEvent);
  };

  /** The same for a finger nothing could claim while it moves: never blocks. */
  private readonly onTargetTouchMovePassive = (event: Event): void => {
    this.onTouchMove(event as TouchEvent);
  };

  private readonly onTargetTouchEnd = (event: Event): void => {
    this.onTouchEnd(event as TouchEvent);
  };

  /** The same, registered passively for a touch only watchers follow. */
  private readonly onTargetTouchEndPassive = (event: Event): void => {
    this.onTouchEnd(event as TouchEvent);
  };

  private readonly onTargetTouchCancel = (event: Event): void => {
    this.onTouchCancel(event as TouchEvent);
  };

  /**
   * Cancel tracked fingers the event says are no longer down. `touches`
   * lists every finger on the screen; one missing from it (and not lifting
   * in this very event) ended where we could not see it.
   */
  private dropFingersNotDown(event: TouchEvent): void {
    if (
      event.touches == null ||
      (this.touchIds.size === 0 && this.cancelledFingers.size === 0)
    ) {
      return;
    }
    const down = new Set<number>();
    for (const touch of touchesOf(event.touches)) {
      down.add(touch.identifier);
    }
    for (const touch of touchesOf(event.changedTouches)) {
      down.add(touch.identifier);
    }
    for (const identifier of [...this.cancelledFingers]) {
      if (!down.has(identifier)) {
        this.cancelledFingers.delete(identifier);
      }
    }
    const gone = [...this.touchIds.keys()].filter(
      identifier => !down.has(identifier),
    );
    const ids: number[] = [];
    for (const identifier of gone) {
      const id = this.forgetFinger(identifier);
      if (id != null) {
        ids.push(id);
      }
    }
    if (ids.length > 0) {
      this.arena.cancelled(ids, eventTime(event));
    }
  }

  private watchTarget(
    identifier: number,
    target: EventTarget | null,
    isBlocking: boolean,
    isClaiming: boolean,
  ): void {
    if (target == null || typeof target.addEventListener !== 'function') {
      return;
    }
    this.touchTargets.set(identifier, target);
    const state = this.watched.get(target);
    if (state == null) {
      this.watched.set(target, {
        count: 1,
        blocking: isBlocking ? 1 : 0,
        claiming: isClaiming ? 1 : 0,
      });
      if (isBlocking) {
        this.blockingFingers.add(identifier);
      }
      if (isClaiming) {
        this.claimingFingers.add(identifier);
      }
      target.addEventListener(
        'touchmove',
        isBlocking ? this.onTargetTouchMove : this.onTargetTouchMovePassive,
        {passive: !isBlocking},
      );
      target.addEventListener(
        'touchend',
        isClaiming ? this.onTargetTouchEnd : this.onTargetTouchEndPassive,
        {passive: !isClaiming},
      );
      target.addEventListener('touchcancel', this.onTargetTouchCancel, {
        passive: true,
      });
      return;
    }
    const wasBlocking = state.blocking > 0;
    const wasClaiming = state.claiming > 0;
    state.count += 1;
    if (isBlocking) {
      state.blocking += 1;
      this.blockingFingers.add(identifier);
    }
    if (isClaiming) {
      state.claiming += 1;
      this.claimingFingers.add(identifier);
    }
    this.swapTargetTouchMove(target, wasBlocking, state.blocking > 0);
    this.swapTargetTouchEnd(target, wasClaiming, state.claiming > 0);
  }

  private unwatchTarget(identifier: number): void {
    const target = this.touchTargets.get(identifier);
    if (target == null) {
      return;
    }
    this.touchTargets.delete(identifier);
    const state = this.watched.get(target);
    if (state == null) {
      return;
    }
    const wasBlocking = state.blocking > 0;
    const wasClaiming = state.claiming > 0;
    state.count -= 1;
    if (this.blockingFingers.delete(identifier)) {
      state.blocking -= 1;
    }
    if (this.claimingFingers.delete(identifier)) {
      state.claiming -= 1;
    }
    if (state.count > 0) {
      this.swapTargetTouchMove(target, wasBlocking, state.blocking > 0);
      this.swapTargetTouchEnd(target, wasClaiming, state.claiming > 0);
      return;
    }
    this.watched.delete(target);
    target.removeEventListener(
      'touchmove',
      wasBlocking ? this.onTargetTouchMove : this.onTargetTouchMovePassive,
    );
    target.removeEventListener(
      'touchend',
      wasClaiming ? this.onTargetTouchEnd : this.onTargetTouchEndPassive,
    );
    target.removeEventListener('touchcancel', this.onTargetTouchCancel);
  }

  /**
   * Keeps one `touchmove` listener on a watched target: the blocking one
   * while a finger on it could be claimed as it moves, a passive one
   * otherwise, so a scroll starting there never waits on the main thread
   * (`spec:AST-094` FR19).
   */
  private swapTargetTouchMove(
    target: EventTarget,
    wasBlocking: boolean,
    isBlocking: boolean,
  ): void {
    if (wasBlocking === isBlocking) {
      return;
    }
    target.removeEventListener(
      'touchmove',
      wasBlocking ? this.onTargetTouchMove : this.onTargetTouchMovePassive,
    );
    target.addEventListener(
      'touchmove',
      isBlocking ? this.onTargetTouchMove : this.onTargetTouchMovePassive,
      {passive: !isBlocking},
    );
  }

  /**
   * Keeps one `touchend` listener on a watched target: the cancelable one
   * while a finger on it has a participant that could claim (a lift whose
   * click must not happen cancels its `touchend`), a passive one while only
   * watchers follow its fingers (`spec:AST-094` FR20).
   */
  private swapTargetTouchEnd(
    target: EventTarget,
    wasClaiming: boolean,
    isClaiming: boolean,
  ): void {
    if (wasClaiming === isClaiming) {
      return;
    }
    target.removeEventListener(
      'touchend',
      wasClaiming ? this.onTargetTouchEnd : this.onTargetTouchEndPassive,
    );
    target.addEventListener(
      'touchend',
      isClaiming ? this.onTargetTouchEnd : this.onTargetTouchEndPassive,
      {passive: !isClaiming},
    );
  }

  /** Stop tracking a finger by its Touch.identifier; returns its arena id. */
  private forgetFinger(identifier: number): number | undefined {
    const id = this.touchIds.get(identifier);
    this.touchIds.delete(identifier);
    this.unwatchTarget(identifier);
    if (id != null) {
      this.forgetContact(id);
    }
    return id;
  }

  private pairTouch(id: number, place: PlacedContact): void {
    for (const [pointerId, pending] of this.pendingPointers) {
      if (isSamePlace(pending, place)) {
        this.pendingPointers.delete(pointerId);
        this.fingerPointers.set(pointerId, id);
        this.pointerFed.add(id);
        return;
      }
    }
    this.unpairedTouches.set(id, place);
  }

  private pairPointer(pointerId: number, place: PlacedContact): void {
    for (const [id, unpaired] of this.unpairedTouches) {
      if (isSamePlace(unpaired, place)) {
        this.unpairedTouches.delete(id);
        this.fingerPointers.set(pointerId, id);
        this.pointerFed.add(id);
        return;
      }
    }
    this.pendingPointers.set(pointerId, place);
  }

  /** Feed moves from a contact's sampling channel, in time order. */
  private feedMoves(inputs: ReadonlyArray<TouchInput>): void {
    const fresh = inputs.filter(input => {
      const last = this.lastFed.get(input.id);
      if (last != null && input.time < last.time) {
        return false;
      }
      this.lastFed.set(input.id, {x: input.x, y: input.y, time: input.time});
      return true;
    });
    if (fresh.length > 0) {
      this.arena.moved(fresh);
    }
  }

  /** Forget a contact's pairing and echo state. */
  private forgetContact(id: number): void {
    this.unlockSelection(id);
    this.retargeted.delete(id);
    this.lastFed.delete(id);
    this.pointerFed.delete(id);
    this.judgedUncancelable.delete(id);
    this.unpairedTouches.delete(id);
    for (const [pointerId, paired] of this.fingerPointers) {
      if (paired === id) {
        this.fingerPointers.delete(pointerId);
      }
    }
  }

  // --- Pointer events --------------------------------------------------------

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.endWheel(eventTime(event));
    // A new press: whatever click is still owed to the last one is not this.
    disarmClickGuard(this.doc);
    if (!isPointerKind(event.pointerType)) {
      return;
    }
    if (event.pointerType === 'touch' && this.usesTouchEvents) {
      this.pairPointer(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        target: landedOn(event),
      });
      return;
    }
    // A right click, a pen's barrel button, or a ctrl-click on macOS (its
    // context click) starts no press (FR43).
    if (event.pointerType !== 'touch' && !isPrimaryClick(event)) {
      return;
    }
    const landed = landedOn(event);
    const target = this.presentedTarget(
      landed,
      event.clientX,
      event.clientY,
      event.timeStamp,
    );
    const {recognizers, consumer, consumerElement} = this.participantsAt(
      target,
      event.pointerType,
    );
    if (recognizers.length === 0 && consumer == null) {
      return;
    }
    const id = this.nextId++;
    this.pointerIds.set(event.pointerId, id);
    if (target !== landed && target != null) {
      this.retargeted.set(id, {x: event.clientX, y: event.clientY, target});
    }
    this.arena.began([
      {
        id,
        x: event.clientX,
        y: event.clientY,
        time: eventTime(event),
        pointerType: event.pointerType,
        target,
        scroll: createNativeScrollProbe(target),
        recognizers,
        consumer,
      },
    ]);
    if (locksSelectionFor(event.pointerType)) {
      // The presented target: what the pen is on, where the engine's own
      // hit test may still see the motion's start.
      this.lockSelection(
        id,
        this.arena.participantsOf(id),
        target,
        this.arena.consumerOf(id) ?? null,
        consumerElement,
      );
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && this.usesTouchEvents) {
      const id = this.fingerPointers.get(event.pointerId);
      if (id != null) {
        this.feedMoves([
          {
            id,
            x: event.clientX,
            y: event.clientY,
            time: eventTime(event),
            history: coalescedHistory(event),
          },
        ]);
      }
      return;
    }
    const id = this.pointerIds.get(event.pointerId);
    if (id != null) {
      this.arena.moved([
        {
          id,
          x: event.clientX,
          y: event.clientY,
          time: eventTime(event),
          history: coalescedHistory(event),
        },
      ]);
      return;
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.releaseArmedPress();
    if (event.pointerType === 'touch' && this.usesTouchEvents) {
      // The lift itself is the touchend's: it alone can cancel the click.
      this.fingerPointers.delete(event.pointerId);
      this.pendingPointers.delete(event.pointerId);
      return;
    }
    const id = this.pointerIds.get(event.pointerId);
    if (id == null) {
      return;
    }
    this.pointerIds.delete(event.pointerId);
    this.unlockSelection(id);
    const dispositions = this.arena.ended([
      {id, x: event.clientX, y: event.clientY, time: eventTime(event)},
    ]);
    // A retargeted tap's own click arms the click guard for the engine's.
    const landed = this.retargeted.get(id);
    this.retargeted.delete(id);
    const clicked = this.clickRetargetedTap(
      landed,
      {x: event.clientX, y: event.clientY},
      dispositions.get(id),
    );
    if (!clicked && needsSuppression(dispositions)) {
      armClickGuard(this.doc);
    }
    // A finger read from its pointer events: the touchend that follows the
    // lift is cancelled when a gesture took it, which the lift itself may
    // decide (a hold whose time came with it), or when its tap was retargeted
    // (FR21).
    if (
      event.pointerType === 'touch' &&
      (clicked || needsSuppression(dispositions))
    ) {
      this.noteClaimedLift(event);
    }
  };

  /**
   * Note a claimed finger's lift, so the `touchend` that follows its
   * `pointerup` is cancelled (FR21). Only where an element's listener can take
   * that touchend: elsewhere none comes, and the note would hold its node for
   * nothing. At most CLAIMED_LIFT_LIMIT wait, the oldest going first, and one
   * timer drops each once CLAIMED_LIFT_MS has passed (FR24); the host's
   * uninstall keeps them, as it can run in the microtask after the pointerup,
   * before the touchend that comes later in the same task.
   */
  private noteClaimedLift(event: PointerEvent): void {
    if (
      !this.readsFingersFromPointerEvents() ||
      !(this.isCoarse || this.sendsTouchEvents())
    ) {
      return;
    }
    this.claimedLifts.push({
      x: event.clientX,
      y: event.clientY,
      target: landedOn(event),
      time: eventTime(event),
    });
    if (this.claimedLifts.length > CLAIMED_LIFT_LIMIT) {
      this.claimedLifts.shift();
    }
    this.armClaimedLiftTimer();
  }

  /** Arm the one timer for the oldest claimed lift still waiting. */
  private armClaimedLiftTimer(): void {
    if (this.claimedLiftTimer != null || this.claimedLifts.length === 0) {
      return;
    }
    const due = this.claimedLifts[0].time + CLAIMED_LIFT_MS;
    this.claimedLiftTimer = this.clock.setTimeout(
      () => {
        this.claimedLiftTimer = null;
        const now = this.clock.now();
        for (let i = this.claimedLifts.length - 1; i >= 0; i--) {
          if (now - this.claimedLifts[i].time >= CLAIMED_LIFT_MS) {
            this.claimedLifts.splice(i, 1);
          }
        }
        this.armClaimedLiftTimer();
      },
      Math.max(0, due - this.clock.now()),
    );
  }

  /** Drop every claimed lift and its timer, once the last one is taken. */
  private clearClaimedLifts(): void {
    this.claimedLifts.length = 0;
    if (this.claimedLiftTimer != null) {
      this.clock.clearTimeout(this.claimedLiftTimer);
      this.claimedLiftTimer = null;
    }
  }

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.releaseArmedPress();
    if (event.pointerType === 'touch' && this.usesTouchEvents) {
      const id =
        this.fingerPointers.get(event.pointerId) ??
        this.touchForCancelledPointer(event);
      this.fingerPointers.delete(event.pointerId);
      this.pendingPointers.delete(event.pointerId);
      if (id != null) {
        // The pointer channel ends here while the finger keeps moving (the
        // browser scrolls with it): its touch events, now the only channel,
        // sample it, as a watcher following the scroll to the lift needs.
        this.pointerFed.delete(id);
        this.browserTook([id], eventTime(event));
      }
      return;
    }
    const id = this.pointerIds.get(event.pointerId);
    if (id != null) {
      this.pointerIds.delete(event.pointerId);
      this.unlockSelection(id);
      this.retargeted.delete(id);
      this.arena.cancelled([id], eventTime(event));
    }
  };

  /**
   * Which live finger a touch `pointercancel` is about. The pointer keeps
   * the target the finger landed on (implicit capture), as the Touch does;
   * among fingers on that target, the nearest. WebKit also numbers the
   * pointer like the Touch, which settles what position cannot.
   */
  private touchForCancelledPointer(event: PointerEvent): number | null {
    let best: GestureTouch | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const touch of this.arena.touches) {
      if (
        touch.pointerType !== 'touch' ||
        touch.phase === 'ended' ||
        touch.phase === 'cancelled' ||
        touch.target !== landedOn(event)
      ) {
        continue;
      }
      const d = Math.hypot(touch.x - event.clientX, touch.y - event.clientY);
      if (d < bestDistance) {
        best = touch;
        bestDistance = d;
      }
    }
    if (best != null) {
      return best.id;
    }
    return this.touchIds.get(event.pointerId) ?? null;
  }

  // --- Clicks, menus, scrolls, focus -----------------------------------------

  private replayClick(touch: GestureTouch, allowed: boolean): void {
    if (!allowed) {
      return;
    }
    // The browser's own click was swallowed while recognizers decided; they
    // all failed, so the click the touch earned is delivered now.
    disarmClickGuard(this.doc);
    const target = touch.target;
    const view = this.doc.defaultView;
    if (!(target instanceof Element) || !target.isConnected || view == null) {
      return;
    }
    withoutClickGuard(() =>
      target.dispatchEvent(
        new view.MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          composed: true,
          detail: 1,
          clientX: touch.x,
          clientY: touch.y,
        }),
      ),
    );
  }

  private readonly onContextMenu = (event: MouseEvent): void => {
    for (const touch of this.arena.touches) {
      if (this.arena.isClaimed(touch.id)) {
        event.preventDefault();
        return;
      }
    }
  };

  /**
   * A recognizer is about to scroll `scroller` itself (a menu's edge
   * autoscroll, spec:AST-094 FR30): the scroll that write fires is not a
   * finger's and not the browser taking one. It passes until the end of the
   * next frame, when that event has fired; a real pan in that window still
   * reports itself through pointercancel or touchcancel.
   */
  ownScroll(scroller: Node): void {
    const call = ++this.ownScrollCalls;
    this.ownedScrolls.set(scroller, call);
    const view = this.doc.defaultView;
    if (view == null) {
      return;
    }
    // A newer call keeps it until its own frame has passed: its frames
    // replace the older call's.
    this.ownScrollFrames.get(scroller)?.();
    let inner = 0;
    const outer = view.requestAnimationFrame(() => {
      inner = view.requestAnimationFrame(() => {
        this.ownScrollFrames.delete(scroller);
        if (this.ownedScrolls.get(scroller) === call) {
          this.ownedScrolls.delete(scroller);
        }
      });
    });
    this.ownScrollFrames.set(scroller, () => {
      view.cancelAnimationFrame(outer);
      if (inner !== 0) {
        view.cancelAnimationFrame(inner);
      }
    });
  }

  /**
   * @internal Whether a recognizer is scrolling `scroller` itself now
   * (ownScroll): that scroll is not a finger's (fingerScroll.ts reads it).
   */
  isOwnScroll(scroller: Node): boolean {
    return this.ownedScrolls.has(scroller);
  }

  private readonly onScroll = (event: Event): void => {
    const time = eventTime(event);
    const scroller = event.target === this.doc ? this.doc : event.target;
    if (!(scroller instanceof Node) || this.ownedScrolls.has(scroller)) {
      return;
    }
    // A scroll is a finger's only if that finger was inside this scroller,
    // recently; anything else is the program moving something.
    const last = this.lastTouch;
    if (
      last != null &&
      time - last.time < UIKIT_PRESS.momentumMemory.value &&
      containsAlongFlatTree(scroller, last.target)
    ) {
      this.lastScroll = {scroller, time};
    }
    const taken: number[] = [];
    for (const touch of this.arena.touches) {
      if (
        touch.takenByBrowser ||
        touch.phase === 'ended' ||
        touch.phase === 'cancelled' ||
        touch.pointerType !== 'touch' ||
        this.arena.isClaimed(touch.id)
      ) {
        continue;
      }
      if (
        touch.target instanceof Node &&
        containsAlongFlatTree(scroller, touch.target) &&
        // Only a pan this finger drove takes the touch: the browser starts
        // one only once the finger has travelled the take distance
        // (spec:AST-094 FR20). A scroll under a finger that has not
        // (scrollIntoView, a transcript pinned to its end, scroll
        // anchoring) is the page's own: the touch, and the click it earns,
        // stay where they are.
        Math.hypot(touch.x - touch.startX, touch.y - touch.startY) >=
          UIKIT_PRESS.slop.value
      ) {
        taken.push(touch.id);
      }
    }
    if (taken.length > 0) {
      this.browserTook(taken, time);
    }
  };

  private noteFingersDown(event: TouchEvent): void {
    const fingers: Node[] = [];
    for (const touch of touchesOf(event.touches)) {
      if ((touch as StylusTouch).touchType !== 'stylus') {
        if (touch.target instanceof Node) {
          fingers.push(touch.target);
        }
      }
    }
    this.fingerTargets = fingers;
    for (const listener of [...this.fingerListeners]) {
      listener();
    }
  }

  /**
   * A second finger landed somewhere (wherever: often on a plain row): a
   * pan that takes one finger only and has not claimed its touch fails, so
   * the two fingers stay the browser's pinch (WCAG 1.4.4) instead of the
   * pan claiming them midway. A drag a recognizer has claimed keeps its
   * finger: a second finger never cancels or redirects it (`spec:AST-094`
   * FR10), and no claim is released here.
   */
  private failUnclaimedLoneFingerPans(): void {
    for (const recognizer of [...this.arena.involvedRecognizers]) {
      if (
        isPanRecognizer(recognizer) &&
        recognizer.state === 'possible' &&
        recognizer.maximumNumberOfTouches === 1 &&
        recognizer.trackedTouches.length > 0 &&
        recognizer.trackedTouches.every(
          touch =>
            touch.pointerType === 'touch' && !this.arena.isClaimed(touch.id),
        )
      ) {
        recognizer.cancel();
      }
    }
  }

  private readonly onVisibilityChange = (): void => {
    if (this.doc.visibilityState === 'hidden') {
      this.cancelEverything(this.arena.now());
      // As at a blur: the press sends no further pointer event, so an armed
      // press's page listeners go now (FR24).
      this.releaseArmedPress();
    }
  };

  private readonly onBlur = (): void => {
    this.cancelEverything(this.arena.now());
    // The press a blur ends sends no further pointer event: an armed press's
    // page listeners go now, as at its lift (FR24).
    this.releaseArmedPress();
  };

  /** Whether the browser sends Touch Events at all (`ontouchstart`). */
  private sendsTouchEvents(): boolean {
    const view = this.doc.defaultView;
    return view != null && 'ontouchstart' in view;
  }

  /**
   * Whether the host reads fingers from their pointer events: Pointer Events
   * input, or a window with no `ontouchstart` (touch emulation turned on
   * after load), as the move path does.
   */
  private readsFingersFromPointerEvents(): boolean {
    const view = this.doc.defaultView;
    return (
      this.inputMode === 'pointer-events' ||
      (view != null && !('ontouchstart' in view))
    );
  }

  /** The app lost focus: UIKit cancels every touch in flight. */
  private cancelEverything(time: number): void {
    const ids = [...this.pointerIds.values()];
    for (const id of ids) {
      this.unlockSelection(id);
    }
    for (const identifier of [...this.touchIds.keys()]) {
      // The browser may keep the touch alive: its lift must not click.
      this.cancelledFingers.add(identifier);
      const id = this.forgetFinger(identifier);
      if (id != null) {
        ids.push(id);
      }
    }
    this.pointerIds.clear();
    this.retargeted.clear();
    this.fingerPointers.clear();
    this.pendingPointers.clear();
    this.unpairedTouches.clear();
    this.lastFed.clear();
    this.pointerFed.clear();
    if (ids.length > 0) {
      this.arena.cancelled(ids, time);
    }
  }
}

function needsSuppression(
  dispositions: Map<number, ClickDisposition>,
): boolean {
  for (const disposition of dispositions.values()) {
    if (disposition !== 'allow') {
      return true;
    }
  }
  return false;
}

function coalescedHistory(event: PointerEvent): TouchSample[] {
  if (typeof event.getCoalescedEvents !== 'function') {
    return [];
  }
  const coalesced = event.getCoalescedEvents();
  return coalesced.slice(0, -1).map(sample => ({
    x: sample.clientX,
    y: sample.clientY,
    time: eventTime(sample),
  }));
}

/** The gesture host of a document, created on first use. */
export function getGestureHost(doc: Document): GestureHost {
  let host = gestureHosts.get(doc);
  if (host == null) {
    host = new GestureHost(doc);
    gestureHosts.set(doc, host);
  }
  return host;
}
