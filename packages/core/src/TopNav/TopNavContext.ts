// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavContext.ts
 * @input Layer-scoped React context
 * @output TopNavSlotContext and useTopNavSlot
 * @position Navigation slot presentation defaults
 */

import {use} from 'react';
import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';

export type TopNavSlot = 'start' | 'center' | 'end';

export const TopNavSlotContext = createContext<TopNavSlot>('start');
TopNavSlotContext.displayName = 'TopNavSlotContext';

export function useTopNavSlot(): TopNavSlot {
  return use(TopNavSlotContext);
}
