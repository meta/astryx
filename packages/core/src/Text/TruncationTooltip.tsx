// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TruncationTooltip.tsx
 * @input A truncated element's ref, its full text and the tooltip placement
 * @output Exports `useTruncationTooltipInterest`, which loads the Tooltip
 *   module once text is truncated and tracks the first hover, tap or focus on
 *   it, and `TruncationTooltip`, the Tooltip that mounts on that interaction
 * @position Shared by Text, Heading and Lab's LineClamp (through Core's internal
 *   line-clamp entry). Until the first interaction a page of
 *   truncated text mounts no tooltip layers, and the tooltip that then mounts
 *   answers that interaction as it would once mounted.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type {LayerPlacement} from '../Layer';
import {createModuleLoader} from '../utils/moduleLoader';
import type {Tooltip as TooltipType} from '../Tooltip/Tooltip';
import {useTapRecognizer} from '../Layer/tapRecognizer';
import {
  TooltipPresentInterestContext,
  type TooltipPresentInterestState,
} from '../Tooltip/tooltipPresentInterest';

type TooltipComponent = typeof TooltipType;

// The Tooltip module. Once loaded, a tooltip renders from it at once: no
// boundary suspends, so the first hover's delay starts on the hover.
const tooltipModule = createModuleLoader(
  async () => import('../Tooltip/Tooltip'),
);

export interface TruncationTooltipInterest {
  /** Whether a hover, tap or focus has reached the element. It stays true. */
  readonly isWanted: boolean;
  /** The Tooltip component, once its module has loaded. */
  readonly tooltip: TooltipComponent | null;
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
  const [tooltip, setTooltip] = useState<TooltipComponent | null>(
    () => tooltipModule.loaded()?.Tooltip ?? null,
  );
  // Syncs with the module loader: truncated text loads the Tooltip module, so
  // the first interaction mounts the tooltip at once.
  useEffect(() => {
    if (!isEnabled || tooltip != null) {
      return;
    }
    let isCurrent = true;
    tooltipModule.load().then(
      loaded => {
        if (isCurrent) {
          setTooltip(() => loaded.Tooltip);
        }
      },
      () => {},
    );
    return () => {
      isCurrent = false;
    };
  }, [isEnabled, tooltip]);
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
      // After a failed load, this interaction asks the module loader again.
      // The loader returns its cached module when another element loaded it.
      tooltipModule.load().then(
        loaded => setTooltip(() => loaded.Tooltip),
        () => {},
      );
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
    tooltip,
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
  interest,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  content: ReactNode;
  placement: LayerPlacement;
  interest: TruncationTooltipInterest;
}): ReactNode {
  // A first interaction before the module loads mounts the tooltip once it
  // has: the interaction is held until the tooltip reads it.
  const Tooltip = interest.tooltip;
  if (Tooltip == null) {
    return null;
  }
  return (
    <TooltipPresentInterestContext value={interest.interestRef}>
      <Tooltip anchorRef={anchorRef} content={content} placement={placement} />
    </TooltipPresentInterestContext>
  );
}
