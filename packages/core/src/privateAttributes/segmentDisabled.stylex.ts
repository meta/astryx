// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/segmentDisabled.stylex.ts
 * @input A segment's own `isDisabled`
 * @output segmentDisabledProps, which marks a SegmentedControl segment
 *   disabled by its own `isDisabled`, and isSegmentDisabledOnItsOwn, which
 *   reads that mark
 * @position Owner module of the private segment-disabled attribute
 *   (`architecture:public-component-api` INV23): the only file that writes
 *   its name. SegmentedControl reads it to place the Tab stop of a control
 *   disabled with a reason (`component:SegmentedControl` FR2). No package
 *   entry exports it.
 */

const SEGMENT_DISABLED = 'data-astryx-segment-disabled';

/** Spread on a segment: marks it when it is disabled by its own isDisabled. */
export function segmentDisabledProps(
  isDisabled: boolean,
): Readonly<Record<string, string>> {
  return isDisabled ? {[SEGMENT_DISABLED]: ''} : {};
}

/** Whether a segment element is disabled by its own isDisabled. */
export function isSegmentDisabledOnItsOwn(segment: Element): boolean {
  return segment.hasAttribute(SEGMENT_DISABLED);
}
