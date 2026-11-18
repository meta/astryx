// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file tooltipPresentInterest.ts
 * @input createSharedContext
 * @output Exports `TooltipPresentInterestContext` and its value types: the
 *   interaction on a tooltip's anchor that mounted the tooltip; and
 *   `TooltipDescribesContext`: whether a tooltip describes its anchor
 * @position Internal to Core, not exported from the Tooltip entry. A
 *   truncated Text or Heading mounts its tooltip on the first hover, tap or
 *   focus, and provides that interaction here, so the tooltip answers it when
 *   its trigger attaches, as its own listeners would have.
 */

import type {RefObject} from 'react';
import {createSharedContext} from '../utils/sharedContext';

/**
 * The interaction on the anchor that mounted the tooltip: a hover from a
 * mouse or pen still over it, a completed tap, or focus inside it. `null`
 * when there is none.
 */
export type TooltipPresentInterest = 'hover' | 'tap' | 'focus' | null;

/**
 * Holds the interaction until the tooltip's trigger attaches. The tooltip
 * reads it once and marks it read, so a later remount opens nothing by itself.
 */
export interface TooltipPresentInterestState {
  interest: TooltipPresentInterest;
  /** The `click` that completed the tap, for the touch trigger's rules. */
  tapEvent: Event | null;
  isRead: boolean;
}

export const TooltipPresentInterestContext =
  createSharedContext<RefObject<TooltipPresentInterestState> | null>(
    'TooltipPresentInterestContext',
    1,
    null,
  );
TooltipPresentInterestContext.displayName = 'TooltipPresentInterestContext';

/**
 * Whether a tooltip describes its anchor (`aria-describedby`). False where
 * the tooltip's content is the anchor's own text, such as the truncation
 * tooltip of Text and Heading: a description would make a screen reader
 * read that text twice.
 */
export const TooltipDescribesContext = createSharedContext<boolean>(
  'TooltipDescribesContext',
  1,
  true,
);
TooltipDescribesContext.displayName = 'TooltipDescribesContext';
