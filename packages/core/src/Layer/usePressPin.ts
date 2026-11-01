// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePressPin.ts
 * @input A hover layer's trigger, its open state, show and hide, and its
 *   `triggerBehavior` and `touchTrigger` options
 * @output usePressPin: the press toggle that pins a hover layer open
 *   (component:Tooltip FR9 and FR10), with the layer's touch trigger wired to
 *   it; isPressPinTrigger, the button test it applies; isPressPinClick and
 *   stopPressPinClick, the stop at the trigger; LayerTriggerBehavior type
 *   (Core's own, not exported from the Layer entry point)
 * @position One call per hover layer that pins on a press, useTooltip's
 *   (`architecture:react-component-runtime` INV16): it owns the layer's touch
 *   trigger (useTouchTriggerInternal), which decides taps under `adaptive`
 *   (an explicit `touchTrigger` included), opens on no tap under `hover`,
 *   and pins under `toggle`
 *
 * Under `triggerBehavior="toggle"`, a click, a completed tap, Enter, or Space
 * on a button trigger pins the layer and the same press closes it; Escape, a
 * press or scroll outside (the touch trigger's outside dismissal, which the
 * pin arms), or focus leaving the trigger and the layer (the pin listens on
 * the trigger it wires) closes a pin, and a press on the layer's own text
 * keeps it. A controlled layer only reports the toggled value (`report`).
 * While wired, the trigger carries `aria-expanded` and `aria-controls`,
 * restored on unwiring; a named layer's `label` is announced from the press
 * handler (spec:AST-086 FR14), else the host announces its rendered text
 * (FR12). The press stops at the trigger: its default action is prevented,
 * and the component's wrapper stops it after the trigger's own handlers
 * (`stopPressPinClick`); an anchored trigger has no wrapper, so a plain
 * `onClick` element around it receives the press unless the trigger stops it
 * (component:Tooltip FR9); Astryx clickable containers ignore a pinning
 * press (`isPressPinClick`), even from a trigger that is not a nested button.
 * A trigger that is not a button gets a development warning and keeps
 * tap-only opening; one whose layer repeats its own visible text
 * (`repeatsTriggerText`, a truncated Text that is its own tab stop) pins
 * without being a button, with no warning, toggle state, or announcement.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Tooltip/useTooltip.tsx
 * - /packages/core/src/Layer/usePressPin.test.tsx
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react';
import {useAnnounce} from '../hooks/useAnnounce';
import {useDevWarning} from '../hooks/useDevWarning';
import {
  useTouchTriggerInternal,
  type LayerTouchTrigger,
  type UseTouchTriggerReturn,
} from './useTouchTrigger';

/**
 * How the trigger opens the layer: `adaptive` (the default) previews it on
 * hover and focus and opens it on a tap unless the trigger acts, as
 * `touchTrigger` decides while it remains; `hover` previews it on hover and
 * focus, and no touch or pen tap opens it; `toggle` pins it on every press of
 * a button trigger.
 */
export type LayerTriggerBehavior = 'adaptive' | 'hover' | 'toggle';

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

/**
 * The layer component's wrapper handler: a press that pinned or closed the
 * layer stops here, after the trigger's own handlers ran, so no clickable
 * row, card, or container around the trigger receives it
 * (component:Tooltip FR9).
 */
export function stopPressPinClick(event: ReactMouseEvent): void {
  if (pressPinClicks.has(event.nativeEvent)) {
    event.stopPropagation();
  }
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
  /** The layer's `triggerBehavior`. */
  triggerBehavior: LayerTriggerBehavior;

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

  /**
   * The layer repeats the trigger's own visible text (a truncated Text that is
   * its own tab stop): a press pins it without a button trigger, with no
   * development warning, no `aria-expanded` or `aria-controls`, and no
   * announcement, since its text is already the trigger's content.
   */
  repeatsTriggerText?: boolean;

  /**
   * The layer's name (a named layer's `label`), when it has one: a press that
   * pins the layer says it once, from the press handler, in place of the
   * rendered text the host announces otherwise.
   */
  label?: string;

  /**
   * The layer's `touchTrigger`, which decides taps under `adaptive`. Under
   * `hover` no touch or pen tap opens the layer; under the toggle it is ignored: a
   * trigger no press can pin keeps tap-only opening.
   */
  touchTrigger: LayerTouchTrigger;

  /** The host's trigger element, which the touch trigger reads. */
  triggerRef: RefObject<HTMLElement | null>;
}

export interface UsePressPinReturn {
  /** Whether presses on this trigger pin the layer: toggle mode and a button. */
  isToggleTrigger: (element: HTMLElement | null) => boolean;

  /**
   * Whether a press holds the layer open now: under the toggle, on a wired
   * trigger, a pin while the layer shows (or a controlled layer's open
   * value). The host's hover and focus hides ask it, so a layer whose
   * `triggerBehavior` turned to `adaptive` while pinned closes on leave again.
   */
  isHeldOpen: () => boolean;

  /** Wires the trigger element, or unwires it with `null`. */
  attach: (element: HTMLElement | null) => void;

  /** Drops the pin: Escape, or a hide that came from elsewhere. */
  unpin: () => void;

  /**
   * While pinned, focus moving onto an element outside the trigger and the
   * layer closes it, and any other focus move keeps it. Returns whether the
   * pin decided. The pin calls it for focus leaving the trigger it wires; a
   * host calls it for focus leaving the layer's own content.
   */
  handleFocusLeave: (event: FocusEvent) => boolean;

  /**
   * Whether the layer shows pinned on a trigger that carries the toggle state:
   * the host announces the layer's rendered text while it is, unless the
   * layer has a `label`, which the press handler already said.
   */
  isPinShown: boolean;

  /** The layer's touch trigger (useTouchTriggerInternal), wired to the pin. */
  touch: Pick<
    UseTouchTriggerReturn,
    | 'isTouchPointerRef'
    | 'isTouchInteraction'
    | 'handlePointerEnter'
    | 'handlePointerDown'
    | 'clearTapOpen'
  >;
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

function writeAttribute(
  element: HTMLElement,
  name: string,
  value: string | null,
): void {
  if (element.getAttribute(name) !== value) {
    restoreAttribute(element, name, value);
  }
}

export function usePressPin(options: UsePressPinOptions): UsePressPinReturn {
  const {triggerBehavior, isOpen, isLayerOpen, layerId} = options;
  const isToggleMode = triggerBehavior === 'toggle';
  const wiresState = options.repeatsTriggerText !== true;

  // The handlers run from DOM listeners: they read the latest options, and
  // the announcer for where the layer renders (inside a modal, the modal's
  // own region), here.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const announce = useAnnounce();
  const announceRef = useRef(announce);
  announceRef.current = announce;

  const isPinnedRef = useRef(false);
  const [isPinned, setIsPinnedState] = useState(false);
  const setPinned = useCallback((next: boolean) => {
    isPinnedRef.current = next;
    setIsPinnedState(next);
  }, []);

  // The wired trigger lives in a ref. The element the host last offered stays
  // in a ref too, wired or not, so a `triggerBehavior` that changes after mount
  // wires or unwires it (the host's ref does not run again); what the render
  // needs to know about it is state.
  const triggerRef = useRef<HTMLElement | null>(null);
  const offeredRef = useRef<HTMLElement | null>(null);
  // What kind of element the host offered last: 0 none yet, 1 a trigger that
  // is not a button, 2 a button. A primitive, so a host that re-attaches the
  // same trigger on every commit sets the same value and renders nothing.
  const [offeredKind, setOfferedKind] = useState<0 | 1 | 2>(0);
  // The trigger's own aria-expanded and aria-controls, restored on unwiring.
  const ownStateRef = useRef<{
    expanded: string | null;
    controls: string | null;
  } | null>(null);

  // The touch trigger's outside dismissal (a press that lifts outside the
  // trigger and the layer, or a scroll that starts there) closes a pinned
  // layer through the pin, so the pin drops with it; otherwise it hides as a
  // tap-open does.
  const hideFromTouch = useCallback(() => {
    const current = optionsRef.current;
    if (current.triggerBehavior === 'toggle' && triggerRef.current != null) {
      if (current.isOpen !== undefined) {
        current.report(false);
        return;
      }
      if (isPinnedRef.current) {
        setPinned(false);
      }
    }
    current.hide();
  }, [setPinned]);

  const {
    isTouchPointerRef,
    isTouchInteraction,
    handlePointerEnter,
    handlePointerDown,
    clearTapOpen,
    armOutsideDismiss,
  } = useTouchTriggerInternal({
    touchTrigger: isToggleMode
      ? 'tap'
      : triggerBehavior === 'hover'
        ? 'none'
        : options.touchTrigger,
    isEnabled: options.isEnabled,
    isControlled: isOpen !== undefined,
    isOpen: isLayerOpen,
    layerId,
    triggerRef: options.triggerRef,
    show: options.show,
    hide: hideFromTouch,
  });

  const isToggleTrigger = useCallback(
    (element: HTMLElement | null) =>
      optionsRef.current.triggerBehavior === 'toggle' &&
      element != null &&
      (optionsRef.current.repeatsTriggerText === true ||
        isPressPinTrigger(element)),
    [],
  );

  const close = useCallback(() => {
    const current = optionsRef.current;
    clearTapOpen();
    if (current.isOpen !== undefined) {
      current.report(false);
      return;
    }
    setPinned(false);
    current.hide();
  }, [setPinned, clearTapOpen]);

  // A string, so it goes straight to useAnnounce, with no Effect (FR14).
  const announceName = useCallback(() => {
    const current = optionsRef.current;
    const name = current.label?.trim() ?? '';
    if (name !== '' && current.repeatsTriggerText !== true) {
      announceRef.current(name, 'polite');
    }
  }, []);

  const toggle = useCallback(() => {
    const current = optionsRef.current;
    if (current.isOpen !== undefined) {
      if (!current.isOpen) {
        armOutsideDismiss();
        announceName();
      } else {
        clearTapOpen();
      }
      current.report(!current.isOpen);
      return;
    }
    // A pin counts only while its layer shows: a layer closed some other way
    // (a leave after `triggerBehavior` turned to `adaptive`) pins on the next press.
    if (isPinnedRef.current && current.isLayerOpen) {
      setPinned(false);
      clearTapOpen();
      current.hide();
    } else {
      setPinned(true);
      current.show();
      armOutsideDismiss();
      announceName();
    }
  }, [setPinned, announceName, armOutsideDismiss, clearTapOpen]);

  // Enter or Space on a trigger that is not a native button: no click
  // follows from the browser, so the key presses. A click its own key
  // handler synthesizes in the same task is that press, not a second one.
  const keyPressedRef = useRef(false);
  const handlePress = useCallback(
    (event: MouseEvent) => {
      const current = optionsRef.current;
      if (!current.isEnabled || current.triggerBehavior !== 'toggle') {
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
        current.triggerBehavior !== 'toggle' ||
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

  const isHeldOpen = useCallback(() => {
    const current = optionsRef.current;
    if (current.triggerBehavior !== 'toggle' || triggerRef.current == null) {
      return false;
    }
    return current.isOpen !== undefined
      ? current.isOpen && current.isLayerOpen
      : isPinnedRef.current && current.isLayerOpen;
  }, []);

  const handleFocusLeave = useCallback(
    (event: FocusEvent) => {
      if (!isHeldOpen()) {
        return false;
      }
      const next = event.relatedTarget;
      // Focus that leaves for no element is a press's to decide: a press on
      // the layer's own text moves it to the body and keeps the pin, and a
      // press outside closes it through the outside dismissal.
      if (!(next instanceof Node)) {
        return true;
      }
      const trigger = triggerRef.current;
      const surface =
        trigger?.ownerDocument.getElementById(optionsRef.current.layerId) ??
        null;
      if (
        trigger?.contains(next) === true ||
        surface?.contains(next) === true
      ) {
        return true;
      }
      close();
      return true;
    },
    [isHeldOpen, close],
  );

  const unwire = useCallback(() => {
    const previous = triggerRef.current;
    if (previous == null) {
      return;
    }
    previous.removeEventListener('click', handlePress);
    previous.removeEventListener('keydown', handleKeyDown);
    previous.removeEventListener('focusout', handleFocusLeave);
    const own = ownStateRef.current;
    if (own != null) {
      restoreAttribute(previous, 'aria-expanded', own.expanded);
      restoreAttribute(previous, 'aria-controls', own.controls);
    }
    ownStateRef.current = null;
    triggerRef.current = null;
  }, [handlePress, handleKeyDown, handleFocusLeave]);

  // The element and mode the toggle last settled, wired or not: the same pair
  // again (the mount after the host's ref attached, a re-render) does nothing.
  const settledRef = useRef<{
    element: HTMLElement | null;
    mode: LayerTriggerBehavior;
  } | null>(null);

  const wire = useCallback(
    (element: HTMLElement | null) => {
      const current = optionsRef.current;
      const settled = settledRef.current;
      if (
        settled != null &&
        settled.element === element &&
        settled.mode === current.triggerBehavior
      ) {
        return;
      }
      settledRef.current = {element, mode: current.triggerBehavior};
      unwire();
      if (element == null || current.triggerBehavior !== 'toggle') {
        return;
      }
      const isRepeat = current.repeatsTriggerText === true;
      if (!isRepeat && !isPressPinTrigger(element)) {
        return;
      }
      element.addEventListener('click', handlePress);
      if (element.tagName !== 'BUTTON') {
        element.addEventListener('keydown', handleKeyDown);
      }
      // The pin's own focus-leave close, whatever focus listeners the host
      // attaches (a `focusTrigger="never"` tooltip attaches none).
      element.addEventListener('focusout', handleFocusLeave);
      if (!isRepeat) {
        ownStateRef.current = {
          expanded: element.getAttribute('aria-expanded'),
          controls: element.getAttribute('aria-controls'),
        };
      }
      triggerRef.current = element;
    },
    [unwire, handlePress, handleKeyDown, handleFocusLeave],
  );

  const attach = useCallback(
    (element: HTMLElement | null) => {
      offeredRef.current = element;
      // A detach is not recorded: hosts detach and re-attach their trigger
      // within one commit, and a removed trigger wires nothing anyway.
      if (element != null) {
        setOfferedKind(isPressPinTrigger(element) ? 2 : 1);
      }
      wire(element);
    },
    [wire],
  );

  // Whether the toggle wires the offered trigger: a button, or a trigger whose
  // layer repeats its own text.
  const isWired =
    isToggleMode && offeredKind !== 0 && (!wiresState || offeredKind === 2);
  useDevWarning(
    options.component,
    '`triggerBehavior="toggle"` pins only a button trigger (a <button> or role="button"); this trigger keeps tap-only opening.',
    isToggleMode && wiresState && offeredKind === 1,
  );

  // A `triggerBehavior` that changes after the trigger mounted wires or unwires
  // it here: the host's ref callback does not run again for that change.
  useEffect(() => {
    wire(offeredRef.current);
  }, [triggerBehavior, wire]);

  const unpin = useCallback(() => {
    if (isPinnedRef.current) {
      setPinned(false);
    }
  }, [setPinned]);

  // Every path that hides a pinned layer drops the pin in its own handler
  // (a second press, a press or focus outside, Escape through `unpin`); a
  // layer that is not showing is never reported expanded.
  const isExpanded = (isOpen !== undefined ? isOpen : isPinned) && isLayerOpen;

  // The wired trigger's aria-expanded and aria-controls follow the pin. No
  // dependency array: the trigger lives in a ref and a host may swap it on any
  // commit, and the writes are skipped when the values already match.
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!isToggleMode || !isWired || !wiresState || trigger == null) {
      return;
    }
    writeAttribute(trigger, 'aria-expanded', isExpanded ? 'true' : 'false');
    writeAttribute(trigger, 'aria-controls', isLayerOpen ? layerId : null);
  });

  const isPinShown = isToggleMode && isWired && wiresState && isExpanded;

  return {
    isToggleTrigger,
    isHeldOpen,
    attach,
    unpin,
    handleFocusLeave,
    isPinShown,
    touch: {
      isTouchPointerRef,
      isTouchInteraction,
      handlePointerEnter,
      handlePointerDown,
      clearTapOpen,
    },
  };
}
