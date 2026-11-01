// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuPressGesture.ts
 * @input A menu press gesture and one pointer event, both as plain data
 * @output Exports the pure `menuPressStep` state machine, its state, event and
 *   effect types, the settle constant and the finger's scrub handoff
 * @position Pure module under `useMenuPress`; no DOM, no React, so every
 *   transition is unit-testable without a browser
 *
 * The press model shared by every Astryx menu and picker: the row under the
 * pointer when it is RELEASED is the row that acts, and the highlight follows
 * the pointer while it is held. It is the model of macOS and iOS menus.
 *
 * States:
 * - `idle` — no gesture is live.
 * - `triggerPress` — a finger rests on the trigger; the menu is not open yet.
 *   A mouse skips this state: a mouse press on the trigger opens at once.
 * - `open` — the menu opened under a held pointer (a mouse press, or a
 *   finger held on the trigger for the hold-open delay) and the pointer is
 *   not picking yet.
 * - `tracking` — the pointer is held and the highlight follows it.
 *
 * When the opening press may pick, by pointer:
 * - A finger (or a pen): UIMenu's handoff. The still-held finger has to
 *   travel `MENU_PRESS_HANDOFF_PX` from the first sample the menu sees
 *   before it picks; until then nothing is highlighted and its lift acts on
 *   nothing. So the press that opened a menu never picks the row that
 *   appeared under it, however long it rests (UIKit counts distance, not
 *   time). A host that reports no positions keeps the settle rule below.
 * - A mouse: the settle rule. Its release acts only once it has entered the
 *   menu or the press has lasted `MENU_PRESS_SETTLE_MS`, as a macOS pop-up
 *   button's does; otherwise it acts on nothing and the menu stays open.
 *
 * Rows are opaque (`T`): the machine never touches the DOM. The hook resolves
 * the enabled row under the pointer and feeds it in; `null` means the pointer
 * is over a divider, a heading, a disabled row, or outside the menu.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/menuPressGesture.test.ts
 * - /packages/core/src/hooks/useMenuPress.ts
 */

import {MENU_PRESS_HANDOFF_PX as UIKIT_MENU_PRESS_HANDOFF_PX} from './menuPressValues';

/** How long a MOUSE's opening press must last before its release may act. */
export const MENU_PRESS_SETTLE_MS = 300;

/**
 * How far a finger that opened the menu travels, from the first sample the
 * menu sees, before it starts picking (UIMenu's scrub handoff).
 */
export const MENU_PRESS_HANDOFF_PX: number = UIKIT_MENU_PRESS_HANDOFF_PX;

export type MenuPressPointerType = 'mouse' | 'touch' | 'pen';

/** @internal The machine's own shape, with UIMenu's handoff (`spec:AST-094` FR29); not public contract. */
export type MenuPressState<T> =
  | {phase: 'idle'}
  | {
      phase: 'triggerPress';
      pointerType: MenuPressPointerType;
      startedAt: number;
    }
  | {
      phase: 'open';
      pointerType: MenuPressPointerType;
      openedAt: number;
      /**
       * A finger's handoff: the first position the menu saw after it opened,
       * which the scrub distance is counted from. Unset until that sample.
       * @internal Implements `spec:AST-094` FR29; not public contract.
       */
      handoffFrom?: {x: number; y: number};
    }
  | {
      phase: 'tracking';
      pointerType: MenuPressPointerType;
      /** Where the press began. */
      origin: 'trigger' | 'menu';
      /** The enabled row currently under the pointer, if any. */
      row: T | null;
    };

/** @internal The machine's own shape, with UIMenu's handoff (`spec:AST-094` FR29); not public contract. */
export type MenuPressInput<T> =
  | {
      type: 'down';
      target: 'trigger' | 'menu';
      pointerType: MenuPressPointerType;
      /** The enabled row under the press when it lands inside the menu. */
      row: T | null;
      time: number;
    }
  /** The menu opened while the trigger press is still held. */
  | {type: 'opened'; time: number}
  | {
      type: 'move';
      row: T | null;
      isInMenu: boolean;
      time: number;
      /**
       * Viewport position, for a finger's handoff distance.
       * @internal Implements `spec:AST-094` FR29; not public contract.
       */
      x?: number;
      /** @internal See `x`. */
      y?: number;
    }
  | {
      type: 'up';
      row: T | null;
      isInMenu: boolean;
      isOnTrigger: boolean;
      time: number;
      /**
       * Viewport position, for a finger's handoff distance.
       * @internal Implements `spec:AST-094` FR29; not public contract.
       */
      x?: number;
      /** @internal See `x`. */
      y?: number;
    }
  /** The browser took the gesture: pointercancel, a second pointer, a scroll. */
  | {type: 'cancel'};

/** @internal The machine's own shape, with UIMenu's handoff (`spec:AST-094` FR29); not public contract. */
export type MenuPressOutcome<T> =
  | {type: 'none'}
  /** A mouse pressed the trigger: open the menu now, under the held pointer. */
  | {type: 'open'}
  | {type: 'highlight'; row: T}
  | {type: 'clear'}
  | {type: 'act'; row: T}
  /**
   * The gesture ended without a row acting. `stray` says whether the browser
   * will still report a `click` for this gesture that must not act; `dismiss`
   * says the menu should close: a mouse released outside it.
   */
  | {type: 'settle'; stray: boolean; dismiss: boolean};

/** @internal The machine's own shape, with UIMenu's handoff (`spec:AST-094` FR29); not public contract. */
export interface MenuPressTransition<T> {
  gesture: MenuPressState<T>;
  effect: MenuPressOutcome<T>;
}

export const IDLE_MENU_PRESS: MenuPressState<never> = {phase: 'idle'};

const NONE: MenuPressOutcome<never> = {type: 'none'};

function idle<T>(effect: MenuPressOutcome<T>): MenuPressTransition<T> {
  return {gesture: {phase: 'idle'}, effect};
}

function highlightEffect<T>(row: T | null): MenuPressOutcome<T> {
  return row == null ? {type: 'clear'} : {type: 'highlight', row};
}

/** A finger or a pen: UIKit's touch rules apply. */
function isFinger(pointerType: MenuPressPointerType): boolean {
  return pointerType !== 'mouse';
}

function hasPosition(event: {
  x?: number;
  y?: number;
}): event is {x: number; y: number} {
  return event.x != null && event.y != null;
}

/**
 * Whether a finger has travelled the handoff distance from `from`: a
 * straight-line distance, as UIMenu measures it (a diagonal 7 pt each way
 * does not hand off, 9 pt each way does).
 */
function hasPassedHandoff(
  from: {x: number; y: number},
  to: {x: number; y: number},
): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= MENU_PRESS_HANDOFF_PX;
}

/**
 * Resolve a release while the highlight is tracking the pointer: over an
 * enabled row it acts, over the menu's chrome it acts on nothing, outside the
 * menu it acts on nothing and — under a mouse — dismisses the menu (a
 * finger leaves it open). A release back on the trigger never dismisses.
 */
function release<T>(
  pointerType: MenuPressPointerType,
  event: Extract<MenuPressInput<T>, {type: 'up'}>,
): MenuPressTransition<T> {
  if (event.row != null) {
    return idle({type: 'act', row: event.row});
  }
  if (event.isInMenu || event.isOnTrigger) {
    return idle({type: 'settle', stray: true, dismiss: false});
  }
  return idle({type: 'settle', stray: true, dismiss: pointerType === 'mouse'});
}

/**
 * Advance the gesture by one event. Pure: same inputs, same output.
 */
/** @internal The machine's own shape, with UIMenu's handoff (`spec:AST-094` FR29); not public contract. */
export function menuPressTransition<T>(
  gesture: MenuPressState<T>,
  event: MenuPressInput<T>,
): MenuPressTransition<T> {
  switch (gesture.phase) {
    case 'idle':
      return stepIdle(gesture, event);
    case 'triggerPress':
      return stepTriggerPress(gesture, event);
    case 'open':
      return stepOpen(gesture, event);
    case 'tracking':
      return stepTracking(gesture, event);
  }
}

function stepIdle<T>(
  gesture: Extract<MenuPressState<T>, {phase: 'idle'}>,
  event: MenuPressInput<T>,
): MenuPressTransition<T> {
  if (event.type !== 'down') {
    return {gesture, effect: NONE};
  }
  if (event.target === 'menu') {
    return {
      gesture: {
        phase: 'tracking',
        pointerType: event.pointerType,
        origin: 'menu',
        row: event.row,
      },
      effect: highlightEffect(event.row),
    };
  }
  if (event.pointerType === 'mouse') {
    return {
      gesture: {
        phase: 'open',
        pointerType: 'mouse',
        openedAt: event.time,
      },
      effect: {type: 'open'},
    };
  }
  return {
    gesture: {
      phase: 'triggerPress',
      pointerType: event.pointerType,
      startedAt: event.time,
    },
    effect: NONE,
  };
}

function stepTriggerPress<T>(
  gesture: Extract<MenuPressState<T>, {phase: 'triggerPress'}>,
  event: MenuPressInput<T>,
): MenuPressTransition<T> {
  switch (event.type) {
    case 'opened':
      return {
        gesture: {
          phase: 'open',
          pointerType: gesture.pointerType,
          openedAt: event.time,
        },
        effect: NONE,
      };
    case 'up':
      // A tap. The browser's click on the trigger is what opens the menu, so
      // it must pass, and no gesture is live afterwards.
      return idle({type: 'settle', stray: false, dismiss: false});
    case 'cancel':
      // The browser took the gesture (an incoming call, a system gesture).
      // Settle rather than going quiet: a held finger has already installed
      // the document's touchmove preventer, and only the end of a gesture
      // takes it back off. No click follows a cancelled pointer.
      return idle({type: 'settle', stray: false, dismiss: false});
    case 'down':
    case 'move':
      return {gesture, effect: NONE};
  }
}

function stepOpen<T>(
  gesture: Extract<MenuPressState<T>, {phase: 'open'}>,
  event: MenuPressInput<T>,
): MenuPressTransition<T> {
  switch (event.type) {
    case 'move': {
      if (isFinger(gesture.pointerType) && hasPosition(event)) {
        // UIMenu's handoff: the first sample after the open is where the
        // distance counts from; the finger picks once it is that far away.
        const from = gesture.handoffFrom;
        if (from == null) {
          return {
            gesture: {...gesture, handoffFrom: {x: event.x, y: event.y}},
            effect: NONE,
          };
        }
        if (!hasPassedHandoff(from, event)) {
          return {gesture, effect: NONE};
        }
        return {
          gesture: {
            phase: 'tracking',
            pointerType: gesture.pointerType,
            origin: 'trigger',
            row: event.row,
          },
          effect: highlightEffect(event.row),
        };
      }
      if (!event.isInMenu) {
        return {gesture, effect: NONE};
      }
      return {
        gesture: {
          phase: 'tracking',
          pointerType: gesture.pointerType,
          origin: 'trigger',
          row: event.row,
        },
        effect: highlightEffect(event.row),
      };
    }
    case 'up': {
      if (isFinger(gesture.pointerType) && hasPosition(event)) {
        // The finger never travelled the handoff distance: whatever row is
        // under it now appeared under a press nobody moved, so nothing acts,
        // the menu stays, and the trigger's click for this press is spent.
        return idle({type: 'settle', stray: true, dismiss: false});
      }
      const hasSettled = event.time - gesture.openedAt >= MENU_PRESS_SETTLE_MS;
      if (!hasSettled) {
        // The pointer never entered the menu and the press was short: the
        // menu stays open and nothing acts. The trigger's own click for this
        // gesture must not toggle it shut either.
        return idle({type: 'settle', stray: true, dismiss: false});
      }
      return release(gesture.pointerType, event);
    }
    case 'cancel':
      // As above: the gesture ends, so its document listeners come off. The
      // menu stays open: a cancelled pointer did not ask to close it.
      return idle({type: 'settle', stray: false, dismiss: false});
    case 'down':
    case 'opened':
      return {gesture, effect: NONE};
  }
}

function stepTracking<T>(
  gesture: Extract<MenuPressState<T>, {phase: 'tracking'}>,
  event: MenuPressInput<T>,
): MenuPressTransition<T> {
  switch (event.type) {
    case 'move':
      if (event.row === gesture.row) {
        return {gesture, effect: NONE};
      }
      return {
        gesture: {...gesture, row: event.row},
        effect: highlightEffect(event.row),
      };
    case 'up':
      return release(gesture.pointerType, event);
    case 'cancel':
      // The browser took the gesture (a scroll, a second finger): nothing
      // acts, the menu stays, and no click follows a cancelled pointer.
      return idle({type: 'settle', stray: false, dismiss: false});
    case 'down':
    case 'opened':
      return {gesture, effect: NONE};
  }
}

// ---------------------------------------------------------------------------
// The released public shape (`@astryxdesign/core/hooks`). The handoff
// positions and `handoffFrom` stay internal: a caller of
// `menuPressStep` keeps the settle rule, as released.
// ---------------------------------------------------------------------------

export type MenuPressGesture<T> =
  | {phase: 'idle'}
  | {
      phase: 'triggerPress';
      pointerType: MenuPressPointerType;
      startedAt: number;
    }
  | {
      phase: 'open';
      pointerType: MenuPressPointerType;
      openedAt: number;
    }
  | {
      phase: 'tracking';
      pointerType: MenuPressPointerType;
      /** Where the press began. */
      origin: 'trigger' | 'menu';
      /** The enabled row currently under the pointer, if any. */
      row: T | null;
    };

export type MenuPressEvent<T> =
  | {
      type: 'down';
      target: 'trigger' | 'menu';
      pointerType: MenuPressPointerType;
      /** The enabled row under the press when it lands inside the menu. */
      row: T | null;
      time: number;
    }
  /** The menu opened while the trigger press is still held. */
  | {type: 'opened'; time: number}
  | {type: 'move'; row: T | null; isInMenu: boolean; time: number}
  | {
      type: 'up';
      row: T | null;
      isInMenu: boolean;
      isOnTrigger: boolean;
      time: number;
    }
  /** The browser took the gesture: pointercancel, a second pointer, a scroll. */
  | {type: 'cancel'};

export type MenuPressEffect<T> =
  | {type: 'none'}
  /** A mouse pressed the trigger: open the menu now, under the held pointer. */
  | {type: 'open'}
  | {type: 'highlight'; row: T}
  | {type: 'clear'}
  | {type: 'act'; row: T}
  /**
   * The gesture ended without a row acting. `stray` says whether the browser
   * will still report a `click` for this gesture that must not act; `dismiss`
   * says the menu should close (a mouse released outside it).
   */
  | {type: 'settle'; stray: boolean; dismiss: boolean};

export interface MenuPressStep<T> {
  gesture: MenuPressGesture<T>;
  effect: MenuPressEffect<T>;
}

/**
 * The menu press machine, as released: one step from a gesture and an event
 * to the next gesture and the effect to apply. Pure.
 */
export function menuPressStep<T>(
  gesture: MenuPressGesture<T>,
  event: MenuPressEvent<T>,
): MenuPressStep<T> {
  const {gesture: next, effect} = menuPressTransition(gesture, event);
  return {
    gesture: publicGesture(next),
    effect,
  };
}

function publicGesture<T>(gesture: MenuPressState<T>): MenuPressGesture<T> {
  if (gesture.phase !== 'open') {
    return gesture;
  }
  return {
    phase: 'open',
    pointerType: gesture.pointerType,
    openedAt: gesture.openedAt,
  };
}
