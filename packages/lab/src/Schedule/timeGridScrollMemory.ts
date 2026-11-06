// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file timeGridScrollMemory.ts
 * @input The rendered range, the clock, the hour window, and viewport geometry
 * @output Where a time-grid viewport opens for a range, and the memory that
 *   keeps a person's scroll offset for that range across the suspended fallback
 * @position Internal to the time-grid views; Schedule owns the memory above its
 *   suspense boundary so the fallback and the loaded content share one record
 */

import {createContext, type RefObject} from 'react';
import {
  plainDateFromInstant,
  plainDateIsEqual,
  type PlainDate,
} from '@astryxdesign/core/utils';
import {getMinutesSinceStartOfDay} from './shared';
import type {Instant} from './types';

/**
 * Identifies one intentional open of a time grid: the range's bounds, the
 * zone, and the hour window the offset was computed for. Object identities
 * are deliberately absent so a caller that rebuilds its view object on every
 * render cannot turn a data refresh into a new open.
 */
export interface TimeGridRangeKey {
  start: Instant;
  end: Instant;
  timezoneID: string;
  minHour: number;
  maxHour: number;
  hourHeight: number;
}

export interface TimeGridScrollMemory {
  key: TimeGridRangeKey | null;
  /** The viewport's last known scroll offset for `key`. */
  offset: number;
}

export const TimeGridScrollMemoryContext =
  createContext<RefObject<TimeGridScrollMemory> | null>(null);

export function isSameRangeKey(
  a: TimeGridRangeKey,
  b: TimeGridRangeKey,
): boolean {
  return (
    a.start === b.start &&
    a.end === b.end &&
    a.timezoneID === b.timezoneID &&
    a.minHour === b.minHour &&
    a.maxHour === b.maxHour &&
    a.hourHeight === b.hourHeight
  );
}

/**
 * The offset a time-grid viewport opens at for a range it has not shown yet:
 * one hour above the current minute when the range's days include today, so
 * what just happened and what is next are both in view; otherwise the top of
 * the configured hour window. Clamped to what the viewport can scroll.
 */
export function getInitialTimeGridOffset({
  currentTime,
  days,
  timezoneID,
  minHour,
  hourHeight,
  scrollHeight,
  clientHeight,
}: {
  currentTime: Instant;
  days: ReadonlyArray<PlainDate>;
  timezoneID: string;
  minHour: number;
  hourHeight: number;
  scrollHeight: number;
  clientHeight: number;
}): number {
  const maxOffset = Math.max(0, scrollHeight - clientHeight);
  const today = plainDateFromInstant(currentTime, timezoneID);
  if (!days.some(day => plainDateIsEqual(day, today))) {
    return 0;
  }
  const currentMinute = getMinutesSinceStartOfDay(currentTime, timezoneID);
  // The now-line sits at `calc(<minutes since minHour>% + 2px)` inside the
  // column; the hour above it is the lead.
  const nowOffset = ((currentMinute - minHour * 60) / 60) * hourHeight + 2;
  return Math.min(maxOffset, Math.max(0, Math.round(nowOffset - hourHeight)));
}
