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
   * True when the whole control is disabled *and* a `disabledMessage` is set.
   * In that mode the selected segment stays focusable (via `aria-disabled`
   * rather than being dropped from the tab order) so the group's disabled-reason
   * tooltip is keyboard-discoverable; selection is still blocked.
   */
  hasDisabledMessage?: boolean;
  /**
   * The id of the group's disabled-reason tooltip while `hasDisabledMessage`
   * is true. It also describes each segment, so the segment that has focus is
   * described by the reason (spec:AST-085 FR5).
   */
  disabledReasonID?: string;
  /**
   * With a group `disabledMessage`, the segment that holds the Tab stop when
   * no enabled segment is selected: the first enabled segment, else the first.
   * Null when the selected segment holds it, or without a reason.
   */
  fallbackTabStop?: string | null;
  /**
   * Records whether a segment is itself `isDisabled`, so the group can pick
   * the fallback Tab stop. Returns the cleanup that forgets it.
   */
  registerSegment?: (value: string, isDisabled: boolean) => () => void;
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
