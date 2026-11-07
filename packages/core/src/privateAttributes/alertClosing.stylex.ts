// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/alertClosing.stylex.ts
 * @input A closing alert's live dialog element, and its exit copy
 * @output holdAlertClosing, fadeAlertClosing and clearAlertClosing set and
 *   clear the closing mark. alertClosingStyle gives a marked dimming its
 *   animation: none while held, the exit fade while fading.
 * @position Owner module of the private alert-closing attribute: the only
 *   file that writes its name. AlertDialog's touch close marks the alert and
 *   its copy, and composes the style. No package entry exports it.
 */

import * as stylex from '@stylexjs/stylex';

const ALERT_CLOSING = 'data-astryx-alert-closing';

const fadeOut = stylex.keyframes({from: {opacity: 1}, to: {opacity: 0}});

/**
 * A value that only an attribute selector chooses. StyleX infers a value's
 * type from its `default`, its `:` and `@` conditions, and an index
 * signature. A literal attribute key is none of these, so this type gives
 * the value an index signature.
 */
type ByAttribute<Value> = Readonly<{
  default: null;
  [attribute: string]: Value | null;
}>;

const closingDimming: Readonly<{
  animationName: ByAttribute<string>;
  animationDuration: ByAttribute<string>;
  animationTimingFunction: ByAttribute<string>;
  animationFillMode: ByAttribute<string>;
}> = {
  animationName: {
    default: null,
    '[data-astryx-alert-closing="held"]': 'none',
    '[data-astryx-alert-closing="fading"]': fadeOut,
  },
  animationDuration: {
    default: null,
    '[data-astryx-alert-closing="fading"]': 'inherit',
  },
  animationTimingFunction: {
    default: null,
    '[data-astryx-alert-closing="fading"]': 'inherit',
  },
  animationFillMode: {
    default: null,
    '[data-astryx-alert-closing="fading"]': 'forwards',
  },
};

const styles = stylex.create({
  closing: {
    '::backdrop': {...closingDimming},
  },
});

/**
 * Compose on the live alert; its exit copy keeps the style. A held dimming
 * has no animation. WebKit keeps a dimming's finished entrance and does not
 * start it again at the next open. The change to no animation, applied while
 * the dimming still shows, clears it. On the exit copy, the hold keeps the
 * dimming at rest until its fade starts. A fading dimming plays the exit fade
 * on the copy's timing.
 */
export const alertClosingStyle = styles.closing;

/**
 * Holds the dimming. The next style read applies the mark, so set it while
 * the dimming still shows.
 */
export function holdAlertClosing(element: Element): void {
  element.setAttribute(ALERT_CLOSING, 'held');
}

/** Starts the exit fade of a held dimming. */
export function fadeAlertClosing(element: Element): void {
  element.setAttribute(ALERT_CLOSING, 'fading');
}

/** Clears the closing mark before the alert opens again. */
export function clearAlertClosing(element: Element): void {
  element.removeAttribute(ALERT_CLOSING);
}
