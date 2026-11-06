// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ToolbarContext.ts
 * @input Layer-scoped React context
 * @output Exports ToolbarContext and useToolbar hook
 * @position Shared context; consumed by ButtonGroup to yield toolbar role and roving focus
 */

import {use} from 'react';
import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';

export interface ToolbarContextValue {
  orientation: 'horizontal' | 'vertical';
}

export const ToolbarContext = createContext<ToolbarContextValue | null>(null);
ToolbarContext.displayName = 'ToolbarContext';

/**
 * Hook for components (like ButtonGroup) to detect when they are nested inside a Toolbar.
 * Returns null when used outside a toolbar or inside an overlay layer (e.g. popover/dialog).
 */
export function useToolbar(): ToolbarContextValue | null {
  return use(ToolbarContext);
}
