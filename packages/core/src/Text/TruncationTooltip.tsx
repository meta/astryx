// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TruncationTooltip.tsx
 * @input A truncated element's ref, its full text and the tooltip placement
 * @output Exports `useTruncationTooltipInterest`, which loads the Tooltip
 *   module once text is truncated and holds the first hover, tap or focus on
 *   it, and `TruncationTooltip`, the Tooltip that mounts on that interaction
 * @position Shared by Text, Heading and Lab's LineClamp (through Core's internal
 *   line-clamp entry). Until the first interaction a page of
 *   truncated text mounts no tooltip layers, and the tooltip that then mounts
 *   answers that interaction as it would once mounted.
 */

import type {ReactNode, RefObject} from 'react';
import type {LayerPlacement} from '../Layer/useLayer';
import {
  useDeferredTooltipInterest,
  type DeferredTooltipInterest,
} from '../hooks/useDeferredTooltipInterest';
import {TooltipPresentInterestContext} from '../Tooltip/tooltipPresentInterest';
import {createModuleLoader} from '../utils/moduleLoader';

// The Tooltip module. Once loaded, a tooltip renders from it at once: no
// boundary suspends, so the first hover's delay starts on the hover.
const tooltipModule = createModuleLoader(
  async () => import('../Tooltip/Tooltip'),
);

type TooltipModule = Awaited<ReturnType<typeof tooltipModule.load>>;

export type TruncationTooltipInterest = DeferredTooltipInterest<TooltipModule>;

/**
 * Holds the interaction that wants a truncated element's tooltip, while
 * `isEnabled`, and loads the Tooltip module once the text is truncated.
 */
export function useTruncationTooltipInterest(
  isEnabled: boolean,
): TruncationTooltipInterest {
  return useDeferredTooltipInterest(isEnabled, tooltipModule);
}

/** The truncated element's Tooltip, given the interaction the base held. */
export function TruncationTooltip({
  anchorRef,
  content,
  placement,
  interest,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  content: ReactNode;
  placement: LayerPlacement;
  interest: TruncationTooltipInterest;
}): ReactNode {
  // A first interaction before the module loads mounts the tooltip once it
  // has: the interaction is held until the tooltip reads it.
  const Tooltip = interest.loadedModule?.Tooltip;
  if (Tooltip == null) {
    return null;
  }
  return (
    <TooltipPresentInterestContext value={interest.interestRef}>
      <Tooltip anchorRef={anchorRef} content={content} placement={placement} />
    </TooltipPresentInterestContext>
  );
}
