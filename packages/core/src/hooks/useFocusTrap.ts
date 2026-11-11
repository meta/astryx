// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useFocusTrap.ts
 * @input Uses React useCallback, useEffect, useRef
 * @output Exports useFocusTrap, the internal focus-region Tab containment it
 *   composes, the deprecated Escape-state shim, and an
 *   internal compatibility-signal hook
 * @position Core hook; used by dialogs, modals, date pickers
 *
 * Based on WAI-ARIA dialog pattern:
 * https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 */

import {useCallback, useEffect, useRef} from 'react';
import {
  cancelLayerFocus,
  prepareFocusRepairOnRemoval,
  restoreLayerFocus,
  trackLayerFocus,
  type LayerFocusRecord,
} from '../utils/focusReturn';
import {isHTMLElement} from '../utils/nodeType';

import {FOCUSABLE_SELECTOR} from './focusableSelector';
import {useLayerDismissal} from '../Layer/useLayerDismissal';

// Escape-dismissible focus traps currently mounted. This is the whole state
// behind `hasActiveFocusTrapEscape`, which predates the shared stack and must
// keep answering about focus traps alone — the stack now carries families that
// never trapped focus (tooltips, hover cards), and counting those would tell
// callers a trap is above them when none is.
let activeEscapeTrapCount = 0;

/**
 * Whether an Escape-dismissible focus trap is currently active — a Popover,
 * menu or other trapped layer that would take an Escape press.
 *
 * @deprecated The focus trap no longer owns Escape coordination — every overlay
 *   family shares one stack (`useLayerDismissal`), which routes each press to
 *   the top-most layer. A layer that wants the same ordering should join the
 *   stack rather than ask whether a trap exists.
 */
export function hasActiveFocusTrapEscape(): boolean {
  return activeEscapeTrapCount > 0;
}

/**
 * Keep the deprecated `hasActiveFocusTrapEscape` signal accurate for a focus
 * trap whose Escape is coordinated by another registration in the shared
 * stack. This hook is intentionally internal (not re-exported from `hooks`): it
 * preserves the released read-only compatibility signal without creating a
 * second dismissal owner.
 */
export function useFocusTrapEscapeCompatibilitySignal(isActive: boolean): void {
  // Syncs the module count of active Escape traps with `isActive`. The
  // compatibility signal reads this count.
  useEffect(() => {
    if (!isActive) {
      return;
    }
    activeEscapeTrapCount += 1;
    return () => {
      activeEscapeTrapCount -= 1;
    };
  }, [isActive]);
}

/**
 * Whether an element is shown as a popover. jsdom and browsers without the
 * Popover API do not recognize `:popover-open`, and nothing is popover-open
 * there.
 */
function isPopoverOpen(el: Element): boolean {
  try {
    return el.matches(':popover-open');
  } catch {
    return false;
  }
}

/**
 * Whether an element is currently perceivable/focusable — excludes ones hidden
 * via `display:none`/`visibility:hidden` or inside an `inert`/`hidden` subtree,
 * which the browser skips for Tab, and ones inside an `aria-hidden="true"`
 * subtree, which sighted-keyboard users could Tab to while AT skips them
 * (WCAG 4.1.2 — focusable content must be exposed to assistive tech).
 */
function isVisiblyFocusable(el: HTMLElement): boolean {
  if (el.hasAttribute('inert') || el.closest('[inert]')) {
    return false;
  }
  if (el.hidden || el.closest('[hidden]')) {
    return false;
  }
  // A closed <dialog> renders nothing, so nothing inside it can take focus.
  // A dialog shown with showPopover() (a non-modal sheet or drawer) never
  // sets `open`, so it counts as shown while it is popover-open.
  for (
    let dialog = el.closest('dialog');
    dialog != null;
    dialog = dialog.parentElement?.closest('dialog') ?? null
  ) {
    if (!dialog.open && !isPopoverOpen(dialog)) {
      return false;
    }
  }
  // closest() matches the element itself as well as any ancestor.
  if (el.closest('[aria-hidden="true"]')) {
    return false;
  }
  // offsetParent is null for display:none (and fixed elements); pair with a
  // visibility check via getComputedStyle when available.
  if (typeof window !== 'undefined' && window.getComputedStyle) {
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') {
      return false;
    }
  }
  return true;
}

/**
 * Get all focusable elements within a container.
 *
 * Exported for menus that place their own Tab stops inside a trapped layer
 * (DropdownMenu's header and footer), so they judge reachability exactly as
 * the trap does. Not re-exported from the package's `hooks` entry.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isVisiblyFocusable);
}

/**
 * The name of a named native radio, or null for any other element and for an
 * unnamed radio, which is its own Tab stop.
 */
function radioNameOf(el: Element): string | null {
  if (!el.matches('input[type="radio"][name]')) {
    return null;
  }
  return (el as HTMLInputElement).name || null;
}

/**
 * Whether two radios are one group: the same name and the same form owner (or
 * both with no form).
 */
function isSameRadioGroup(a: Element, b: Element): boolean {
  const name = radioNameOf(a);
  return (
    name != null &&
    name === radioNameOf(b) &&
    (a as HTMLInputElement).form === (b as HTMLInputElement).form
  );
}

/**
 * Drop the radios the browser skips for Tab, leaving every other element, and
 * each kept radio, at its own place. In a named group the browser stops only at
 * the focused radio, else the checked one; a group with nothing checked keeps
 * every radio, so a forward entry reaches its first and a backward entry its
 * last.
 *
 * Exported for menus that walk their own Tab stops (DropdownMenu's header and
 * footer), so they skip radios exactly as the focus region does.
 */
export function collapseRadioGroups(
  elements: HTMLElement[],
  active: Element | null,
): HTMLElement[] {
  return elements.filter(el => {
    if (radioNameOf(el) == null) {
      return true;
    }
    if (active != null && isSameRadioGroup(el, active)) {
      return el === active;
    }
    return (
      (el as HTMLInputElement).checked ||
      !elements.some(
        other =>
          isSameRadioGroup(el, other) && (other as HTMLInputElement).checked,
      )
    );
  });
}

/**
 * The document a trap lives in: its container's. An app that renders into a
 * same-origin iframe or a Document Picture-in-Picture window through a portal
 * puts the trap in that window's document, whose key presses and focus
 * changes never reach this module's global `document`.
 */
function trapDocument(container: HTMLElement | null): Document {
  return container?.ownerDocument ?? document;
}

/**
 * Whether node `a` comes before node `b` in document order.
 */
function precedes(a: Node, b: Node): boolean {
  return (
    (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  );
}

/**
 * Attempt to focus an element. Returns true if focus was successful.
 */
function attemptFocus(element: HTMLElement): boolean {
  try {
    element.focus();
  } catch {
    // Some elements may throw on focus
  }
  return element.ownerDocument.activeElement === element;
}

/**
 * Wrap focus to `target` for a Tab press, and cancel the press only when the
 * target took focus. A target the browser refuses (inert behind a modal
 * layered over this region) leaves the press to the browser instead of
 * stranding focus where it was.
 */
function wrapFocus(event: KeyboardEvent, target: HTMLElement): void {
  if (attemptFocus(target)) {
    event.preventDefault();
  }
}

/**
 * Focus the first focusable descendant of a container.
 * Returns true if a focusable element was found and focused.
 */
function focusFirstDescendant(container: HTMLElement): boolean {
  const focusable = getFocusableElements(container);
  for (const element of focusable) {
    if (attemptFocus(element)) {
      return true;
    }
  }
  return false;
}

/**
 * Focus the last focusable descendant of a container.
 * Returns true if a focusable element was found and focused.
 */
function focusLastDescendant(container: HTMLElement): boolean {
  const focusable = getFocusableElements(container);
  for (let i = focusable.length - 1; i >= 0; i--) {
    if (attemptFocus(focusable[i])) {
      return true;
    }
  }
  return false;
}

// Containers of the focus regions currently active, in every document. A Tab
// is answered by the innermost region that holds focus, so regions that nest
// in the DOM never fight over one key press.
const activeRegionContainers = new Set<HTMLElement>();

function hasInnerRegionHolding(
  container: HTMLElement,
  active: Element,
): boolean {
  // An open <dialog> nested in the region that holds focus is its own focus
  // context (a modal step over a covered sheet): it answers Tab, not us.
  const dialog = active.closest('dialog[open]');
  if (dialog != null && dialog !== container && container.contains(dialog)) {
    return true;
  }
  for (const other of activeRegionContainers) {
    if (
      other !== container &&
      container.contains(other) &&
      other.contains(active)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Tab containment for a focus region: Tab and Shift+Tab pressed inside wrap at
 * either end, and a Tab that starts outside is left to the page. When regions
 * nest, the innermost one holding focus answers.
 *
 * `useFocusTrap` composes this. Dialog, BottomSheet and Lightbox call it
 * directly, because their native lifecycle already owns focus entry and
 * return. Internal: not re-exported from `hooks`.
 */
export function useFocusRegionContainment(
  containerRef: React.RefObject<HTMLElement | null>,
  isActive: boolean,
): void {
  const lastFocusRef = useRef<Element | null>(null);
  // Track if focus change was triggered by keyboard (Tab key)
  const isKeyboardNavigationRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!isActive || container == null) {
      return;
    }
    activeRegionContainers.add(container);
    return () => {
      activeRegionContainers.delete(container);
    };
  }, [containerRef, isActive]);

  /**
   * Handle focus events - redirect focus back into container if it escapes.
   * Only redirects for keyboard navigation, not mouse clicks.
   */
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const doc = trapDocument(containerRef.current);

    const handleFocus = (event: FocusEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const target = event.target as Node;

      if (container.contains(target)) {
        // Focus is inside the container - track it
        lastFocusRef.current = target as Element;
      } else if (isKeyboardNavigationRef.current) {
        // Focus escaped via keyboard - redirect it back
        const focusedFirst = focusFirstDescendant(container);

        // If we're back at the same element (Shift+Tab from first element),
        // try focusing the last element instead
        if (focusedFirst && lastFocusRef.current === doc.activeElement) {
          focusLastDescendant(container);
        } else if (
          !focusedFirst &&
          isHTMLElement(lastFocusRef.current) &&
          container.contains(lastFocusRef.current)
        ) {
          // A modal surface may intentionally have no tabbable controls and
          // place initial focus on a tabIndex={-1} heading or panel. Preserve
          // that programmatic focus target instead of letting Tab escape.
          attemptFocus(lastFocusRef.current);
        }

        lastFocusRef.current = doc.activeElement;
      }
      // If focus escaped via mouse click, don't redirect - let light dismiss handle it

      // Reset keyboard navigation flag
      isKeyboardNavigationRef.current = false;
    };

    // Use capture phase to intercept focus before it settles
    doc.addEventListener('focus', handleFocus, true);

    return () => {
      doc.removeEventListener('focus', handleFocus, true);
    };
  }, [containerRef, isActive]);

  /**
   * Handle Tab key to wrap focus at boundaries. Also tracks that keyboard
   * navigation is occurring.
   *
   * No Escape here, and no IME guard: the shared layer dismissal stack owns
   * that press, and each surface that applies a region decides its own
   * dismissal (`useFocusTrap` through its `onEscape`).
   */
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const doc = trapDocument(containerRef.current);

    const handleKeyDown = (event: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      if (event.key === 'Tab') {
        if (event.defaultPrevented) {
          // A control that handles Tab itself (an editor that indents) keeps
          // focus where it is.
          return;
        }
        const active = doc.activeElement;
        // Any focused node counts, not only HTML elements: an SVG control
        // inside the container is still inside.
        if (active == null || !container.contains(active)) {
          // The trap contains focus that is inside it; it does not pull in a
          // Tab pressed elsewhere on the page. A layer can be open while focus
          // legitimately sits outside it — a listbox popup anchored to its own
          // input, a non-modal popover beside the content it annotates — and
          // capturing that Tab would take the rest of the page away from
          // keyboard users.
          return;
        }

        if (hasInnerRegionHolding(container, active)) {
          // A region nested in this one (a Dialog opened from a Dialog, a
          // Popover inside a Drawer) holds focus; that region answers Tab.
          return;
        }

        // Mark that keyboard navigation is leaving from inside the trap, so a
        // focus that lands outside is redirected back in.
        isKeyboardNavigationRef.current = true;

        const focusable = getFocusableElements(container);
        if (focusable.length === 0) {
          // There is nowhere to advance to. Keep focus on the current
          // programmatic target (for example a dialog panel with tabIndex=-1)
          // rather than allowing the browser to move into background content.
          event.preventDefault();
          lastFocusRef.current = active;
          isKeyboardNavigationRef.current = false;
          return;
        }

        // jsdom groups a selector list by selector, not in document order.
        const stops = collapseRadioGroups(
          [...focusable].sort((a, b) => (precedes(a, b) ? -1 : 1)),
          active,
        );
        const first = stops[0];
        const last = stops[stops.length - 1];

        if (doc.activeElement === container) {
          // Programmatic initial focus can sit on the trap container itself
          // (for example a dialog panel with no content controls). Move into
          // the tabbable cycle instead of letting Tab escape to the page.
          wrapFocus(event, event.shiftKey ? last : first);
          return;
        }

        // Programmatic focus can also sit on an element that is not a Tab stop
        // (a dialog title with tabIndex -1). Its place in document order
        // decides the edge: nothing tabbable before it means Shift+Tab is
        // leaving the region, nothing after it means Tab is.
        const isProgrammaticStop = !(focusable as Element[]).includes(active);
        if (event.shiftKey) {
          // Shift+Tab: if on (or before) the first element, wrap to last
          if (
            active === first ||
            (isProgrammaticStop && precedes(active, first))
          ) {
            wrapFocus(event, last);
          }
        } else {
          // Tab: if on (or after) the last element, wrap to first
          if (
            active === last ||
            (isProgrammaticStop && precedes(last, active))
          ) {
            wrapFocus(event, first);
          }
        }
      }
    };

    doc.addEventListener('keydown', handleKeyDown);

    return () => {
      doc.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, isActive]);
}

/**
 * Configuration for focus trap behavior
 */
export interface UseFocusTrapOptions {
  /**
   * Whether the focus trap is currently active.
   */
  isActive: boolean;

  /**
   * Callback when Escape key is pressed.
   */
  onEscape?: () => void;
}

/**
 * Return type for useFocusTrap hook
 */
export interface UseFocusTrapReturn<T extends HTMLElement = HTMLElement> {
  /**
   * Ref to attach to the container element that should trap focus.
   */
  containerRef: React.RefObject<T | null>;

  /**
   * Focus the first focusable element in the container.
   */
  focusFirst: () => void;
}

/**
 * Hook for trapping focus within a container element.
 *
 * Implements the WAI-ARIA dialog focus trap pattern:
 * - Listens to focus events on the container's document
 * - Redirects focus back into the container if it escapes
 * - Handles both Tab and Shift+Tab navigation
 * - Restores focus to the element that was focused before activation when the
 *   trap deactivates or unmounts, unless focus was already moved elsewhere
 *   (so consumers that restore focus themselves are unaffected) or focus
 *   never entered the trap (so popups that keep focus on their trigger, like
 *   comboboxes, are unaffected)
 *
 * @example
 * ```
 * const {containerRef, focusFirst} = useFocusTrap({
 *   isActive: isOpen,
 *   onEscape: () => setIsOpen(false),
 * });
 *
 * useEffect(() => {
 *   if (isOpen) {
 *     focusFirst();
 *   }
 * }, [isOpen, focusFirst]);
 *
 * <div ref={containerRef}>
 *   <button>First</button>
 *   <button>Last</button>
 * </div>
 * ```
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  options: UseFocusTrapOptions,
): UseFocusTrapReturn<T> {
  return useFocusTrapInternal<T>(options);
}

/**
 * Package-internal options. Not re-exported from the package entry point.
 */
interface InternalFocusTrapOptions extends UseFocusTrapOptions {
  /**
   * The element to restore focus to on deactivation, read at activation. For
   * an overlay that may move focus inside before the trap activates (initial
   * focus within the opening event), the element focused at activation is
   * already inside, so the overlay names its opener instead. Returning `null`
   * falls back to the element focused at activation.
   */
  getRestoreTarget?: () => HTMLElement | null;
  /**
   * A component's own stand-in for an opener that is gone, read at
   * deactivation. It comes after the opener and its trigger in the shared
   * return chain.
   */
  getRestoreFallback?: () => HTMLElement | null;
  /**
   * Moves focus to the element the trap returns to, in place of the shared
   * move, so the caller knows which focus is the return.
   */
  restoreFocusTo?: (element: HTMLElement) => void;
  /** The overlay's trigger now, for an opener that remounted. */
  getTrigger?: () => HTMLElement | null;
  /** The overlay's anchor now, when it is not the trigger. */
  getAnchor?: () => Element | null;
  /** The id the trigger's `aria-controls` names. */
  layerId?: string;
  /**
   * Whether Tab and Shift+Tab cycle inside the container while it is active.
   * A non-modal overlay leaves Tab to the page's own order.
   * @default true
   */
  isContaining?: boolean;
  /**
   * Whether the overlay takes an Escape press now, asked at press time. A
   * non-modal overlay takes Escape only while it holds focus; otherwise the
   * press passes to the layer or page beneath.
   */
  isEscapeInScope?: () => boolean;
}

export interface InternalFocusTrapReturn<
  T extends HTMLElement = HTMLElement,
> extends UseFocusTrapReturn<T> {
  /**
   * Runs the focus return now, as the overlay starts to close and while it
   * still holds focus. Deactivation then has nothing left to do.
   */
  returnFocus: () => void;
}

export function useFocusTrapInternal<T extends HTMLElement = HTMLElement>(
  options: InternalFocusTrapOptions,
): InternalFocusTrapReturn<T> {
  const {
    isActive,
    onEscape,
    getRestoreTarget,
    getRestoreFallback,
    restoreFocusTo,
    getTrigger,
    getAnchor,
    layerId,
    isContaining = true,
    isEscapeInScope,
  } = options;
  const getRestoreTargetRef = useRef(getRestoreTarget);
  getRestoreTargetRef.current = getRestoreTarget;
  const getRestoreFallbackRef = useRef(getRestoreFallback);
  getRestoreFallbackRef.current = getRestoreFallback;
  const restoreFocusToRef = useRef(restoreFocusTo);
  restoreFocusToRef.current = restoreFocusTo;
  const getTriggerRef = useRef(getTrigger);
  getTriggerRef.current = getTrigger;
  const getAnchorRef = useRef(getAnchor);
  getAnchorRef.current = getAnchor;
  const layerIdRef = useRef(layerId);
  layerIdRef.current = layerId;

  const containerRef = useRef<T | null>(null);

  // Tab and Shift+Tab wrap inside the container while the trap is active and
  // containing.
  useFocusRegionContainment(containerRef, isActive && isContaining);

  // Join the shared layer dismissal stack. The trap no longer listens for
  // Escape itself: the stack owns one listener and routes each press to the
  // top-most layer, so a popover inside a Dialog, a submenu inside a menu, and
  // a modal inside a modal all peel off one at a time. A trap with no
  // `onEscape` is not dismissible and stays off the stack, so a press flows
  // past it to whatever is underneath.
  // One expression drives both the stack registration and the deprecated
  // `hasActiveFocusTrapEscape` count, so the two can never disagree about
  // whether this trap is active.
  const isEscapeTrap = isActive && onEscape != null;

  useLayerDismissal({
    isActive: isEscapeTrap,
    onDismiss: () => {
      onEscape?.();
    },
    // The trap renders nothing, so it cannot push a depth provider around its
    // content; hand the stack the container instead so two DOM-nested traps
    // still resolve in the right order.
    getContainer: () => containerRef.current,
    isPresent: isEscapeInScope,
  });

  useFocusTrapEscapeCompatibilitySignal(isEscapeTrap);

  /**
   * Focus the first focusable element.
   */
  const focusFirst = useCallback(() => {
    if (containerRef.current) {
      focusFirstDescendant(containerRef.current);
    }
  }, []);

  /**
   * The shared layer focus return (`utils/focusReturn`). Activation records
   * the opener and its stand-ins; deactivation, or an earlier `returnFocus`,
   * returns focus that the close would strand. Overlays are opened
   * imperatively (`showPopover()`), and the browser restores focus only for
   * an auto popover whose opener is still there, so the trap owns the return.
   * Focus that never entered the container (a listbox popup that keeps focus
   * on its input) or that already left it is not moved.
   */
  const recordRef = useRef<LayerFocusRecord | null>(null);
  useEffect(() => {
    if (!isActive) {
      return;
    }
    const container = containerRef.current;
    const record = trackLayerFocus({
      getLayer: () => containerRef.current ?? container,
      opener: getRestoreTargetRef.current?.() ?? null,
      getTrigger: () => getTriggerRef.current?.() ?? null,
      getRestoreFallback: () => getRestoreFallbackRef.current?.() ?? null,
      getAnchor: () => getAnchorRef.current?.() ?? null,
      layerId: layerIdRef.current ?? null,
      focus:
        restoreFocusToRef.current == null
          ? undefined
          : element => restoreFocusToRef.current?.(element),
      doc: container?.ownerDocument,
    });
    recordRef.current = record;
    const repairOnRemoval =
      container == null ? null : prepareFocusRepairOnRemoval(container);
    return () => {
      recordRef.current = null;
      if (record.isDone) {
        return;
      }
      if (container == null || container.isConnected) {
        restoreLayerFocus(record);
        cancelLayerFocus(record);
        return;
      }
      // Removed while active, as with its owner or its whole view. An
      // opener still on the page takes focus at once. Otherwise the return
      // waits until the removal is done, so it never lands on an element the
      // same removal is taking away.
      if (restoreLayerFocus(record, {isOpenerOnly: true})) {
        return;
      }
      repairOnRemoval?.(() => {
        restoreLayerFocus(record, {warnsWhenNothingQualifies: false});
      });
      queueMicrotask(() => cancelLayerFocus(record));
    };
  }, [isActive]);

  const returnFocus = useCallback(() => {
    const record = recordRef.current;
    if (record != null) {
      restoreLayerFocus(record);
    }
  }, []);

  return {
    containerRef,
    focusFirst,
    returnFocus,
  };
}
