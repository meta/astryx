// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file haptics.ts
 * @input A feedback kind, or a label element a real finger will tap
 * @output Exports playHaptic (vibration where the platform has it),
 *   attachTapHaptic (iOS Safari's tap-moment light impact) and the support
 *   probes
 * @position Haptics of packages/core/src/gestures; the kinds and the
 *   vibration patterns live in the constants table (motion/uikit/gestures.ts)
 *
 * The web has one haptics API, `navigator.vibrate`, and iOS Safari does not
 * implement it. iOS Safari does play a haptic in exactly one place: when a
 * REAL tap toggles an `<input type="checkbox" switch>`, by landing on the
 * switch or on a `<label>` tied to it (and during a native drag-flip of the
 * switch). That haptic is UIImpactFeedbackGenerator(.light). WebKit requires
 * a user gesture AND a trusted event for it: a `label.click()` from script
 * does not play it (WebKit bug 309082, May 2026), so nothing can fire a
 * haptic later from JavaScript, and mid-drag haptics (detent snaps, picker
 * ticks) cannot exist in iOS Safari.
 *
 * So there are two tools:
 *
 * - `attachTapHaptic(label)` puts a visually hidden switch inside a label the
 *   control renders as its tap target: every real tap on the label plays the
 *   light impact at the moment of the tap. The switch itself never takes the
 *   touch (`pointer-events: none`; WebKit marks a switch's `touchstart`
 *   handled, which would stop a pan starting on it from scrolling the page),
 *   and its own events never reach the page.
 * - `playHaptic(kind)` vibrates where `navigator.vibrate` exists (Android
 *   browsers) with the kind's pattern, and does nothing elsewhere.
 *
 * UIKit's haptics follow the system setting, not Reduce Motion, so neither
 * tool consults `prefers-reduced-motion`.
 */

import {
  HAPTIC_VIBRATION_PATTERNS,
  type HapticFeedbackKind,
} from '../motion/uikit/gestures';

/** Marks the hidden switch, so click handlers can recognize and ignore it. */
export const HAPTIC_SWITCH_ATTRIBUTE = 'data-astryx-haptic-switch';

/** Whether this browser vibrates at all. */
export function canVibrate(): boolean {
  return (
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  );
}

/** Whether this browser knows the switch control (Safari 17.4 and later). */
export function supportsSwitchControl(doc?: Document): boolean {
  const target = doc ?? (typeof document === 'undefined' ? null : document);
  if (target == null) {
    return false;
  }
  const input = target.createElement('input');
  input.type = 'checkbox';
  return 'switch' in input;
}

/**
 * Vibrate for a feedback kind where `navigator.vibrate` exists. Returns
 * whether anything was played. Never plays on iOS, which has no vibration
 * API; use `attachTapHaptic` for the tap moment there.
 */
export function playHaptic(kind: HapticFeedbackKind): boolean {
  if (!canVibrate()) {
    return false;
  }
  return navigator.vibrate([...HAPTIC_VIBRATION_PATTERNS[kind].value]);
}

const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;' +
  'overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;' +
  'opacity:0;pointer-events:none;';

let nextLabelId = 0;

/** A native disabled control, or one marked `aria-disabled`. */
function isDisabledControl(control: HTMLElement): boolean {
  return (
    control.matches(':disabled') ||
    control.getAttribute('aria-disabled') === 'true'
  );
}

/** Whether `input` is a switch checkbox, which plays the tap haptic itself. */
function isSwitch(input: HTMLInputElement): boolean {
  return input.type === 'checkbox' && input.hasAttribute('switch');
}

function swallow(event: Event): void {
  event.stopPropagation();
}

/**
 * Make every real tap on `label` play iOS Safari's light impact, by giving it
 * a hidden switch to toggle. Returns a function that removes the switch.
 * Harmless where switches have no haptics.
 *
 * - The switch never keeps the focus: where a label's activation focuses
 *   its control (Chromium), the focus goes on to the label's own control,
 *   or back where it was, so it never lands on an `aria-hidden` element.
 * - A label that already has a control keeps it: the switch takes the
 *   label's activation (it goes first) and hands the click on to that
 *   control, so the tap plays and the control still toggles. The control
 *   keeps its name too: while the switch is attached it is labelled by the
 *   label through `aria-labelledby`, unless it already names itself. A control
 *   that is itself a switch plays on its own, and a label tied to its
 *   control by `for` cannot be given a second one: both are left as they
 *   are.
 */
export function attachTapHaptic(label: HTMLLabelElement): () => void {
  const existing = label.control;
  if (
    (existing instanceof HTMLInputElement && isSwitch(existing)) ||
    (existing != null && label.htmlFor !== '')
  ) {
    return () => {};
  }
  const doc = label.ownerDocument;
  const input = doc.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.setAttribute(HAPTIC_SWITCH_ATTRIBUTE, '');
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  input.style.cssText = VISUALLY_HIDDEN;
  // The label's activation clicks the switch, and that click would bubble
  // through the control as a second click: keep it, and the switch's
  // change events, inside. A label with a control of its own gets that
  // click handed on, so the control still toggles.
  // A disabled control gives no feedback (spec:AST-094 FR23): its label's
  // activation neither toggles the switch, so nothing plays, nor reaches
  // the control.
  const onClick = (event: Event) => {
    event.stopPropagation();
    if (existing != null && isDisabledControl(existing)) {
      event.preventDefault();
      return;
    }
    existing?.click();
  };
  const onFocus = (event: FocusEvent) => {
    const previous = event.relatedTarget;
    if (
      existing instanceof HTMLElement &&
      existing.tabIndex >= 0 &&
      !isDisabledControl(existing)
    ) {
      existing.focus({preventScroll: true});
    }
    if (doc.activeElement !== input) {
      return;
    }
    if (previous instanceof HTMLElement && previous.isConnected) {
      previous.focus({preventScroll: true});
    }
    if (doc.activeElement === input) {
      input.blur();
    }
  };
  input.addEventListener('click', onClick);
  input.addEventListener('change', swallow);
  input.addEventListener('input', swallow);
  input.addEventListener('focus', onFocus);
  // The switch becomes the label's control, so the control the label named
  // is named through `aria-labelledby` instead (the switch is aria-hidden,
  // so the label's text is the name).
  let labelledControl: HTMLElement | null = null;
  let addedLabelId = false;
  if (existing != null) {
    label.prepend(input);
    if (
      existing instanceof HTMLElement &&
      !existing.hasAttribute('aria-labelledby') &&
      !existing.hasAttribute('aria-label')
    ) {
      if (label.id === '') {
        label.id = `astryx-haptic-label-${(nextLabelId += 1)}`;
        addedLabelId = true;
      }
      existing.setAttribute('aria-labelledby', label.id);
      labelledControl = existing;
    }
  } else {
    label.appendChild(input);
  }
  return () => {
    labelledControl?.removeAttribute('aria-labelledby');
    if (addedLabelId) {
      label.removeAttribute('id');
    }
    input.removeEventListener('click', onClick);
    input.removeEventListener('change', swallow);
    input.removeEventListener('input', swallow);
    input.removeEventListener('focus', onFocus);
    input.remove();
  };
}
