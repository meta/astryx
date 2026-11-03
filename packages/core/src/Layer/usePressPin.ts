// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePressPin.ts
 * @input A hover layer's trigger, open state, show and hide, and its
 *   `triggerBehavior` and `touchTrigger` options
 * @output usePressPin, the press toggle that pins a hover layer open, and
 *   the app hold behind useTooltip's show() and hide(); isPressPinTrigger;
 *   stopPressPinClick; the LayerTriggerBehavior type
 * @position Core-internal: one call per hover layer, useTooltip's. It owns
 *   the layer's touch trigger, so the host makes no second touch-trigger call.
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
import {stopInReactTree} from './layerClickBoundary';
import {
  useTouchTriggerInternal,
  type LayerTouchTrigger,
  type UseTouchTriggerReturn,
} from './useTouchTrigger';

/**
 * How the trigger opens the layer. `adaptive`, the default, previews it on
 * hover and focus, and `touchTrigger` decides taps. `toggle` pins it on every
 * press of a button trigger. Internal: InfoTip's press-to-pin uses `toggle`.
 */
export type LayerTriggerBehavior = 'adaptive' | 'toggle';

/** The clicks a press pin answered, so the wrapper can stop them (`stopPressPinClick`). */
const pressPinClicks = new WeakSet<Event>();

/**
 * The layer component's wrapper handler. It stops a press that pinned or
 * closed the layer in the React tree only, after the trigger's own handlers.
 * No clickable row, card, or container around the trigger then receives it,
 * and document and window listeners still do. An anchored trigger has no
 * wrapper, so a plain `onClick` element around it still receives the press.
 */
export function stopPressPinClick(event: ReactMouseEvent): void {
  if (pressPinClicks.has(event.nativeEvent)) {
    stopInReactTree(event);
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
  /** The layer's `label`: a press that pins the layer says it once, in place of its text. */
  label?: string;
  /** The layer's `touchTrigger`, which decides taps only under `adaptive`. */
  touchTrigger: LayerTouchTrigger;
  /** The host's trigger element, which the touch trigger reads. */
  triggerRef: RefObject<HTMLElement | null>;
}

export interface UsePressPinReturn {
  /** Whether presses on this trigger pin the layer: toggle mode and a button. */
  isToggleTrigger: (element: HTMLElement | null) => boolean;
  /**
   * Whether a press holds the layer open now: a pin on a wired trigger while
   * the layer shows, or a controlled layer's open value. The host's hover and
   * focus hides ask it.
   */
  isHeldOpen: () => boolean;
  /** Wires the trigger element, or unwires it with `null`. */
  attach: (element: HTMLElement | null) => void;
  /** Drops the pin and the app hold: Escape, or a hide from elsewhere. */
  unpin: () => void;
  /**
   * The app's `show()`: shows the layer and holds it open, as a pin does,
   * until `release`, Escape, a press outside, or focus leaving the trigger
   * and the layer. A controlled layer reports the request instead.
   */
  hold: () => void;
  /** The app's `hide()`: drops the hold and hides the layer. */
  release: () => void;
  /** Whether the app's `show()` holds the layer open now. */
  isAppHeld: () => boolean;
  /**
   * While pinned, focus moving onto an element outside the trigger and the
   * layer closes it. Returns whether the pin decided. The pin calls it for its
   * trigger, and a host calls it for the layer's own content.
   */
  handleFocusLeave: (event: FocusEvent) => boolean;
  /**
   * Whether the layer shows pinned on a wired trigger, or held by the app's
   * `show()`. The host then announces its rendered text, unless the layer has
   * a `label`.
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

/**
 * Pins a hover layer open on a press of a button trigger, under
 * `triggerBehavior="toggle"`. The same press closes it, and so do Escape, a
 * press or scroll outside, and focus that leaves the trigger and the layer.
 * The press stops at the trigger. A trigger that is not a button gets a
 * development warning and keeps tap-only opening.
 */
export function usePressPin(options: UsePressPinOptions): UsePressPinReturn {
  const {triggerBehavior, isOpen, isLayerOpen, layerId} = options;
  const isToggleMode = triggerBehavior === 'toggle';

  // DOM listeners read the latest options and announcer through refs. The
  // announcer is the layer's own: inside a modal, the modal's region.
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

  // The app's show() holds the layer on any trigger, in any mode.
  const isAppHeldRef = useRef(false);
  const [isAppHeldState, setIsAppHeldState] = useState(false);
  const setAppHeld = useCallback((next: boolean) => {
    isAppHeldRef.current = next;
    setIsAppHeldState(next);
  }, []);

  // The last offered element lets a `triggerBehavior` change rewire it.
  const triggerRef = useRef<HTMLElement | null>(null);
  // Every offered trigger, in any mode, so focus leaving ends a pin or an
  // app hold.
  const focusTargetRef = useRef<HTMLElement | null>(null);
  const offeredRef = useRef<HTMLElement | null>(null);
  // A primitive: re-attaching the same trigger renders nothing.
  const [offeredKind, setOfferedKind] = useState<'none' | 'other' | 'button'>(
    'none',
  );
  // The trigger's own aria-expanded and aria-controls, restored on unwiring.
  const ownStateRef = useRef<{
    expanded: string | null;
    controls: string | null;
  } | null>(null);

  // The touch trigger's outside dismissal (a press or scroll outside) closes
  // a pinned layer through the pin, so the pin drops with it.
  const hideFromTouch = useCallback(() => {
    const current = optionsRef.current;
    if (isAppHeldRef.current) {
      setAppHeld(false);
      if (current.isOpen !== undefined) {
        current.report(false);
        return;
      }
    }
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
  }, [setPinned, setAppHeld]);

  const {
    isTouchPointerRef,
    isTouchInteraction,
    handlePointerEnter,
    handlePointerDown,
    clearTapOpen,
    armOutsideDismiss,
  } = useTouchTriggerInternal({
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
      optionsRef.current.triggerBehavior === 'toggle' &&
      element != null &&
      isPressPinTrigger(element),
    [],
  );

  const close = useCallback(() => {
    const current = optionsRef.current;
    clearTapOpen();
    setAppHeld(false);
    if (current.isOpen !== undefined) {
      current.report(false);
      return;
    }
    setPinned(false);
    current.hide();
  }, [setPinned, setAppHeld, clearTapOpen]);

  const announceName = useCallback(() => {
    const current = optionsRef.current;
    const name = current.label?.trim() ?? '';
    if (name !== '') {
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
    // A pin counts only while its layer shows; a closed layer pins again.
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

  // A non-native button gets no click from the browser for a key. So Enter
  // presses it on keydown, and Space on keyup, as on a native button. A click
  // with no pointer (`detail` 0) while Space is down, or in a key press's
  // task, is that same press.
  const keyPressedRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const handlePress = useCallback(
    (event: MouseEvent) => {
      const current = optionsRef.current;
      if (!current.isEnabled || current.triggerBehavior !== 'toggle') {
        return;
      }
      // The press stops at its trigger: no label control, link, or submit.
      event.preventDefault();
      pressPinClicks.add(event);
      if (
        event.detail === 0 &&
        (keyPressedRef.current || spaceHeldRef.current)
      ) {
        return;
      }
      toggle();
    },
    [toggle],
  );
  const pressFromKey = useCallback(() => {
    keyPressedRef.current = true;
    setTimeout(() => {
      keyPressedRef.current = false;
    }, 0);
    toggle();
  }, [toggle]);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const current = optionsRef.current;
      if (
        !current.isEnabled ||
        current.triggerBehavior !== 'toggle' ||
        event.isComposing ||
        (event.key !== 'Enter' && event.key !== ' ')
      ) {
        return;
      }
      // The press replaces the key's own action, such as a page scroll on Space.
      event.preventDefault();
      if (event.repeat) {
        return;
      }
      if (event.key === ' ') {
        spaceHeldRef.current = true;
        return;
      }
      pressFromKey();
    },
    [pressFromKey],
  );
  // Only a Space that went down on the trigger presses it when it comes up.
  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== ' ' || !spaceHeldRef.current) {
        return;
      }
      spaceHeldRef.current = false;
      const current = optionsRef.current;
      if (!current.isEnabled || current.triggerBehavior !== 'toggle') {
        return;
      }
      pressFromKey();
    },
    [pressFromKey],
  );

  const isHeldOpen = useCallback(() => {
    const current = optionsRef.current;
    if (isAppHeldRef.current && current.isLayerOpen) {
      return current.isOpen !== false;
    }
    if (current.triggerBehavior !== 'toggle' || triggerRef.current == null) {
      return false;
    }
    return current.isOpen !== undefined
      ? current.isOpen && current.isLayerOpen
      : isPinnedRef.current && current.isLayerOpen;
  }, []);

  const handleFocusLeave = useCallback(
    (event: FocusEvent) => {
      // A Space that comes up after focus left presses nothing.
      spaceHeldRef.current = false;
      if (!isHeldOpen()) {
        return false;
      }
      const next = event.relatedTarget;
      const trigger = focusTargetRef.current;
      // Focus that leaves for no element is a press's to decide. The trigger
      // can sit in another document, so the check uses its own window.
      const view = trigger?.ownerDocument.defaultView;
      if (view == null || !(next instanceof view.Node)) {
        return true;
      }
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
    focusTargetRef.current?.removeEventListener('focusout', handleFocusLeave);
    focusTargetRef.current = null;
    const previous = triggerRef.current;
    if (previous == null) {
      return;
    }
    previous.removeEventListener('click', handlePress);
    previous.removeEventListener('keydown', handleKeyDown);
    previous.removeEventListener('keyup', handleKeyUp);
    const own = ownStateRef.current;
    if (own != null) {
      restoreAttribute(previous, 'aria-expanded', own.expanded);
      restoreAttribute(previous, 'aria-controls', own.controls);
    }
    ownStateRef.current = null;
    triggerRef.current = null;
  }, [handlePress, handleKeyDown, handleKeyUp, handleFocusLeave]);

  // The element and mode last settled; the same pair again does nothing.
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
      if (element == null) {
        return;
      }
      // Its own focus-leave listener, in any mode: `focusTrigger="never"`
      // attaches none, and an app hold needs it on any trigger.
      element.addEventListener('focusout', handleFocusLeave);
      focusTargetRef.current = element;
      if (current.triggerBehavior !== 'toggle' || !isPressPinTrigger(element)) {
        return;
      }
      element.addEventListener('click', handlePress);
      if (element.tagName !== 'BUTTON') {
        element.addEventListener('keydown', handleKeyDown);
        element.addEventListener('keyup', handleKeyUp);
      }
      ownStateRef.current = {
        expanded: element.getAttribute('aria-expanded'),
        controls: element.getAttribute('aria-controls'),
      };
      triggerRef.current = element;
    },
    [unwire, handlePress, handleKeyDown, handleKeyUp, handleFocusLeave],
  );

  const attach = useCallback(
    (element: HTMLElement | null) => {
      offeredRef.current = element;
      // Hosts detach and re-attach within one commit, so a detach is not kept.
      if (element != null) {
        setOfferedKind(isPressPinTrigger(element) ? 'button' : 'other');
      }
      wire(element);
    },
    [wire],
  );

  const isWired = isToggleMode && offeredKind === 'button';
  useDevWarning(
    options.component,
    'A press-to-pin tooltip pins only a button trigger (a <button> or role="button"); this trigger keeps tap-only opening.',
    isToggleMode && offeredKind === 'other',
  );

  // A later `triggerBehavior` change rewires here; the ref does not rerun.
  useEffect(() => {
    wire(offeredRef.current);
  }, [triggerBehavior, wire]);

  const unpin = useCallback(() => {
    if (isPinnedRef.current) {
      setPinned(false);
    }
    if (isAppHeldRef.current) {
      setAppHeld(false);
    }
  }, [setPinned, setAppHeld]);

  const hold = useCallback(() => {
    const current = optionsRef.current;
    if (!current.isEnabled) {
      return;
    }
    setAppHeld(true);
    armOutsideDismiss();
    announceName();
    if (current.isOpen !== undefined) {
      current.report(true);
      return;
    }
    current.show();
  }, [setAppHeld, armOutsideDismiss, announceName]);

  const release = useCallback(() => {
    close();
  }, [close]);

  const isAppHeld = useCallback(() => isAppHeldRef.current, []);

  // Each path that hides a pinned layer drops the pin itself, so a layer that
  // does not show is never reported expanded.
  const isExpanded = (isOpen !== undefined ? isOpen : isPinned) && isLayerOpen;

  // The trigger's aria-expanded and aria-controls follow the pin. No deps: a
  // host can swap the trigger on any commit; equal values are not rewritten.
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!isToggleMode || !isWired || trigger == null) {
      return;
    }
    writeAttribute(trigger, 'aria-expanded', isExpanded ? 'true' : 'false');
    writeAttribute(trigger, 'aria-controls', isLayerOpen ? layerId : null);
  });

  const isPinShown =
    (isToggleMode && isWired && isExpanded) ||
    (isAppHeldState && isLayerOpen && isOpen !== false);

  return {
    isToggleTrigger,
    isHeldOpen,
    attach,
    unpin,
    hold,
    release,
    isAppHeld,
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
