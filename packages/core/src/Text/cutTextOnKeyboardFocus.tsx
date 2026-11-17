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
import {createModuleLoader} from '../utils/moduleLoader';
import {isElement} from '../utils/nodeType';

const cutTextModule = createModuleLoader(async () => import('./cutText'));

type CutTextModule = NonNullable<ReturnType<typeof cutTextModule.loaded>>;

/** What keyboard focus on `target` shows for the anchor, measured now. */
function cutTextIn(
  module: CutTextModule,
  anchorRef: RefObject<HTMLElement | null>,
  measureRef: RefObject<HTMLElement | null> | undefined,
  target: Element,
): string | null {
  const anchor = anchorRef.current;
  const measured = measureRef?.current ?? anchor;
  return anchor == null || measured == null
    ? null
    : module.cutTextFor(anchor, measured, target);
}

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
 * reaches the anchor or an element inside it, the loaded
 * module measures `measureRef`'s text; if a box cuts it short, it shows until
 * focus leaves the anchor, Escape, or a press. A caller's own tooltip on the
 * anchor wins. A hover and a touch tap show nothing, and nothing is measured
 * at rest. A focus that arrives before the module loads shows once it loads,
 * if focus is still there. Internal: the package does not export it.
 */
export function useCutTextOnKeyboardFocus({
  anchorRef,
  measureRef,
  isEnabled,
}: {
  /** The element focus reaches and the tooltip attaches to. */
  anchorRef: RefObject<HTMLElement | null>;
  /** The element whose text is cut; the anchor itself when omitted. */
  measureRef?: RefObject<HTMLElement | null>;
  isEnabled: boolean;
}): CutTextOnKeyboardFocus {
  const [cutText, setCutText] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(() => cutTextModule.loaded());
  // A keyboard focus that arrived before the module loaded.
  const pendingRef = useRef<Element | null>(null);
  const readModality = useInteractionModalityTrackingFor(anchorRef, isEnabled);
  // Syncs with the module loader: the module loads after the page's first
  // paint, and a focus that arrived before it shows then.
  useEffect(() => {
    if (!isEnabled || loaded != null) {
      return;
    }
    let isCurrent = true;
    cutTextModule.load().then(
      module => {
        if (!isCurrent) {
          return;
        }
        setLoaded(module);
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending?.matches(':focus-visible') === true) {
          setCutText(cutTextIn(module, anchorRef, measureRef, pending));
        }
      },
      () => {},
    );
    return () => {
      isCurrent = false;
    };
  }, [isEnabled, loaded, anchorRef, measureRef]);
  const hide = useCallback(() => setCutText(null), []);
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
    if (loaded == null) {
      pendingRef.current = target;
    } else {
      setCutText(cutTextIn(loaded, anchorRef, measureRef, target));
    }
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (!(isElement(next) && anchorRef.current?.contains(next))) {
      pendingRef.current = null;
      setCutText(null);
    }
  };
  return {
    tooltip:
      isEnabled && cutText != null && loaded != null ? (
        <loaded.UndescribedTooltip
          anchorRef={anchorRef}
          content={cutText}
          onHide={hide}
        />
      ) : null,
    onFocus,
    onBlur,
    onPointerDown: hide,
  };
}
