// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavContext.ts
 * @input Layer-scoped React context
 * @output TopNavSlotContext, useTopNavSlot, and TopNavMegaMenuCloseContext
 * @position Navigation slot presentation defaults
 */

import {use} from 'react';
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
