// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useScheduleViewPopover.ts
 * @input The dialog name for the open trigger's key, or for no open trigger,
 *   and where focus goes when the open trigger stops being painted
 * @output One view-owned Popover with its open key, trigger props, a switch
 *   of the open content inside the popover, the press that returns a trigger
 *   to its own content, and a close when the open trigger is no longer
 *   painted
 * @position Internal hook for Schedule views that own a popover (the month
 *   view's popover, component:Schedule FR17, FR20); not exported
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {layerAnimations} from '@astryxdesign/core/Layer';
import {usePopover, type UsePopoverReturn} from '@astryxdesign/core/Popover';

const TRIGGER_ATTRIBUTE = 'data-schedule-popover-trigger';

export interface ScheduleViewPopover {
  /** The view's one popover. Render it with `popover.render(content, …)`. */
  readonly popover: UsePopoverReturn;
  /** Key of the trigger whose popover is open, or null. */
  readonly openKey: string | null;
  /** Spread on an element that contains every trigger. */
  readonly containerProps: {
    onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
  };
  /**
   * Props of one trigger button. Calling it also marks the trigger as painted
   * this render; the popover closes when its trigger was not. A trigger may
   * own open keys it did not open itself (`ownsOpenKey`): content switched to
   * from inside its popover keeps it expanded and painted.
   */
  getTriggerProps: (
    key: string,
    ownsOpenKey?: (openKey: string) => boolean,
  ) => {
    'aria-haspopup': 'dialog';
    'aria-expanded': boolean;
    'aria-controls': string;
    [TRIGGER_ATTRIBUTE]: string;
    onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  };
  /**
   * Shows `key`'s content in the open popover, in the same gesture, and moves
   * focus into it. The popover keeps its trigger, so focus returns there.
   */
  switchTo: (key: string) => void;
}

const FALLBACK_CLOSE = '[data-astryx-popover-fallback-close]';
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * One popover for a view, opened from any of its trigger buttons. The popover
 * is the system's standard Popover: a modal dialog named by `dialogLabelFor`
 * of the open key, auto-focus, a hidden fallback close, Escape and light
 * dismiss, focus return, and the standard surface and padding. While nothing
 * is open the dialog is not shown, but it still carries a name, so the view
 * never mounts an unnamed dialog.
 */
export function useScheduleViewPopover(
  dialogLabelFor: (key: string | null) => string,
  onTriggerLost?: (key: string) => void,
): ScheduleViewPopover {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const popover = usePopover({
    dialogLabel: dialogLabelFor(openKey),
    // Popover's own defaults, spelled out where the hook's differ.
    padding: 3,
    surfaceTarget: 'popover',
    // The entrance runs on the surface: an anchored layer lays out again on
    // each frame its own style animates.
    xstyle: layerAnimations.below,
    onHide: useCallback(() => {
      setOpenKey(null);
    }, []),
  });

  // A press on the open trigger while it shows content switched to from
  // inside the popover (an event handed from a busy day's list) shows the
  // trigger's own content again. The layer cannot tell that press from one
  // that closes it, so the popover closes here, ahead of the browser's light
  // dismiss, and the click that follows opens it.
  const onPointerDownCapture = (event: ReactPointerEvent<HTMLElement>) => {
    const trigger = (event.target as Element | null)?.closest(
      `[${TRIGGER_ATTRIBUTE}]`,
    );
    const pressedKey = trigger?.getAttribute(TRIGGER_ATTRIBUTE) ?? null;
    if (
      pressedKey != null &&
      pressedKey !== openKey &&
      popover.isOpen &&
      trigger?.getAttribute('aria-expanded') === 'true'
    ) {
      popover.hide();
    }
  };

  // A press on another trigger while the popover is open: the browser's
  // light dismiss closes it as the press ends, and this show from the other
  // trigger opens it there. A press on the open trigger ends closed: its
  // light dismiss closes the popover, and the layer absorbs the show from
  // that same trigger.
  const toggle = (key: string, button: HTMLButtonElement) => {
    if (openKey === key && popover.isOpen) {
      popover.hide();
      return;
    }
    setOpenKey(key);
    popover.triggerRef(button);
    popover.show();
  };

  // Content switched to inside an open popover takes focus once it renders,
  // the way the popover's own auto-focus does when it opens.
  const focusSwitchedContentRef = useRef(false);
  const switchTo = (key: string) => {
    if (!popover.isOpen) {
      return;
    }
    focusSwitchedContentRef.current = true;
    setOpenKey(key);
  };
  useEffect(() => {
    if (!focusSwitchedContentRef.current) {
      return;
    }
    focusSwitchedContentRef.current = false;
    const frame = requestAnimationFrame(() => {
      const content = popover.contentRef.current;
      if (content == null) {
        return;
      }
      const first = Array.from(
        content.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).find(element => element.closest(FALLBACK_CLOSE) == null);
      (first ?? content).focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [openKey, popover.contentRef]);

  // Triggers painted this render; the popover may stay open only for one of
  // them. When its trigger is gone, focus — inside the popover, or dropped
  // to the page with the trigger — has nowhere to return to, so the view
  // decides where it lands.
  const paintedKeys = new Set<string>();
  useEffect(() => {
    if (openKey != null && !paintedKeys.has(openKey)) {
      const content = popover.contentRef.current;
      const active = document.activeElement;
      const hadFocus =
        active == null ||
        active === document.body ||
        (content?.contains(active) ?? false);
      popover.hide();
      setOpenKey(null);
      if (hadFocus) {
        onTriggerLost?.(openKey);
      }
    }
  });

  return {
    popover,
    openKey,
    containerProps: {onPointerDownCapture},
    getTriggerProps: (key, ownsOpenKey) => {
      paintedKeys.add(key);
      const ownsOpen =
        openKey != null && openKey !== key && (ownsOpenKey?.(openKey) ?? false);
      if (ownsOpen) {
        paintedKeys.add(openKey);
      }
      return {
        'aria-haspopup': 'dialog',
        'aria-expanded': popover.isOpen && (openKey === key || ownsOpen),
        'aria-controls': popover.id,
        [TRIGGER_ATTRIBUTE]: key,
        onClick: event => toggle(key, event.currentTarget),
      };
    },
    switchTo,
  };
}
