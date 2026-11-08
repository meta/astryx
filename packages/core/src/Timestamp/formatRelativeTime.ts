// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file formatRelativeTime.ts
 * @input A Date, reference Date, provider locale, and long or narrow style
 * @output A locale-correct relative time string
 * @position Pure locale-aware formatting boundary for Timestamp's relative modes
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Timestamp/Timestamp.tsx
 * - /packages/core/src/Timestamp/Timestamp.test.tsx
 * - /packages/core/src/Timestamp/Timestamp.doc.mjs
 */

import type {Locale} from '../i18n/types';

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Tolerance for treating a future timestamp as the present. Values this close
 * are usually clock skew rather than a genuinely scheduled future instant.
 */
const FUTURE_SKEW_TOLERANCE = 30;

type RelativeTimeStyle = 'long' | 'narrow';
type RelativeTimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year';

const formatters = new Map<string, Intl.RelativeTimeFormat>();

function getFormatter(
  locale: Locale,
  style: RelativeTimeStyle,
  numeric: Intl.RelativeTimeFormatNumeric,
): Intl.RelativeTimeFormat {
  const key = JSON.stringify([locale, style, numeric]);
  let formatter = formatters.get(key);
  if (formatter == null) {
    formatter = new Intl.RelativeTimeFormat(locale, {numeric, style});
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Chooses Astryx's existing time tier, then delegates locale-specific wording,
 * plural rules, and word order to the platform's CLDR-backed formatter.
 */
export function formatRelativeTime(
  date: Date,
  now: Date,
  locale: Locale,
  style: RelativeTimeStyle,
): string {
  const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const absDiff = Math.abs(diffSeconds);

  // Treat values at (or a hair before/after) the present as "now". The wider
  // future tolerance absorbs realistic clock skew.
  if (absDiff < 10 || (diffSeconds < 0 && absDiff <= FUTURE_SKEW_TOLERANCE)) {
    return getFormatter(locale, style, 'auto').format(0, 'second');
  }

  let count: number;
  let unit: RelativeTimeUnit;
  if (absDiff < MINUTE) {
    count = absDiff;
    unit = 'second';
  } else if (absDiff < HOUR) {
    count = Math.floor(absDiff / MINUTE);
    unit = 'minute';
  } else if (absDiff < DAY) {
    count = Math.floor(absDiff / HOUR);
    unit = 'hour';
  } else if (absDiff < MONTH) {
    count = Math.floor(absDiff / DAY);
    unit = 'day';
  } else if (absDiff < YEAR) {
    count = Math.floor(absDiff / MONTH);
    unit = 'month';
  } else {
    count = Math.floor(absDiff / YEAR);
    unit = 'year';
  }

  // Intl uses positive values for the future and negative values for the past.
  const value = diffSeconds < 0 ? count : -count;
  // Preserve the long form's existing "yesterday" idiom. The compact form is
  // deliberately numeric, so English remains "1d ago" rather than "yesterday".
  const numeric =
    style === 'long' && unit === 'day' && value === -1 ? 'auto' : 'always';
  return getFormatter(locale, style, numeric).format(value, unit);
}
