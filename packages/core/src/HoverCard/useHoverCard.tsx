// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useHoverCard.ts
 * @input Uses useLayer, useTouchTrigger, React hooks
 * @output Exports useHoverCard hook with stable trigger refs for hover/focus/tap layers
 * @position Layer hook; builds on useLayer for hover card behavior
 *
 * SYNC: When modified, update:
 * - /packages/core/src/HoverCard/index.ts
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
  useLayer,
  type ContextRenderProps,
  type LayerAlignment,
  type LayerPlacement,
} from '../Layer/useLayer';
import type {LayerTouchTrigger} from '../Layer/useTouchTrigger';
import {useAnnounceRenderedText} from '../hooks/useAnnounceRenderedText';
import {usePressPin, type LayerPressTrigger} from '../Layer/usePressPin';
import {layerAnimations} from '../Layer/layerAnimations.stylex';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {
  colorVars,
  shadowVars,
  radiusVars,
  spacingVars,
} from '../theme/tokens.stylex';
import {themeProps} from '../utils/themeProps';

const styles = stylex.create({
  // Base container styles passed to useLayer
  container: {
    backgroundColor: colorVars['--color-background-surface'],
    '--_hovercard-radius': radiusVars['--radius-container'],
    borderRadius: 'var(--_hovercard-radius)',
    boxShadow: shadowVars['--shadow-med'],
  },
  // Content wrapper for padding and interaction events.
  content: {
    display: 'block',
    paddingBlockStart: spacingVars['--spacing-3'],
    paddingBlockEnd: spacingVars['--spacing-3'],
    paddingInlineStart: spacingVars['--spacing-3'],
    paddingInlineEnd: spacingVars['--spacing-3'],
  },
});

/**
 * Focus trigger behavior for hover cards
 */
export type HoverCardFocusTrigger = 'auto' | 'always' | 'never';

/**
 * Touch trigger behavior for hover cards
 */
export type HoverCardTouchTrigger = LayerTouchTrigger;

/**
 * Whether a press on the trigger pins the card open: `none` leaves taps to
 * `touchTrigger`; `toggle` pins on a click, tap, Enter, or Space on a button
 * trigger (component:HoverCard FR9).
 */
export type HoverCardPressTrigger = LayerPressTrigger;

export interface HoverCardOptions {
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
   * @default 300
   */
  delay?: number;

  /**
   * Delay before hiding after mouse/focus leave (ms)
   * @default 200
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
  focusTrigger?: HoverCardFocusTrigger;

  /**
   * What a tap does on a touch pointer, where there is no hover:
   * - `auto`: tap opens the card, unless the trigger performs an action of its
   *   own (a button, a link, a form control) — that tap belongs to the control
   * - `tap`: tap always opens the card, even on a trigger that acts.
   *   Ignored under `pressTrigger="toggle"`
   * - `none`: touch never opens the card
   *
   * @default 'auto'
   */
  touchTrigger?: HoverCardTouchTrigger;

  /**
   * Whether a press on the trigger pins the card open:
   * - `none`: no press pins it; `touchTrigger` decides what a tap does
   * - `toggle`: on a button trigger, a click, a tap, Enter, or Space pins the
   *   card open and the same press closes it; hover and focus still preview
   *   it. A pinned card stays until Escape, a second press on the trigger, a
   *   press outside the trigger and the card, or focus leaving them. Astryx
   *   clickable rows and cards ignore the pinning press; the `HoverCard`
   *   component also stops it at the trigger, and a hook caller stops a plain
   *   `onClick` ancestor itself. The trigger reports `aria-expanded` and
   *   `aria-controls`, and the card's `label` (else its text) is announced
   *   once when it pins. `touchTrigger` is ignored.
   *
   * @default 'none'
   */
  pressTrigger?: HoverCardPressTrigger;

  /**
   * Whether the hover card is enabled.
   * When false, hover/focus triggers are disabled.
   *
   * @default true
   */
  isEnabled?: boolean;

  /**
   * Accessible name for the hover card popup.
   *
   * When provided, the popup is exposed to assistive technology as a named
   * `role="dialog"`. When omitted, the popup falls back to `role="group"` —
   * a group may validly be unnamed, an unnamed dialog may not.
   */
  label?: string;

  /**
   * Controlled open state. When provided, overrides hover/focus triggers:
   * - `true`: force-show the hover card (hover/focus hide is suppressed)
   * - `false`: force-hide the hover card
   * - `undefined`: uncontrolled — hover/focus triggers manage visibility
   *
   * A controlled hover card still takes Escape when it is the top-most layer,
   * and answers by calling `onHide` without hiding itself — closing is your
   * update's decision, exactly as for a controlled Dialog. Ignore the call and
   * the card stays, and so does the press: nothing underneath dismisses.
   */
  isOpen?: boolean;

  /**
   * Whether the hover card should be shown on mount.
   * The hover card is still dismissible — this just opens it initially.
   */
  isDefaultOpen?: boolean;

  /**
   * Callback fired when hover card is shown.
   * Wrap in useCallback for stable identity.
   */
  onShow?: () => void;

  /**
   * Callback fired when hover card is hidden.
   * Wrap in useCallback for stable identity.
   */
  onHide?: () => void;
}

export interface HoverCardReturn {
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
   * Unique ID for the hover card container.
   * Useful for `aria-controls` or `aria-owns` on the trigger.
   */
  id: string;

  /**
   * Deprecated alias of `id`. Kept for backwards compatibility; prefer `id`.
   */
  describedBy: string;

  /**
   * Whether the hover card is currently open.
   * Useful for driving `aria-expanded` on the trigger — but only when the
   * trigger's role permits it (`button`, `link`, `combobox`, …). On a role-less
   * trigger `aria-expanded` is invalid; use `aria-haspopup`/`aria-controls`
   * alone there.
   */
  isOpen: boolean;

  /**
   * Render function for hover card content.
   * Returns anchor-positioned popover element.
   *
   * `positioning` is excluded: the hover card always derives its position
   * from placement/alignment, so accepting the custom opt-out here would be
   * a silent no-op.
   */
  renderHoverCard: (
    children: ReactNode,
    props?: Omit<ContextRenderProps, 'positioning'>,
  ) => ReactNode;

  /**
   * Imperatively show the hover card (bypassing hover delay).
   */
  show: () => void;

  /**
   * Imperatively hide the hover card.
   */
  hide: () => void;
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
 * Hook for hover card behavior with hover/focus triggers.
 *
 * Builds on useLayer to add:
 * - Hover triggers with configurable delay
 * - Focus triggers with auto-detection for focusable elements
 * - Stay-open behavior when mouse/focus moves into the hover card
 *
 * @example
 * ```
 * const hoverCard = useHoverCard({ placement: 'above' });
 * <Button ref={hoverCard.ref} aria-describedby={hoverCard.describedBy}>
 *   Hover me
 * </Button>
 * {hoverCard.renderHoverCard(<ProfileCard user={user} />)}
 * ```
 */
export function useHoverCard(options: HoverCardOptions = {}): HoverCardReturn {
  const {
    placement = 'above',
    alignment = 'center',
    delay = 300,
    hideDelay = 200,
    focusTrigger = 'auto',
    touchTrigger = 'auto',
    pressTrigger = 'none',
    isEnabled = true,
    label,
    isOpen,
    isDefaultOpen = false,
    onShow,
    onHide,
  } = options;

  const layer = useLayer({
    mode: 'context',
    lazyMount: true,
    onShow,
    onHide,
  });
  // Destructure the layer and touch objects once: both are rebuilt every
  // render, but their members are stable. Depending on the members instead of
  // the enclosing objects keeps the refs below identity-stable across
  // unchanged rerenders, so React never detaches and re-attaches the trigger
  // (and never rewrites the trigger's `anchor-name`) while the card streams
  // alongside it.
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
  const isHoveringContentRef = useRef(false);
  // Track when we're dismissing via Escape to prevent re-show on refocus
  const isEscapeDismissingRef = useRef(false);

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
    isHoveringContentRef.current = false;
    hideLayer();
  }, [clearTimeouts, hideLayer]);

  // The imperative hide. A card closed while the pointer rests on it unmounts
  // without a mouseleave, so the content-hover latch is cleared here; left set,
  // it would keep the trigger's next hover-open from closing on leave.
  const hide = useCallback(() => {
    isHoveringContentRef.current = false;
    hideLayer();
  }, [hideLayer]);

  // A press pins the card under `pressTrigger="toggle"` (FR9, FR10). The pin
  // also owns the card's touch trigger, so this is the one call that wires
  // both (`architecture:react-component-runtime` INV16).
  const {
    isToggleTrigger,
    isHeldOpen: isPressHeldOpen,
    attach: attachPressPin,
    unpin: unpinPress,
    handleFocusLeave: handlePressFocusLeave,
    isPinShown,
    touch: {
      isTouchPointerRef,
      isTouchInteraction,
      handlePointerEnter,
      handlePointerDown: handleTouchPointerDown,
      clearTapOpen,
    },
  } = usePressPin({
    pressTrigger,
    touchTrigger,
    isEnabled,
    isOpen,
    isLayerOpen,
    layerId,
    triggerRef,
    component: 'HoverCard',
    show: showNow,
    hide: hideNow,
    report: next => (next ? onShow?.() : onHide?.()),
    label,
  });

  // A pinned card is said once when it pins (FR10): its `label`, from the
  // press handler (usePressPin), or else its own rendered text here
  // (spec:AST-086 FR12).
  const contentRef = useRef<HTMLDivElement | null>(null);
  useAnnounceRenderedText(
    contentRef,
    isPinShown && (label == null || label.trim() === ''),
    'pinned',
  );

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

  // Schedule hide with delay (suppressed when isOpen is true)
  const scheduleHide = useCallback(() => {
    // A pinned card stays when the pointer or focus leaves (FR9).
    if (isOpen === true || isPressHeldOpen()) {
      return;
    }
    clearTimeouts();
    hideTimeoutRef.current = setTimeout(() => {
      // Don't hide if hovering content
      if (!isHoveringContentRef.current) {
        hideLayer();
      }
    }, hideDelay);
  }, [isOpen, isPressHeldOpen, clearTimeouts, hideLayer, hideDelay]);

  // Event handlers
  const handleMouseEnter = useCallback(() => {
    // A tap synthesizes mouseenter. On touch the tap path owns the decision,
    // so hover must not also fire — without this a hover card opens on every
    // tap of its trigger and has nothing to close it.
    if (isTouchPointerRef.current) {
      return;
    }
    scheduleShow();
  }, [isTouchPointerRef, scheduleShow]);

  const handleMouseLeave = useCallback(() => {
    // On touch the synthesized mouseleave arrives with the next tap elsewhere,
    // which the outside-tap dismissal already handles.
    if (isTouchPointerRef.current) {
      return;
    }
    scheduleHide();
  }, [isTouchPointerRef, scheduleHide]);

  // Tap-to-open on touch; on a mouse this does nothing and hover still rules.
  const handlePointerDown = useCallback(
    (event: PointerEvent) => {
      // A press on a toggle trigger pins or closes through its click (FR9).
      if (isToggleTrigger(triggerRef.current)) {
        return;
      }
      handleTouchPointerDown(event);
    },
    [isToggleTrigger, handleTouchPointerDown],
  );

  const handleFocusIn = useCallback(() => {
    if (!isEnabled) {
      return;
    }
    // A tap focuses the trigger it activates. Opening on that focus would
    // reinstate exactly the behavior the touch path just decided against —
    // and on an action trigger it covers the thing the user tapped.
    if (isTouchInteraction()) {
      return;
    }
    // Skip showing if we're in the middle of an Escape dismiss
    if (isEscapeDismissingRef.current) {
      isEscapeDismissingRef.current = false;
      return;
    }
    clearTimeouts();
    showLayer();
  }, [isEnabled, isTouchInteraction, clearTimeouts, showLayer]);

  const handleFocusOut = useCallback(
    (e: FocusEvent) => {
      // A pinned card's close on focus leaving the trigger is the pin's own:
      // it listens on the trigger whatever `focusTrigger` is.
      // Check if focus is moving to the hover card content
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      const popoverElement = document.getElementById(layerId);

      if (popoverElement?.contains(relatedTarget)) {
        // Focus moving into hover card, keep it open
        return;
      }

      scheduleHide();
    },
    [layerId, scheduleHide],
  );

  // Escape dismissal (WCAG 1.4.13) goes through the shared layer stack: a
  // visible card is the top-most layer, so it takes the press and consumes it.
  //
  // This replaces a keydown listener on the TRIGGER that called
  // stopPropagation() on any Escape while the trigger merely had focus — open
  // card or not — so focusing a HoverCard trigger inside a Dialog silently ate
  // the press that should have closed the Dialog. Presence is now answered from
  // the DOM, so a closed card never claims a press.
  // A controlled hover card stays on the stack and takes the press like any
  // other layer, but answers it by reporting instead of hiding: `isOpen` is
  // the consumer's value, so only their update may change it. Same contract as
  // a controlled Dialog.
  useLayerDismissal({
    // Registered for the hook's lifetime rather than gated on `layer.isOpen`:
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
      unpinPress();
      // Controlled: report and stop. The close — and the focus restore that
      // goes with it — happens in the controlled effect if and when the
      // consumer flips `isOpen`.
      if (isOpen !== undefined) {
        onHide?.();
        return;
      }
      // Only when the card itself held focus, which is the one case the
      // content-level handler this replaced could run in. Refocusing
      // unconditionally would drag the caret out of a field the user was
      // typing in while a hover card happened to be up; arming the re-show
      // guard unconditionally would swallow their next focus on the trigger,
      // because a focus() on the already-focused trigger fires no focusin to
      // clear it.
      const card =
        typeof document === 'undefined'
          ? null
          : document.getElementById(layerId);
      const hadFocus = card?.contains(document.activeElement) ?? false;
      hide();
      if (hadFocus) {
        isEscapeDismissingRef.current = true;
        triggerRef.current?.focus();
      }
    },
  });

  // Interaction ref that handles event listeners only
  const interactionRef: RefCallback<HTMLElement> = useCallback(
    (el: HTMLElement | null) => {
      // Cleanup previous element
      if (triggerRef.current) {
        triggerRef.current.removeEventListener('mouseenter', handleMouseEnter);
        triggerRef.current.removeEventListener('mouseleave', handleMouseLeave);
        triggerRef.current.removeEventListener('focusin', handleFocusIn);
        triggerRef.current.removeEventListener(
          'focusout',
          handleFocusOut as EventListener,
        );
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
        el.addEventListener('pointerdown', handlePointerDown);

        // Attach focus listeners based on focusTrigger option
        const shouldAttachFocus =
          focusTrigger === 'always' ||
          (focusTrigger === 'auto' && isFocusable(el));

        if (shouldAttachFocus) {
          el.addEventListener('focusin', handleFocusIn);
          el.addEventListener('focusout', handleFocusOut as EventListener);
        }
      }

      triggerRef.current = el;
      attachPressPin(el);
    },
    [
      attachPressPin,
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
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- intentionally only on mount
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
      // A consumer closing the card while it holds focus would strand focus on
      // <body>. Arming the re-show guard is what keeps the refocus from
      // reopening the card through `handleFocusIn`, which shows on any focusin.
      const card =
        typeof document === 'undefined'
          ? null
          : document.getElementById(layerId);
      const hadFocus = card?.contains(document.activeElement) ?? false;
      hideLayer();
      if (hadFocus) {
        isEscapeDismissingRef.current = true;
        triggerRef.current?.focus();
      }
    }
  }, [isOpen, clearTimeouts, showLayer, hideLayer, layerId]);

  // Render function that wraps layer.render with hover card behavior
  const renderHoverCard = useCallback(
    (
      children: ReactNode,
      props?: Omit<ContextRenderProps, 'positioning'>,
    ): ReactNode => {
      const renderPlacement = props?.placement ?? placement;
      const themeClassName = themeProps('hover-card').className;
      const renderProps = {
        placement: renderPlacement,
        alignment: props?.alignment ?? alignment,
        offset: spacingVars['--spacing-1'],
        // A named dialog when a label is provided; otherwise a group. A group
        // may validly be unnamed, an unnamed dialog may not — and hover cards
        // are non-modal, so group is honest semantics without a name.
        role: label ? 'dialog' : 'group',
        'aria-label': label || undefined,
        // Consumer surface style props land on the layer container — the
        // themed surface (bg/radius/shadow) where the theme class lives — so
        // customizing the card targets the same element as the theme. The inner
        // div keeps `styles.content` for padding.
        xstyle: [
          popoverXstyle,
          layerAnimations[renderPlacement],
          props?.xstyle,
        ],
        className: props?.className
          ? `${themeClassName} ${props.className}`
          : themeClassName,
        style: props?.style,
        // useLayer mounts only after it has verified or corrected the parent,
        // so rich HoverCard content can use block-safe markup.
        as: 'div' as const,
      };

      return renderLayer(
        <div
          ref={contentRef}
          {...stylex.props(styles.content)}
          onMouseEnter={() => {
            // Touch synthesizes these over the card too; letting a tap inside
            // register as "hovering content" would block every later hide.
            if (isTouchPointerRef.current) {
              return;
            }
            isHoveringContentRef.current = true;
            clearTimeouts();
          }}
          onMouseLeave={() => {
            if (isTouchPointerRef.current) {
              return;
            }
            isHoveringContentRef.current = false;
            scheduleHide();
          }}
          onBlur={e => {
            // Check if focus is moving back to the trigger or staying within content
            const relatedTarget = e.relatedTarget as HTMLElement | null;
            const popoverElement = e.currentTarget;

            // If focus stays within the hover card, do nothing
            if (popoverElement.contains(relatedTarget)) {
              return;
            }

            // If focus is moving back to the trigger, do nothing
            if (triggerRef.current?.contains(relatedTarget)) {
              return;
            }

            // A pinned card closes when focus leaves it and the trigger.
            if (handlePressFocusLeave(e.nativeEvent)) {
              return;
            }

            // Focus is leaving the hover card entirely
            scheduleHide();
          }}>
          {children}
        </div>,
        renderProps,
      );
    },
    [
      renderLayer,
      placement,
      alignment,
      label,
      clearTimeouts,
      scheduleHide,
      handlePressFocusLeave,
      popoverXstyle,
      isTouchPointerRef,
    ],
  );

  return {
    ref,
    positionRef: layerRef,
    interactionRef,
    anchorId: layerAnchorId,
    id: layerId,
    describedBy: layerId,
    isOpen: isLayerOpen,
    renderHoverCard,
    show: showLayer,
    hide,
  };
}
