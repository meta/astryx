// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ButtonGroupContext.ts
 * @input Layer-scoped React context
 * @output Exports ButtonGroup context and useButtonGroup hook
 * @position Shared context; consumed by Button for group-aware styling
 */

import {use} from 'react';
import {createLayerScopedContext} from '../Layer/layerScopedContext';

export type ButtonGroupOrientation = 'horizontal' | 'vertical';

export interface ButtonGroupContextValue {
  orientation: ButtonGroupOrientation;
  isDisabled: boolean;
}

export const ButtonGroupContext =
  createLayerScopedContext<ButtonGroupContextValue | null>(
    'ButtonGroupContext',
    1,
    null,
  );
ButtonGroupContext.displayName = 'ButtonGroupContext';

/**
 * Hook for Button to detect when it's inside a ButtonGroup.
 * Returns null when used outside a group.
 */
export function useButtonGroup(): ButtonGroupContextValue | null {
  return use(ButtonGroupContext);
}
