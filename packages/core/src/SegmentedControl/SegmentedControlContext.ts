// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SegmentedControlContext.ts
 * @input Layer-scoped React context, use
 * @output Exports SegmentedControlContext, useSegmentedControlContext
 * @position Context provider; consumed by SegmentedControlItem.tsx
 *
 * SYNC: When modified, update /packages/core/src/SegmentedControl/SegmentedControl.doc.mjs
 */

import {use} from 'react';
import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';

export type SegmentedControlSize = 'sm' | 'md' | 'lg';
export type SegmentedControlLayout = 'hug' | 'fill';

export interface SegmentedControlContextValue {
  value: string;
  onChange: (value: string) => void;
  size: SegmentedControlSize;
  layout: SegmentedControlLayout;
  isDisabled: boolean;
  /**
   * The id of the group's disabled-reason tooltip while the group is disabled
   * with a `disabledMessage`. It also describes each segment, so the segment that has focus is
   * described by the reason (spec:AST-085 FR5).
   */
  disabledReasonID?: string;
}

export const SegmentedControlContext =
  createContext<SegmentedControlContextValue | null>(null);
SegmentedControlContext.displayName = 'SegmentedControlContext';

export function useSegmentedControlContext(): SegmentedControlContextValue {
  const ctx = use(SegmentedControlContext);
  if (ctx == null) {
    throw new Error(
      'useSegmentedControlContext must be used within SegmentedControl. ' +
        'Wrap your SegmentedControlItem in <SegmentedControl>.',
    );
  }
  return ctx;
}
