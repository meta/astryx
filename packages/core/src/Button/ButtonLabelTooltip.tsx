// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ButtonLabelTooltip.tsx
 * @input A Button element, its label element and the label text
 * @output Exports `useLabelTooltip`, which measures the label on the first
 *   hover or keyboard focus and reports whether it is cut short, and
 *   `ButtonLabelTooltip`, the tooltip that shows the full label then
 * @position Internal to Button. Nothing is measured or observed at rest: the
 *   label is measured when a pointer or keyboard focus reaches the Button, so
 *   a page of buttons holds no observers. The tooltip answers the interaction
 *   that mounted it, and it adds no description, because its text is the
 *   Button's own name.
 */

import {
  useCallback,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {useTooltip} from '../Tooltip/useTooltip';
import {
  TooltipPresentInterestContext,
  type TooltipPresentInterestState,
} from '../Tooltip/tooltipPresentInterest';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {isElement} from '../utils/nodeType';

export interface LabelTooltip {
  /** The full label while it is cut short, else `null`. */
  readonly cutLabel: string | null;
  readonly interestRef: RefObject<TooltipPresentInterestState>;
  readonly onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
}

function isCut(label: HTMLElement): boolean {
  return label.scrollWidth > label.offsetWidth;
}

/**
 * Measures the label when a mouse or pen enters the Button or keyboard focus
 * reaches it, while `isEnabled`. A label that fits shows no tooltip.
 */
export function useLabelTooltip(
  labelRef: RefObject<HTMLElement | null>,
  isEnabled: boolean,
): LabelTooltip {
  const [cutLabel, setCutLabel] = useState<string | null>(null);
  const interestRef = useRef<TooltipPresentInterestState>({
    interest: null,
    tapEvent: null,
    isRead: false,
  });
  const measure = useCallback(
    (interest: 'hover' | 'focus') => {
      const label = labelRef.current;
      if (!isEnabled || label == null) {
        return;
      }
      const text = label.textContent?.trim() ?? '';
      if (text === '' || !isCut(label)) {
        setCutLabel(null);
        return;
      }
      if (cutLabel == null) {
        // The tooltip mounts now and answers this interaction.
        interestRef.current = {interest, tapEvent: null, isRead: false};
      }
      setCutLabel(text);
    },
    [labelRef, isEnabled, cutLabel],
  );
  const onPointerEnter = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') {
        measure('hover');
      }
    },
    [measure],
  );
  const onFocus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const target = event.target;
      if (isElement(target) && target.matches(':focus-visible')) {
        measure('focus');
      }
    },
    [measure],
  );
  return {
    cutLabel: isEnabled ? cutLabel : null,
    interestRef,
    onPointerEnter,
    onFocus,
  };
}

function LabelTooltipLayer({
  anchorRef,
  content,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  content: string;
}): ReactNode {
  const tooltip = useTooltip({placement: 'above'});
  const attach = tooltip.ref;
  // Attaches to the Button element without a description: the tooltip repeats
  // the Button's name, so a screen reader does not hear it twice.
  useIsomorphicLayoutEffect(() => {
    attach(anchorRef.current);
    return () => {
      attach(null);
    };
  }, [anchorRef, attach]);
  return tooltip.renderTooltip(content);
}

/** The Button's tooltip for a cut label, answering the interaction that mounted it. */
export function ButtonLabelTooltip({
  anchorRef,
  labelTooltip,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  labelTooltip: LabelTooltip;
}): ReactNode {
  if (labelTooltip.cutLabel == null) {
    return null;
  }
  return (
    <TooltipPresentInterestContext value={labelTooltip.interestRef}>
      <LabelTooltipLayer
        anchorRef={anchorRef}
        content={labelTooltip.cutLabel}
      />
    </TooltipPresentInterestContext>
  );
}
