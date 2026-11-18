// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyboardLayoutGuide.ts
 * @input The keyboard module's reports (subscribeKeyboardHeight) and
 *   createKeyboardModel
 * @output getKeyboardLayoutGuide (a window's one guide), bringsUpKeyboard and
 *   the KeyboardLayoutGuide type
 * @position The web's UIKeyboardLayoutGuide: where the software keyboard
 *   covers the layout viewport and how it moves. Touch presentations read it
 *   to keep content above the keyboard. It is internal to core.
 *
 * SYNC: When modified, update /packages/core/src/keyboard/README.md
 */

import {
  getKeyboardHeight,
  hasVirtualKeyboard,
  isTextEntryControl,
  subscribeKeyboardHeight,
  type KeyboardHeightEvent,
} from './keyboardHeight';
import {
  createKeyboardModel,
  type KeyboardModel,
  type KeyboardProfile,
  type KeyboardTransition,
} from './keyboardModel';
import {sharedWeakMap} from '../utils/sharedRealm';

/**
 * Whose keyboard schedule the guide reads: `chromium` where the browser has
 * the VirtualKeyboard API, else null. Without the profile, no surface rides
 * the guide. Chrome reports the keyboard as each slide starts. The profile is
 * a capability, never the user agent. motion/android/keyboard.ts holds the
 * measured timing.
 */
export function keyboardProfileOf(win: Window): KeyboardProfile | null {
  return hasVirtualKeyboard(win) ? 'chromium' : null;
}

/** A window's keyboard layout guide. */
export interface KeyboardLayoutGuide {
  /** The inset the keyboard rests at (or is heading to), CSS px. */
  readonly inset: number;
  /** The latest transition. */
  readonly transition: KeyboardTransition;
  /** The inset presented at `time` (default now), CSS px. */
  presentation(time?: number): number;
  /**
   * Calls `listener` with every transition, inside the event that revealed
   * it, until the caller runs the returned function.
   */
  subscribe(listener: (transition: KeyboardTransition) => void): () => void;
  /** Whose keyboard schedule the guide reads (keyboardProfileOf). */
  readonly profile: KeyboardProfile | null;
}

// Extra time after a predicted transition's end before checking it.
const VERIFY_SLACK_MS = 150;
// How long after a field gains focus Chrome may still report the keyboard
// gone for a moment (measured: back within 50 ms of the move).
const FOCUS_HANDOFF_MS = 150;

// Controls whose picker Chrome on Android opens over the page while the
// keyboard goes away; on iOS the picker takes the keyboard's place.
const PICKER_INPUT_TYPES = new Set([
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
]);

/**
 * Whether focusing `target` brings up a software keyboard (or another input
 * view in its place, as a select's picker does).
 */
export function bringsUpKeyboard(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  return (
    isTextEntryControl(element) ||
    (element instanceof HTMLSelectElement && !element.disabled)
  );
}

// Whether `target` is a select, or a date or time field, which Chrome on
// Android edits in a picker over the page.
function opensPickerOverPage(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (element == null || element.nodeType !== 1) {
    return false;
  }
  return (
    element.tagName === 'SELECT' ||
    (element.tagName === 'INPUT' &&
      PICKER_INPUT_TYPES.has((element as HTMLInputElement).type))
  );
}

/**
 * Whether `target` can hold a field the page cannot see: a frame, an open
 * shadow host or a custom element. Focus on a field inside one leaves
 * `document.activeElement` on it.
 */
export function hidesField(target: Element): boolean {
  return (
    target.tagName === 'IFRAME' ||
    target.tagName === 'FRAME' ||
    target.tagName === 'OBJECT' ||
    target.tagName === 'EMBED' ||
    target.shadowRoot != null ||
    target.tagName.includes('-')
  );
}

const guides = sharedWeakMap<Window, KeyboardLayoutGuide>(
  'keyboard/keyboard-layout-guide/guides',
  1,
);

/**
 * The window's keyboard layout guide, created on first use.
 *
 * One guide serves each window. It subscribes to the keyboard module only
 * while something subscribes to it. It owns no listener and measures nothing.
 * It feeds the model the module's reports, the keyboard height and the focus
 * changes that start a hide. It hands each transition to its subscribers.
 * What it adds is timing: when a show started, a hide predicted from the
 * blur, and the motion in between. Layout follows the keyboard height
 * itself, and the guide's transitions only time the optional ride on top.
 *
 * The model reads Chrome's measured schedule: Chrome reports each slide just
 * after it starts. A surface rides the guide only where the VirtualKeyboard
 * API reports the keyboard. Focus can move from one field to another through
 * something that brings no keyboard, such as a popover's container. Chrome
 * then reports the keyboard gone for a moment and then back. So a hide
 * reported while a field that just got focus still has it waits until the
 * move settles.
 *
 * A busy page reads Chrome's reports late, after Gboard's slide. So once a
 * hide predicted from a blur is under way, a report of the keyboard partway
 * down, or still up, starts nothing. Only the report of the keyboard gone
 * confirms the hide. Focus that comes back still turns it around. Focus in a
 * frame, an open shadow host or a custom element can keep up a keyboard the
 * guide cannot see. There the viewport decides, as before. A closed shadow
 * root on a built-in element reads as nothing focused.
 *
 * @example
 * ```
 * const guide = getKeyboardLayoutGuide(window);
 * const unsubscribe = guide.subscribe(t => {
 *   rideKeyboard(animator, {y: -t.to}, t);
 * });
 * ```
 */
export function getKeyboardLayoutGuide(win: Window): KeyboardLayoutGuide {
  let guide = guides.get(win);
  if (guide == null) {
    guide = createGuide(win);
    guides.set(win, guide);
  }
  return guide;
}

function createGuide(win: Window): KeyboardLayoutGuide {
  const listeners = new Set<(transition: KeyboardTransition) => void>();
  let profile = keyboardProfileOf(win);
  let model: KeyboardModel = createKeyboardModel(getKeyboardHeight(win));
  let verifyTimer: ReturnType<typeof setTimeout> | null = null;
  let detach: (() => void) | null = null;
  // Whether focusing `target` keeps an input view where the keyboard is. On
  // iOS, a select's picker or a date or time field's picker takes the
  // keyboard's place. Chrome on Android opens it over the page, and the
  // keyboard goes away.
  const keepsInputView = (target: EventTarget | null): boolean =>
    bringsUpKeyboard(target) &&
    !(profile === 'chromium' && opensPickerOverPage(target));
  // Whether a hide predicted from a blur is under way with nothing focused
  // that can keep a keyboard up. Then only Chrome's report of the keyboard
  // gone counts.
  const awaitsHide = (): boolean => {
    const active = win.document.activeElement;
    return (
      model.transition.kind === 'hide' &&
      model.transition.predicted &&
      !keepsInputView(active) &&
      !(active != null && hidesField(active))
    );
  };

  const publish = (transition: KeyboardTransition | null) => {
    if (transition == null) {
      return;
    }
    if (transition.predicted) {
      scheduleVerify(transition);
    }
    for (const listener of [...listeners]) {
      listener(transition);
    }
  };
  const scheduleVerify = (transition: KeyboardTransition) => {
    if (verifyTimer != null) {
      clearTimeout(verifyTimer);
    }
    const due =
      transition.start + (transition.curve?.durationMs ?? 0) + VERIFY_SLACK_MS;
    verifyTimer = setTimeout(
      () => {
        verifyTimer = null;
        const inset = getKeyboardHeight(win);
        if (inset != null && inset > 0.5 && awaitsHide()) {
          return;
        }
        publish(model.verify(inset, win.performance.now()));
      },
      Math.max(0, due - win.performance.now()),
    );
  };

  const attach = () => {
    profile = keyboardProfileOf(win);
    model = createKeyboardModel(getKeyboardHeight(win));
    // When a field that brings up a keyboard last gained focus.
    let keyboardFocusAt = -Infinity;
    let handoffTimer: ReturnType<typeof setTimeout> | null = null;
    const report = (
      height: number,
      time: number,
    ): KeyboardTransition | null => {
      if (handoffTimer != null) {
        clearTimeout(handoffTimer);
        handoffTimer = null;
      }
      const settled = keyboardFocusAt + FOCUS_HANDOFF_MS;
      if (
        profile === 'chromium' &&
        height < 0.5 &&
        model.inset >= 0.5 &&
        time < settled &&
        keepsInputView(win.document.activeElement)
      ) {
        // Focus just moved to another field: Chrome reports the keyboard
        // gone before it reports it back. Hold the hide until the move
        // settles, then believe whatever the keyboard is doing.
        handoffTimer = setTimeout(() => {
          handoffTimer = null;
          publish(model.report(getKeyboardHeight(win), settled));
        }, settled - time);
        return null;
      }
      if (height > 0.5 && awaitsHide()) {
        return null;
      }
      return model.report(height, time);
    };
    const onReport = (event: KeyboardHeightEvent) => {
      if (event.type === 'viewport') {
        publish(report(event.height, event.timeStamp));
      } else if (event.type === 'focusin') {
        if (keepsInputView(event.target)) {
          keyboardFocusAt = event.timeStamp;
          publish(model.focused(event.timeStamp));
        }
      } else if (
        keepsInputView(event.target) &&
        !keepsInputView(event.relatedTarget)
      ) {
        publish(model.blurred(event.timeStamp));
      }
    };
    const unsubscribe = subscribeKeyboardHeight(win, onReport, {focus: true});
    return () => {
      unsubscribe();
      if (handoffTimer != null) {
        clearTimeout(handoffTimer);
        handoffTimer = null;
      }
      if (verifyTimer != null) {
        clearTimeout(verifyTimer);
        verifyTimer = null;
      }
    };
  };

  return {
    get profile() {
      return profile;
    },
    get inset() {
      return model.inset;
    },
    get transition() {
      return model.transition;
    },
    presentation(time = win.performance.now()) {
      return model.presentation(time);
    },
    subscribe(listener) {
      listeners.add(listener);
      if (detach == null) {
        detach = attach();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && detach != null) {
          detach();
          detach = null;
        }
      };
    },
  };
}
