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
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type {LayerPlacement} from '../Layer';
import {
  TooltipPresentInterestContext,
  type TooltipPresentInterest,
  type TooltipPresentInterestBox,
} from '../Tooltip/tooltipPresentInterest';

const LazyTooltip = lazy(async () =>
  import('../Tooltip/Tooltip').then(mod => ({default: mod.Tooltip})),
);

export interface TruncationTooltipInterest {
  /** Whether a hover, tap or focus has reached the element. It stays true. */
  readonly isWanted: boolean;
  /** The interaction that mounted the tooltip, until the tooltip reads it. */
  readonly interestBox: TooltipPresentInterestBox;
  readonly onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onClick: (event: MouseEvent<HTMLElement>) => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
}

/**
 * Tracks the interaction that mounts a truncated element's tooltip, while
 * `isEnabled`. A finger's arrival does not count: the browser decides on the
 * press whether it is a tap or a scroll, and only a tap's `click` mounts the
 * tooltip. Once it is mounted, the tooltip's own listeners take over.
 */
export function useTruncationTooltipInterest(
  isEnabled: boolean,
): TruncationTooltipInterest {
  const [isWanted, setIsWanted] = useState(false);
  const interestRef = useRef<TooltipPresentInterest>(null);
  const isWantedRef = useRef(false);
  const pressTypeRef = useRef<string | null>(null);
  const want = useCallback(
    (interest: 'hover' | 'tap' | 'focus') => {
      if (!isEnabled || isWantedRef.current) {
        return;
      }
      interestRef.current = interest;
      isWantedRef.current = true;
      setIsWanted(true);
    },
    [isEnabled, interestRef],
  );
  const onPointerEnter = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') {
        want('hover');
      }
    },
    [want],
  );
  const onPointerLeave = useCallback(() => {
    if (interestRef.current === 'hover') {
      interestRef.current = null;
    }
  }, [interestRef]);
  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    pressTypeRef.current = event.pointerType;
  }, []);
  const onClick = useCallback(() => {
    const pressType = pressTypeRef.current;
    pressTypeRef.current = null;
    if (pressType === 'touch' || pressType === 'pen') {
      want('tap');
    }
  }, [want]);
  const onFocus = useCallback(() => {
    want('focus');
  }, [want]);
  const onBlur = useCallback(() => {
    if (interestRef.current === 'focus') {
      interestRef.current = null;
    }
  }, [interestRef]);
  return {
    isWanted,
    interestBox: interestRef,
    onPointerEnter,
    onPointerLeave,
    onPointerDown,
    onClick,
    onFocus,
    onBlur,
  };
}

/** The truncated element's Tooltip, given the interaction that mounted it. */
export function TruncationTooltip({
  anchorRef,
  content,
  placement,
  interestBox,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  content: ReactNode;
  placement: LayerPlacement;
  interestBox: TooltipPresentInterestBox;
}): ReactNode {
  return (
    <Suspense fallback={null}>
      <TooltipPresentInterestContext value={interestBox}>
        <LazyTooltip
          anchorRef={anchorRef}
          content={content}
          placement={placement}
        />
      </TooltipPresentInterestContext>
    </Suspense>
  );
}
