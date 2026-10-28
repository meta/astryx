// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextRequest.ts
 * @input An element, a request callback and the document's gesture host
 * @output attachContextRequest: one shared context request from a held
 *   finger or pen, a pointer's context click, or Shift+F10 and the
 *   context-menu key (spec:AST-094 FR43)
 * @position Internal gesture module, never exported from the package: the
 *   headless context menu (spec:AST-107 FR8) and row menus build on it
 *
 * One gesture makes one request. A hold is an arena participant, a long press
 * held to UIKit's 500 ms with its 10 pt tolerance, so it loses to a claim
 * another recognizer already made on that finger; the browser's own menu
 * that a held finger, a held pen or a key also fires is refused rather than
 * requested again. A control that keeps its press for a hold-repeat (a
 * stepper) owns only its hold: its right click and Shift+F10 still reach the
 * request. A mouse held still makes no request: it selects text and drags.
 */

import {lockSelection} from '../utils/selectionLock';
import {getGestureHost, type GestureHost} from './GestureHost';
import {LongPressGestureRecognizer} from './LongPressGestureRecognizer';
import type {PointerKind} from './types';

/** What a context request reports. */
export interface ContextRequest {
  /** What made it: a held finger or pen, a pointer's context click, or a key. */
  readonly kind: 'hold' | 'pointer' | 'keyboard';
  /** The pointer that made it; null from the keyboard. */
  readonly pointerType: PointerKind | null;
  /** Where, in client coordinates; null from the keyboard. */
  readonly point: {readonly x: number; readonly y: number} | null;
  /** The Pointer Events id of the pointer that made it, when the host knows it. */
  readonly pointerId: number | null;
  /** When, on the gesture host's clock. */
  readonly time: number;
}

export interface ContextRequestOptions {
  onRequest: (request: ContextRequest) => void;
  /**
   * Read when it attaches: a disabled request registers nothing (spec:AST-094
   * FR24). Read again at each input. @default () => true
   */
  isEnabled?: () => boolean;
  /**
   * A hold's progress: committed when the still finger or pen claims its
   * touch and the hold requests, then ended at its lift, or cancelled if the
   * touch is cancelled first.
   */
  onHold?: (phase: 'committed' | 'ended' | 'cancelled') => void;
}

/**
 * How long after a key's request, or a pen's hold, the browser's own context
 * menu event is that input's echo, ms.
 */
const MENU_ECHO_MS = 500;

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
  let lastKeyRequestAt = Number.NEGATIVE_INFINITY;
  /** When a pen's hold last ended, for its menu event at the lift. */
  let lastPenHoldAt = Number.NEGATIVE_INFINITY;
  let held: {touchId: number; pointerType: PointerKind} | null = null;

  // UIKit's long press, its duration and its tolerance as a distance: the
  // hold requests as it begins.
  const recognizer = new LongPressGestureRecognizer({
    name: 'contextRequest',
    // A mouse held still selects text and drags: a hold is a finger's or a
    // pen's (spec:AST-094 FR43).
    allowedPointerTypes: ['touch', 'pen'],
    // A hold that opens a menu takes no selection or callout (FR41).
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
      options.onHold?.('committed');
      if (!isEnabled()) {
        return;
      }
      const point = recognizer.location();
      options.onRequest({
        kind: 'hold',
        pointerType: held?.pointerType ?? 'touch',
        point: {x: point.x, y: point.y},
        pointerId: held == null ? null : host.pointerIdOf(held.touchId),
        time: host.arena.now(),
      });
    } else if (state === 'ended' || state === 'cancelled') {
      options.onHold?.(state);
      if (held?.pointerType === 'pen') {
        lastPenHoldAt = host.arena.now();
      }
      held = null;
    }
  });

  const onContextMenu = (event: Event): void => {
    const menu = event as MouseEvent;
    // A hold-repeat control inside owns only its hold: its right click
    // reaches this request.
    if (!isEnabled()) {
      return;
    }
    // The browser's own menu stays off either way.
    menu.preventDefault();
    const time = host.arena.now();
    const pointerType = pointerKindOf(menu);
    // A held finger's menu is the hold's to request, or a claim refused it;
    // a key's menu event is that key's echo.
    if (
      pointerType === 'touch' ||
      host.fingersDown() > 0 ||
      time - lastKeyRequestAt < MENU_ECHO_MS ||
      // A pen's own menu event, during its hold or at its lift, is the hold's.
      (pointerType === 'pen' &&
        ((held?.pointerType === 'pen' &&
          (recognizer.state === 'began' || recognizer.state === 'changed')) ||
          time - lastPenHoldAt < MENU_ECHO_MS))
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
    if (!isRequestKey || !isEnabled()) {
      return;
    }
    key.preventDefault();
    lastKeyRequestAt = host.arena.now();
    options.onRequest({
      kind: 'keyboard',
      pointerType: null,
      point: null,
      pointerId: null,
      time: lastKeyRequestAt,
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
