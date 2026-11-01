// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePressPin.ts
 * @input A hover layer's trigger, its open state, show and hide, and its
 *   `pressTrigger` option
 * @output usePressPin: the press toggle that pins Tooltip and HoverCard open
 *   (component:Tooltip FR9 and FR10, component:HoverCard FR9 and FR10);
 *   isPressPinTrigger, the button test it applies; LayerPressTrigger type
 * @position Shared by useTooltip and useHoverCard, beside useTouchTrigger,
 *   which keeps deciding taps while `pressTrigger` is `none`
 *
 * With `pressTrigger="toggle"` and a trigger whose role is `button` (a
 * `<button>` or `role="button"`), a click, a completed tap, Enter, or Space
 * pins the layer open, and the same press on a pinned layer closes it. Enter
 * and Space reach it as the button's own click. Hover and keyboard focus still
 * preview the layer; a pinned layer stays open when the pointer leaves, and
 * Escape, a second press, a press outside the trigger and the layer, or focus
 * moving outside them closes it. A controlled layer only reports the toggled
 * value, through `report`, and never changes its own state.
 *
 * While it wires a button trigger, the trigger carries `aria-expanded`, true
 * only while pinned, and `aria-controls` naming the layer while it shows,
 * each replacing the trigger's own value and restored on cleanup; when the
 * layer pins, `announcement()` is said once through the polite live region.
 *
 * A press that pins or closes the layer stops at its trigger: its default
 * action is prevented (a label's control, a link, a form submit), and the
 * component's wrapper stops it before any clickable row, card, or container
 * around the trigger (`isPressPinClick`), while the trigger's own handlers
 * still run.
 *
 * A trigger that is not a button gets a development warning, and no press
 * pins it: the caller keeps tap-only opening for it. A trigger whose layer
 * repeats its own visible text (`repeatsTriggerText`, a truncated Text that is
 * its own tab stop) pins without being a button, with no warning, no
 * `aria-expanded` or `aria-controls`, and no announcement.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Tooltip/useTooltip.tsx
 * - /packages/core/src/HoverCard/useHoverCard.tsx
 * - /packages/core/src/Layer/usePressPin.test.tsx
 */

import {useCallback, useEffect, useRef, useState, type RefObject} from 'react';
import {useAnnounce} from '../hooks/useAnnounce';
import {devWarn} from '../utils/devWarning';

/**
 * Whether a press on the trigger pins the layer open: `none` leaves taps to
 * `touchTrigger`; `toggle` pins on every press of a button trigger.
 */
export type LayerPressTrigger = 'none' | 'toggle';

/** The clicks a press pin answered, so wrappers can stop them (`isPressPinClick`). */
const pressPinClicks = new WeakSet<Event>();

/**
 * Whether a press pin answered this click: the component wrapping the trigger
 * stops it there, and a clickable container ignores it, so the press does
 * nothing beyond opening or closing its layer.
 */
export function isPressPinClick(event: Event): boolean {
  return pressPinClicks.has(event);
}

/** Whether presses on this element can pin a layer: a button, by role. */
export function isPressPinTrigger(element: Element): boolean {
  const role = element.getAttribute('role');
  if (role != null && role !== '') {
    return role === 'button';
  }
  return element.tagName === 'BUTTON';
}

export interface UsePressPinOptions {
  /** The layer's `pressTrigger`. */
  pressTrigger: LayerPressTrigger;

  /** Whether the layer's triggers are live at all. */
  isEnabled: boolean;

  /** The controlled open value, or `undefined` when uncontrolled. */
  isOpen: boolean | undefined;

  /** Whether the layer shows now. */
  isLayerOpen: boolean;

  /** The layer surface's element id. */
  layerId: string;

  /** The component its development warning names. */
  component: string;

  /** Shows the layer now, with no delay. */
  show: () => void;

  /** Hides the layer now. */
  hide: () => void;

  /** Reports a controlled layer's toggled value without changing it. */
  report: (isOpen: boolean) => void;

  /** What the layer says when it pins: its label, else its text. */
  announcement: () => string | null;

  /**
   * The layer repeats the trigger's own visible text (a truncated Text that is
   * its own tab stop): a press pins it without a button trigger, with no
   * development warning, no `aria-expanded` or `aria-controls`, and no
   * announcement, since its text is already the trigger's content.
   */
  repeatsTriggerText?: boolean;

  /**
   * Arms the host's outside dismissal (useTouchTrigger's `armOutsideDismiss`)
   * when a press pins the layer: a press that lifts outside the trigger and
   * the layer closes it.
   */
  armOutsideDismiss?: () => void;

  /** Disarms that dismissal when the pin drops. */
  disarmOutsideDismiss?: () => void;
}

export interface UsePressPinReturn {
  /** Whether presses on this trigger pin the layer: toggle mode and a button. */
  isToggleTrigger: (element: HTMLElement | null) => boolean;

  /** True while a press holds the uncontrolled layer open. */
  isPinnedRef: RefObject<boolean>;

  /** Wires the trigger element, or unwires it with `null`. */
  attach: (element: HTMLElement | null) => void;

  /** Drops the pin: Escape, or a hide that came from elsewhere. */
  unpin: () => void;

  /**
   * Closes the layer when a press holds it pinned and reports whether it did:
   * the host's outside dismissal calls it before its own hide.
   */
  closeIfPinned: () => boolean;

  /**
   * The host's focus-leave path calls it first: while pinned, focus moving
   * into the trigger or the layer keeps the pin and focus moving anywhere
   * else closes it. Returns whether the pin decided.
   */
  handleFocusLeave: (event: FocusEvent) => boolean;

  /**
   * Whether the pin wires this trigger's `aria-expanded` and `aria-controls`
   * (a button trigger, under the toggle): the host leaves them alone then.
   */
  wiresTrigger: boolean;
}

function restoreAttribute(
  element: HTMLElement,
  name: string,
  value: string | null,
): void {
  if (value == null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}

export function usePressPin(options: UsePressPinOptions): UsePressPinReturn {
  const {pressTrigger, isOpen, isLayerOpen, layerId} = options;
  const isToggleMode = pressTrigger === 'toggle';

  // The handlers run from DOM listeners: they read the latest options here.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const isPinnedRef = useRef(false);
  const [isPinned, setIsPinnedState] = useState(false);
  const setPinned = useCallback((next: boolean) => {
    isPinnedRef.current = next;
    setIsPinnedState(next);
  }, []);

  // The wired trigger, as state: its ARIA follows the pin through effects.
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const isToggleTrigger = useCallback(
    (element: HTMLElement | null) =>
      optionsRef.current.pressTrigger === 'toggle' &&
      element != null &&
      (optionsRef.current.repeatsTriggerText === true ||
        isPressPinTrigger(element)),
    [],
  );

  const close = useCallback(() => {
    const current = optionsRef.current;
    current.disarmOutsideDismiss?.();
    if (current.isOpen !== undefined) {
      current.report(false);
      return;
    }
    setPinned(false);
    current.hide();
  }, [setPinned]);

  const toggle = useCallback(() => {
    const current = optionsRef.current;
    if (current.isOpen !== undefined) {
      if (!current.isOpen) {
        current.armOutsideDismiss?.();
      } else {
        current.disarmOutsideDismiss?.();
      }
      current.report(!current.isOpen);
      return;
    }
    if (isPinnedRef.current) {
      setPinned(false);
      current.disarmOutsideDismiss?.();
      current.hide();
    } else {
      setPinned(true);
      current.show();
      current.armOutsideDismiss?.();
    }
  }, [setPinned]);

  // Enter or Space on a trigger that is not a native button: no click
  // follows from the browser, so the key presses. A click its own key
  // handler synthesizes in the same task is that press, not a second one.
  const keyPressedRef = useRef(false);
  const handlePress = useCallback(
    (event: MouseEvent) => {
      const current = optionsRef.current;
      if (!current.isEnabled || current.pressTrigger !== 'toggle') {
        return;
      }
      // The press stops at its trigger: no label control, link, or submit.
      event.preventDefault();
      pressPinClicks.add(event);
      if (keyPressedRef.current && event.detail === 0) {
        return;
      }
      toggle();
    },
    [toggle],
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const current = optionsRef.current;
      if (
        !current.isEnabled ||
        current.pressTrigger !== 'toggle' ||
        event.repeat ||
        event.isComposing ||
        (event.key !== 'Enter' && event.key !== ' ')
      ) {
        return;
      }
      event.preventDefault();
      keyPressedRef.current = true;
      setTimeout(() => {
        keyPressedRef.current = false;
      }, 0);
      toggle();
    },
    [toggle],
  );

  const detach = useCallback(() => {
    const previous = triggerRef.current;
    previous?.removeEventListener('click', handlePress);
    previous?.removeEventListener('keydown', handleKeyDown);
    triggerRef.current = null;
  }, [handlePress, handleKeyDown]);

  const attach = useCallback(
    (element: HTMLElement | null) => {
      if (element != null && element === triggerRef.current) {
        return;
      }
      detach();
      const current = optionsRef.current;
      if (element == null || current.pressTrigger !== 'toggle') {
        setTrigger(null);
        return;
      }
      const isRepeat = current.repeatsTriggerText === true;
      if (!isRepeat && !isPressPinTrigger(element)) {
        devWarn(
          current.component,
          '`pressTrigger="toggle"` pins only a button trigger (a <button> or role="button"); this trigger keeps tap-only opening.',
        );
        setTrigger(null);
        return;
      }
      element.addEventListener('click', handlePress);
      if (element.tagName !== 'BUTTON') {
        element.addEventListener('keydown', handleKeyDown);
      }
      triggerRef.current = element;
      setTrigger(element);
    },
    [detach, handlePress, handleKeyDown],
  );

  const unpin = useCallback(() => {
    if (isPinnedRef.current) {
      setPinned(false);
    }
  }, [setPinned]);

  // Every path that hides a pinned layer drops the pin in its own handler
  // (a second press, a press or focus outside, Escape through `unpin`); a
  // layer that is not showing is never reported expanded.
  const isExpanded = (isOpen !== undefined ? isOpen : isPinned) && isLayerOpen;

  // Whether a press holds the layer open right now, read from the handlers.
  const isHeldOpen = useCallback(() => {
    const current = optionsRef.current;
    if (current.pressTrigger !== 'toggle' || triggerRef.current == null) {
      return false;
    }
    return current.isOpen !== undefined
      ? current.isOpen && current.isLayerOpen
      : isPinnedRef.current;
  }, []);

  const closeIfPinned = useCallback(() => {
    if (!isHeldOpen()) {
      return false;
    }
    close();
    return true;
  }, [isHeldOpen, close]);

  const handleFocusLeave = useCallback(
    (event: FocusEvent) => {
      if (!isHeldOpen()) {
        return false;
      }
      const next = event.relatedTarget;
      const trigger = triggerRef.current;
      const surface =
        trigger?.ownerDocument.getElementById(optionsRef.current.layerId) ??
        null;
      if (
        next instanceof Node &&
        (trigger?.contains(next) === true || surface?.contains(next) === true)
      ) {
        return true;
      }
      close();
      return true;
    },
    [isHeldOpen, close],
  );

  // A trigger whose layer repeats its text carries no toggle state: its text
  // is already its content.
  const wiresState = options.repeatsTriggerText !== true;

  // The trigger's own aria-expanded and aria-controls come back on cleanup.
  useEffect(() => {
    if (!isToggleMode || trigger == null || !wiresState) {
      return;
    }
    const ownExpanded = trigger.getAttribute('aria-expanded');
    const ownControls = trigger.getAttribute('aria-controls');
    return () => {
      restoreAttribute(trigger, 'aria-expanded', ownExpanded);
      restoreAttribute(trigger, 'aria-controls', ownControls);
    };
  }, [isToggleMode, trigger, wiresState]);

  useEffect(() => {
    if (!isToggleMode || trigger == null || !wiresState) {
      return;
    }
    trigger.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    if (isLayerOpen) {
      trigger.setAttribute('aria-controls', layerId);
    } else {
      trigger.removeAttribute('aria-controls');
    }
  }, [isToggleMode, trigger, wiresState, isExpanded, isLayerOpen, layerId]);

  // Said once when the layer pins; a preview says nothing beyond the
  // trigger's description. Through useAnnounce, so inside a modal the pin is
  // heard in the modal's own region (spec:AST-086 FR14).
  const announce = useAnnounce();
  const announcedRef = useRef(false);
  useEffect(() => {
    if (!isToggleMode || trigger == null || !isExpanded || !wiresState) {
      announcedRef.current = false;
      return;
    }
    if (announcedRef.current) {
      return;
    }
    announcedRef.current = true;
    const text = optionsRef.current.announcement()?.trim();
    if (text != null && text !== '') {
      announce(text, 'polite');
    }
  }, [isToggleMode, trigger, isExpanded, wiresState, announce]);

  useEffect(() => detach, [detach]);

  return {
    isToggleTrigger,
    isPinnedRef,
    attach,
    unpin,
    closeIfPinned,
    handleFocusLeave,
    wiresTrigger: isToggleMode && trigger != null && wiresState,
  };
}
