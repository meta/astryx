// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCalendarSystem.ts
 * @input InternationalizationContext, an optional component `calendar`
 * @output The calendar system a date component shows, and the helpers that
 *   normalize a calendar identifier and read one from a locale tag
 * @position Internal i18n hook; read by InternationalizationProvider and date
 *   components. Not re-exported from the i18n barrel.
 */

import {use} from 'react';
import {InternationalizationContext} from './InternationalizationContext';
import type {Locale} from './types';
import {
  type CalendarSystem,
  isCalendarSystem,
  isCalendarSystemAvailable,
} from '../utils/calendarSystem';
import {warnOnce} from '../utils/devWarning';

// ECMA-402 resolves the observational `islamic` calendar to `islamic-tbla`.
const CALENDAR_ALIASES: Readonly<Record<string, CalendarSystem>> = {
  islamic: 'islamic-tbla',
};

/**
 * Normalizes a calendar identifier. An identifier outside `CalendarSystem`
 * resolves to `gregory` and warns once in development.
 */
export function resolveCalendarSystem(
  id: string,
  source: string,
): CalendarSystem {
  const normalized = CALENDAR_ALIASES[id] ?? id;
  if (isCalendarSystem(normalized)) {
    return normalized;
  }
  warnOnce(
    `calendar-unsupported:${id}`,
    source,
    `The calendar "${id}" is not supported; showing Gregorian dates.`,
  );
  return 'gregory';
}

/**
 * The calendar that a locale tag names with a `-u-ca-` keyword, such as
 * `th-TH-u-ca-buddhist`. A locale without the keyword names no calendar, so
 * `fa-IR` returns `undefined` and its default calendar never applies.
 */
export function getExplicitLocaleCalendar(
  locale: Locale,
  source: string,
): CalendarSystem | undefined {
  let requested: string | undefined;
  try {
    requested = new Intl.Locale(locale).calendar;
  } catch {
    return undefined;
  }
  return requested == null
    ? undefined
    : resolveCalendarSystem(requested, source);
}

/**
 * A calendar this runtime can show, else `gregory`. Calendars outside the
 * Gregorian-aligned set need a `Temporal` that supports them. The fallback
 * warns once for each calendar, on the server and in the browser.
 */
function availableCalendarOrGregorian(
  calendar: CalendarSystem,
  source: string,
): CalendarSystem {
  if (isCalendarSystemAvailable(calendar)) {
    return calendar;
  }
  warnOnce(
    `calendar-unavailable:${calendar}`,
    source,
    `The "${calendar}" calendar needs a Temporal that supports it, and this ` +
      'runtime has none; showing Gregorian dates. Load a Temporal polyfill ' +
      "with every calendar, such as 'temporal-polyfill/full/global', on the " +
      'server and in the browser.',
  );
  return 'gregory';
}

/**
 * The calendar a date component shows: its own `calendar`, else the
 * provider's resolved calendar, else `gregory`. It resolves during render, so
 * the server and the browser agree when both have `Temporal` or both lack it.
 */
export function useCalendarSystem(
  calendar: CalendarSystem | undefined,
  source: string,
): CalendarSystem {
  const context = use(InternationalizationContext);
  const requested =
    calendar != null
      ? resolveCalendarSystem(calendar, source)
      : (context.calendar ?? 'gregory');
  return availableCalendarOrGregorian(requested, source);
}
