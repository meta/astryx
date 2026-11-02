// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InputGroupInternalContext.ts
 * @input Layer-scoped React context
 * @output Package-private InputGroup state context, and useIsMemberInvalid
 *   for a member's aria-invalid
 * @position Internal group state; not re-exported by index.ts
 */

import {use} from 'react';
import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';

export const InputGroupInternalContext = createContext({
  isDisabled: false,
  /**
   * Whether the group's status is an error. The group's `role="group"` cannot
   * carry `aria-invalid`, so its members carry it.
   */
  isInvalid: false,
});
InputGroupInternalContext.displayName = 'InputGroupInternalContext';

/**
 * Whether a field is invalid for `aria-invalid`: its own status decides when
 * it has one; otherwise a group error makes it invalid.
 */
export function useIsMemberInvalid(
  status: {type: string} | undefined,
): boolean {
  const {isInvalid} = use(InputGroupInternalContext);
  return status != null ? status.type === 'error' : isInvalid;
}
