// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file releaseMotion.ts
 * @input The shared touch presentation resolver, the motion foundation's
 *   cubic-bézier and the sheet element's computed transition
 * @output Exports readReleaseMotion (which timing a sheet's release runs on)
 *   and themeCurve (a theme timing as a curve the animator plays)
 * @position Internal to BottomSheet; read once per gesture by
 *   useSheetGestures
 *
 * A finger or a pen where the primary pointer is coarse (`readTouchPresentation`;
 * one touch model on every touch device, iOS and Android alike) moves the
 * sheet the way a UIKit sheet does: its release runs on UIKit's springs,
 * handed the finger's velocity (spec:AST-094 FR13). A mouse, even where the
 * primary pointer is coarse, and anything where it is fine keep the theme's
 * motion: the duration and easing its stylesheet gives `transform`, as today
 * (spec:AST-017 FR59). The drag's tracking follows the same answer.
 * Either way the curve plays on the compositor, through the same animator.
 *
 * The theme timing is read from the element's computed transition when a
 * drag begins, before the drag turns transitions off, so a theme or a
 * caller's `transition` keeps meaning what it did. Under reduced motion the
 * animator replaces either curve (design:reduced-motion).
 *
 * SYNC: When modified, update /packages/core/src/BottomSheet/useSheetGestures.ts
 */

import type {MotionCurve} from '../motion/animator';
import {cubicBezier, type BezierPoints} from '../motion/bezier';
import {readTouchPresentation} from './sheetTouch';

export type ReleaseMotion =
  | {readonly kind: 'uikit'}
  | {
      readonly kind: 'theme';
      /** How long a settle takes, ms (0: transitions are off). */
      readonly durationMs: number;
      readonly easing: (progress: number) => number;
    };

const UIKIT: ReleaseMotion = {kind: 'uikit'};

// The CSS keywords, as cubic-bézier control points.
const KEYWORDS: Record<string, BezierPoints> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

/** Splits a computed list on its top-level commas (not those inside `cubic-bezier(…)`). */
function splitList(list: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const char = list[i];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (char === ',' && depth === 0) {
      items.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  items.push(list.slice(start).trim());
  return items;
}

function parseTime(value: string): number | null {
  const time = Number.parseFloat(value);
  if (!Number.isFinite(time)) {
    return null;
  }
  return value.trim().endsWith('ms') ? time : time * 1000;
}

function parseEasing(value: string): ((progress: number) => number) | null {
  if (value === 'linear') {
    return progress => progress;
  }
  const keyword = KEYWORDS[value];
  if (keyword != null) {
    return cubicBezier(keyword);
  }
  const match = /^cubic-bezier\(([^)]*)\)$/.exec(value);
  if (match == null) {
    return null;
  }
  const points = match[1].split(',').map(Number);
  if (points.length !== 4 || points.some(point => !Number.isFinite(point))) {
    return null;
  }
  return cubicBezier(points as unknown as BezierPoints);
}

/**
 * The timing a release of `element` dragged by `pointerType` runs on: UIKit's
 * for a finger or a pen where the primary pointer is coarse, else the
 * duration and easing its stylesheet transitions `transform` with. An
 * easing it cannot read (`steps()`) plays linearly over that duration; no
 * element or no readable duration settles at once.
 */
export function readReleaseMotion(
  element: HTMLElement | null,
  pointerType: string,
): ReleaseMotion {
  if (
    readTouchPresentation().isTouch &&
    (pointerType === 'touch' || pointerType === 'pen')
  ) {
    return UIKIT;
  }
  if (element == null || typeof getComputedStyle !== 'function') {
    return {kind: 'theme', durationMs: 0, easing: progress => progress};
  }
  const style = getComputedStyle(element);
  if (style.transitionProperty === 'none') {
    return {kind: 'theme', durationMs: 0, easing: progress => progress};
  }
  const properties = splitList(style.transitionProperty);
  const index = properties.findIndex(
    property => property === 'transform' || property === 'all',
  );
  if (index < 0) {
    return {kind: 'theme', durationMs: 0, easing: progress => progress};
  }
  const pick = (list: string) => {
    const items = splitList(list);
    return items[index % items.length] ?? '';
  };
  const duration = parseTime(pick(style.transitionDuration));
  const delay = parseTime(pick(style.transitionDelay)) ?? 0;
  if (duration == null) {
    return {kind: 'theme', durationMs: 0, easing: progress => progress};
  }
  const easing =
    parseEasing(pick(style.transitionTimingFunction)) ??
    ((progress: number) => progress);
  return {kind: 'theme', durationMs: Math.max(0, duration + delay), easing};
}

/** A theme timing from `from` to `to` as a curve the animator plays. */
export function themeCurve(
  from: number,
  to: number,
  {durationMs, easing}: {durationMs: number; easing: (p: number) => number},
): MotionCurve {
  const duration = durationMs / 1000;
  const at = (t: number) =>
    duration <= 0 || t >= duration
      ? to
      : from + (to - from) * easing(Math.max(0, t) / duration);
  return {
    duration,
    at,
    velocity: t => {
      const h = 0.0005;
      const a = Math.max(0, t - h);
      const b = Math.min(duration, t + h);
      return b > a ? (at(b) - at(a)) / (b - a) : 0;
    },
  };
}
