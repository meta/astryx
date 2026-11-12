// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/segmentTitle.stylex.ts
 * @input Nothing
 * @output segmentTitleProps, which marks a SegmentedControl segment's title,
 *   and titleOfSegment, which finds that title in a segment
 * @position Owner module of the private segment-title attribute: the only
 *   file that writes its name. No package entry exports it.
 */

const SEGMENT_TITLE = 'data-astryx-segment-title';

/** Spread on a segment's title: marks it for the touch layer. */
export const segmentTitleProps: Readonly<Record<string, string>> = {
  [SEGMENT_TITLE]: '',
};

/** The title inside `segment`, or null when the label is hidden. */
export function titleOfSegment(segment: Element): HTMLElement | null {
  return segment.querySelector<HTMLElement>(`[${SEGMENT_TITLE}]`);
}
