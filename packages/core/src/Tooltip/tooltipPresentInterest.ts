// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file tooltipPresentInterest.ts
 * @input createSharedContext
 * @output Exports `TooltipPresentInterestContext` and its value types: the
 *   interaction on a tooltip's anchor that mounted the tooltip; and
 *   `TooltipDescribesContext`: whether the tooltip describes its anchor; and
 *   `TooltipDescriptionIdContext`: the id that description takes; and
 *   `tooltipIdOf` and `isTooltipDescription`, which read those ids
 * @position Internal to Core, not exported from the Tooltip entry. A
 *   truncated Text or Heading mounts its tooltip on the first hover, tap or
 *   focus, and provides that interaction here, so the tooltip answers it when
 *   its trigger attaches, as its own listeners would have. A tooltip whose
 *   text is its anchor's own content (a cut label) describes nothing.
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
 * Whether the tooltip describes its anchor: a hidden copy of its text that
 * the anchor's `aria-describedby` names. Core components set it `false` for a
 * tooltip whose text is already the anchor's own content or name. It is not
 * exported from the package entry.
 */
export const TooltipDescribesContext = createSharedContext<boolean>(
  'TooltipDescribesContext',
  1,
  true,
);
TooltipDescribesContext.displayName = 'TooltipDescribesContext';

/**
 * The id a describing tooltip gives its description, when a Core component
 * names that id in its own control's `aria-describedby` (a disabled
 * checkbox's reason). Without it the tooltip derives the id from its layer.
 * It is not exported from the package entry.
 */
export const TooltipDescriptionIdContext = createSharedContext<string | null>(
  'TooltipDescriptionIdContext',
  1,
  null,
);
TooltipDescriptionIdContext.displayName = 'TooltipDescriptionIdContext';

/** The suffix a tooltip's description id adds to its layer's id. */
export const DESCRIPTION_SUFFIX = '-description';

/**
 * The tooltip element's id for a `describedBy` id: the element the layer
 * mounts at its first show. For Core components only; it is not exported
 * from the package entry. It lives here, beside the other internal trigger
 * contracts, so a component that reads it does not import the tooltip
 * runtime.
 */
export function tooltipIdOf(describedBy: string): string {
  return describedBy.endsWith(DESCRIPTION_SUFFIX)
    ? describedBy.slice(0, -DESCRIPTION_SUFFIX.length)
    : describedBy;
}

/**
 * Whether `element` is a tooltip's description copy, the hidden element a
 * trigger's `aria-describedby` names before the tooltip first shows. For
 * Core components only.
 */
export function isTooltipDescription(element: Element): boolean {
  return (
    element.hasAttribute('hidden') && element.id.endsWith(DESCRIPTION_SUFFIX)
  );
}
