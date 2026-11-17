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
import type {
  Tooltip as TooltipType,
  UndescribedTooltip as UndescribedTooltipType,
} from '../Tooltip/Tooltip';
import {useInteractionModalityTrackingFor} from '../utils/interactionModality';
import {useTapRecognizer} from '../Layer/gestureCounter';
import {isElement} from '../utils/nodeType';
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

/** Whether a box clips its content. */
function overflows(element: Element): boolean {
  const box =
    element.clientWidth ||
    (element instanceof HTMLElement ? element.offsetWidth : 0);
  return box > 0 && element.scrollWidth > box;
}

/** Whether an element is visually hidden: a screen-reader-only label. */
function isVisuallyHidden(element: Element): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return (
    style != null &&
    style.position === 'absolute' &&
    ((style.clip !== '' && style.clip !== 'auto') ||
      (style.clipPath !== '' && style.clipPath !== 'none'))
  );
}

/**
 * Whether an element is left out of what a sighted reader sees: hidden, a
 * hidden copy (ToggleButton's bold-width reservation), or visually hidden.
 */
function isLeftOut(element: Element): boolean {
  return (
    element.closest('[hidden], [aria-hidden="true"]') != null ||
    isVisuallyHidden(element)
  );
}

/** Whether text is cut: its box, or a box inside it that a reader sees, clips it. */
function isTextCut(element: HTMLElement): boolean {
  return (
    overflows(element) ||
    [...element.querySelectorAll('*')].some(
      child => !isLeftOut(child) && overflows(child),
    )
  );
}

/** The text a sighted reader sees: hidden and visually hidden text is left out. */
function visibleText(root: HTMLElement): string {
  let text = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
    } else if (
      node instanceof Element &&
      !node.hasAttribute('hidden') &&
      node.getAttribute('aria-hidden') !== 'true' &&
      !isVisuallyHidden(node)
    ) {
      node.childNodes.forEach(walk);
    }
  };
  walk(root);
  return text.replace(/\s+/g, ' ').trim();
}

type UndescribedTooltipComponent = typeof UndescribedTooltipType;

export interface CutTextOnKeyboardFocus {
  /** The full text while keyboard focus is inside and the text is cut. */
  readonly cutText: string | null;
  /**
   * The tooltip that shows `cutText` with no description, once its module
   * has loaded (after the first render, as tooltip code loads).
   */
  readonly Tooltip: UndescribedTooltipComponent | null;
  /** Closes the tooltip; pass it as the tooltip's `onHide` (Escape). */
  readonly hide: () => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
  /** A press closes it, as a press closes a tooltip. */
  readonly onPointerDown: () => void;
}

/**
 * Shows a component's cut text in an undescribed tooltip on keyboard focus:
 * a Button's cut label, a table header cell's cut heading. When keyboard focus
 * reaches the anchor (or an element inside it), it measures `measureRef`'s
 * text; if the text is cut, `cutText` holds it until focus leaves the anchor,
 * Escape, or a press. A hover, a pointer-focused field and a touch tap show
 * nothing, and nothing is measured at rest. Internal: the package does not
 * export it.
 */
export function useCutTextOnKeyboardFocus({
  anchorRef,
  measureRef,
  isEnabled,
  isSuppressed,
}: {
  /** The element focus reaches and the tooltip attaches to. */
  anchorRef: RefObject<HTMLElement | null>;
  /** The element whose text is cut; the anchor itself when omitted. */
  measureRef?: RefObject<HTMLElement | null>;
  isEnabled: boolean;
  /** Returns true when another tooltip already describes the anchor. */
  isSuppressed?: (anchor: HTMLElement) => boolean;
}): CutTextOnKeyboardFocus {
  const [cutText, setCutText] = useState<string | null>(null);
  const [Tooltip, setTooltip] = useState<UndescribedTooltipComponent | null>(
    () => tooltipModule.loaded()?.UndescribedTooltip ?? null,
  );
  const readModality = useInteractionModalityTrackingFor(anchorRef, isEnabled);
  // Syncs with the module loader: the tooltip loads after the first render,
  // so keyboard focus shows it at once.
  useEffect(() => {
    if (!isEnabled || Tooltip != null) {
      return;
    }
    let isCurrent = true;
    tooltipModule.load().then(
      loaded => {
        if (isCurrent) {
          setTooltip(() => loaded.UndescribedTooltip);
        }
      },
      () => {},
    );
    return () => {
      isCurrent = false;
    };
  }, [isEnabled, Tooltip]);
  const hide = useCallback(() => setCutText(null), []);
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const anchor = anchorRef.current;
    const measured = measureRef?.current ?? anchor;
    const target = event.target;
    // `:focus-visible` also matches a text field a pointer focused, so the
    // modality reader decides: only keyboard focus counts.
    if (
      !isEnabled ||
      anchor == null ||
      measured == null ||
      !isElement(target) ||
      !target.matches(':focus-visible') ||
      readModality() !== 'keyboard'
    ) {
      return;
    }
    const text = visibleText(measured);
    const isCut =
      text !== '' && !(isSuppressed?.(anchor) ?? false) && isTextCut(measured);
    setCutText(isCut ? text : null);
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (isElement(next) && anchorRef.current?.contains(next)) {
      return;
    }
    setCutText(null);
  };
  return {cutText, Tooltip, hide, onFocus, onBlur, onPointerDown: hide};
}
