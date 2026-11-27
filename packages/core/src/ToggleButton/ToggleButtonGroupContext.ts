// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ToggleButtonGroupContext.ts
 * @input The layer-scoped context factory (Layer/layerScopedContext)
 * @output ToggleButtonGroupContext, which ToggleButtonGroup provides, and
 *   useToggleButtonGroup, which ToggleButton reads
 * @position Internal to ToggleButton. A standalone ToggleButton reads the
 *   group here, so it does not load the group or its press tracking.
 */

import {use} from 'react';
import type {ButtonSize} from '../Button';
import {createLayerScopedContext} from '../Layer/layerScopedContext';

export interface ToggleButtonGroupContextValue {
  /** Currently selected value(s). */
  selectedValues: Set<string>;
  /** Toggle a value on/off. */
  toggle: (value: string) => void;
  /** Group size default — individual buttons can override. */
  size?: ButtonSize;
  /** Group disabled state. */
  isDisabled?: boolean;
  /** The group tracks a press across its toggles that have a value. */
  tracksPress?: boolean;
}

export const ToggleButtonGroupContext =
  createLayerScopedContext<ToggleButtonGroupContextValue | null>(
    'ToggleButtonGroupContext',
    1,
    null,
  );
ToggleButtonGroupContext.displayName = 'ToggleButtonGroupContext';

/**
 * Hook for ToggleButton to read group context.
 * Returns null when used outside a group.
 */
export function useToggleButtonGroup(): ToggleButtonGroupContextValue | null {
  return use(ToggleButtonGroupContext);
}
