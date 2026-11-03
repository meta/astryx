// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ProgressBarTouch.ts
 * @input Uses React, the touch presentation resolver, the shared resize
 *   observer, and the progress table's roles (through resolveMotion)
 * @output useProgressBarTouch: the fill's touch variables (move length,
 *   curve, return offset, minimum length) and, under a finger with marks,
 *   the share of the track the fill draws
 * @position ProgressBar's touch layer, imported only by ProgressBar.tsx
 *
 * SYNC: When modified, update /packages/core/src/ProgressBar/ProgressBar.tsx
 * (its touch styles read these variables and the 16px minimum) and
 * /packages/core/src/motion/uikit/progressBar.ts.
 */

import {useEffect, useRef, useState, type RefObject} from 'react';
import {formatMotionRoleValue} from '../motion/roles';
import {resolveMotion} from '../motion/resolveMotion';
import {progressBar} from '../motion/uikit/progressBar';
import {observeResize} from '../utils/sharedResizeObserver';
import {useTouchPresentation} from '../utils/touchPresentation';

/** The track's height. */
const TRACK_HEIGHT_PX = 8;

/**
 * Under a finger the fill never draws shorter than this above zero:
 * UIProgressView's minimum, two track heights, on ProgressBar's 8px track.
 */
export const TOUCH_MIN_FILL_PX =
  progressBar.progressView.minimumFillHeights * TRACK_HEIGHT_PX;

export interface ProgressBarTouch {
  /** The fill's touch timing variables, set inline on the fill. */
  fillVars: Record<
    | '--_progress-bar-move'
    | '--_progress-bar-curve'
    | '--_progress-bar-flip'
    | '--_progress-bar-min',
    string
  >;
  /** The track, measured under a finger when the bar has marks. */
  trackRef: RefObject<HTMLDivElement | null>;
  /** The share of the track the fill draws (0–100), for placing marks. */
  drawnPercentage: number;
}

export function useProgressBarTouch(
  percentage: number,
  hasMarks: boolean,
): ProgressBarTouch {
  // The touch fill's duration comes from how far the value moved since the
  // last value, the model change that UIKit measures. It holds until the next
  // change, so a re-render with the same value keeps it.
  const [motion, setMotion] = useState({percentage, change: 0, flip: 0});
  const isNewValue = motion.percentage !== percentage;
  // The share of the track the value moved (0–1). `flip` steps through three
  // values on every change (see the fill's touch transform).
  const change = isNewValue
    ? Math.abs(percentage - motion.percentage) / 100
    : motion.change;
  const flip = isNewValue ? (motion.flip + 1) % 3 : motion.flip;
  if (isNewValue) {
    setMotion({percentage, change, flip});
  }

  // Under a finger the fill draws at least TOUCH_MIN_FILL_PX long, so a mark
  // it covers there sits on the fill. That length is a share of the track's
  // width, which only layout knows. So the track is measured, but only under
  // a finger and only when the bar has marks.
  const {isTouch} = useTouchPresentation();
  const watchesTrack = isTouch && hasMarks;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    const element = trackRef.current;
    if (!watchesTrack || element == null) {
      return;
    }
    // The shared observer; its first call (on registration) carries no
    // contentRect, so that one reads the box.
    return observeResize(element, entry => {
      setTrackWidth(
        entry.contentRect?.width ?? element.getBoundingClientRect().width,
      );
    });
  }, [watchesTrack]);
  const drawnPercentage =
    watchesTrack && percentage > 0 && trackWidth > 0
      ? Math.max(percentage, (TOUCH_MIN_FILL_PX / trackWidth) * 100)
      : percentage;

  // CSS applies the theme's tempo to this duration.
  const fillTrackMs = resolveMotion(null, progressBar, 'fillTrackMs');
  const curve = resolveMotion(null, progressBar.curves.fill);
  return {
    fillVars: {
      '--_progress-bar-move': `${Math.round(change * fillTrackMs * 1000) / 1000}ms`,
      '--_progress-bar-curve': formatMotionRoleValue('curve', curve),
      '--_progress-bar-flip': String(flip),
      '--_progress-bar-min': `${TOUCH_MIN_FILL_PX}px`,
    },
    trackRef,
    drawnPercentage,
  };
}
