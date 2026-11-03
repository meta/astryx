// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressPinClick.ts
 * @input A click event
 * @output markPressPinClick and isPressPinClick, the mark that a press pin
 *   puts on each click it answers
 * @position Core-internal, with no imports. Clickable rows and containers read
 *   the mark without loading the press pin itself (usePressPin.ts).
 */

/** The clicks that a press pin answered. */
const pressPinClicks = new WeakSet<Event>();

/** Marks a click that a press pin answered. */
export function markPressPinClick(event: Event): void {
  pressPinClicks.add(event);
}

/**
 * Whether a press pin answered this click. The component around the trigger
 * stops it there, and Astryx clickable containers and rows ignore it. So the
 * press only opens or closes its layer.
 */
export function isPressPinClick(event: Event): boolean {
  return pressPinClicks.has(event);
}
