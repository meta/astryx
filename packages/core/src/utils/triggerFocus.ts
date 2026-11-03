// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file triggerFocus.ts
 * @input A focus event on a hover-layer trigger and its focusTrigger value
 * @output Whether that focus counts as focus on the trigger, and a gate that
 *   remembers it for the matching blur
 * @position Shared focus-trigger judgement for Tooltip and HoverCard
 */

/** When focus on a trigger opens its layer. */
export type TriggerFocusMode = 'auto' | 'always' | 'never';

/** Whether `element` is in the tab order or naturally focusable. */
export function isFocusableTrigger(element: HTMLElement): boolean {
  if (element.hasAttribute('tabindex')) {
    return element.tabIndex >= 0;
  }
  const focusableTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
  if (focusableTags.includes(element.tagName)) {
    return !(element as HTMLButtonElement).disabled;
  }
  return element.isContentEditable;
}

/**
 * Whether a focus event on a trigger (its `currentTarget`) counts as focus on
 * the trigger.
 *
 * Under `auto` it is decided when focus arrives, not when listeners attach: a
 * roving-tabindex member that was `tabindex="-1"` then can be the tab stop
 * now. A trigger that receives focus is focusable by definition, which covers
 * focusable elements this check does not list, such as a `<summary>` or an SVG
 * link. Focus inside the trigger counts only while the trigger is focusable
 * too, so a plain wrapper ignores its children's focus.
 */
export function isFocusForTrigger(
  event: Event,
  mode: TriggerFocusMode,
): boolean {
  if (mode === 'always') {
    return true;
  }
  if (mode === 'never') {
    return false;
  }
  const trigger = event.currentTarget as HTMLElement | null;
  return (
    trigger != null && (event.target === trigger || isFocusableTrigger(trigger))
  );
}

/** Remembers whether a trigger's current focus counted when it arrived. */
export interface TriggerFocusGate {
  /** On focusin: whether this focus opens the layer. */
  focusIn(event: Event, mode: TriggerFocusMode): boolean;
  /**
   * On focusout: whether this blur closes the layer. A focus that counted
   * closes on blur even if the trigger has since left the tab order.
   */
  focusOut(event: Event, mode: TriggerFocusMode): boolean;
}

/** A gate for one trigger; each hook keeps one for its lifetime. */
export function createTriggerFocusGate(): TriggerFocusGate {
  let isCounted = false;
  return {
    focusIn(event, mode) {
      isCounted = isFocusForTrigger(event, mode);
      return isCounted;
    },
    focusOut(event, mode) {
      if (!isCounted && !isFocusForTrigger(event, mode)) {
        return false;
      }
      isCounted = false;
      return true;
    },
  };
}
