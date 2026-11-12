// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTooltip.tsx
 * @input Uses useLayer, useTouchTriggerInternal, React hooks
 * @output Exports useTooltip hook with stable trigger refs for hover/focus/tap tooltips
 *   and imperative show() and hide() for an app-built toggle trigger, and
 *   useTooltipInternal, its Core-only form with the `isReason` option
 * @position Layer hook; builds on useLayer for tooltip behavior
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Tooltip/index.ts
 */

import {
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefCallback,
} from 'react';
import {TooltipPresentInterestContext} from './tooltipPresentInterest';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  isCoveredByTooltipReason,
  setTooltipReason,
  watchTooltipReason,
} from '../privateAttributes/tooltipReason.stylex';
import {createTriggerFocusGate, isFocusOnTrigger} from '../utils/triggerFocus';
import * as stylex from '@stylexjs/stylex';
import {
  useLayerInternal,
  type ContextRenderProps,
  type LayerAlignment,
  type LayerPlacement,
} from '../Layer/useLayer';
import {
  useTouchTriggerInternal,
  type LayerTouchTrigger,
} from '../Layer/useTouchTrigger';
import {useAnnounceRenderedText} from '../hooks/useAnnounceRenderedText';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {layerAnimations} from '../Layer/layerAnimations.stylex';
import {registerLayerSurface} from '../Layer/layerSurfacePress';
import {noteOutsideDismissal} from '../Layer/outsidePress';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {themeProps} from '../utils/themeProps';
import {
  colorVars,
  radiusVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
} from '../theme/tokens.stylex';

/**
 * Grace period (ms) before hiding on pointer-leave when no explicit `hideDelay`
 * is set, so the pointer can travel across the small gap from the trigger onto
 * the tooltip surface without the tooltip disappearing (WCAG 1.4.13 hoverable).
 */
const HOVER_BRIDGE_DELAY = 100;

const styles = stylex.create({
  // Base container styles - inverted colors for high contrast
  container: {
    // Inverted color palette: dark background, light text
    backgroundColor: colorVars['--color-text-primary'],
    color: colorVars['--color-background-surface'],
    borderRadius: radiusVars['--radius-container'],
    // Typography
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
  },
  // Position-based margin styles
  // Content wrapper for padding
  content: {
    paddingBlockStart: spacingVars['--spacing-1'],
    paddingBlockEnd: spacingVars['--spacing-1'],
    paddingInlineStart: spacingVars['--spacing-2'],
    paddingInlineEnd: spacingVars['--spacing-2'],
    maxWidth: 300,
    wordBreak: 'break-word',
  },
});

/**
 * Focus trigger behavior for tooltips
 */
export type TooltipFocusTrigger = 'auto' | 'always' | 'never';

/**
 * Touch trigger behavior for tooltips
 */
export type TooltipTouchTrigger = LayerTouchTrigger;

export interface TooltipOptions {
  /**
   * Position placement relative to anchor
   * @default 'above'
   */
  placement?: LayerPlacement;

  /**
   * Alignment along the placement axis
   * @default 'center'
   */
  alignment?: LayerAlignment;

  /**
   * Delay before showing on hover (ms)
   * @default 200
   */
  delay?: number;

  /**
   * Delay before hiding after mouse/focus leave (ms)
   * @default 0
   */
  hideDelay?: number;

  /**
   * When to trigger on focus:
   * - `auto`: focus on the trigger itself, or within a trigger that is
   *   focusable when focus arrives
   * - `always`: focus on the trigger or anything inside it
   * - `never`: never on focus (for composite widgets)
   *
   * @default 'auto'
   */
  focusTrigger?: TooltipFocusTrigger;

  /**
   * What a tap does on a touch pointer, where there is no hover:
   * - `auto`: tap opens the tooltip, unless the trigger performs an action of
   *   its own (a button, a link, a form control) — that tap belongs to the
   *   control, and a hint about a control the user just operated is noise
   * - `tap`: tap always opens the tooltip, even on a trigger that acts
   * - `none`: touch never opens the tooltip
   *
   * @default 'auto'
   */
  touchTrigger?: TooltipTouchTrigger;

  /**
   * Whether the tooltip is enabled.
   * When false, hover/focus triggers are disabled.
   *
   * @default true
   */
  isEnabled?: boolean;

  /**
   * Controlled open state. When provided, overrides hover/focus triggers:
   * - `true`: force-show the tooltip (hover/focus hide is suppressed)
   * - `false`: force-hide the tooltip. Focus that would show it calls
   *   `onShow` and shows nothing.
   * - `undefined`: uncontrolled — hover/focus triggers manage visibility
   *
   * A controlled tooltip still takes Escape when it is the top-most layer, and
   * answers by calling `onHide` without hiding itself — closing is your
   * update's decision, exactly as for a controlled Dialog. Ignore the call and
   * the tip stays, and so does the press: nothing underneath dismisses.
   */
  isOpen?: boolean;

  /**
   * Whether the tooltip should be shown on mount.
   * The tooltip is still dismissible — this just opens it initially.
   */
  isDefaultOpen?: boolean;

  /**
   * Callback fired when tooltip is shown. Under `isOpen={false}`, it reports
   * focus that would show the tooltip.
   * Wrap in useCallback for stable identity.
   */
  onShow?: () => void;

  /**
   * Callback fired when tooltip is hidden.
   * Wrap in useCallback for stable identity.
   */
  onHide?: () => void;
}

export interface TooltipReturn {
  /**
   * Combined ref that sets both position and interaction on the same element.
   * Shorthand for calling both positionRef and interactionRef.
   */
  ref: RefCallback<HTMLElement>;

  /**
   * Ref for the positioning anchor element.
   * While the layer is shown, and until its exit animation ends, the trigger
   * carries the layer's CSS anchor name.
   */
  positionRef: RefCallback<HTMLElement>;

  /**
   * Ref for the interaction element.
   * Attaches hover/focus event listeners via addEventListener.
   * Can be the same element as positionRef or different.
   */
  interactionRef: RefCallback<HTMLElement>;

  /**
   * The CSS anchor name to use for positioning.
   * Use this when you need to set anchorName manually (e.g., display:contents wrapper).
   * Set it only while the layer is shown or its exit animation runs.
   */
  anchorId: string;

  /**
   * ID for aria-describedby on the trigger element.
   * Caller should compose with other IDs using mergeIds utility.
   */
  describedBy: string;

  /**
   * Render function for tooltip content.
   * Returns anchor-positioned popover element.
   *
   * `positioning` is excluded: the tooltip always derives its position from
   * placement/alignment, so accepting the custom opt-out here would be a
   * silent no-op.
   */
  renderTooltip: (
    children: ReactNode,
    props?: Omit<ContextRenderProps, 'positioning'>,
  ) => ReactNode;

  /**
   * Opens the tooltip now and keeps it open until `hide()`, Escape, a press
   * outside, or focus leaving its trigger. If a press on the trigger is down
   * when you call it, and the press ends off the trigger with no click, the
   * hold ends. The hover rules then decide.
   * Its text is announced once. Reports through `onShow`. Under a controlled `isOpen`,
   * it calls `onShow` and does not change `isOpen`. Does nothing while
   * `isEnabled` is false.
   *
   * Use `show()` and `hide()` to build a toggle-style trigger: your own button
   * calls them, sets `aria-describedby` and `aria-controls` to `describedBy`
   * and `aria-expanded` (true while shown), and keeps its own accessible name.
   */
  show: () => void;

  /**
   * Closes the tooltip now. Reports through `onHide`. Under a controlled
   * `isOpen`, it calls `onHide` and does not change `isOpen`.
   */
  hide: () => void;
}

/**
 * Hook for tooltip behavior with hover/focus triggers.
 *
 * Builds on useLayer to add:
 * - Hover triggers with configurable delay
 * - Focus triggers with auto-detection for focusable elements
 * - Tap triggers on touch, where there is no hover (see useTouchTrigger)
 * - Inverted color palette for high contrast
 *
 * Unlike HoverCard, tooltips:
 * - Don't stay open when hovering the tooltip content
 * - Have shorter delays
 * - Use inverted colors (dark background, light text)
 * - Are typically used for short, non-interactive text
 *
 * @example
 * ```
 * const tooltip = useTooltip({ placement: 'above' });
 * <Button ref={tooltip.ref} aria-describedby={tooltip.describedBy}>
 *   Hover me
 * </Button>
 * {tooltip.renderTooltip('Helpful tooltip text')}
 * ```
 */

export function useTooltip(options: TooltipOptions = {}): TooltipReturn {
  return useTooltipInternal(options);
}

/** Core-only options of `useTooltip`. */
export interface InternalTooltipOptions extends TooltipOptions {
  /**
   * The tooltip gives a reason for the state of the control it covers, such
   * as why it is disabled. While it is enabled, it marks its trigger, and
   * every other tooltip on that control, inside it, or on the wrapper of its
   * field renders no layer: it neither shows nor adds to the control's
   * accessible description.
   */
  isReason?: boolean;
  /**
   * The tooltip shows its field's own status message. A reason never covers
   * it, because the field must show its status.
   */
  isStatus?: boolean;
  /**
   * The tooltip's trigger is its own control, such as InfoTip's button. A
   * reason never covers it.
   */
  hasOwnControl?: boolean;
}

/**
 * `useTooltip` with Core-only options. Not exported from the Tooltip entry.
 */
export function useTooltipInternal(
  options: InternalTooltipOptions = {},
): TooltipReturn {
  const {
    placement = 'above',
    alignment = 'center',
    delay = 200,
    hideDelay = 0,
    focusTrigger = 'auto',
    touchTrigger = 'auto',
    isEnabled = true,
    isOpen,
    isDefaultOpen = false,
    onShow,
    onHide,
    isReason = false,
    isStatus = false,
    hasOwnControl = false,
  } = options;

  // A tooltip stays open while its trigger is hovered, so it must never settle
  // over the trigger: content taller than the room above and below opens
  // beside it, or on the roomier side sized to that room, and scrolls what does not
  // fit inside the surface, which stays hoverable (spec:AST-059 FR4).
  const layer = useLayerInternal({
    mode: 'context',
    onShow,
    onHide,
    keepsAnchorClear: true,
  });
  const {
    ref: layerRef,
    anchorId: layerAnchorId,
    show: showLayerNow,
    hide: hideLayer,
    isOpen: isLayerOpen,
    id: layerId,
    render: renderLayer,
  } = layer;

  const popoverXstyle = styles.container;

  // A disabled reason is the only tooltip its control shows. While a reason
  // tooltip covers this tooltip's trigger, this one renders no layer, so it
  // neither shows nor adds to the control's accessible description. Coverage
  // is read when the tooltip would show and when the owner module tells it a
  // mark changed.
  const [isCovered, setIsCovered] = useState(false);
  const isCoveredRef = useRef(false);

  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  // The app's show() holds the tooltip open until hide(), Escape, a press or
  // scroll outside, or focus leaving the trigger and the tooltip. A held
  // tooltip is a press on its own trigger, so a reason does not cover it.
  const isHeldRef = useRef(false);
  const isCoveredNow = useCallback(() => {
    const trigger = triggerRef.current;
    return (
      !isReason &&
      !isStatus &&
      !hasOwnControl &&
      !isHeldRef.current &&
      trigger != null &&
      isCoveredByTooltipReason(trigger)
    );
  }, [isReason, isStatus, hasOwnControl]);
  // The after-render sync below records a covered tooltip's state.
  const showLayer = useCallback(() => {
    if (!isCoveredNow()) {
      showLayerNow();
    }
  }, [isCoveredNow, showLayerNow]);
  // Set only by a Core component that mounts the tooltip on interaction.
  const presentInterest = use(TooltipPresentInterestContext);
  // Whether the tooltip is enabled now, for a show that runs after a render
  // (a pending hover show) and for the trigger ref callback.
  const isEnabledRef = useRef(isEnabled);
  isEnabledRef.current = isEnabled;
  // Counts the renders in which the tooltip is disabled. A pending show
  // records it, so a show scheduled before a disable is dropped even when
  // the tooltip is enabled again before the timer fires.
  const disabledRendersRef = useRef(0);
  if (!isEnabled) {
    disabledRendersRef.current += 1;
  }

  // Clear all timeouts
  const clearTimeouts = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  // Touch resolves immediately: the hover delays exist to filter out a pointer
  // passing across the trigger, and a tap is never that.
  const showNow = useCallback(() => {
    clearTimeouts();
    showLayer();
  }, [clearTimeouts, showLayer]);

  const hideNow = useCallback(() => {
    clearTimeouts();
    hideLayer();
  }, [clearTimeouts, hideLayer]);

  // DOM listeners read the latest controlled state through a ref.
  const latestRef = useRef({isOpen, isLayerOpen, onShow, onHide});
  latestRef.current = {isOpen, isLayerOpen, onShow, onHide};

  // Records whether a reason covers this tooltip now. An uncontrolled open
  // tooltip that a reason comes to cover closes; a controlled one keeps the
  // caller's `isOpen` and renders no layer until the reason ends.
  const syncCoverage = useCallback(() => {
    const next = isCoveredNow();
    if (next === isCoveredRef.current) {
      return;
    }
    isCoveredRef.current = next;
    const latest = latestRef.current;
    if (next && latest.isLayerOpen && latest.isOpen === undefined) {
      hideLayer();
    }
    setIsCovered(next);
  }, [isCoveredNow, hideLayer]);

  const [isHeldState, setIsHeldState] = useState(false);
  const setHeld = useCallback((next: boolean) => {
    isHeldRef.current = next;
    syncCoverage();
    setIsHeldState(next);
  }, []);

  // Whether the current hold began during a press on the trigger. Such a
  // hold ends with the press when the press ends off the trigger, as no click
  // pins it. The hover rules then decide. isHoldInThisTaskRef covers a show()
  // that runs before the hook's own pointerdown listener.
  const isHoldFromPressRef = useRef(false);
  const isHoldInThisTaskRef = useRef(false);
  const handleReleaseInLayer = useCallback(() => {
    if (isHoldFromPressRef.current && isHeldRef.current) {
      isHoldFromPressRef.current = false;
      setHeld(false);
    }
  }, [setHeld]);

  // The touch trigger's outside dismissal (a press or scroll outside) ends a
  // hold with the tooltip.
  const hideFromTouch = useCallback(() => {
    if (isHeldRef.current) {
      setHeld(false);
      const latest = latestRef.current;
      if (latest.isOpen !== undefined) {
        latest.onHide?.();
        return;
      }
    }
    hideNow();
  }, [setHeld, hideNow]);

  const {
    isTouchPointerRef,
    isTouchInteraction,
    handlePointerEnter,
    handlePointerDown: handleTouchPointerDown,
    clearTapOpen,
    armOutsideDismiss,
    answerTap,
  } = useTouchTriggerInternal(
    {
      touchTrigger,
      isEnabled,
      isControlled: isOpen !== undefined,
      isOpen: isLayerOpen,
      layerId,
      triggerRef,
      show: showNow,
      hide: hideFromTouch,
    },
    handleReleaseInLayer,
  );

  const isHeldOpen = useCallback(() => {
    const latest = latestRef.current;
    return isHeldRef.current && latest.isLayerOpen && latest.isOpen !== false;
  }, []);

  const releaseHold = useCallback(() => {
    clearTapOpen();
    setHeld(false);
    const latest = latestRef.current;
    if (latest.isOpen !== undefined) {
      latest.onHide?.();
      return;
    }
    hideNow();
  }, [clearTapOpen, setHeld, hideNow]);

  const dropHold = useCallback(() => {
    if (isHeldRef.current) {
      setHeld(false);
    }
  }, [setHeld]);

  // Focus leaving the trigger and the tooltip ends a hold, whatever
  // `focusTrigger` is. Focus that leaves for no element is a press's to
  // decide. The trigger can sit in another document, so the check uses its
  // own window.
  const handleHeldFocusOut = useCallback(
    (event: FocusEvent) => {
      if (!isHeldOpen()) {
        return;
      }
      const next = event.relatedTarget;
      const trigger = triggerRef.current;
      const view = trigger?.ownerDocument.defaultView;
      if (view == null || !(next instanceof view.Node)) {
        return;
      }
      const surface = trigger?.ownerDocument.getElementById(layerId) ?? null;
      if (
        trigger?.contains(next) === true ||
        surface?.contains(next) === true
      ) {
        return;
      }
      noteOutsideDismissal(view.document);
      releaseHold();
    },
    [isHeldOpen, layerId, releaseHold],
  );

  const isHoldShown = isHeldState && isLayerOpen && isOpen !== false;

  // Only a hold announces the text: a preview is already the trigger's
  // description.
  const contentRef = useRef<HTMLDivElement | null>(null);
  useAnnounceRenderedText(contentRef, isHoldShown, 'pinned');
  const contentRefs = useMergedRefs<HTMLDivElement>(
    contentRef,
    registerLayerSurface,
  );

  // Schedule show with delay (suppressed when isOpen is false)
  const scheduleShow = useCallback(() => {
    if (!isEnabled || isOpen === false) {
      return;
    }
    clearTimeouts();
    const disabledRenders = disabledRendersRef.current;
    showTimeoutRef.current = setTimeout(() => {
      // A show runs only if the tooltip stayed enabled since it was
      // scheduled: nothing would close a tooltip that opens after a disable.
      if (disabledRendersRef.current === disabledRenders) {
        showLayer();
      }
    }, delay);
  }, [isEnabled, isOpen, clearTimeouts, showLayer, delay]);

  // Schedule hide with delay (suppressed when isOpen is true).
  // A small hover bridge (when hideDelay is 0) lets the pointer travel from the
  // trigger onto the tooltip surface without the tooltip vanishing — required
  // for WCAG 1.4.13 (Content on Hover or Focus: hoverable).
  const scheduleHide = useCallback(() => {
    if (isOpen === true || isHeldOpen()) {
      return;
    }
    clearTimeouts();
    const effectiveHideDelay = hideDelay > 0 ? hideDelay : HOVER_BRIDGE_DELAY;
    hideTimeoutRef.current = setTimeout(() => {
      hideLayer();
    }, effectiveHideDelay);
  }, [isOpen, isHeldOpen, clearTimeouts, hideLayer, hideDelay]);

  // Cancel a pending hide (e.g. the pointer entered the tooltip surface).
  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  // Event handlers
  const handleMouseEnter = useCallback(() => {
    // A tap synthesizes mouseenter. On touch the tap path owns the decision,
    // so hover must not also fire — including the tap that just opened the
    // tooltip, which would otherwise be double-handled.
    if (isTouchPointerRef.current) {
      return;
    }
    scheduleShow();
  }, [isTouchPointerRef, scheduleShow]);

  const handleMouseLeave = useCallback(
    (event: Event) => {
      // On touch the synthesized mouseleave arrives with the next tap elsewhere,
      // which the outside-tap dismissal already handles — and handling it here
      // too would close the tooltip behind the tap-open bookkeeping's back.
      if (isTouchPointerRef.current) {
        return;
      }
      // Leaving straight onto the tooltip: the surface's onMouseEnter already
      // ran, because React dispatches it from the mouseout that precedes this
      // mouseleave, so a hide scheduled now would never be cancelled. The
      // surface's own mouse leave schedules the hide instead.
      const next = (event as MouseEvent).relatedTarget as Node | null;
      const surface =
        next == null ? null : next.ownerDocument?.getElementById(layerId);
      if (surface != null && surface.contains(next)) {
        return;
      }
      scheduleHide();
    },
    [isTouchPointerRef, layerId, scheduleHide],
  );

  // Under `auto`, whether focus counts is decided when it arrives, and a
  // focus that counted still hides on blur (utils/triggerFocus.ts).
  const [focusGate] = useState(createTriggerFocusGate);

  // Whether focus on `target` opens the tooltip. With a `trigger`, its
  // `focusTrigger` rule applies too. Only `:focus-visible` focus opens it, and
  // a tap never does: a tapped `<input>` also matches `:focus-visible`.
  const opensOnFocus = useCallback(
    (target: HTMLElement, trigger: HTMLElement | null): boolean => {
      if (trigger != null && !isFocusOnTrigger(target, trigger, focusTrigger)) {
        return false;
      }
      return !isTouchInteraction() && target.matches(':focus-visible');
    },
    [focusTrigger, isTouchInteraction],
  );

  const handleFocusIn = useCallback(
    (e: Event) => {
      if (!focusGate.focusIn(e, focusTrigger) || !isEnabled) {
        return;
      }
      if (!opensOnFocus(e.target as HTMLElement, null)) {
        return;
      }
      clearTimeouts();
      // Held closed, the focus reports through onShow and shows nothing. The
      // caller decides.
      const latest = latestRef.current;
      if (latest.isOpen === false) {
        latest.onShow?.();
        return;
      }
      showLayer();
    },
    [
      focusGate,
      focusTrigger,
      isEnabled,
      opensOnFocus,
      clearTimeouts,
      showLayer,
    ],
  );

  // A held tooltip's focus-leave close is the hold's own: it listens on the
  // trigger whatever `focusTrigger` is. This schedules the unheld hide, which
  // a held tooltip skips.
  const handleFocusOut = useCallback(
    (e: Event) => {
      if (!focusGate.focusOut(e, focusTrigger)) {
        return;
      }
      scheduleHide();
    },
    [focusGate, focusTrigger, scheduleHide],
  );

  // Pressing the trigger hides its own tooltip: once the control is activated
  // the hint has served its purpose, and a tooltip lingering over a
  // just-pressed control reads as stale. Fires on pointerdown so it feels
  // immediate. Uncontrolled tooltips only — a controlled tooltip's visibility
  // is owned by the consumer. `hideLayer()` self-guards when already closed.
  // A touch press is a different gesture (it may be the only way to open the
  // tooltip at all), so the touch path answers it first.
  // Whether a press on the trigger is down, from the hook's pointerdown to
  // the press's end.
  const isTriggerPressedRef = useRef(false);
  const stopPressTrackingRef = useRef<(() => void) | null>(null);
  const trackTriggerPress = useCallback(() => {
    stopPressTrackingRef.current?.();
    const view = triggerRef.current?.ownerDocument.defaultView;
    if (view == null) {
      return;
    }
    isTriggerPressedRef.current = true;
    const trigger = triggerRef.current;
    const stop = (event?: Event) => {
      // A press that ends on the trigger keeps its hold, as a click does.
      if (
        event?.type === 'pointerup' &&
        event.target instanceof view.Node &&
        trigger?.contains(event.target) === true
      ) {
        isHoldFromPressRef.current = false;
      }
      view.removeEventListener('pointerup', stop, true);
      view.removeEventListener('pointercancel', stop, true);
      isTriggerPressedRef.current = false;
      stopPressTrackingRef.current = null;
    };
    view.addEventListener('pointerup', stop, true);
    view.addEventListener('pointercancel', stop, true);
    stopPressTrackingRef.current = stop;
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent) => {
      trackTriggerPress();
      // The app's hide() closes a held tooltip. A press neither hides it here
      // nor waits for a tap verdict. A show() in a capture handler of this
      // press runs before this listener. Tie that hold to the press.
      if (isHeldRef.current) {
        if (isHoldInThisTaskRef.current) {
          isHoldFromPressRef.current = true;
        }
        return;
      }
      if (handleTouchPointerDown(event)) {
        // A pen in range starts the hover show before it lands. Left pending,
        // that show opens the layer during the press. The tap then closes it.
        if (showTimeoutRef.current) {
          clearTimeout(showTimeoutRef.current);
          showTimeoutRef.current = null;
        }
        return;
      }
      if (isOpen !== undefined) {
        return;
      }
      clearTimeouts();
      hideLayer();
    },
    [
      handleTouchPointerDown,
      trackTriggerPress,
      isOpen,
      clearTimeouts,
      hideLayer,
    ],
  );

  // The trigger's listeners call the latest handlers through this ref, so the
  // trigger ref callback keeps one identity.
  const handlersRef = useRef({
    handleMouseEnter,
    handleMouseLeave,
    handleFocusIn,
    handleFocusOut,
    handleHeldFocusOut,
    handlePointerEnter,
    handlePointerDown,
    focusTrigger,
    isOpen,
    dropHold,
    hideNow,
    showNow,
    opensOnFocus,
    presentInterest,
    answerTap,
    isReason,
    syncCoverage,
  });
  handlersRef.current = {
    handleMouseEnter,
    handleMouseLeave,
    handleFocusIn,
    handleFocusOut,
    handleHeldFocusOut,
    handlePointerEnter,
    handlePointerDown,
    focusTrigger,
    isOpen,
    dropHold,
    hideNow,
    showNow,
    opensOnFocus,
    presentInterest,
    answerTap,
    isReason,
    syncCoverage,
  };

  // Removes the attached trigger's listeners (the trigger ref callback's
  // cleanup).
  const detachTriggerRef = useRef<(() => void) | null>(null);
  // Set when the trigger detached while the tooltip was disabled: the
  // caller removed the wiring (DropdownMenu's Button while its menu is
  // open), so the next enabled attach reads the focus that arrived meanwhile.
  const wasSuppressedRef = useRef(false);

  // The trigger's ref callback owns every trigger listener, and reads the
  // trigger's state when it attaches and detaches.
  const interactionRef = useCallback((el: HTMLElement | null) => {
    // A caller that reports `null` by hand detaches the trigger, as the
    // returned cleanup does.
    if (el == null) {
      detachTriggerRef.current?.();
      return;
    }
    if (el === triggerRef.current) {
      return;
    }
    detachTriggerRef.current?.();
    const latest = () => handlersRef.current;
    // `pointerenter` runs before the synthesized `mouseenter` a tap produces,
    // which is what lets the hover path know it is looking at a finger.
    const onPointerEnter = (e: PointerEvent) => latest().handlePointerEnter(e);
    const onMouseEnter = () => latest().handleMouseEnter();
    const onMouseLeave = (e: Event) => latest().handleMouseLeave(e);
    // Press-to-dismiss on a mouse; tap-to-open on a touch pointer.
    const onPointerDown = (e: PointerEvent) => latest().handlePointerDown(e);
    // Focus counts unless focus never opens the tooltip; `auto` decides per
    // event (isFocusForTrigger).
    const onFocusIn = (e: Event) => {
      if (latest().focusTrigger !== 'never') {
        latest().handleFocusIn(e);
      }
    };
    const onFocusOut = (e: Event) => {
      if (latest().focusTrigger !== 'never') {
        latest().handleFocusOut(e);
      }
    };
    // A held tooltip's own focus-leave close, whatever `focusTrigger` is.
    const onHeldFocusOut = (e: FocusEvent) => latest().handleHeldFocusOut(e);
    el.addEventListener('pointerenter', onPointerEnter);
    el.addEventListener('mouseenter', onMouseEnter);
    el.addEventListener('mouseleave', onMouseLeave);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    el.addEventListener('focusout', onHeldFocusOut);
    triggerRef.current = el;
    if (latest().isReason) {
      setTooltipReason(el, isEnabledRef.current);
    }
    const stopWatchingReasons = latest().isReason
      ? null
      : watchTooltipReason(() => latest().syncCoverage());
    latest().syncCoverage();

    // A trigger that attaches again after its wiring was removed
    // (DropdownMenu's Button as its menu closes) missed the focus that
    // arrived meanwhile. Show for it only if it would open the tooltip:
    // returned keyboard focus does, focus returned after a pointer pick does
    // not. Any other attach leaves the tooltip as it is, so a tooltip
    // dismissed with Escape stays closed.
    const focused = el.ownerDocument.activeElement;
    const wasSuppressed = wasSuppressedRef.current;
    if (isEnabledRef.current) {
      wasSuppressedRef.current = false;
    }
    if (
      wasSuppressed &&
      isEnabledRef.current &&
      latest().isOpen === undefined &&
      latest().focusTrigger !== 'never' &&
      focused instanceof HTMLElement &&
      el.contains(focused) &&
      latest().opensOnFocus(focused, el)
    ) {
      latest().showNow();
    }

    // This tooltip mounted after the interaction that wants it. It answers
    // that interaction once, by the same rules as its listeners.
    const state = latest().presentInterest?.current;
    const interest = state == null || state.isRead ? null : state.interest;
    const tapEvent = state?.tapEvent ?? null;
    if (state != null) {
      state.isRead = true;
    }
    if (isEnabledRef.current && latest().isOpen === undefined) {
      if (interest === 'hover') {
        latest().handleMouseEnter();
      } else if (interest === 'tap') {
        latest().answerTap(tapEvent);
      } else if (
        interest === 'focus' &&
        latest().focusTrigger !== 'never' &&
        focused instanceof HTMLElement &&
        el.contains(focused) &&
        latest().opensOnFocus(focused, el)
      ) {
        latest().showNow();
      }
    }

    const detach = () => {
      if (detachTriggerRef.current === detach) {
        detachTriggerRef.current = null;
      }
      el.removeEventListener('pointerenter', onPointerEnter);
      el.removeEventListener('mouseenter', onMouseEnter);
      el.removeEventListener('mouseleave', onMouseLeave);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      el.removeEventListener('focusout', onHeldFocusOut);
      stopPressTrackingRef.current?.();
      if (latest().isReason) {
        setTooltipReason(el, false);
      }
      stopWatchingReasons?.();
      if (triggerRef.current === el) {
        triggerRef.current = null;
      }
      // A caller removes the wiring as it disables the tooltip. Close an
      // uncontrolled tooltip then, or the next attach shows a stale tooltip.
      // A detach while enabled, such as a merged ref that changes identity
      // on a re-render, keeps a hovered or held tooltip open.
      if (!isEnabledRef.current && latest().isOpen === undefined) {
        wasSuppressedRef.current = true;
        latest().dropHold();
        latest().hideNow();
      }
    };
    detachTriggerRef.current = detach;
    return detach;
  }, []);

  // Combined ref - shorthand for calling both positionRef and interactionRef
  const ref = useCallback(
    (el: HTMLElement | null) => {
      layerRef(el);
      const detachInteraction = interactionRef(el);
      if (el == null) {
        return;
      }
      return () => {
        detachInteraction?.();
        layerRef(null);
      };
    },
    [layerRef, interactionRef],
  );

  // Syncs a reason tooltip's mark on its trigger with its enabled state,
  // before its children's passive effects read it.
  useIsomorphicLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (isReason && trigger != null) {
      setTooltipReason(trigger, isEnabled);
    }
  }, [isReason, isEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeouts();
    };
  }, [clearTimeouts]);

  // Show on mount when isDefaultOpen is true
  useEffect(() => {
    if (isDefaultOpen) {
      showLayer();
    }
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- mount-only: isDefaultOpen is not reactive
  }, []);

  // Controlled open state — overrides hover/focus triggers
  useEffect(() => {
    if (isOpen === undefined) {
      return;
    }
    if (isOpen) {
      clearTimeouts();
      // The caller's value stands under a reason too; renderTooltip renders
      // no layer while a reason covers the trigger.
      showLayerNow();
    } else {
      clearTimeouts();
      // A hold ends when the consumer closes the tooltip.
      dropHold();
      hideLayer();
    }
  }, [isOpen, clearTimeouts, showLayerNow, hideLayer, dropHold]);

  // Dismiss on Escape (WCAG 1.4.13 — dismissible) through the shared layer
  // stack. A visible tip is the top-most layer, so it takes the press and
  // consumes it: Escape hides the tip and leaves the dialog underneath open.
  // The user presses Escape again to close that. Consuming (rather than also
  // dismissing what is beneath) keeps one rule with no per-component
  // exceptions, and the failure mode is one extra keystroke instead of a
  // dialog closing under someone who only wanted the tip gone.
  //
  // A controlled tooltip stays on the stack and takes the press like any other
  // layer, but answers it by reporting instead of hiding: `isOpen` is the
  // consumer's value, so only their update may change it. Same contract as a
  // controlled Dialog.
  useLayerDismissal({
    // Registered for the hook's lifetime rather than gated on `isLayerOpen`:
    // that state can lag a frame behind the DOM, so a press arriving right after
    // the layer appears would find nothing registered. Because this layer
    // CONSUMES the press, a stale registration would be worse than a missed one
    // — it would silently eat Escapes meant for the dialog underneath — so
    // presence is answered from the DOM at press time instead of from state.
    isActive: true,
    isPresent: () => {
      const el =
        typeof document === 'undefined'
          ? null
          : document.getElementById(layerId);
      if (el == null) {
        return false;
      }
      try {
        return el.matches(':popover-open');
      } catch {
        // Browsers without the Popover API (and some test environments) cannot
        // answer the selector; fall back to the hook's own state.
        return isLayerOpen;
      }
    },
    onDismiss: () => {
      clearTimeouts();
      clearTapOpen();
      dropHold();
      if (isOpen !== undefined) {
        onHide?.();
        return;
      }
      hideLayer();
    },
  });

  // Render function that wraps layer.render with tooltip styling
  const renderTooltip = useCallback(
    (
      children: ReactNode,
      props?: Omit<ContextRenderProps, 'positioning'>,
    ): ReactNode => {
      if (isCovered) {
        return null;
      }
      const renderPlacement = props?.placement ?? placement;
      const renderProps = {
        placement: renderPlacement,
        alignment: props?.alignment ?? alignment,
        offset: spacingVars['--spacing-1'],
        role: 'tooltip',
        xstyle: [popoverXstyle, layerAnimations[renderPlacement]],
        className: themeProps('tooltip').className,
        // Keep the tooltip open while the pointer is over the surface itself
        // (WCAG 1.4.13 hoverable). These sit on the layer container — the
        // element the user actually hovers — not the inner content div, since
        // mouseenter/leave do not bubble.
        onMouseEnter: cancelHide,
        onMouseLeave: scheduleHide,
      };

      return renderLayer(
        // FR11: React bubbles a press on the surface to the trigger's
        // ancestors, portaled or not. A registered surface counts as
        // something else in the shared interactive-ancestor walk, so a
        // clickable container around the trigger leaves the press alone while
        // document listeners still see it.
        // The hold's announcement reads this element's text.
        <div ref={contentRefs} {...stylex.props(styles.content)}>
          {children}
        </div>,
        renderProps,
      );
    },
    [
      renderLayer,
      placement,
      alignment,
      popoverXstyle,
      cancelHide,
      scheduleHide,
      contentRefs,
      isCovered,
    ],
  );

  const show = useCallback(() => {
    clearTimeouts();
    if (!isEnabled) {
      return;
    }
    setHeld(true);
    armOutsideDismiss();
    isHoldFromPressRef.current = isTriggerPressedRef.current;
    isHoldInThisTaskRef.current = true;
    triggerRef.current?.ownerDocument.defaultView?.setTimeout(() => {
      isHoldInThisTaskRef.current = false;
    }, 0);
    const latest = latestRef.current;
    if (latest.isOpen !== undefined) {
      latest.onShow?.();
      return;
    }
    showLayer();
  }, [clearTimeouts, isEnabled, setHeld, armOutsideDismiss, showLayer]);

  const hide = useCallback(() => {
    clearTimeouts();
    releaseHold();
  }, [clearTimeouts, releaseHold]);

  return {
    ref,
    positionRef: layerRef,
    interactionRef,
    anchorId: layerAnchorId,
    describedBy: layerId,
    renderTooltip,
    show,
    hide,
  };
}
