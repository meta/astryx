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
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type {LayerPlacement} from '../Layer';
import {useTapRecognizer} from '../Layer/useTouchTrigger';
import {
  TooltipPresentInterestContext,
  type TooltipPresentInterestState,
} from '../Tooltip/tooltipPresentInterest';

const LazyTooltip = lazy(async () =>
  import('../Tooltip/Tooltip').then(mod => ({default: mod.Tooltip})),
);

export interface TruncationTooltipInterest {
  /** Whether a hover, tap or focus has reached the element. It stays true. */
  readonly isWanted: boolean;
  /** The interaction that mounted the tooltip, until the tooltip reads it. */
  readonly interestRef: RefObject<TooltipPresentInterestState>;
  readonly onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
}

/**
 * Tracks the interaction that mounts a truncated element's tooltip, while
 * `isEnabled`, until the mounted tooltip reads it. A finger's arrival does not
 * count: only a press that the touch trigger's recognizer takes for a tap
 * does. Once the tooltip has read the interaction, its own listeners take
 * over.
 */
export function useTruncationTooltipInterest(
  isEnabled: boolean,
): TruncationTooltipInterest {
  const [isWanted, setIsWanted] = useState(false);
  const interestRef = useRef<TooltipPresentInterestState>({
    interest: null,
    tapEvent: null,
    isRead: false,
  });
  const tapRecognizer = useTapRecognizer();
  const want = useCallback(
    (interest: 'hover' | 'tap' | 'focus', tapEvent: Event | null = null) => {
      const state = interestRef.current;
      if (!isEnabled || state.isRead) {
        return;
      }
      state.interest = interest;
      state.tapEvent = tapEvent;
      setIsWanted(true);
    },
    [isEnabled],
  );
  const forget = useCallback((interest: 'hover' | 'focus') => {
    const state = interestRef.current;
    if (!state.isRead && state.interest === interest) {
      state.interest = null;
    }
  }, []);
  const onPointerEnter = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') {
        want('hover');
      }
    },
    [want],
  );
  const onPointerLeave = useCallback(() => forget('hover'), [forget]);
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!isEnabled || interestRef.current.isRead) {
        tapRecognizer.forget();
        return;
      }
      const isTouch = tapRecognizer.press(
        event.nativeEvent,
        event.currentTarget,
        tapEvent => want('tap', tapEvent),
      );
      // A mouse press cancels a hover show, as a mounted tooltip does. A pen
      // press waits for its tap.
      if (!isTouch) {
        forget('hover');
      }
    },
    [isEnabled, tapRecognizer, want, forget],
  );
  const onFocus = useCallback(() => want('focus'), [want]);
  const onBlur = useCallback(() => forget('focus'), [forget]);
  return {
    isWanted,
    interestRef,
    onPointerEnter,
    onPointerLeave,
    onPointerDown,
    onFocus,
    onBlur,
  };
}

/** The truncated element's Tooltip, given the interaction that mounted it. */
export function TruncationTooltip({
  anchorRef,
  content,
  placement,
  interestRef,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  content: ReactNode;
  placement: LayerPlacement;
  interestRef: RefObject<TooltipPresentInterestState>;
}): ReactNode {
  return (
    <Suspense fallback={null}>
      <TooltipPresentInterestContext value={interestRef}>
        <LazyTooltip
          anchorRef={anchorRef}
          content={content}
          placement={placement}
        />
      </TooltipPresentInterestContext>
    </Suspense>
  );
}
