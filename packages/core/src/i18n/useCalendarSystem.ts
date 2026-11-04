// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCalendarSystem.ts
 * @input InternationalizationContext, an optional component `calendar`
 * @output The calendar system a date component shows, and the helpers that
 *   normalize a calendar identifier
 * @position Internal i18n hook; read by InternationalizationProvider, date
 *   components, and the public calendar hooks. Not re-exported from the i18n
 *   barrel.
 */

import {use} from 'react';
import {InternationalizationContext} from './InternationalizationContext';
import {
  type CalendarSystem,
  isCalendarSystem,
  isCalendarSystemAvailable,
} from '../utils/calendarSystem';
import {warnOnce} from '../utils/devWarning';

/**
 * Normalizes a calendar identifier. An identifier outside `CalendarSystem`
 * resolves to `gregory` and warns once in development.
 */
export function resolveCalendarSystem(
  id: string,
  source: string,
): CalendarSystem {
  if (isCalendarSystem(id)) {
    return id;
  }
  warnOnce(
    `calendar-unsupported:${id}`,
    source,
    `The calendar "${id}" is not supported; showing Gregorian dates.`,
  );
  return 'gregory';
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
 * The calendar that a caller names, without the provider: an unknown
 * identifier, or one this runtime cannot show, becomes `gregory` and warns
 * once in development.
 */
export function resolveShownCalendar(
  calendar: string,
  source: string,
): CalendarSystem {
  return availableCalendarOrGregorian(
    resolveCalendarSystem(calendar, source),
    source,
  );
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
  return resolveShownCalendar(
    calendar ?? context.calendar ?? 'gregory',
    source,
  );
}
