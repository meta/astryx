// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePressPin.ts
 * @input A hover layer's trigger, its open state, show and hide, and its
 *   `pressTrigger` and `touchTrigger` options
 * @output usePressPin: the press toggle that pins a hover layer open
 *   (component:Tooltip FR9 and FR10), with the layer's touch trigger wired to
 *   it; isPressPinTrigger, the button test
 *   it applies; isPressPinClick and stopPressPinClick, the stop at the
 *   trigger; LayerPressTrigger type (Core's own, not exported from the Layer
 *   entry point)
 * @position One call per hover layer that pins on a press, useTooltip's
 *   (`architecture:react-component-runtime` INV16): it owns the layer's touch
 *   trigger (useTouchTriggerInternal), which keeps deciding taps while
 *   `pressTrigger` is `none`
 *
 * With `pressTrigger="toggle"` and a trigger whose role is `button` (a
 * `<button>` or `role="button"`), a click, a completed tap, Enter, or Space
 * pins the layer open, and the same press on a pinned layer closes it. Enter
 * and Space reach it as the button's own click. Hover and keyboard focus still
 * preview the layer; a pinned layer stays open when the pointer leaves, and
 * Escape, a second press, a press or scroll outside the trigger and the layer
 * (the touch trigger's outside dismissal, which the pin arms), or focus
 * moving onto an element outside them closes it: the pin listens for focus
 * leaving the trigger it wires, whatever the host's focus listeners. A press on the layer's own text,
 * which moves focus to no element, keeps it. A controlled layer only reports
 * the toggled value, through `report`, and never changes its own state.
 *
 * While it wires a button trigger, the trigger carries `aria-expanded`, true
 * only while pinned, and `aria-controls` naming the layer while it shows,
 * each replacing the trigger's own value and restored when it unwires. When a
 * press pins a layer that has a `label` (a dialog's name), the
 * press handler says that label once through useAnnounce (spec:AST-086
 * FR14); otherwise `isPinShown` turns true and the host announces the
 * layer's rendered text through useAnnounceRenderedText (spec:AST-086 FR12).
 *
 * A press that pins or closes the layer stops at its trigger: its default
 * action is prevented (a label's control, a link, a form submit), and the
 * component's wrapper stops it before any clickable row, card, or container
 * around the trigger (`stopPressPinClick`), while the trigger's own handlers
 * still run; an Astryx clickable container ignores it (`isPressPinClick`),
 * even from a trigger that is not a nested button.
 * A trigger with no such wrapper (a Tooltip's `anchorRef`) is not stopped:
 * its own handlers run, and a plain `onClick` element around it receives the
 * press unless the trigger's handler stops it (component:Tooltip FR9).
 *
 * A trigger that is not a button gets a development warning, and no press
 * pins it: the layer keeps tap-only opening for it. A trigger whose layer
 * repeats its own visible text (`repeatsTriggerText`, a truncated Text that is
 * its own tab stop) pins without being a button, with no warning, no
 * `aria-expanded` or `aria-controls`, and no announcement.
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
   * The layer's `touchTrigger`. Under the toggle it is ignored: a trigger no
   * press can pin keeps tap-only opening.
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
   * `pressTrigger` turned to `none` while pinned closes on leave again.
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
  const {pressTrigger, isOpen, isLayerOpen, layerId} = options;
  const isToggleMode = pressTrigger === 'toggle';
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
  // in a ref too, wired or not, so a `pressTrigger` that changes after mount
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
    if (current.pressTrigger === 'toggle' && triggerRef.current != null) {
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
    // Under the toggle, a trigger no press can pin keeps tap-only opening.
    touchTrigger: isToggleMode ? 'tap' : options.touchTrigger,
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
      optionsRef.current.pressTrigger === 'toggle' &&
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

  // A press that pins a named layer says its name once: a string, so it goes
  // straight to useAnnounce from the handler, with no Effect (spec:AST-086
  // FR14). A layer without a name is announced by its host, from its text.
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
    // (a leave after `pressTrigger` turned to `none`) pins on the next press.
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

  // Whether a press holds the layer open right now, read from the handlers.
  const isHeldOpen = useCallback(() => {
    const current = optionsRef.current;
    if (current.pressTrigger !== 'toggle' || triggerRef.current == null) {
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
    mode: LayerPressTrigger;
  } | null>(null);

  const wire = useCallback(
    (element: HTMLElement | null) => {
      const current = optionsRef.current;
      const settled = settledRef.current;
      if (
        settled != null &&
        settled.element === element &&
        settled.mode === current.pressTrigger
      ) {
        return;
      }
      settledRef.current = {element, mode: current.pressTrigger};
      unwire();
      if (element == null || current.pressTrigger !== 'toggle') {
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
    '`pressTrigger="toggle"` pins only a button trigger (a <button> or role="button"); this trigger keeps tap-only opening.',
    isToggleMode && wiresState && offeredKind === 1,
  );

  // A `pressTrigger` that changes after the trigger mounted wires or unwires
  // it here: the host's ref callback does not run again for that change.
  useEffect(() => {
    wire(offeredRef.current);
  }, [pressTrigger, wire]);

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
