// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';
/**
 * @file Table-owned bridge for a row's recognized menu layer.
 * @input ContextMenu open/close state and the existing window focus owner.
 * @output One retained logical row across portal focus and trigger return.
 * @position Private row-to-layer coordination; no second focus-return manager.
 */
import {createContext} from 'react';
export const TableRowFocusContext = createContext<{
  onOpenChange(open: boolean): void;
} | null>(null);
TableRowFocusContext.displayName = 'TableRowFocusContext';
