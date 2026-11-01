// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTouchTrigger.ts
 * @input Touch trigger mode, layer open state, trigger ref, show/hide callbacks
 * @output Exports useTouchTrigger hook, isActionTrigger, LayerTouchTrigger type,
 *   tapLandsOnDisabledControl, TOUCH_POINTER_TYPES and useTapStop (internal:
 *   not re-exported from index); useTouchTriggerInternal, Core's own variant
 *   that also returns the outside dismissal's arm for the press pin (not
 *   exported from the Layer entry point)
 * @position Layer hook; shared touch behavior for useTooltip and useHoverCard
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/index.ts
 * - /packages/core/src/hooks/useClickableContainer.ts (innermostInteractive)
 *
 * Hover is the one trigger a touch screen cannot express. A tap synthesizes
 * `mouseenter`, so an untreated hover layer either opens on every tap and
 * lingers with nothing to close it, or swallows the tap the user aimed at the
 * control underneath.
 *
 * What the trigger DOES decides which of those the tap deserves. A trigger
 * that performs an action — a button, a link, a form control — keeps its tap:
 * the layer stays shut, because the tap already has somewhere to go and a hint
 * about a control the user just operated is noise. A trigger that performs no
 * action — an info icon, an abbreviation, a truncated label — has nothing to
 * lose, so the tap opens the layer and the next tap outside dismisses it. That
 * is `auto`; `tap` and `none` state the choice outright, which is what an
 * icon-button whose only job is to reveal the layer needs. An `aria-disabled`
 * control performs no action: a tap that lands in one, or on a label for a
 * disabled control, opens the layer, so its reason has a touch path. (A
 * natively `disabled` control receives no click at all.)
 *
 * A touch decides nothing until it is a tap. A finger landing on the trigger
 * may be starting a scroll, a pinch or a long press, and only the browser
 * knows which once the finger moves or lifts. Its `click` is that verdict (on
 * iOS it comes from UIKit's own tap recognizer), so the press only records
 * itself and the tap's `click` opens or closes the layer; a press the browser
 * takes for scrolling ends in `pointercancel` and never gets there. That is
 * how a UIKit tap behaves: it recognizes when the finger lifts and fails once
 * the scroll view claims the touch. The tap outside that closes a tap-opened
 * layer counts when the finger lifts too, or when a scroll takes the touch,
 * which is when UIKit dismisses a popover.
 */

import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {currentGesture} from './gestureCounter';
import {
  innermostInteractive,
  matchesInteractiveSelectors,
} from '../hooks/useClickableContainer';
import {isDisabledControl} from '../utils/pressDisabled';
import {useInteractionModalityTrackingFor} from '../utils/interactionModality';

/**
 * How a hover layer behaves on a touch pointer.
 *
 * - `auto`: tap-to-open, unless the trigger performs an action of its own
 * - `tap`: always tap-to-open, even on a trigger that performs an action.
 *   Deprecated (DEP-0016): pass `triggerBehavior="toggle"` (usePressPin) on a
 *   button trigger; `astryx upgrade` rewrites icon and span triggers and
 *   lists the rest
 * - `none`: never open on touch
 */
export type LayerTouchTrigger = 'auto' | 'tap' | 'none';

/**
 * Pointer types whose *press* is a tap rather than a click.
 *
 * A pen belongs here but not in the arrival path: in detection range it hovers
 * — firing `pointerenter`/`pointermove` with no contact, exactly as a mouse
 * does, on a device where `(hover: hover)` matches — and only becomes a tap
 * once it lands. See `handlePointerEnter`.
 */
export const TOUCH_POINTER_TYPES = new Set(['touch', 'pen']);

export function useTapStop(event: 'click'): {
  onPointerDown: (event: ReactPointerEvent<Element>) => void;
  onClick: (event: ReactMouseEvent<Element>) => void;
};
export function useTapStop(event: 'mousedown'): {
  onPointerDown: (event: ReactPointerEvent<Element>) => void;
  onMouseDown: (event: ReactMouseEvent<Element>) => void;
};
export function useTapStop(event: 'click' | 'mousedown') {
  const pressIsTapRef = useRef(false);
  const onPointerDown = (pointer: ReactPointerEvent<Element>) => {
    pressIsTapRef.current = TOUCH_POINTER_TYPES.has(pointer.pointerType);
  };
  const cancel = (mouse: ReactMouseEvent<Element>) => {
    if (pressIsTapRef.current) {
      mouse.preventDefault();
    }
    pressIsTapRef.current = false;
  };
  return event === 'click'
    ? {onPointerDown, onClick: cancel}
    : {onPointerDown, onMouseDown: cancel};
}

/**
 * ARIA roles that make an element do something when activated. An explicit
 * role wins over the tag: `<button role="presentation">` is scenery, and a
 * `<span role="button">` is a real control.
 */
const ACTION_ROLES = new Set([
  'button',
  'checkbox',
  'combobox',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
]);

/**
 * Whether activating this element does something other than reveal the layer.
 *
 * Deliberately narrower than "focusable": the wrapper a text-only Tooltip
 * renders carries `tabindex=0` so keyboard users can reach the hint, and it
 * still performs no action.
 *
 * True only decides that the layer stays shut — the tap itself is never
 * swallowed. Nothing here calls `preventDefault` or `stopPropagation`, so an
 * inert trigger that happens to carry its own `onClick` (a `<div onClick>`
 * with no role) gets both: the layer opens and the handler runs.
 */
export function isActionTrigger(element: HTMLElement): boolean {
  // A disabled control performs no action: its tap is free to open the layer
  // that explains why it is disabled.
  if (isDisabledControl(element)) {
    return false;
  }
  const role = element.getAttribute('role');
  if (role != null && role !== '') {
    return ACTION_ROLES.has(role);
  }

  switch (element.tagName) {
    case 'LABEL': {
      // A label acts by operating its control, so a label for a disabled one
      // performs none.
      const control = (element as HTMLLabelElement).control;
      return control == null || !isDisabledControl(control);
    }
    case 'BUTTON':
    case 'INPUT':
    case 'SELECT':
    case 'SUMMARY':
    case 'TEXTAREA':
      return true;
    case 'A':
    case 'AREA':
      return element.hasAttribute('href');
    default:
      return isEditable(element);
  }
}

/**
 * Whether this element takes a tap itself, as a disabled control does: an
 * `aria-disabled` (or `:disabled`) control, or a label for one.
 */
function isDisabledTarget(element: Element): boolean {
  if (isDisabledControl(element)) {
    return true;
  }
  if (element.tagName === 'LABEL') {
    const control = (element as HTMLLabelElement).control;
    return control != null && isDisabledControl(control);
  }
  return false;
}

/**
 * Whether a tap landed in a disabled control: walking out from the tapped
 * element on the clickable containers' own walk (`innermostInteractive`),
 * with labels counted, the innermost interactive element is an
 * `aria-disabled` control or a label for a disabled control. That element
 * takes the tap: the layer opens with its reason, and nothing activates.
 * Every other tap is left to the trigger (`isActionTrigger`).
 */
export function tapLandsOnDisabledControl(tapped: Element): boolean {
  const innermost = innermostInteractive(
    tapped,
    null,
    element =>
      matchesInteractiveSelectors(element) ||
      element.tagName === 'LABEL' ||
      isDisabledControl(element),
  );
  return innermost != null && isDisabledTarget(innermost);
}

/**
 * Whether typing into this element edits it. Reads the attribute as well as
 * the property: jsdom does not implement `isContentEditable`, and an editor
 * that is an action in the browser must not be inert under test.
 */
function isEditable(element: HTMLElement): boolean {
  if (element.isContentEditable === true) {
    return true;
  }
  const attribute = element.getAttribute('contenteditable');
  return attribute != null && attribute !== 'false';
}

export interface UseTouchTriggerOptions {
  /** How the layer should behave on a touch pointer. */
  touchTrigger: LayerTouchTrigger;

  /** Whether the layer's triggers are live at all. */
  isEnabled: boolean;

  /**
   * Whether the consumer controls visibility. A controlled layer is never
   * toggled by a tap — its visibility is the consumer's to own.
   */
  isControlled: boolean;

  /** Whether the layer is currently open. */
  isOpen: boolean;

  /** Element id of the layer surface, so taps inside it count as inside. */
  layerId: string;

  /** The trigger element the layer is anchored to. */
  triggerRef: RefObject<HTMLElement | null>;

  /** Open the layer immediately, with no hover delay. */
  show: () => void;

  /** Close the layer immediately. */
  hide: () => void;
}

export interface UseTouchTriggerReturn {
  /**
   * Whether the pointer in play on this trigger has no hover of its own: a
   * finger, or a pen that has landed. A hovering pen reads as false, because
   * it hovers.
   */
  isTouchPointerRef: RefObject<boolean>;

  /**
   * Whether the interaction in flight is a touch one. Unlike the raw ref this
   * goes false again as soon as the user reaches for the keyboard, so
   * focus-driven triggers stay available after a tap.
   */
  isTouchInteraction: () => boolean;

  /**
   * Attach to the trigger: records pointer type ahead of synthesized hover.
   * Arrival alone only marks a finger — a pen hovers, so it is left to the
   * hover path until it presses.
   */
  handlePointerEnter: (event: PointerEvent) => void;

  /**
   * Attach to the trigger. Returns true when the press was a touch one and
   * this hook has dealt with it, meaning the caller's own pointer-down
   * behavior must not also run. A touch press opens or closes nothing by
   * itself: the hook waits for that press's tap (the `click` the browser
   * fires when the finger lifts without scrolling) on the same element.
   */
  handlePointerDown: (event: PointerEvent) => boolean;

  /** Forget a tap-open. Call from every other close path (Escape, controlled). */
  clearTapOpen: () => void;
}

/**
 * useTouchTrigger's return plus the outside dismissal's arm, for Core's own
 * press pin (usePressPin). Not exported from the Layer entry point.
 *
 * @internal
 */
export interface UseTouchTriggerInternalReturn extends UseTouchTriggerReturn {
  /**
   * Arms the outside dismissal a tap-open gets: a press that lifts outside
   * the trigger and the layer, or a scroll that starts there, hides it. A
   * press pin arms it too.
   */
  armOutsideDismiss: () => void;
}

/**
 * Touch behavior shared by the hover layers.
 *
 * @example
 * ```
 * const touch = useTouchTrigger({
 *   touchTrigger,
 *   isEnabled,
 *   isControlled: isOpen !== undefined,
 *   isOpen: layer.isOpen,
 *   layerId: layer.id,
 *   triggerRef,
 *   show: showNow,
 *   hide: hideNow,
 * });
 * ```
 */
export function useTouchTrigger(
  options: UseTouchTriggerOptions,
): UseTouchTriggerReturn {
  const touch = useTouchTriggerInternal(options);
  return {
    isTouchPointerRef: touch.isTouchPointerRef,
    isTouchInteraction: touch.isTouchInteraction,
    handlePointerEnter: touch.handlePointerEnter,
    handlePointerDown: touch.handlePointerDown,
    clearTapOpen: touch.clearTapOpen,
  };
}

/**
 * useTouchTrigger, plus the outside dismissal's arm a press pin uses
 * (component:Tooltip FR9, component:HoverCard FR9).
 *
 * @internal
 */
export function useTouchTriggerInternal(
  options: UseTouchTriggerOptions,
): UseTouchTriggerInternalReturn {
  const {
    touchTrigger,
    isEnabled,
    isControlled,
    isOpen,
    layerId,
    triggerRef,
    show,
    hide,
  } = options;

  const isTouchPointerRef = useRef(false);
  // Mirrors `isOpen` for synchronous reads inside the pointer handler, which
  // runs outside React's render and would otherwise close over a stale value.
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  // Latest values for the document listener, which outlives the render that
  // armed it.
  const hideRef = useRef(hide);
  hideRef.current = hide;
  const layerIdRef = useRef(layerId);
  layerIdRef.current = layerId;

  // Whether a tap is what opened the layer. Only a tap-open owes the user an
  // outside-tap dismissal: a hover-opened layer already closes on
  // pointer-leave, and a controlled one is not ours to close.
  const isTapOpenRef = useRef(false);
  const outsideListenerRef = useRef<((event: PointerEvent) => void) | null>(
    null,
  );
  // A touch press on the trigger still waiting for its tap: calling it stops
  // waiting. The next press, a cancel, the tap itself or unmounting calls it.
  const forgetPendingTapRef = useRef<(() => void) | null>(null);

  const readModality = useInteractionModalityTrackingFor(triggerRef);

  const disarmOutsideDismiss = useCallback(() => {
    isTapOpenRef.current = false;
    const listener = outsideListenerRef.current;
    if (listener == null) {
      return;
    }
    outsideListenerRef.current = null;
    document.removeEventListener('pointerup', listener, true);
    document.removeEventListener('pointercancel', listener, true);
  }, []);

  // Capture phase, so a trigger that stops propagation cannot strand an open
  // layer. It is armed by the opening tap's `click`, after that tap's own
  // `pointerup`, so the listener never sees the tap that opened the layer.
  // A tap outside counts when it lifts (`pointerup`); a scroll or pinch that
  // starts outside counts as soon as the browser takes it (`pointercancel`).
  const armOutsideDismiss = useCallback(() => {
    isTapOpenRef.current = true;
    if (outsideListenerRef.current != null) {
      return;
    }

    const handleOutsidePointerEnd = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target != null) {
        // A tap on the trigger is the trigger's to toggle. A scroll that
        // starts there is a scroll outside the layer, and it does close it.
        if (
          event.type === 'pointerup' &&
          triggerRef.current?.contains(target) === true
        ) {
          return;
        }
        // Hover card content is interactive; a tap inside it is not a dismiss.
        if (
          document.getElementById(layerIdRef.current)?.contains(target) === true
        ) {
          return;
        }
      }
      disarmOutsideDismiss();
      hideRef.current();
    };

    outsideListenerRef.current = handleOutsidePointerEnd;
    document.addEventListener('pointerup', handleOutsidePointerEnd, true);
    document.addEventListener('pointercancel', handleOutsidePointerEnd, true);
  }, [triggerRef, disarmOutsideDismiss]);

  useEffect(() => disarmOutsideDismiss, [disarmOutsideDismiss]);
  useEffect(() => () => forgetPendingTapRef.current?.(), []);

  const isTouchInteraction = useCallback(
    () => isTouchPointerRef.current && readModality() === 'pointer',
    [readModality],
  );

  const handlePointerEnter = useCallback((event: PointerEvent) => {
    // Only a finger is hoverless on arrival. A pen in detection range hovers
    // like a mouse, and treating its arrival as touch would bail out of the
    // hover path and leave a stylus user with no tooltip at all. A pen that
    // presses is a tap, and `handlePointerDown` still reads it as one.
    isTouchPointerRef.current = event.pointerType === 'touch';
  }, []);

  // What a tap on the trigger does. It runs from the tap's `click`, after the
  // render that armed it, so it reads the latest props through this ref.
  const answerTapRef = useRef<(tapEvent: Event) => void>(() => {});
  answerTapRef.current = (tapEvent: Event) => {
    const trigger = triggerRef.current;
    // A tap that landed in a disabled control is that control's: its reason
    // opens. Every other tap is the trigger's to decide.
    const tapped = tapEvent.target instanceof Element ? tapEvent.target : null;
    const mode =
      touchTrigger === 'auto'
        ? tapped != null && tapLandsOnDisabledControl(tapped)
          ? 'tap'
          : trigger != null && isActionTrigger(trigger)
            ? 'none'
            : 'tap'
        : touchTrigger;

    if (mode === 'none' || !isEnabled) {
      // A layer left open by an earlier tap must not survive the next one.
      disarmOutsideDismiss();
      hide();
      return;
    }

    // A lazily mounted layer reports `isOpen` a tick after `show()`, so the
    // tap's own bookkeeping is what makes the second tap a close.
    if (isOpenRef.current || isTapOpenRef.current) {
      disarmOutsideDismiss();
      hide();
      return;
    }

    armOutsideDismiss();
    show();
  };

  const handlePointerDown = useCallback(
    (event: PointerEvent): boolean => {
      const isTouch = TOUCH_POINTER_TYPES.has(event.pointerType);
      isTouchPointerRef.current = isTouch;
      // A new press replaces one that never became a tap.
      forgetPendingTapRef.current?.();

      if (!isTouch || isControlled) {
        return false;
      }

      const trigger =
        event.currentTarget instanceof Element
          ? event.currentTarget
          : triggerRef.current;
      if (trigger == null) {
        return true;
      }

      // The tap must belong to this press. A key press or a new pointer press
      // advances the gesture, so a keyboard activation that later fires
      // `click` on the trigger (Enter on a button) is not mistaken for it.
      const gesture = currentGesture();
      const forget = () => {
        trigger.removeEventListener('click', handleTap);
        trigger.removeEventListener('pointercancel', forget);
        if (forgetPendingTapRef.current === forget) {
          forgetPendingTapRef.current = null;
        }
      };
      const handleTap = (tapEvent: Event) => {
        forget();
        if (currentGesture() === gesture) {
          answerTapRef.current(tapEvent);
        }
      };
      trigger.addEventListener('click', handleTap);
      // The browser took the touch for a scroll or a pinch: no tap is coming.
      trigger.addEventListener('pointercancel', forget);
      forgetPendingTapRef.current = forget;
      return true;
    },
    [isControlled, triggerRef],
  );

  // A layer closed by any other path (Escape, a consumer, the browser) leaves
  // no tap-open to dismiss. Only a true open→closed transition counts: a
  // lazily mounted layer still reports `false` for a tick after the tap asked
  // it to open, and reading that as a close would disarm the dismissal the
  // tap-open just armed.
  const wasOpenRef = useRef(isOpen);
  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      disarmOutsideDismiss();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, disarmOutsideDismiss]);

  return {
    isTouchPointerRef,
    isTouchInteraction,
    handlePointerEnter,
    handlePointerDown,
    clearTapOpen: disarmOutsideDismiss,
    armOutsideDismiss,
  };
}
