// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file cutTextOnKeyboardFocus.tsx
 * @input An anchor that keyboard focus reaches and the element whose text a
 *   box may cut short
 * @output Exports `useCutTextOnKeyboardFocus`, which shows that text in full
 *   in an undescribed tooltip while keyboard focus is inside the anchor and
 *   the text is cut
 * @position Used by Button (a cut label) and TableHeaderCell (a cut heading).
 *   Its first-load part is the focus handlers. The measurement and the
 *   tooltip load in one module after the page's first paint (cutText.tsx).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {useInteractionModalityTrackingFor} from '../utils/interactionModality';
import {afterNextPaint, createModuleLoader} from '../utils/moduleLoader';
import {isElement} from '../utils/nodeType';

// A parent's commit can run this hook's effect before the browser paints, as
// a Table's commit does, so the load waits for the next paint.
const cutTextModule = createModuleLoader(async () => {
  await afterNextPaint(window);
  return import('./cutText');
});

export interface CutTextOnKeyboardFocus {
  /** The tooltip to render beside the anchor; `null` while none can show. */
  readonly tooltip: ReactNode;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
  /** A press closes it, as a press closes a tooltip. */
  readonly onPointerDown: () => void;
}

/**
 * Shows a component's cut text in an undescribed tooltip on keyboard focus:
 * a Button's cut label, a table header cell's cut heading. When keyboard focus
 * reaches the anchor or an element inside it, the loaded module measures
 * `measureRef`'s text; if a box cuts it short, it shows until focus leaves the
 * anchor, Escape, or a press. With `yieldsToCallerTooltip`, a caller's own
 * tooltip on the anchor wins. A hover and a touch tap show nothing, and
 * nothing is measured at rest. A focus that arrives before the module loads
 * shows once it loads, if focus is still there; a press first drops it.
 * Internal: the package does not export it.
 */
export function useCutTextOnKeyboardFocus({
  anchorRef,
  measureRef,
  isEnabled,
  yieldsToCallerTooltip = false,
}: {
  /** The element focus reaches and the tooltip attaches to. */
  anchorRef: RefObject<HTMLElement | null>;
  /** The element whose text is cut; the anchor itself when omitted. */
  measureRef?: RefObject<HTMLElement | null>;
  isEnabled: boolean;
  /** Shows nothing while a caller's tooltip describes the anchor (Button). */
  yieldsToCallerTooltip?: boolean;
}): CutTextOnKeyboardFocus {
  const [cutText, setCutText] = useState<string | null>(null);
  const heldFocusRef = useRef<Element | null>(null);
  const readModality = useInteractionModalityTrackingFor(anchorRef, isEnabled);
  // Syncs with the module loader: the module loads after the page's first
  // paint, and a focus that arrived before it shows then.
  useEffect(() => {
    if (!isEnabled || cutTextModule.loaded() != null) {
      return;
    }
    let isCurrent = true;
    cutTextModule.load().then(
      module => {
        if (!isCurrent) {
          return;
        }
        const held = heldFocusRef.current;
        heldFocusRef.current = null;
        if (held?.matches(':focus-visible') === true) {
          setCutText(
            module.cutTextFor(
              anchorRef,
              measureRef,
              held,
              yieldsToCallerTooltip,
            ),
          );
        }
      },
      () => {},
    );
    return () => {
      isCurrent = false;
    };
  }, [isEnabled, anchorRef, measureRef, yieldsToCallerTooltip]);
  // The open tooltip takes this as `onHide`, so it keeps one identity.
  const hide = useCallback(() => {
    heldFocusRef.current = null;
    setCutText(null);
  }, []);
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const target = event.target;
    // `:focus-visible` also matches a text field a pointer focused, so the
    // modality reader decides: only keyboard focus counts.
    if (
      !isEnabled ||
      !isElement(target) ||
      !target.matches(':focus-visible') ||
      readModality() !== 'keyboard'
    ) {
      return;
    }
    const loaded = cutTextModule.loaded();
    if (loaded == null) {
      heldFocusRef.current = target;
    } else {
      setCutText(
        loaded.cutTextFor(anchorRef, measureRef, target, yieldsToCallerTooltip),
      );
    }
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (!(isElement(next) && anchorRef.current?.contains(next))) {
      hide();
    }
  };
  // The module is set once, before the state update that shows a text, so a
  // render with a text always finds it.
  const loaded = cutTextModule.loaded();
  return {
    tooltip:
      isEnabled && cutText != null && loaded != null ? (
        <loaded.UndescribedTooltip
          anchorRef={anchorRef}
          content={cutText}
          isOpen
          onHide={hide}
        />
      ) : null,
    onFocus,
    onBlur,
    onPointerDown: hide,
  };
}
