// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TruncationTooltip.tsx
 * @input A truncated element's ref, its full text and the tooltip placement
 * @output Exports `useTruncationTooltipInterest`, which loads the Tooltip
 *   module once text is truncated, or after the page's first paint for text
 *   that measures on interest, and tracks the first hover, tap or focus on it,
 *   and `TruncationTooltip`, the Tooltip that mounts on that interaction
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
import {afterNextPaint, createModuleLoader} from '../utils/moduleLoader';
import type {UndescribedTooltip as UndescribedTooltipType} from '../Tooltip/Tooltip';
import {holdMouseMoves, isMouseMove} from '../utils/inputStream';
import {useTapRecognizer} from '../Layer/gestureCounter';
import {isElement} from '../utils/nodeType';
import {
  TooltipPresentInterestContext,
  type TooltipPresentInterestState,
} from '../Tooltip/tooltipPresentInterest';

type UndescribedTooltipComponent = typeof UndescribedTooltipType;

// The Tooltip module. Once loaded, a tooltip renders from it at once: no
// boundary suspends, so the first hover's delay starts on the hover.
const tooltipModule = createModuleLoader(
  async () => import('../Tooltip/Tooltip'),
);

// The page's texts share one preload. It waits for the next paint, then
// loads the module once. The shared loader keeps no failed load, so the next
// text tries again.
const afterPaintModule = createModuleLoader(async () => {
  await afterNextPaint(window);
  return tooltipModule.load();
});
const loadAfterNextPaint = afterPaintModule.load;

export interface TruncationTooltipInterest {
  /** Whether a hover, tap or focus has reached the element. It stays true. */
  readonly isWanted: boolean;
  /** The tooltip component, once its module has loaded. */
  readonly tooltip: UndescribedTooltipComponent | null;
  /** The interaction that mounted the tooltip, until the tooltip reads it. */
  readonly interestRef: RefObject<TooltipPresentInterestState>;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
}

/**
 * Tracks the interaction that mounts a truncated element's tooltip, while
 * `isEnabled` or, with `measure`, while the interaction measures the text
 * truncated, until the mounted tooltip reads it. A finger's arrival does not
 * count: only a press that the touch trigger's recognizer takes for a tap
 * does. Once the tooltip has read the interaction, its own listeners take
 * over.
 */
export function useTruncationTooltipInterest(
  isEnabled: boolean,
  // For text that measures on interest: measures now and returns whether the
  // text is truncated, so the interaction that measures it can mount the
  // tooltip.
  measure?: () => boolean,
  // The element, so the window it is in hears mouse moves while it can show
  // a tooltip.
  elementRef?: RefObject<HTMLElement | null>,
): TruncationTooltipInterest {
  const [isWanted, setIsWanted] = useState(false);
  const [tooltip, setTooltip] = useState<UndescribedTooltipComponent | null>(
    () => tooltipModule.loaded()?.UndescribedTooltip ?? null,
  );
  // Syncs with the module loader: truncated text loads the Tooltip module, so
  // the first interaction mounts the tooltip at once. Text that measures on
  // interest has no answer yet. It joins the page's one after-paint preload,
  // so the page shows first, and a hover never hurries the load.
  useEffect(() => {
    if ((!isEnabled && measure == null) || tooltip != null) {
      return;
    }
    let isCurrent = true;
    const show = (loaded: {
      UndescribedTooltip: UndescribedTooltipComponent;
    }) => {
      if (isCurrent) {
        setTooltip(() => loaded.UndescribedTooltip);
      }
    };
    (measure == null ? tooltipModule.load() : loadAfterNextPaint()).then(
      show,
      () => {},
    );
    return () => {
      isCurrent = false;
    };
  }, [isEnabled, measure, tooltip]);
  const interestRef = useRef<TooltipPresentInterestState>({
    interest: null,
    tapEvent: null,
    isRead: false,
  });
  const tapRecognizer = useTapRecognizer();
  // A tooltip that read an interaction unmounts while the text fits. When the
  // text is cut off again, the next tooltip reads the next interaction.
  const measureInterest = useCallback((): boolean => {
    if (measure == null) {
      return isEnabled;
    }
    const isTruncated = measure();
    if (isTruncated && !isEnabled) {
      interestRef.current.isRead = false;
    }
    return isTruncated;
  }, [isEnabled, measure]);
  const want = useCallback(
    (interest: 'hover' | 'tap' | 'focus', tapEvent: Event | null = null) => {
      const state = interestRef.current;
      if (!measureInterest() || state.isRead) {
        return;
      }
      state.interest = interest;
      state.tapEvent = tapEvent;
      setIsWanted(true);
    },
    [measureInterest],
  );
  const forget = useCallback((interest: 'hover' | 'focus') => {
    const state = interestRef.current;
    if (!state.isRead && state.interest === interest) {
      state.interest = null;
    }
  }, []);
  // Set by a mouse press until the pointer leaves: the press ends the hover,
  // so a later move does not start it again.
  const isHoverEndedRef = useRef(false);
  // Set by the first move of a hover until the pointer leaves, so a hover
  // measures the text once, not on every move.
  const isHoverStartedRef = useRef(false);
  // The text holds its window's mouse moves while it can show a tooltip.
  // isMouseMove then tells a still mouse's repeated move from a real move.
  useEffect(() => {
    if (!isEnabled && measure == null) {
      return;
    }
    return holdMouseMoves(elementRef?.current?.ownerDocument.defaultView);
  }, [isEnabled, measure, elementRef]);
  // A hover starts at the first mouse or pen move over the element. A
  // `pointerenter` also comes when the element appears or moves under a still
  // pointer. After a scroll, WebKit also sends a move at the still point
  // (isMouseMove).
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (
        event.pointerType === 'touch' ||
        isHoverEndedRef.current ||
        isHoverStartedRef.current ||
        !isMouseMove(event.nativeEvent)
      ) {
        return;
      }
      isHoverStartedRef.current = true;
      want('hover');
    },
    [want],
  );
  const onPointerLeave = useCallback(() => {
    isHoverEndedRef.current = false;
    isHoverStartedRef.current = false;
    forget('hover');
  }, [forget]);
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!measureInterest() || interestRef.current.isRead) {
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
        isHoverEndedRef.current = true;
        forget('hover');
      }
    },
    [measureInterest, tapRecognizer, want, forget],
  );
  const onFocus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const target = event.target;
      if (
        isElement(target) &&
        target.matches(':focus-visible') &&
        // Chrome on Android focuses a tapped child before the tap's click.
        // Skip that focus, so the click still opens the tooltip.
        !tapRecognizer.isTouchPressCurrent()
      ) {
        want('focus');
      }
    },
    [want, tapRecognizer],
  );
  const onBlur = useCallback(() => forget('focus'), [forget]);
  return {
    isWanted,
    tooltip,
    interestRef,
    onPointerMove,
    onPointerLeave,
    onPointerDown,
    onFocus,
    onBlur,
  };
}

/**
 * The truncated element's tooltip, given the interaction that mounted it. Its
 * text is the element's own, so it adds no description.
 */
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
