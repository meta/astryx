// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file cutTextTooltip.tsx
 * @input An element whose text a row may cut short, and the element the
 *   tooltip anchors to
 * @output Exports `useCutTextTooltip`, which measures the text on the first
 *   hover or keyboard focus and reports whether it is cut short, and
 *   `CutTextTooltip`, the tooltip that shows the full text then
 * @position Internal to Core: shared by Button's label and TableHeaderCell.
 *   Nothing is measured or observed at rest; the text is measured when a
 *   mouse or pen enters, or keyboard focus reaches, the element, so a page of
 *   them holds no observers, and the tooltip layer loads only once text is
 *   found cut. The tooltip answers the interaction that mounted it, and adds
 *   no description, because its text is the element's own name.
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
import type {TooltipFocusTrigger} from '../Tooltip/useTooltip';
import type {CutTextTooltipLayer as CutTextTooltipLayerType} from '../Tooltip/cutTextTooltipLayer';
import {createModuleLoader} from '../utils/moduleLoader';
import {
  TooltipPresentInterestContext,
  type TooltipPresentInterestState,
} from '../Tooltip/tooltipPresentInterest';
import {isElement} from '../utils/nodeType';

// The tooltip layer, loaded the first time text is found cut, so a page of
// labels that fit carries no tooltip code.
const layerModule = createModuleLoader(
  async () => import('../Tooltip/cutTextTooltipLayer'),
);

export interface CutTextTooltipState {
  /** The full text while it is cut short, else `null`. */
  readonly cutText: string | null;
  readonly interestRef: RefObject<TooltipPresentInterestState>;
  readonly onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
}

function isCut(element: HTMLElement): boolean {
  const box = element.clientWidth || element.offsetWidth;
  return element.scrollWidth > box;
}

/** The text a reader sees: hidden and `aria-hidden` content is left out. */
function visibleText(element: HTMLElement): string {
  let text = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
      return;
    }
    if (
      isElement(node) &&
      (node.hasAttribute('hidden') ||
        node.getAttribute('aria-hidden') === 'true')
    ) {
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(element);
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Measures `measureRef` when a mouse or pen enters the element or keyboard
 * focus reaches it, while `isEnabled`. Text that fits shows no tooltip.
 */
export function useCutTextTooltip(
  measureRef: RefObject<HTMLElement | null>,
  isEnabled: boolean,
): CutTextTooltipState {
  const [cutText, setCutText] = useState<string | null>(null);
  const interestRef = useRef<TooltipPresentInterestState>({
    interest: null,
    tapEvent: null,
    isRead: false,
  });
  const measure = useCallback(
    (interest: 'hover' | 'focus') => {
      const element = measureRef.current;
      if (!isEnabled || element == null) {
        return;
      }
      const text = visibleText(element);
      if (text === '' || !isCut(element)) {
        setCutText(null);
        return;
      }
      if (cutText == null) {
        // The tooltip mounts now and answers this interaction.
        interestRef.current = {interest, tapEvent: null, isRead: false};
      }
      setCutText(text);
    },
    [measureRef, isEnabled, cutText],
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
    cutText: isEnabled ? cutText : null,
    interestRef,
    onPointerEnter,
    onFocus,
  };
}

/** The tooltip for cut text, answering the interaction that mounted it. */
export function CutTextTooltip({
  anchorRef,
  state,
  focusTrigger = 'auto',
}: {
  anchorRef: RefObject<HTMLElement | null>;
  state: CutTextTooltipState;
  /**
   * `'always'` opens on keyboard focus anywhere inside an anchor that is not
   * focusable itself, such as a header cell holding a sort control.
   */
  focusTrigger?: TooltipFocusTrigger;
}): ReactNode {
  const isCutNow = state.cutText != null;
  const [Layer, setLayer] = useState<typeof CutTextTooltipLayerType | null>(
    () => layerModule.loaded()?.CutTextTooltipLayer ?? null,
  );
  // Syncs with the module loader: cut text loads the layer once. The held
  // interaction waits in `interestRef` until the layer reads it.
  useEffect(() => {
    if (!isCutNow || Layer != null) {
      return;
    }
    let isCurrent = true;
    layerModule.load().then(
      loaded => {
        if (isCurrent) {
          setLayer(() => loaded.CutTextTooltipLayer);
        }
      },
      () => {},
    );
    return () => {
      isCurrent = false;
    };
  }, [isCutNow, Layer]);
  if (state.cutText == null || Layer == null) {
    return null;
  }
  return (
    <TooltipPresentInterestContext value={state.interestRef}>
      <Layer
        anchorRef={anchorRef}
        content={state.cutText}
        focusTrigger={focusTrigger}
      />
    </TooltipPresentInterestContext>
  );
}
