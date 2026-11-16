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
  type KeyboardCurveSchedule,
} from './keyboardModel';
import {sharedState, sharedWeakMap} from '../utils/sharedRealm';

/**
 * The rules a keyboard schedule gives the guide for focus that moves to a
 * field the page cannot see.
 */
export interface KeyboardFocusRules {
  /** Focus moved: true when the focused element may keep a keyboard up. */
  readonly focused: () => boolean;
  /**
   * A field lost focus to `next` at `blurAt`: true when the rules decide the
   * hide later, through the guide's `hide`.
   */
  readonly blurred: (next: EventTarget | null, blurAt: number) => boolean;
  /** Stops anything the rules wait for. */
  readonly dispose: () => void;
}

/** The guide's own field check, which a schedule's focus rules use. */
export interface KeyboardFocusChecks {
  readonly hidesField: (target: Element) => boolean;
}

/**
 * Safari on iOS's keyboard schedule, with the windows it applies to and the
 * focus rules the guide follows under it.
 */
export interface UIKitKeyboardSchedule extends KeyboardCurveSchedule {
  readonly appliesTo: (win: Window) => boolean;
  readonly focusRules: (
    win: Window,
    hide: (blurAt: number) => void,
    checks: KeyboardFocusChecks,
  ) => KeyboardFocusRules;
}

// Where the guide reads Safari on iOS's schedule. The touch runtime publishes
// the schedule, and a keyboard rider registers this reader as it attaches
// (keyboardTarget.ts).
const uikit = sharedState(
  'keyboard/keyboard-layout-guide/uikit-schedule',
  2,
  (): {read: (() => UIKitKeyboardSchedule | null) | null} => ({read: null}),
);

/**
 * Registers how the guide reads Safari on iOS's keyboard schedule; null
 * forgets it. Until the reader returns a schedule, no surface rides the
 * keyboard in Safari on iOS, as before the ride.
 */
export function registerUIKitKeyboardSchedule(
  read: (() => UIKitKeyboardSchedule | null) | null,
): void {
  uikit.read = read;
}

const uikitScheduleOf = (): UIKitKeyboardSchedule | null =>
  uikit.read?.() ?? null;

/**
 * Whose keyboard schedule the guide reads. `chromium`: the browser has the
 * VirtualKeyboard API. `uikit`: Safari on iOS or iPadOS, once the touch
 * runtime gives the guide UIKit's schedule. Otherwise null. Without the
 * profile, no surface rides the guide. Chrome reports the keyboard as each
 * slide starts, and Safari reports its show as UIKit's keyboard starts up.
 * The profile is a capability, never the user agent.
 */
export function keyboardProfileOf(win: Window): KeyboardProfile | null {
  if (hasVirtualKeyboard(win)) {
    return 'chromium';
  }
  return uikitScheduleOf()?.appliesTo(win) === true ? 'uikit' : null;
}

// The schedule the guide's model reads under `profile`. Chrome's is the
// model's own.
const scheduleOf = (profile: KeyboardProfile | null) =>
  profile === 'uikit' ? (uikitScheduleOf() ?? undefined) : undefined;

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
 * The model reads the profile's schedule. Chrome reports each slide just
 * after it starts, and Safari reports its show as UIKit's keyboard starts
 * up. A surface rides the guide only where it has a profile. Focus can move
 * from one field to another through something that brings no keyboard, such
 * as a popover's container. Chrome then reports the keyboard gone for a
 * moment and then back. So a hide reported while a field that just got focus
 * still has it waits until the move settles.
 *
 * A busy page reads Chrome's reports late, after Gboard's slide. So once a
 * hide predicted from a blur is under way, a report of the keyboard partway
 * down, or still up, starts nothing. Only the report of the keyboard gone
 * confirms the hide. Focus that comes back still turns it around. A field in
 * a frame, an open shadow host or a custom element can keep up a keyboard
 * the guide cannot see. So focus that moves there predicts no hide, and the
 * report decides. A closed shadow root on a built-in element reads as
 * nothing focused.
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
  let model: KeyboardModel = createKeyboardModel(
    getKeyboardHeight(win),
    scheduleOf(profile),
  );
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
    let rules: KeyboardFocusRules | null = null;
    let synced = false;
    // The schedule follows the profile, which changes once the touch runtime
    // registers UIKit's schedule.
    const sync = () => {
      const next = keyboardProfileOf(win);
      if (synced && next === profile) {
        return;
      }
      synced = true;
      profile = next;
      model = createKeyboardModel(getKeyboardHeight(win), scheduleOf(profile));
      rules?.dispose();
      rules =
        profile === 'uikit'
          ? (uikitScheduleOf()?.focusRules(
              win,
              blurAt => publish(model.blurred(blurAt)),
              {hidesField},
            ) ?? null)
          : null;
    };
    sync();
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
      sync();
      if (event.type === 'viewport') {
        publish(report(event.height, event.timeStamp));
      } else if (event.type === 'focusin') {
        const keeps = rules?.focused() ?? false;
        if (keepsInputView(event.target)) {
          keyboardFocusAt = event.timeStamp;
          publish(model.focused(event.timeStamp));
        } else if (keeps) {
          publish(model.focused(event.timeStamp));
        }
      } else if (
        keepsInputView(event.target) &&
        !keepsInputView(event.relatedTarget) &&
        rules?.blurred(event.relatedTarget, event.timeStamp) !== true
      ) {
        publish(model.blurred(event.timeStamp));
      }
    };
    const unsubscribe = subscribeKeyboardHeight(win, onReport, {focus: true});
    return () => {
      unsubscribe();
      rules?.dispose();
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
