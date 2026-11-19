// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextRequest.ts
 * @input An element, a request callback and the document's gesture host
 * @output attachContextRequest: one shared context request from a held
 *   finger or pen, a pointer's context click, or Shift+F10 and the
 *   context-menu key
 * @position Internal gesture module, never exported from the package. The
 *   headless context menu and row menus build on it.
 */

import {lockSelection} from '../utils/selectionLock';
import {sharedWeakSet} from '../utils/sharedRealm';
import {getGestureHost, type GestureHost} from './GestureHost';
import {LongPressGestureRecognizer} from './LongPressGestureRecognizer';
import type {PointerKind} from './types';

/** What a context request reports. */
export interface ContextRequest {
  /**
   * What made it: a held finger or pen, a pointer's context click, or a key.
   */
  readonly kind: 'hold' | 'pointer' | 'keyboard';
  /** The pointer that made it; null from the keyboard. */
  readonly pointerType: PointerKind | null;
  /** Where, in client coordinates; null from the keyboard. */
  readonly point: {readonly x: number; readonly y: number} | null;
  /**
   * The Pointer Events id of the pointer that made it, when the host knows it.
   */
  readonly pointerId: number | null;
  /** When, on the gesture host's clock. */
  readonly time: number;
}

export interface ContextRequestOptions {
  onRequest: (request: ContextRequest) => void;
  /**
   * Read when it attaches: a disabled request registers nothing. Read again
   * at each input. @default () => true
   */
  isEnabled?: () => boolean;
  /**
   * A hold's progress. It reports `committed` when the still finger or pen
   * claims its touch and the hold requests. It then reports `ended` at its
   * lift, or `cancelled` if a cancel ends the touch first. A hold disabled
   * before it requests reports nothing.
   */
  onHold?: (phase: 'committed' | 'ended' | 'cancelled') => void;
}

/**
 * How long after a request key's last keydown, or a pen's lift, the browser's
 * own context menu event is that input's echo, ms.
 */
const MENU_ECHO_MS = 500;

/**
 * Menu events and keys a request already answered: one inside nested
 * requests reaches only the innermost, as a hold resolves to one winner.
 * Every copy of Core shares the set, so nested requests from two copies
 * still answer once.
 */
const answered = sharedWeakSet<Event>('gestures/context-request/answered', 1);

const POINTER_KINDS: ReadonlySet<string> = new Set(['touch', 'mouse', 'pen']);

function pointerKindOf(event: MouseEvent): PointerKind | null {
  const type = (event as Partial<PointerEvent>).pointerType;
  return type != null && POINTER_KINDS.has(type) ? (type as PointerKind) : null;
}

/**
 * Report context requests on `element` until the returned function runs.
 * `host` is the document's gesture host; tests pass their own.
 */
export function attachContextRequest(
  element: Element,
  options: ContextRequestOptions,
  host: GestureHost = getGestureHost(element.ownerDocument),
): () => void {
  const isEnabled = () => options.isEnabled?.() !== false;
  if (!isEnabled()) {
    return () => {};
  }
  let lastRequestKeyAt = Number.NEGATIVE_INFINITY;
  let held: {touchId: number; pointerType: PointerKind} | null = null;
  let isHoldReported = false;

  // The defaults are UIKit's plain long press.
  const recognizer = new LongPressGestureRecognizer({
    name: 'contextRequest',
    // A mouse held still selects text and drags: a hold is a finger's or a
    // pen's.
    allowedPointerTypes: ['touch', 'pen'],
    // A hold that opens a menu takes no selection or callout.
    selectionLock: lockSelection,
    shouldReceiveTouch: (_recognizer, touch) => {
      if (!isEnabled() || host.keepsPressBetween(touch.target, element)) {
        return false;
      }
      held = {touchId: touch.id, pointerType: touch.pointerType};
      return true;
    },
  });

  recognizer.addListener(() => {
    const {state} = recognizer;
    if (state === 'began') {
      // A request disabled during the hold makes none, and its hold reports
      // no phase: `committed` comes only with a request.
      if (!isEnabled()) {
        return;
      }
      isHoldReported = true;
      options.onHold?.('committed');
      const point = recognizer.location();
      options.onRequest({
        kind: 'hold',
        pointerType: held?.pointerType ?? 'touch',
        point: {x: point.x, y: point.y},
        pointerId: held == null ? null : host.pointerIdOf(held.touchId),
        time: host.arena.now(),
      });
    } else if (state === 'ended' || state === 'cancelled') {
      if (isHoldReported) {
        options.onHold?.(state);
      }
      isHoldReported = false;
      held = null;
    }
  });

  const onContextMenu = (event: Event): void => {
    const menu = event as MouseEvent;
    // A hold-repeat control inside owns only its hold: its right click
    // reaches this request. A request inside already answered this event.
    if (!isEnabled() || answered.has(menu)) {
      return;
    }
    answered.add(menu);
    // The browser's own menu stays off either way.
    menu.preventDefault();
    const time = host.arena.now();
    const pointerType = pointerKindOf(menu);
    // A held finger's menu is the hold's to request, or a claim refused it.
    // That needs a finger down inside this element. A key's menu event is
    // that key's echo.
    if (
      pointerType === 'touch' ||
      host.isFingerDownIn(element) ||
      time - lastRequestKeyAt < MENU_ECHO_MS ||
      // A pen's own menu event is its hold's: during any hold of it inside
      // this element, or right after its lift. The hold may be this
      // request's, a stepper's, or a handle's that claimed first.
      (pointerType === 'pen' &&
        (host.isPenDownIn(element) ||
          time - host.lastPenLiftIn(element) < MENU_ECHO_MS))
    ) {
      return;
    }
    options.onRequest({
      kind: 'pointer',
      pointerType: pointerType ?? 'mouse',
      point: {x: menu.clientX, y: menu.clientY},
      pointerId: (menu as Partial<PointerEvent>).pointerId ?? null,
      time,
    });
  };

  const onKeyDown = (event: Event): void => {
    const key = event as KeyboardEvent;
    const isRequestKey =
      (key.key === 'F10' && key.shiftKey) || key.key === 'ContextMenu';
    // A hold-repeat control inside owns only its hold: Shift+F10 on it
    // reaches this request.
    if (!isRequestKey || !isEnabled() || answered.has(key)) {
      return;
    }
    answered.add(key);
    key.preventDefault();
    // A held key repeats its keydown. Each repeat keeps the echo window
    // open, and only the first keydown requests.
    lastRequestKeyAt = host.arena.now();
    if (key.repeat) {
      return;
    }
    options.onRequest({
      kind: 'keyboard',
      pointerType: null,
      point: null,
      pointerId: null,
      time: lastRequestKeyAt,
    });
  };

  const detachRecognizer = host.attach(element, recognizer);
  element.addEventListener('contextmenu', onContextMenu);
  element.addEventListener('keydown', onKeyDown);
  return () => {
    element.removeEventListener('contextmenu', onContextMenu);
    element.removeEventListener('keydown', onKeyDown);
    detachRecognizer();
  };
}
