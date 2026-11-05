// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getWeekdayHeaderNames.ts
 * @input Generated CLDR weekday header table and the shared date formatter
 * @output Private resolver for one locale's weekday header row
 * @position Package-internal pure utility for the Calendar grid and the
 *   DateInput and DateTimeInput bottom sheets; not exported from the package
 */

import {characterCount} from '../utils/characters';
import type {DayOfWeek} from '../utils/dateTypes';
import {plainDateWeekdayNames} from '../utils/plainDate';
import {
  weekdayHeaderNamesByLocale,
  type WeekdayHeaderNames,
} from './weekdayHeaderNames.generated';

const weekdayNamesByLocale: Readonly<Record<string, WeekdayHeaderNames>> =
  weekdayHeaderNamesByLocale;
const englishWeekdayNames = weekdayNamesByLocale.en;

/** The longest abbreviated name a header row takes; the generator uses the same. */
export const MAX_ABBREVIATED_HEADER_LENGTH = 4;

function fitsHeader(names: ReadonlyArray<string>): boolean {
  return names.every(
    name => characterCount(name) <= MAX_ABBREVIATED_HEADER_LENGTH,
  );
}

/**
 * A language with no generated row keeps its own words. `Intl` has no CLDR
 * short width, so names too long for the column fall to the narrow width.
 */
function sundayFirstNames(locale: string): ReadonlyArray<string> {
  let parsed: Intl.Locale;
  try {
    parsed = new Intl.Locale(locale);
  } catch {
    return englishWeekdayNames;
  }
  const generated =
    weekdayNamesByLocale[parsed.baseName] ??
    weekdayNamesByLocale[parsed.language];
  if (generated != null) {
    return generated;
  }
  const abbreviated = plainDateWeekdayNames(parsed.baseName);
  if (abbreviated == null) {
    return englishWeekdayNames;
  }
  if (fitsHeader(abbreviated)) {
    return abbreviated;
  }
  return (
    plainDateWeekdayNames(parsed.baseName, 'narrow') ?? englishWeekdayNames
  );
}

/** One weekday header cell: its day of week (a stable key, since narrow names repeat) and its name. */
export interface WeekdayHeader {
  dayOfWeek: DayOfWeek;
  name: string;
}

/**
 * The seven weekday headers for a locale, in column order for the week that
 * starts on `weekStartsOn`. Unicode extensions are ignored.
 */
export function getWeekdayHeaders(
  locale: string,
  weekStartsOn: DayOfWeek = 0,
): WeekdayHeader[] {
  const names = sundayFirstNames(locale);
  return Array.from({length: 7}, (_, offset) => {
    const dayOfWeek = ((weekStartsOn + offset) % 7) as DayOfWeek;
    return {dayOfWeek, name: names[dayOfWeek]};
  });
}

/** The names alone, in the same order as `getWeekdayHeaders`. */
export function getWeekdayHeaderNames(
  locale: string,
  weekStartsOn: DayOfWeek = 0,
): string[] {
  return getWeekdayHeaders(locale, weekStartsOn).map(header => header.name);
}
