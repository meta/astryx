// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file tooltipPresentInterest.ts
 * @input React createContext
 * @output Exports `TooltipPresentInterestContext` and its value type: the
 *   interaction on a tooltip's anchor that mounted the tooltip
 * @position Internal to Core, not exported from the Tooltip entry. A
 *   truncated Text or Heading mounts its tooltip on the first hover, tap or
 *   focus, and provides that interaction here, so the tooltip answers it when
 *   its trigger attaches, as its own listeners would have.
 */

import {createContext} from 'react';

/**
 * The interaction on the anchor when the tooltip mounted: a hover from a
 * mouse or pen still over it, a tap, or focus inside it. `null` when there
 * is none.
 */
export type TooltipPresentInterest = 'hover' | 'tap' | 'focus' | null;

export const TooltipPresentInterestContext =
  createContext<TooltipPresentInterest>(null);
TooltipPresentInterestContext.displayName = 'TooltipPresentInterestContext';
