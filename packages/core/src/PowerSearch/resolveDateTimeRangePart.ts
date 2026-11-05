// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolveDateTimeRangePart.ts
 * @input DateTimeRangePart and an optional shared evaluation time
 * @output Resolves absolute, now, and relative range parts to Unix seconds
 * @position Internal PowerSearch date-range utility; shared by filtering and editing
 */

import type {DateTimeRangePart} from './types';

const SECONDS_BY_UNIT = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000,
  year: 31536000,
} as const;

/** Resolves a range part against one caller-supplied instant. */
export function resolveDateTimeRangePart(
  part: DateTimeRangePart,
  nowSeconds = Date.now() / 1000,
): number {
  switch (part.type) {
    case 'NOW':
      return Math.floor(nowSeconds);
    case 'ABSOLUTE':
      return part.unixSeconds;
    case 'RELATIVE':
      return Math.floor(
        nowSeconds - part.backValue * SECONDS_BY_UNIT[part.unit],
      );
  }
}
