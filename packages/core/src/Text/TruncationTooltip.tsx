// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TruncationTooltip.tsx
 * @input A truncated element's ref, its full text and the tooltip placement
 * @output Exports `useTruncationTooltipInterest`, which tracks the first
 *   hover, tap or focus on a truncated element, and `TruncationTooltip`, the
 *   lazily loaded Tooltip that mounts on that interaction
 * @position Shared by Text and Heading. Until the first interaction a page of
 *   truncated text mounts no tooltip layers, and the tooltip that then mounts
 *   answers that interaction as it would once mounted.
 */

import {
  lazy,
  Suspense,
  useCallback,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type {LayerPlacement} from '../Layer';
import {
  TooltipPresentInterestContext,
  type TooltipPresentInterest,
} from '../Tooltip/tooltipPresentInterest';

const LazyTooltip = lazy(async () =>
  import('../Tooltip/Tooltip').then(mod => ({default: mod.Tooltip})),
);

export interface TruncationTooltipInterest {
  /** Whether a hover, tap or focus has reached the element. It stays true. */
  readonly isWanted: boolean;
  /** The interaction on the element now. */
  readonly interest: TooltipPresentInterest;
  readonly onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
}

/**
 * Tracks the interaction on a truncated element while `isEnabled`. A touch
 * pointer's leave arrives with its lift, so a tap stays the interaction.
 */
export function useTruncationTooltipInterest(
  isEnabled: boolean,
): TruncationTooltipInterest {
  const [isWanted, setIsWanted] = useState(false);
  const [interest, setInterest] = useState<TooltipPresentInterest>(null);
  const onPointerEnter = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!isEnabled) {
        return;
      }
      setIsWanted(true);
      setInterest(event.pointerType === 'touch' ? 'tap' : 'hover');
    },
    [isEnabled],
  );
  const onPointerLeave = useCallback(() => {
    setInterest(current => (current === 'hover' ? null : current));
  }, []);
  const onFocus = useCallback(() => {
    if (!isEnabled) {
      return;
    }
    setIsWanted(true);
    setInterest('focus');
  }, [isEnabled]);
  const onBlur = useCallback(() => {
    setInterest(current => (current === 'focus' ? null : current));
  }, []);
  return {isWanted, interest, onPointerEnter, onPointerLeave, onFocus, onBlur};
}

/** The truncated element's Tooltip, given the interaction that mounted it. */
export function TruncationTooltip({
  anchorRef,
  content,
  placement,
  interest,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  content: ReactNode;
  placement: LayerPlacement;
  interest: TooltipPresentInterest;
}): ReactNode {
  return (
    <Suspense fallback={null}>
      <TooltipPresentInterestContext value={interest}>
        <LazyTooltip
          anchorRef={anchorRef}
          content={content}
          placement={placement}
        />
      </TooltipPresentInterestContext>
    </Suspense>
  );
}
