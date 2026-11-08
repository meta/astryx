// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InteractiveRoleContext.ts
 * @input createSharedContext, use
 * @output Exports InteractiveRoleContext, useInteractiveRoleContext
 * @position Context primitive; consumed by useInteractiveRole hook
 *
 * Provides a role override to optionally-interactive child components.
 * When a parent (Popover, DropdownMenu, etc.) needs its child to render
 * as a button, it wraps the child in this context with role = 'button'.
 *
 * Components don't consume this directly — they use `useInteractiveRole`
 * which checks this context as one of its decision inputs.
 *
 * Follows the same pattern as SizeContext:
 *   SizeContext provides size → useSize resolves it
 *   InteractiveRoleContext provides role → useInteractiveRole resolves it
 *
 * SYNC: When modified, update:
 * - /packages/core/src/InteractiveRoleContext/index.ts
 */

import {use} from 'react';
import type {InteractiveRole} from '../hooks/useInteractiveRole';
import {createSharedContext} from '../utils/sharedContext';

/**
 * Context that provides a role override to child components.
 *
 * Provided by containers that need their child to be interactive:
 * - Popover → 'button' (click to open popover)
 * - DropdownMenu → 'button' (click to open menu)
 * - Any future component that wraps an optionally-interactive trigger
 *
 * `null` means no parent is overriding — resolve based on own props.
 */
export const InteractiveRoleContext =
  createSharedContext<InteractiveRole | null>(
    'InteractiveRoleContext',
    1,
    null,
  );
InteractiveRoleContext.displayName = 'InteractiveRoleContext';

/**
 * Read the role override from context, if any.
 *
 * Most components should use `useInteractiveRole` instead of calling
 * this directly — it incorporates this signal alongside href/onClick.
 *
 * @returns The overridden role, or `null` if no parent is providing one.
 */
export function useInteractiveRoleContext(): InteractiveRole | null {
  return use(InteractiveRoleContext);
}
