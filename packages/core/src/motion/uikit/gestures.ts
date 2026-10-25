// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file gestures.ts
 * @input Nothing: plain data
 * @output Exports UIKIT_GESTURES, the gesture thresholds gesture recognizers
 *   read, each with where the number comes from, and the
 *   GestureConstant type that carries a value and its source
 * @position Gesture half of the UIKit constants table. Springs, scroll
 *   physics and timing live beside it in this folder; no component carries a
 *   gesture number of its own.
 *
 * Units are CSS pixels and milliseconds. On a phone with
 * `width=device-width`, one CSS pixel is one UIKit point, so a UIKit distance
 * in points is the same number here.
 *
 * Every entry is either SOURCED (Apple documentation, a WWDC session, or a
 * measurement of a real UIKit app on the iOS simulator, named with the app,
 * the iOS version and the method) or a GUESS. A guess says what it rests on
 * and what to measure to replace it; `gestures.test.ts` fails if an entry
 * carries neither. The table's shared rules hold here too (uikit.test.ts): a
 * source starts with its kind (`apple-docs <URL>`, `wwdc <year>-<session>`,
 * `webkit Source/…`, `measured: …`), and a guess's `measure` starts with
 * the ID of its row in ../MEASUREMENTS.md. The press clocks are the same
 * entries as `scroll.delaysContentTouchesMs` and `timing.press`, read from
 * there. Safari on iOS runs UIKit's own recognizers for
 * tap-to-click, long press, double tap and the start of a page scroll, so
 * many guesses can be settled by measuring Safari itself.
 *
 * SYNC: When modified, update packages/core/src/motion/uikit/gestures.test.ts
 * and the thresholds packages/core/src/gestures/README.md describes.
 */

import {scroll} from './scroll';
import {timing} from './timing';

/**
 * The unit of a gesture constant.
 * @experimental
 */
export type GestureConstantUnit =
  'px' | 'ms' | 'px/s' | 'rad' | 'ratio' | 'count';

interface GestureConstantBase<T> {
  readonly value: T;
  readonly unit: GestureConstantUnit;
}

/**
 * A number with a citable origin.
 * @experimental
 */
export interface SourcedGestureConstant<
  T = number,
> extends GestureConstantBase<T> {
  /** Documentation URL, WWDC session, or `measured: <app>, <iOS>, <method>`. */
  readonly source: string;
}

/**
 * A number nobody has measured yet.
 * @experimental
 */
export interface GuessedGestureConstant<
  T = number,
> extends GestureConstantBase<T> {
  /** What the guess rests on. */
  readonly guess: string;
  /** The measurement that replaces it. */
  readonly measure: string;
}

/**
 * A gesture constant: sourced, or a guess with its measurement task.
 * @experimental
 */
export type GestureConstant<T = number> =
  SourcedGestureConstant<T> | GuessedGestureConstant<T>;

/**
 * Whether a constant still needs its measurement.
 * @experimental
 */
export function isGuess<T>(
  constant: GestureConstant<T>,
): constant is GuessedGestureConstant<T> {
  return 'guess' in constant;
}

const APPLE = 'https://developer.apple.com/documentation/uikit';

/**
 * In-process reads and touch runs of fresh UIKit recognizers (private ivars
 * read with key-value coding, every value confirmed with HID touches and the
 * recognizer state log), iPhone 17 Pro simulator, iOS 26.2, Oct 2026.
 */
const UIKIT_LAB =
  'measured: UIKit lab, iOS 26.2 simulator, ivar reads confirmed with HID touches, Oct 23 2026';

/**
 * The repository's own measurement of the touch press model, recorded in
 * packages/core/src/utils/pressGesture.ts: Settings and Contacts on an iPhone
 * simulator running iOS 26.2, driven with real HID touches, filmed at 60 fps.
 */
const PRESS_MEASUREMENT =
  'measured: Settings and Contacts, iOS 26.2 simulator, HID touches filmed at 60 fps (utils/pressGesture.ts), Oct 6 2026';

/**
 * Safari page scroll is a UIScrollView: the distance at which it claims a
 * slow drag is where a press becomes a scroll, and the last moment a page
 * can still cancel the scroll.
 */
const SAFARI_SCROLL_CLAIM =
  'measured: Mobile Safari 26.2, iOS 26.2 simulator, slow HID drag on a scrollable page (1 pt steps): last cancelable touchmove at 10 px, pointercancel and the first uncancelable touchmove at 11 px, Oct 23 2026';

/**
 * UIKit's gesture thresholds and velocity filter, each with its source.
 * @experimental
 */
export const UIKIT_GESTURES = {
  tap: {
    /**
     * How far each finger may travel from where it landed before a tap
     * fails, as a distance.
     */
    allowableMovement: {
      value: 45,
      unit: 'px',
      source: `${UIKIT_LAB}: UITapGestureRecognizer _allowableMovement 45; 44 pt taps, 46 pt fails, the same on the diagonal`,
    },
    /** Longest interval between one tap lifting and the next landing. */
    maximumIntervalBetweenTaps: {
      value: 350,
      unit: 'ms',
      source: `${UIKIT_LAB}: _maximumIntervalBetweenSuccessiveTaps 0.35 s; 330 ms double-taps, 370 ms does not`,
    },
    /** How far a later tap may land from the first one of the sequence. */
    allowableSeparation: {
      value: 45,
      unit: 'px',
      source: `${UIKIT_LAB}: _allowableSeparation is unbounded and the 45 pt movement rule applies between taps; 44 pt double-taps, 46 does not`,
    },
    /** Longest a finger may stay down and still tap. */
    maximumTapDuration: {
      value: 1500,
      unit: 'ms',
      source: `${UIKIT_LAB}: maximumTapDuration 1.5 s; a 1.4 s hold taps, 1.6 s does not`,
    },
  },
  longPress: {
    /** UILongPressGestureRecognizer.minimumPressDuration default. */
    minimumPressDuration: {
      value: 500,
      unit: 'ms',
      source: `apple-docs ${APPLE}/uilongpressgesturerecognizer/minimumpressduration; ${UIKIT_LAB}: _minimumPressDuration 0.5`,
    },
    /** UILongPressGestureRecognizer.allowableMovement default, a distance. */
    allowableMovement: {
      value: 10,
      unit: 'px',
      source: `apple-docs ${APPLE}/uilongpressgesturerecognizer/allowablemovement; ${UIKIT_LAB}: a (7, 7) drift begins, (7.2, 7.2) fails`,
    },
  },
  pan: {
    /**
     * Travel before a pan begins, PER AXIS: |dx| or |dy| reaching it. The
     * translation is reset when the pan begins, so the hysteresis is not
     * part of it. Kept below the distance at which WebKit claims a drag for
     * scrolling, so a pan that must cancel the native scroll still sees
     * cancelable `touchmove`s.
     */
    hysteresis: {
      value: 10,
      unit: 'px',
      source: `${UIKIT_LAB}: UIPanGestureRecognizer _hysteresis 10; x and y began at 10.0, a diagonal at (10.67, 10.67); translation(in:) is 0 at .began`,
    },
    /**
     * Travel in a one-way pan's direction from which a pan that opts in
     * (`claimDistance: 'early'`) cancels its touch's moves before it begins,
     * under the distance at which WebKit claims a slow drag for scrolling.
     * Not a UIKit value: it gives an overlay's drag (a toast, a banner) on
     * the web the outcome UIKit gives it, where a drag that starts on an
     * overlay never reaches the content behind it.
     */
    earlyClaimDistance: {
      value: 5,
      unit: 'px',
      source:
        'measured: Mobile Safari 26.2, iOS 26.2 simulator, HID drags: cancelling every touchmove from 8 px keeps a scrollable page still; a one-way upward pan over a scrollable page that cancels from 4–5 px keeps the page still and its card follows the finger exactly',
    },
  },
  swipe: {
    /** Travel along the swipe direction before a swipe is recognized. */
    minimumDistance: {
      value: 50,
      unit: 'px',
      source: `${UIKIT_LAB}: UISwipeGestureRecognizer minimum primary movement 50; recognized during the motion; 40 pt does not`,
    },
    /** Longest a swipe may take before it fails. */
    maximumDuration: {
      value: 500,
      unit: 'ms',
      source: `${UIKIT_LAB}: UISwipeGestureRecognizer maximum duration 0.5 s`,
    },
    /** Travel across the swipe direction that fails it. */
    maximumSecondaryMovement: {
      value: 50,
      unit: 'px',
      source: `${UIKIT_LAB}: UISwipeGestureRecognizer maximum secondary movement 50`,
    },
    /**
     * How the minimum movement relaxes over time. Read, not modelled: a
     * 120 pt swipe over 0.8 s was recognized at 303 ms, below 50 pt of travel.
     */
    minimumMovementDecay: {
      value: 0.06,
      unit: 'ratio',
      source: `${UIKIT_LAB}: UISwipeGestureRecognizer rateOfMinimumMovementDecay 0.06 (not modelled)`,
    },
  },
  pinch: {
    /**
     * Change of the distance between two fingers before a pinch begins. The
     * scale is then measured against the starting span moved by this much,
     * so it does not jump.
     */
    hysteresis: {
      value: 8,
      unit: 'px',
      source: `${UIKIT_LAB}: UIPinchGestureRecognizer _hysteresis 8; out from 120 began at 144 with scale 1.125 (= 144 / 128)`,
    },
  },
  rotation: {
    /** Rotation of the two-finger vector before a rotation begins. */
    hysteresis: {
      value: (5 * Math.PI) / 180,
      unit: 'rad',
      guess:
        'UIRotationGestureRecognizer has no scalar threshold among its ivars; 5 degrees.',
      measure:
        'M-G10: The simulator HID cannot rotate two fingers: a device run (or an XCUITest rotate) logging the angle at .began.',
    },
  },
  screenEdgePan: {
    /** Width of the band at the screen edge a touch must land in. */
    edgeRegion: {
      value: 40.2,
      unit: 'px',
      source: `${UIKIT_LAB}: UIScreenEdgePanGestureRecognizer _edgeRegionSize 40.2 on a 402 pt wide screen (10 % of it); edge pans cannot begin from simulator HID`,
    },
    /** Travel before an edge pan begins. */
    hysteresis: {
      value: 15,
      unit: 'px',
      source: `${UIKIT_LAB}: the screen-edge pan hysteresis ivar 15`,
    },
  },
  control: {
    /**
     * How far outside its bounds a UIControl keeps a press inside: a finger
     * dragged out is still "inside" until it passes this margin.
     */
    trackingExpansion: {
      value: 70,
      unit: 'px',
      source: `${UIKIT_LAB}: UIButton (.system) stays inside up to 70 pt out, touchDragExit at 71, touchDragEnter at 69 coming back; touchUpInside up to 70, touchUpOutside from 71`,
    },
  },
  press: {
    /** UIScrollView.delaysContentTouches: a touch in a scroller highlights after this. */
    contentTouchDelay: {
      value: scroll.delaysContentTouchesMs,
      unit: 'ms',
      source: PRESS_MEASUREMENT,
    },
    /** A tap shorter than the delay shows the highlight at the lift for this long. */
    quickTapFlash: {
      value: timing.press.flashMs,
      unit: 'ms',
      source: PRESS_MEASUREMENT,
    },
    /** Travel at which a press is a scroll, not a press. */
    slop: {value: 10, unit: 'px', source: SAFARI_SCROLL_CLAIM},
    /** A touch this soon after a finger-driven scroll moved is a brake, not a press. */
    scrollBrake: {
      value: timing.press.scrollBrakeMs,
      unit: 'ms',
      source: PRESS_MEASUREMENT,
    },
    /**
     * How long after a finger was down a scroll can still be that finger's
     * momentum (the brake only counts scrolls a finger drove).
     */
    momentumMemory: {
      value: 3000,
      unit: 'ms',
      guess:
        'The press model bound (utils/pressFeedback.ts): iOS momentum runs for a second or two after the lift.',
      measure:
        'M-G19: Safari page, hardest HID flick: time from the lift to the last scroll event.',
    },
  },
  scroll: {
    /**
     * Travel past the point where a native scroll ran out of content before
     * an opt-in `scrollHandoff` pan takes the rest of the gesture. UIKit
     * itself never hands a drag over mid-gesture (a sheet over a scrolled
     * list leaves the whole drag to the list), so this is not a parity value.
     */
    contentEndHandoffSlop: {
      value: 4,
      unit: 'px',
      guess:
        'The BottomSheet value (useSheetGestures.ts): enough to ignore a fling coming to rest on the last pixel.',
      measure:
        'M-G13: None for parity: UIKit decides sheet versus scroll when the drag begins (a sheet over a scrolled list leaves the whole drag to the list).',
    },
  },
  velocity: {
    /**
     * The release filter's window (`spec:AST-100` FR2): motion older than
     * this before the lift does not count.
     */
    horizon: {
      value: 100,
      unit: 'ms',
      guess:
        "BottomSheet's two-point window on main, and Android's and Flutter's 100 ms fit window.",
      measure: 'M-G14: Not a parity value: UIKit uses the two-event filter.',
    },
    /**
     * Moves in a row with no movement after which the release velocity is 0
     * (`spec:AST-100` FR2): a resting finger still reports, and UIKit's
     * estimate reaches 0 on the second such sample. No time-based reset.
     */
    stillSamples: {
      value: 2,
      unit: 'count',
      source: `${UIKIT_LAB}: UIPanGestureRecognizer velocity(in:) at .ended after a 1000 pt/s stroke: .moved samples at the same point every 8.33 ms give 1000, then 800, then 0 (v = 0.8 prev + 0.2 latest, updated only on moved samples); a silent rest keeps 1000 for every rest up to 500 ms`,
    },
    /** The tracker keeps at most this many samples (a bound on its buffer). */
    maxSamples: {
      value: 20,
      unit: 'count',
      guess: 'Android VelocityTracker and Flutter VelocityTracker keep 20.',
      measure: 'M-G15: Not a parity value: UIKit uses the two-event filter.',
    },
  },
  click: {
    /**
     * Longest the system waits for the browser's click after a touch it
     * swallows. iOS and Chromium deliver it right after `touchend`; this only
     * bounds a click that never comes.
     */
    strayClickWindow: {
      value: 1000,
      unit: 'ms',
      guess: 'A safety bound, not a UIKit number.',
      measure:
        'M-G17: Not a parity value: confirm in Safari and Chromium that the click follows touchend within one frame.',
    },
  },
} as const satisfies Record<string, Record<string, GestureConstant>>;

/**
 * The feedback kinds UIKit's generators offer: UISelectionFeedbackGenerator,
 * UIImpactFeedbackGenerator (.light .medium .heavy .soft .rigid) and
 * UINotificationFeedbackGenerator (.success .warning .error).
 * https://developer.apple.com/documentation/uikit/uifeedbackgenerator
 * @experimental
 */
export const HAPTIC_FEEDBACK_KINDS = [
  'selection',
  'impactLight',
  'impactMedium',
  'impactHeavy',
  'impactSoft',
  'impactRigid',
  'notificationSuccess',
  'notificationWarning',
  'notificationError',
] as const;

/**
 * A feedback kind of UIKit's feedback generators.
 * @experimental
 */
export type HapticFeedbackKind = (typeof HAPTIC_FEEDBACK_KINDS)[number];

/**
 * `navigator.vibrate` patterns standing in for each kind where the platform
 * has nothing better (Android browsers). Not UIKit numbers: a vibration motor
 * cannot render a Taptic Engine waveform, so these only keep the relative
 * strengths in order.
 * @experimental
 */
export const HAPTIC_VIBRATION_PATTERNS: Record<
  HapticFeedbackKind,
  GestureConstant<ReadonlyArray<number>>
> = {
  selection: vibration([5]),
  impactLight: vibration([8]),
  impactMedium: vibration([12]),
  impactHeavy: vibration([18]),
  impactSoft: vibration([10]),
  impactRigid: vibration([6]),
  notificationSuccess: vibration([8, 60, 12]),
  notificationWarning: vibration([12, 80, 12]),
  notificationError: vibration([12, 50, 12, 50, 18]),
};

function vibration(
  pattern: ReadonlyArray<number>,
): GuessedGestureConstant<ReadonlyArray<number>> {
  return {
    value: pattern,
    unit: 'ms',
    guess:
      'No UIKit equivalent exists for a vibration motor; durations only order the strengths.',
    measure:
      'M-G18: On an Android device, compare against the platform HapticFeedbackConstants for the same moments.',
  };
}
