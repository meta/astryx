// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file menuTriggerPress.ts
 * @input The menu press model's shared state (useMenuPress.ts), useLongPress
 *   and the menu press values (the long press's duration comes from
 *   motion/uikit/longPress.ts). The scroll probe comes in its options.
 * @output Exports `useMenuTriggerPress`: the trigger half of the menu press
 *   model (a mouse press-down open, a held or pressed finger open, the
 *   scroll-view wait)
 * @position Only a menu with a trigger reaches this module: DropdownMenu,
 *   MoreMenu and the public useMenuPress. A sub-menu, a context menu, a
 *   Selector's list and a sheet's action list never press a trigger. They do
 *   not bundle the long-press detectors. DropdownMenu and the public
 *   useMenuPress pass the scroll probe. Only the touch model reads it.
 *
 * SYNC: When modified, update useMenuPress.ts and useMenuPress.test.tsx.
 */

import {useCallback, useMemo, type RefObject} from 'react';
import {currentGesture} from '../Layer/gestureCounter';
import {normalizePointerType} from './menuPressGesture';
import type {
  MenuPressInput,
  MenuPressPointerType,
  MenuPressState,
} from './menuPressGesture';
import {
  DELAYS_CONTENT_TOUCHES_MS,
  MENU_PRESS_HOLD_OPEN_SLOP_PX,
} from './menuPressValues';
import {
  useLongPressDetector,
  type LongPressDetectorHandlers,
  type LongPressTolerance,
} from './useLongPress';
import {LONG_PRESS_DURATION_MS} from '../motion/uikit/longPress';

/**
 * How long a finger rests on the trigger before the menu opens under it,
 * with the 'pointer' touch model and no `longPressDelayMs`. A tap released
 * sooner opens the menu through the trigger's click.
 */
export const MENU_PRESS_LONG_PRESS_MS = LONG_PRESS_DURATION_MS;

/**
 * How far a finger held on a DropdownMenu trigger may move before the open,
 * in CSS px, under every primary pointer. It is the same 13 pt that a
 * trigger in a scroll view allows: a 12 pt move still opens a native menu.
 * ContextMenu keeps the long press's own allowable movement.
 */
export const MENU_PRESS_TRIGGER_DRIFT_PX = MENU_PRESS_HOLD_OPEN_SLOP_PX;

const TRIGGER_TOLERANCE: LongPressTolerance = {
  moveCancelPx: MENU_PRESS_TRIGGER_DRIFT_PX,
};

/** What the trigger half reads and drives of the model. @internal */
export interface MenuTriggerContext {
  readonly optionsRef: RefObject<{
    isEnabled?: boolean;
    onTriggerPress?: (pointerType: MenuPressPointerType) => boolean;
    touchModel?: 'pointer' | 'uikit';
    isInScrollView?: (control: Element) => boolean;
  }>;
  readonly gestureRef: RefObject<MenuPressState<HTMLElement>>;
  // The model's own state changes through these calls, never through a
  // write to one of its refs. React Compiler reads a write through a hook
  // argument as mutating it.
  /** Marks the gesture whose long press opened the menu. */
  readonly setTriggerGesture: (gesture: number | null) => void;
  /**
   * This render's two hold detectors, in a scroll view or not; the model
   * keeps the one the live press uses.
   */
  readonly setHoldDetectors: (detectors: {
    plain: LongPressDetectorHandlers;
    scroller: LongPressDetectorHandlers;
  }) => void;
  /**
   * Starts the live press's hold, in a scroll view or not, at a point, with
   * the press's own tolerance when it has one.
   */
  readonly startHold: (
    kind: 'plain' | 'scroller',
    at: {x: number; y: number},
    tolerance?: LongPressTolerance,
  ) => void;
  readonly setLastPointerEvent: (event: PointerEvent) => void;
  /** Whether the model ignores this pointer; a match is cleared. */
  readonly takeIgnoredPointer: (pointerId: number) => boolean;
  readonly installTouchMovePreventer: () => void;
  readonly step: (
    event: MenuPressInput<HTMLElement>,
    native?: PointerEvent,
  ) => void;
  readonly attach: (pointerId: number) => void;
}

export interface MenuTriggerHandlers {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
}

/**
 * The trigger half of the menu press model. `ctx` is stable for the model's
 * lifetime.
 *
 * @internal
 */
export function useMenuTriggerPress(
  ctx: MenuTriggerContext,
  options: {touchModel?: 'pointer' | 'uikit'; longPressDelayMs?: number},
): MenuTriggerHandlers {
  const fireLongPress = useCallback(() => {
    const gesture = ctx.gestureRef.current;
    if (gesture.phase !== 'triggerPress') {
      return;
    }
    ctx.setTriggerGesture(currentGesture());
    const didOpen =
      ctx.optionsRef.current.onTriggerPress?.(gesture.pointerType) ?? false;
    if (!didOpen) {
      ctx.step({type: 'cancel'});
      return;
    }
    ctx.installTouchMovePreventer();
    ctx.step({type: 'opened', time: Date.now()});
  }, [ctx]);

  // The long-press detector ContextMenu uses, fed from this model's pointer
  // stream. Only its timer, hold time and drift allowance are used. Under the
  // touch model a trigger in a fixed bar opens on press. In a scroll view it
  // waits for the content-touch delay, so a scroll can claim the touch.
  const isUikit = options.touchModel === 'uikit';
  const pointerHoldMs = options.longPressDelayMs ?? MENU_PRESS_LONG_PRESS_MS;
  const plainHold = useLongPressDetector({
    onLongPress: fireLongPress,
    delayMs: pointerHoldMs,
  });
  const scrollerHold = useLongPressDetector({
    onLongPress: fireLongPress,
    delayMs: isUikit ? DELAYS_CONTENT_TOUCHES_MS : pointerHoldMs,
    ...(isUikit ? {moveCancelPx: MENU_PRESS_HOLD_OPEN_SLOP_PX} : {}),
  });
  ctx.setHoldDetectors({plain: plainHold, scroller: scrollerHold});

  const handleTriggerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const {isEnabled = true} = ctx.optionsRef.current;
      if (ctx.takeIgnoredPointer(event.pointerId)) {
        return;
      }
      if (!isEnabled || ctx.gestureRef.current.phase !== 'idle') {
        return;
      }
      const pointerType = normalizePointerType(event.pointerType);
      if (pointerType == null || event.button !== 0) {
        return;
      }
      if (pointerType === 'mouse' && event.ctrlKey) {
        // Control-click is the context menu's on macOS.
        return;
      }
      const native = event.nativeEvent;
      const down = {
        type: 'down',
        target: 'trigger',
        pointerType,
        row: null,
        time: Date.now(),
      } as const;
      const isUikitFinger =
        pointerType !== 'mouse' &&
        ctx.optionsRef.current.touchModel === 'uikit';
      // Only the touch model waits differently inside a scroll view, so only
      // it asks the probe.
      const inScrollView =
        isUikitFinger &&
        (ctx.optionsRef.current.isInScrollView?.(event.currentTarget) ?? false);
      if (isUikitFinger && !inScrollView) {
        // Stop the finger's compatibility mouse events. Their mousedown would
        // take focus back from the menu.
        event.preventDefault();
        ctx.attach(native.pointerId);
        ctx.setLastPointerEvent(native);
        ctx.step(down, native);
        fireLongPress();
        return;
      }
      ctx.attach(native.pointerId);
      ctx.setLastPointerEvent(native);
      if (pointerType !== 'mouse') {
        ctx.startHold(
          inScrollView ? 'scroller' : 'plain',
          {x: native.clientX, y: native.clientY},
          TRIGGER_TOLERANCE,
        );
      }
      ctx.step(down, native);
    },
    [ctx, fireLongPress],
  );

  const handleTriggerContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      // A finger held on the trigger is opening the menu, not asking for the
      // browser's own context menu.
      const gesture = ctx.gestureRef.current;
      if (gesture.phase !== 'idle' && gesture.pointerType !== 'mouse') {
        event.preventDefault();
      }
    },
    [ctx],
  );

  return useMemo(
    () => ({
      onPointerDown: handleTriggerPointerDown,
      onContextMenu: handleTriggerContextMenu,
    }),
    [handleTriggerPointerDown, handleTriggerContextMenu],
  );
}
