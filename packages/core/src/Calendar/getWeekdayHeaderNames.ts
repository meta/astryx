// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getWeekdayHeaderNames.ts
 * @input Generated CLDR weekday header table and the shared date formatter
 * @output Private resolver for one locale's weekday header row
 * @position Package-internal pure utility for the Calendar grid and the
 *   DateInput and DateTimeInput bottom sheets; not exported from the package
 */

import type {DayOfWeek} from '../utils/dateTypes';
import {plainDateWeekdayNames} from '../utils/plainDate';
import {
  weekdayHeaderNamesByLocale,
  type WeekdayHeaderNames,
} from './weekdayHeaderNames.generated';

const weekdayNamesByLocale: Readonly<Record<string, WeekdayHeaderNames>> =
  weekdayHeaderNamesByLocale;
const englishWeekdayNames = weekdayNamesByLocale.en;

/**
 * Sunday-first names: the generated row for the exact locale or its language.
 * A language with no generated row keeps its own words, so it gets the
 * abbreviated names the platform formats. A malformed tag, or a language the
 * platform does not know, gets English.
 */
function sundayFirstNames(locale: string): ReadonlyArray<string> {
  let parsed: Intl.Locale;
  try {
    parsed = new Intl.Locale(locale);
  } catch {
    return englishWeekdayNames;
  }
  return (
    weekdayNamesByLocale[parsed.baseName] ??
    weekdayNamesByLocale[parsed.language] ??
    plainDateWeekdayNames(parsed.baseName) ??
    englishWeekdayNames
  );
}

/**
 * The seven weekday header names for a locale, in column order for the week
 * that starts on `weekStartsOn`. Unicode extensions are ignored.
 */
export function getWeekdayHeaderNames(
  locale: string,
  weekStartsOn: DayOfWeek = 0,
): string[] {
  const names = sundayFirstNames(locale);
  return Array.from(
    {length: 7},
    (_, offset) => names[(weekStartsOn + offset) % 7],
  );
}
