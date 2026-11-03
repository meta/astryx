// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file switchTouch.ts
 * @input The UIKit switch constants (motion/uikit/switch.ts) and a track size
 * @output The pure model of Switch's touch presentation: thumb geometry, the
 *   drag's target, the flip rule, the commit on release, and when the lifted
 *   thumb may settle
 * @position Pure half of Switch's touch presentation; driven by
 *   useSwitchTouch.ts, tested by switchTouch.test.ts without a browser
 *
 * Positions are thumb offsets from the off end, 0 … `travel`, in the writing
 * direction; the caller mirrors them for right-to-left.
 * SYNC: When modified, update useSwitchTouch.ts and switchTouch.test.ts.
 */

import {rubberBandClamp, rubberBandUnclamp} from '../motion/rubberBand';
import {switchControl} from '../motion/uikit/switch';

export interface SwitchTouchGeometry {
  readonly trackWidth: number;
  readonly trackHeight: number;
  /** The thumb at rest, px. */
  readonly thumbWidth: number;
  readonly thumbHeight: number;
  /** Gap between the thumb and the track's top, bottom and nearer end, px. */
  readonly inset: number;
  /** Offset of the thumb at the on end, px. */
  readonly travel: number;
  /**
   * Scale of the lifted thumb, one value on both axes. It is UIKit's lift,
   * capped so the thumb grows into at most half the gap on each side.
   */
  readonly liftScaleX: number;
  readonly liftScaleY: number;
  /**
   * The drag's rubber-band dimension, px: UIKit's, scaled to the track. It
   * never exceeds the gap the lift leaves (`inset` less the lifted growth).
   * The band approaches its dimension and never reaches it, so a banded thumb
   * stays inside the track.
   */
  readonly rubberBandDimension: number;
  /** How far the finger goes toward the other end before a flip, px. */
  readonly flipDistance: number;
}

const [UIKIT_TRACK_WIDTH, UIKIT_TRACK_HEIGHT] = switchControl.trackSize;
const [UIKIT_THUMB_WIDTH, UIKIT_THUMB_HEIGHT] = switchControl.thumbSize;
const [LIFTED_WIDTH, LIFTED_HEIGHT] = switchControl.liftedThumbSize;

/**
 * The thumb geometry in a track of this size: the thumb's measured box when
 * given, UIKit's proportions otherwise.
 */
export function switchTouchGeometry(
  trackWidth: number,
  trackHeight: number,
  thumb?: {readonly width: number; readonly height: number},
): SwitchTouchGeometry {
  const thumbHeight =
    thumb?.height ?? (trackHeight * UIKIT_THUMB_HEIGHT) / UIKIT_TRACK_HEIGHT;
  const thumbWidth =
    thumb?.width ?? (trackWidth * UIKIT_THUMB_WIDTH) / UIKIT_TRACK_WIDTH;
  const inset = Math.max(0, (trackHeight - thumbHeight) / 2);
  // UIKit lifts to 58 × 38.3 from 37 × 24; here the lift fills at most half
  // the gap on each side, on both axes alike.
  const liftScale = Math.max(
    1,
    Math.min(
      LIFTED_WIDTH / UIKIT_THUMB_WIDTH,
      LIFTED_HEIGHT / UIKIT_THUMB_HEIGHT,
      thumbWidth > 0 ? 1 + inset / thumbWidth : 1,
      thumbHeight > 0 ? 1 + inset / thumbHeight : 1,
    ),
  );
  const liftGrowth = (thumbWidth * (liftScale - 1)) / 2;
  return {
    trackWidth,
    trackHeight,
    thumbWidth,
    thumbHeight,
    inset,
    travel: Math.max(0, trackWidth - thumbWidth - 2 * inset),
    liftScaleX: liftScale,
    liftScaleY: liftScale,
    rubberBandDimension: Math.max(
      0,
      Math.min(
        (switchControl.rubberBand.dimension * trackHeight) / UIKIT_TRACK_HEIGHT,
        inset - liftGrowth,
      ),
    ),
    flipDistance: Math.max(0, trackWidth - thumbWidth),
  };
}

/**
 * Where the drag puts the thumb's target. It is the offset at the landing,
 * moved by the finger's translation and rubber-banded past either end.
 *
 * `start` is the thumb's offset on screen when the finger landed, mid-flight
 * or banded. It is unbanded first, so a finger that grabs a moving thumb
 * continues without a jump.
 */
export function dragTarget(
  start: number,
  translation: number,
  geometry: SwitchTouchGeometry,
): number {
  const {travel, rubberBandDimension} = geometry;
  const coefficient = switchControl.rubberBand.coefficient;
  const raw =
    rubberBandUnclamp(start, 0, travel, rubberBandDimension, coefficient) +
    translation;
  return rubberBandClamp(raw, 0, travel, rubberBandDimension, coefficient);
}

/** A drag's flip state: the side it shows and how it got there. */
export interface SwitchFlip {
  /** The value when the finger landed. */
  readonly startedOn: boolean;
  readonly isVisuallyOn: boolean;
  /** The finger passed `flipDistance` on the last event: the next one flips. */
  readonly isArmed: boolean;
  /** The drag has flipped at least once. */
  readonly didFlip: boolean;
}

export function startFlip(isOn: boolean): SwitchFlip {
  return {startedOn: isOn, isVisuallyOn: isOn, isArmed: false, didFlip: false};
}

/**
 * One touch event of the drag. `translation` is the finger's travel since it
 * landed along the writing direction (positive toward the on end).
 */
export function stepFlip(
  flip: SwitchFlip,
  translation: number,
  geometry: SwitchTouchGeometry,
): SwitchFlip {
  // Travel toward the other end: right from off, left from on.
  const toward = flip.startedOn ? -translation : translation;
  if (flip.isVisuallyOn !== flip.startedOn) {
    return toward < 0
      ? {...flip, isVisuallyOn: flip.startedOn, isArmed: false}
      : flip;
  }
  const isPast = toward >= geometry.flipDistance;
  if (flip.isArmed && isPast) {
    return {
      ...flip,
      isVisuallyOn: !flip.startedOn,
      isArmed: false,
      didFlip: true,
    };
  }
  return isPast === flip.isArmed ? flip : {...flip, isArmed: isPast};
}

/**
 * What a release commits: the side a drag flipped to; when nothing flipped,
 * the other side of the value, wherever the finger lifts. A press slid off
 * and lifted outside toggles too, as UISwitch's does. A toggle is
 * reversible, so a stray release costs one more tap.
 */
export function commitOnRelease(
  flip: SwitchFlip | null,
  isOn: boolean,
): boolean {
  return flip?.didFlip === true ? flip.isVisuallyOn : !isOn;
}

/**
 * When the lifted thumb may settle, on the document timeline (ms). It is the
 * release, but never sooner than the minimum lift time after the lift.
 * A caller may pass the minimum it plays; the table's measured one by
 * default.
 */
export function settleTime(
  releaseTime: number,
  liftTime: number,
  minimumLiftMs: number = switchControl.minimumLiftMs,
): number {
  return Math.max(releaseTime, liftTime + minimumLiftMs);
}
