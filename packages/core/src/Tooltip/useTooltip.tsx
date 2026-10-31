// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTooltip.tsx
 * @input Uses useLayer, useTouchTrigger, React hooks
 * @output Exports useTooltip hook with stable trigger refs for hover/focus/tap tooltips
 * @position Layer hook; builds on useLayer for tooltip behavior
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Tooltip/index.ts
 */

import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type RefCallback,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  useLayerInternal,
  type ContextRenderProps,
  type LayerAlignment,
  type LayerPlacement,
} from '../Layer/useLayer';
import {
  useTouchTrigger,
  type LayerTouchTrigger,
} from '../Layer/useTouchTrigger';
import {layerAnimations} from '../Layer/layerAnimations.stylex';
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
   * - `auto`: Only if element is naturally focusable
   * - `always`: Always attach focus listeners
   * - `never`: Never attach focus listeners (for composite widgets)
   *
   * @default 'auto'
   */
  focusTrigger?: TooltipFocusTrigger;

  /**
   * What a tap does on a touch pointer, where there is no hover:
   * - `auto`: tap opens the tooltip, unless the trigger performs an action of
   *   its own (a button, a link, a form control) — that tap belongs to the
   *   control, and a hint about a control the user just operated is noise
   * - `tap`: tap always opens the tooltip. This is what an info icon rendered
   *   as a button wants: it looks like an action to the DOM, but revealing the
   *   tooltip is the only thing it does
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
   * - `false`: force-hide the tooltip
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
   * Callback fired when tooltip is shown.
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
   * Injects anchorName style for CSS anchor positioning.
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
}

/**
 * Check if an element is naturally focusable
 */
function isFocusable(element: HTMLElement): boolean {
  // Elements with explicit tabindex
  if (element.hasAttribute('tabindex')) {
    return element.tabIndex >= 0;
  }

  // Naturally focusable elements
  const focusableTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
  if (focusableTags.includes(element.tagName)) {
    return !(element as HTMLButtonElement).disabled;
  }

  // Elements with contenteditable
  if (element.isContentEditable) {
    return true;
  }

  return false;
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
    show: showLayer,
    hide: hideLayer,
    isOpen: isLayerOpen,
    id: layerId,
    render: renderLayer,
  } = layer;

  const popoverXstyle = styles.container;

  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

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

  const {
    isTouchPointerRef,
    isTouchInteraction,
    handlePointerEnter,
    handlePointerDown: handleTouchPointerDown,
    clearTapOpen,
  } = useTouchTrigger({
    touchTrigger,
    isEnabled,
    isControlled: isOpen !== undefined,
    isOpen: isLayerOpen,
    layerId: layerId,
    triggerRef,
    show: showNow,
    hide: hideNow,
  });

  // Schedule show with delay (suppressed when isOpen is false)
  const scheduleShow = useCallback(() => {
    if (!isEnabled || isOpen === false) {
      return;
    }
    clearTimeouts();
    showTimeoutRef.current = setTimeout(() => {
      showLayer();
    }, delay);
  }, [isEnabled, isOpen, clearTimeouts, showLayer, delay]);

  // A show scheduled while the triggers were enabled must not outlive them:
  // disabling also detaches the leave listener that would have cancelled it,
  // so the timer would open a tooltip that nothing ever closes. Only the
  // pending show is dropped; a pending hide still runs.
  useEffect(() => {
    if (!isEnabled && showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
  }, [isEnabled]);

  // Schedule hide with delay (suppressed when isOpen is true).
  // A small hover bridge (when hideDelay is 0) lets the pointer travel from the
  // trigger onto the tooltip surface without the tooltip vanishing — required
  // for WCAG 1.4.13 (Content on Hover or Focus: hoverable).
  const scheduleHide = useCallback(() => {
    if (isOpen === true) {
      return;
    }
    clearTimeouts();
    const effectiveHideDelay = hideDelay > 0 ? hideDelay : HOVER_BRIDGE_DELAY;
    hideTimeoutRef.current = setTimeout(() => {
      hideLayer();
    }, effectiveHideDelay);
  }, [isOpen, clearTimeouts, hideLayer, hideDelay]);

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

  const handleFocusIn = useCallback(
    (e: Event) => {
      if (!isEnabled) {
        return;
      }
      // A tap focuses the trigger it activates, and `:focus-visible` does not
      // filter that out on every element: a tapped `<input>` or contenteditable
      // matches it. Those are exactly the action triggers `auto` just decided
      // to keep shut, so without this the focus reopens what the tap
      // suppressed, over the field the user is trying to type into.
      if (isTouchInteraction()) {
        return;
      }
      // Only show tooltip for keyboard focus (:focus-visible),
      // not programmatic focus (e.g. dialog auto-focus, touch tap)
      const target = e.target as HTMLElement;
      if (!target.matches(':focus-visible')) {
        return;
      }
      clearTimeouts();
      showLayer();
    },
    [isEnabled, isTouchInteraction, clearTimeouts, showLayer],
  );

  const handleFocusOut = useCallback(() => {
    scheduleHide();
  }, [scheduleHide]);

  // Pressing the trigger hides its own tooltip: once the control is activated
  // the hint has served its purpose, and a tooltip lingering over a
  // just-pressed control reads as stale. Fires on pointerdown so it feels
  // immediate. Uncontrolled tooltips only — a controlled tooltip's visibility
  // is owned by the consumer. `hideLayer()` self-guards when already closed.
  // A touch press is a different gesture (it may be the only way to open the
  // tooltip at all), so the touch path answers it first.
  const handlePointerDown = useCallback(
    (event: PointerEvent) => {
      if (handleTouchPointerDown(event)) {
        return;
      }
      if (isOpen !== undefined) {
        return;
      }
      clearTimeouts();
      hideLayer();
    },
    [handleTouchPointerDown, isOpen, clearTimeouts, hideLayer],
  );

  // Interaction ref that handles event listeners only
  const interactionRef: RefCallback<HTMLElement> = useCallback(
    (el: HTMLElement | null) => {
      // Cleanup previous element
      if (triggerRef.current) {
        triggerRef.current.removeEventListener('mouseenter', handleMouseEnter);
        triggerRef.current.removeEventListener('mouseleave', handleMouseLeave);
        triggerRef.current.removeEventListener('focusin', handleFocusIn);
        triggerRef.current.removeEventListener('focusout', handleFocusOut);
        triggerRef.current.removeEventListener(
          'pointerenter',
          handlePointerEnter,
        );
        triggerRef.current.removeEventListener(
          'pointerdown',
          handlePointerDown,
        );
      }

      if (el) {
        // Attach hover listeners. `pointerenter` runs before the synthesized
        // `mouseenter` a tap produces, which is what lets the hover path know
        // it is looking at a finger.
        el.addEventListener('pointerenter', handlePointerEnter);
        el.addEventListener('mouseenter', handleMouseEnter);
        el.addEventListener('mouseleave', handleMouseLeave);
        // Press-to-dismiss on a mouse; tap-to-open on a touch pointer.
        el.addEventListener('pointerdown', handlePointerDown);

        // Attach focus listeners based on focusTrigger option
        const shouldAttachFocus =
          focusTrigger === 'always' ||
          (focusTrigger === 'auto' && isFocusable(el));

        if (shouldAttachFocus) {
          el.addEventListener('focusin', handleFocusIn);
          el.addEventListener('focusout', handleFocusOut);
        }
      }

      triggerRef.current = el;
    },
    [
      focusTrigger,
      handleMouseEnter,
      handleMouseLeave,
      handleFocusIn,
      handleFocusOut,
      handlePointerEnter,
      handlePointerDown,
    ],
  );

  // Combined ref - shorthand for calling both positionRef and interactionRef
  const ref: RefCallback<HTMLElement> = useCallback(
    (el: HTMLElement | null) => {
      layerRef(el);
      interactionRef(el);
    },
    [layerRef, interactionRef],
  );

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
      showLayer();
    } else {
      clearTimeouts();
      hideLayer();
    }
  }, [isOpen, clearTimeouts, showLayer, hideLayer]);

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
        <div {...stylex.props(styles.content)}>{children}</div>,
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
    ],
  );

  return {
    ref,
    positionRef: layerRef,
    interactionRef,
    anchorId: layerAnchorId,
    describedBy: layerId,
    renderTooltip,
  };
}
