// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuPressGesture.ts
 * @input A menu press gesture and one pointer event, both as plain data
 * @output The pure `menuPressStep` state machine, its state, event and effect
 *   types, the settle constant, and the finger's handoff distance
 * @position Pure module under `useMenuPress`. It has no DOM and no React, so
 *   a unit test can check each transition without a browser.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/menuPressGesture.test.ts
 * - /packages/core/src/hooks/useMenuPress.ts
 */

import {MENU_PRESS_HANDOFF_PX as UIKIT_MENU_PRESS_HANDOFF_PX} from './menuPressValues';

/**
 * How long the opening press must last before its release may act, unless a
 * finger's handoff applies.
 */
export const MENU_PRESS_SETTLE_MS = 300;

/**
 * How far a finger that opened the menu travels, from the first sample the
 * menu sees, before it starts picking (UIMenu's scrub handoff).
 */
export const MENU_PRESS_HANDOFF_PX: number = UIKIT_MENU_PRESS_HANDOFF_PX;

export type MenuPressPointerType = 'mouse' | 'touch' | 'pen';

/** @internal */
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
       * @internal Not public contract.
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
    }
  /**
   * The window lost focus under a finger. The gesture is still tracked, so its
   * document listeners stay its own until its release or cancel. Nothing it
   * does highlights or acts.
   * @internal Not public contract.
   */
  | {
      phase: 'withdrawn';
      pointerType: MenuPressPointerType;
      /**
       * Withdrawn while it was still a press on the trigger: its tap's click
       * is what opens the menu, so its release lets that click through.
       */
      fromTrigger?: true;
    };

/** @internal */
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
       * @internal Not public contract.
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
       * @internal Not public contract.
       */
      x?: number;
      /** @internal See `x`. */
      y?: number;
    }
  /** The browser took the gesture: pointercancel, a second pointer, a scroll. */
  | {type: 'cancel'}
  /**
   * The window lost focus mid-press. A finger's or pen's gesture is withdrawn,
   * tracked to its release with nothing acting; a mouse's ends as a cancel
   * does.
   * @internal Not public contract.
   */
  | {type: 'withdraw'};

/** @internal */
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
   * says the menu should close: a mouse released outside it. `clear`
   * (@internal) says a row a finger lit loses its highlight (the browser took
   * the press).
   */
  | {type: 'settle'; stray: boolean; dismiss: boolean; clear?: true}
  /**
   * The gesture was withdrawn and is still live: stop what drives it (the
   * hold, the autoscroll, the page lock). `clear` says a row a finger lit
   * loses its highlight.
   * @internal Not public contract.
   */
  | {type: 'withdraw'; clear?: true};

/** @internal */
export interface MenuPressTransition<T> {
  gesture: MenuPressState<T>;
  effect: MenuPressOutcome<T>;
}

// The idle gesture: both the released and the internal shape.
export const IDLE_MENU_PRESS: MenuPressGesture<never> & MenuPressState<never> =
  {phase: 'idle'};

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
 * Whether a finger has travelled the handoff distance from `from`. The
 * distance is a straight line, as UIMenu measures it: a diagonal 7 pt each
 * way does not hand off, 9 pt each way does.
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
 *
 * The row under the pointer at the release acts, and the highlight follows
 * the held pointer, as in macOS and iOS menus. The states:
 * - `idle`: no gesture is live.
 * - `triggerPress`: a finger rests on the trigger, and the menu is not open
 *   yet. A mouse press on the trigger skips this state and opens at once.
 * - `open`: the menu opened under a held pointer, and the pointer does not
 *   pick yet.
 * - `tracking`: the pointer is held, and the highlight follows it.
 *
 * A finger or a pen that opened the menu picks only after it travels
 * `MENU_PRESS_HANDOFF_PX` from the first position the menu sees. UIMenu
 * hands off the same way. Until then nothing lights, and its lift acts on
 * nothing. A host that reports no positions keeps the settle rule.
 *
 * The settle rule: the release of the opening gesture acts only after the
 * pointer entered the menu or the press lasted `MENU_PRESS_SETTLE_MS`. Else a
 * menu that opens under the pointer would pick a row that nobody chose.
 *
 * Rows are opaque (`T`). The hook feeds in the enabled row under the
 * pointer, or `null` over a divider, a heading, a disabled row, or outside
 * the menu.
 *
 * @internal
 */
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
    case 'withdrawn':
      return stepWithdrawn(gesture, event);
  }
}

/**
 * A finger's or pen's gesture withdrawn by the window's blur, or a mouse's
 * ended as a cancel, which keeps its click.
 */
function withdraw<T>(
  pointerType: MenuPressPointerType,
  litRow: T | null,
  fromTrigger = false,
): MenuPressTransition<T> {
  if (!isFinger(pointerType)) {
    return idle({type: 'settle', stray: false, dismiss: false});
  }
  return {
    gesture: fromTrigger
      ? {phase: 'withdrawn', pointerType, fromTrigger: true}
      : {phase: 'withdrawn', pointerType},
    effect:
      litRow != null ? {type: 'withdraw', clear: true} : {type: 'withdraw'},
  };
}

function stepWithdrawn<T>(
  gesture: Extract<MenuPressState<T>, {phase: 'withdrawn'}>,
  event: MenuPressInput<T>,
): MenuPressTransition<T> {
  switch (event.type) {
    case 'up':
      // The withdrawn finger lifts: nothing acts, and the click the browser
      // reports for it is still this gesture's, so it is swallowed. Its
      // listeners come off as the gesture ends. A tap on the trigger keeps
      // its click, which opens the menu: the pointer model's open, or a
      // scroll view's open at the lift.
      return idle({
        type: 'settle',
        stray: gesture.fromTrigger !== true,
        dismiss: false,
      });
    case 'cancel':
      return idle({type: 'settle', stray: false, dismiss: false});
    case 'down':
    case 'move':
    case 'opened':
    case 'withdraw':
      return {gesture, effect: NONE};
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
      // The browser took the gesture, for example for a system gesture.
      // Settle and do not go idle: a held finger installed the document's
      // touchmove preventer, and only the end of a gesture removes it. No
      // click follows a cancelled pointer.
      return idle({type: 'settle', stray: false, dismiss: false});
    case 'withdraw':
      return withdraw<T>(gesture.pointerType, null, true);
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
        // UIMenu counts from the first sample after the open, not from the
        // open point.
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
        // The finger never travelled the handoff distance, so the row under it
        // appeared under a press nobody moved. Nothing acts, the menu stays,
        // and the trigger's click for this press is spent.
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
    case 'withdraw':
      return withdraw<T>(gesture.pointerType, null);
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
      // acts, the menu stays, and no click follows a cancelled pointer. A
      // row a finger lit loses its highlight, as UIKit clears it when the
      // list starts scrolling. A mouse's highlight stays where it was.
      return idle({
        type: 'settle',
        stray: false,
        dismiss: false,
        ...(gesture.row != null && isFinger(gesture.pointerType)
          ? {clear: true as const}
          : {}),
      });
    case 'withdraw':
      return withdraw(gesture.pointerType, gesture.row);
    case 'down':
    case 'opened':
      return {gesture, effect: NONE};
  }
}

// ---------------------------------------------------------------------------
// The released public shape (`@astryxdesign/core/hooks`). The machine's own
// types above carry the finger's handoff and are not public contract. The
// handoff positions, `handoffFrom` and the settle `clear` stay internal: a
// caller of `menuPressStep` keeps the settle rule, as released.
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
   * The gesture ends without a row acting. Its `stray` flag is true when the
   * browser still sends a `click` for this gesture. That click must not act.
   * Its `dismiss` flag is true when the menu must close (a mouse released
   * outside it).
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
  // The released machine keeps the settle rule. Positions start the handoff,
  // so a caller's event reaches the transition without them.
  const {
    x: _x,
    y: _y,
    ...released
  } = event as MenuPressEvent<T> & {x?: number; y?: number};
  const {gesture: next, effect} = menuPressTransition(
    gesture,
    released as MenuPressEvent<T>,
  );
  return {
    gesture: publicGesture(next),
    effect:
      effect.type === 'settle'
        ? {type: 'settle', stray: effect.stray, dismiss: effect.dismiss}
        : effect.type === 'withdraw'
          ? // Unreachable from the released events, which carry no `withdraw`.
            {type: 'none'}
          : effect,
  };
}

function publicGesture<T>(gesture: MenuPressState<T>): MenuPressGesture<T> {
  if (gesture.phase === 'withdrawn') {
    // Unreachable from the released events, which carry no `withdraw`.
    return {phase: 'idle'};
  }
  if (gesture.phase !== 'open') {
    return gesture;
  }
  return {
    phase: 'open',
    pointerType: gesture.pointerType,
    openedAt: gesture.openedAt,
  };
}
