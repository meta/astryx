// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InputGroupContext.ts
 * @input Layer-scoped React context/use
 * @output Exports InputGroup context and useInputGroup hook
 * @position Shared context; consumed by input components for group-aware styling and ARIA associations
 */

import {use} from 'react';
import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';

export interface InputGroupContextValue {
  isInGroup: true;
  /** ID of the group label element, for aria-labelledby composition. */
  labelID: string;
  /** IDs of helper/status text owned by the group, for aria-describedby composition. */
  describedByIDs?: string;
}

export const InputGroupContext = createContext<InputGroupContextValue | null>(
  null,
);
InputGroupContext.displayName = 'InputGroupContext';

/**
 * Hook for input components to detect when inside an InputGroup.
 * Returns null when used outside a group.
 */
export function useInputGroup(): InputGroupContextValue | null {
  return use(InputGroupContext);
}
