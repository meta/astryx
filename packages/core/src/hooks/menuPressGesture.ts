// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuPressGesture.ts
 * @input A menu press gesture and one pointer event, both as plain data
 * @output The pure `menuPressStep` state machine, its state, event and effect
 *   types, and the settle constant
 * @position Pure module under `useMenuPress`. It has no DOM and no React, so
 *   a unit test can check each transition without a browser.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/menuPressGesture.test.ts
 * - /packages/core/src/hooks/useMenuPress.ts
 */

/** How long the opening press must last before its release may act. */
export const MENU_PRESS_SETTLE_MS = 300;

export type MenuPressPointerType = 'mouse' | 'touch' | 'pen';

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

export const IDLE_MENU_PRESS: MenuPressGesture<never> = {phase: 'idle'};

const NONE: MenuPressEffect<never> = {type: 'none'};

function idle<T>(effect: MenuPressEffect<T>): MenuPressStep<T> {
  return {gesture: {phase: 'idle'}, effect};
}

function highlightEffect<T>(row: T | null): MenuPressEffect<T> {
  return row == null ? {type: 'clear'} : {type: 'highlight', row};
}

/**
 * Resolve a release while the highlight is tracking the pointer: over an
 * enabled row it acts, over the menu's chrome it acts on nothing, outside the
 * menu it acts on nothing and — under a mouse — dismisses the menu (a
 * finger leaves it open). A release back on the trigger never dismisses.
 */
function release<T>(
  pointerType: MenuPressPointerType,
  event: Extract<MenuPressEvent<T>, {type: 'up'}>,
): MenuPressStep<T> {
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
 * - `open`: the menu opened under a held pointer, and the pointer has not
 *   entered it yet.
 * - `tracking`: the pointer is held, and the highlight follows it.
 *
 * The settle rule: the release of the opening gesture acts only after the
 * pointer entered the menu or the press lasted `MENU_PRESS_SETTLE_MS`. Else a
 * menu that opens under the pointer would pick a row that nobody chose.
 *
 * Rows are opaque (`T`). The hook feeds in the enabled row under the
 * pointer, or `null` over a divider, a heading, a disabled row, or outside
 * the menu.
 */
export function menuPressStep<T>(
  gesture: MenuPressGesture<T>,
  event: MenuPressEvent<T>,
): MenuPressStep<T> {
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
  gesture: Extract<MenuPressGesture<T>, {phase: 'idle'}>,
  event: MenuPressEvent<T>,
): MenuPressStep<T> {
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
  gesture: Extract<MenuPressGesture<T>, {phase: 'triggerPress'}>,
  event: MenuPressEvent<T>,
): MenuPressStep<T> {
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
    case 'down':
    case 'move':
      return {gesture, effect: NONE};
  }
}

function stepOpen<T>(
  gesture: Extract<MenuPressGesture<T>, {phase: 'open'}>,
  event: MenuPressEvent<T>,
): MenuPressStep<T> {
  switch (event.type) {
    case 'move':
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
    case 'up': {
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
      // menu stays open — a cancelled pointer did not ask to close it.
      return idle({type: 'settle', stray: false, dismiss: false});
    case 'down':
    case 'opened':
      return {gesture, effect: NONE};
  }
}

function stepTracking<T>(
  gesture: Extract<MenuPressGesture<T>, {phase: 'tracking'}>,
  event: MenuPressEvent<T>,
): MenuPressStep<T> {
  switch (event.type) {
    case 'move': {
      if (event.row === gesture.row) {
        return {gesture, effect: NONE};
      }
      return {
        gesture: {...gesture, row: event.row},
        effect: highlightEffect(event.row),
      };
    }
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
