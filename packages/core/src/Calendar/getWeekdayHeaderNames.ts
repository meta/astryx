// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getWeekdayHeaderNames.ts
 * @input Generated CLDR weekday header table
 * @output Private locale resolver for weekday header names
 * @position Package-internal pure utility for the Calendar grid and the
 *   DateInput bottom sheet; not exported from the package
 */

import {
  weekdayHeaderNamesByLocale,
  type WeekdayHeaderNames,
} from './weekdayHeaderNames.generated';

const weekdayNamesByLocale: Readonly<Record<string, WeekdayHeaderNames>> =
  weekdayHeaderNamesByLocale;
const englishWeekdayNames = weekdayNamesByLocale.en;

/**
 * Resolve generated weekday reference data as exact locale -> language -> English.
 * Unicode extensions are ignored through Intl.Locale.baseName. Invalid tags and
 * valid but unsupported languages safely use English.
 */
export function getWeekdayHeaderNames(locale: string): WeekdayHeaderNames {
  try {
    const parsed = new Intl.Locale(locale);
    return (
      weekdayNamesByLocale[parsed.baseName] ??
      weekdayNamesByLocale[parsed.language] ??
      englishWeekdayNames
    );
  } catch {
    return englishWeekdayNames;
  }
}
