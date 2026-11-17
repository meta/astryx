// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavContext.ts
 * @input Layer-scoped React context
 * @output TopNavSlotContext, useTopNavSlot, TopNavMegaMenuCloseContext, and
 *   usePickCloses
 * @position Navigation slot presentation defaults
 */

import {use, useRef} from 'react';
import type {PointerEvent} from 'react';
import {createLayerScopedContext} from '../Layer/layerScopedContext';

export type TopNavSlot = 'start' | 'center' | 'end';

export const TopNavSlotContext = createLayerScopedContext<TopNavSlot>(
  'TopNavSlotContext',
  1,
  'start',
);
TopNavSlotContext.displayName = 'TopNavSlotContext';

export function useTopNavSlot(): TopNavSlot {
  return use(TopNavSlotContext);
}

/**
 * Closes the TopNavMegaMenu panel that holds the content, returning focus to
 * its trigger; null outside a panel. Panel items call it on a pick.
 */
export const TopNavMegaMenuCloseContext = createLayerScopedContext<
  (() => void) | null
>('TopNavMegaMenuCloseContext', 1, null);
TopNavMegaMenuCloseContext.displayName = 'TopNavMegaMenuCloseContext';

/**
 * Whether a pick on a TopNav menu item closes the menu. A keyboard pick and a
 * finger or pen press close it; a mouse or trackpad pick leaves the menu
 * open. The press, not the click, says which: a menu's press model acts on
 * release with a dispatched click that looks like a keyboard's. Spread
 * `onPointerDownCapture` and `onKeyDownCapture` on the item and call
 * `closes()` in its click.
 */
export function usePickCloses(): {
  onPointerDownCapture: (event: PointerEvent) => void;
  onKeyDownCapture: () => void;
  closes: () => boolean;
} {
  const pressTypeRef = useRef<string | null>(null);
  return {
    onPointerDownCapture: event => {
      pressTypeRef.current = event.pointerType;
    },
    onKeyDownCapture: () => {
      pressTypeRef.current = null;
    },
    closes: () => {
      const type = pressTypeRef.current;
      pressTypeRef.current = null;
      return type == null || type === 'touch' || type === 'pen';
    },
  };
}
