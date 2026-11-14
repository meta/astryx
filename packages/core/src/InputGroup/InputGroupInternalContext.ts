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
import {createLayerScopedContext} from '../Layer/layerScopedContext';

export const InputGroupInternalContext = createLayerScopedContext(
  'InputGroupInternalContext',
  1,
  {
    isDisabled: false,
    /**
     * The group's `role="group"` cannot carry `aria-invalid`. Its members carry
     * it.
     */
    isInvalid: false,
  },
);
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
