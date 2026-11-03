// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTypedDate.ts
 * @input Provider locale and calendar, a field's format, bounds and constraints;
 *   calendarDateParser, and parseDateInput for other Gregorian text
 * @output Typed-date reading, committed text, the format hint, the calendar
 *   description and rejection messages for a date text field
 * @position DateInput helper hook; used by DateInput and DateTimeInput
 */

import {useCallback, useMemo} from 'react';
import {useLocale} from '../i18n/useLocale';
import {useCalendarSystem} from '../i18n/useCalendarSystem';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/DateInput/useTypedDate.generated';
import type {CalendarSystem} from '../utils/calendarSystem';
import {
  type CalendarDateParseResult,
  calendarDisplayName,
  formatCalendarDateText,
  formatCalendarDateHint,
  getCalendarDateLexicon,
  parseCalendarDate,
} from '../utils/calendarDateParser';
import type {ISODateString, PlainDate} from '../utils/dateTypes';
import {parseDateInput} from '../utils/dateParser';
import {
  type SharedDateFormat,
  nearestAcceptedDate,
  plainDateFromISO,
  plainDateIsAfter,
  plainDateIsBefore,
  plainDateToday,
} from '../utils/plainDate';

registerEnglishFallback(english);

/** A rejected typed date, by the message it announces. */
export type TypedDateError = 'unreadable' | 'nonexistent' | 'outOfRange';

export interface UseTypedDateOptions {
  /** The component that names itself in development warnings. */
  source: string;
  /** The field's own calendar; the provider's calendar applies otherwise. */
  calendar?: CalendarSystem;
  /** The committed display format. */
  format: SharedDateFormat | ((value: ISODateString) => string);
  min?: ISODateString;
  max?: ISODateString;
  isDateDisabled: (date: PlainDate) => boolean;
}

export interface TypedDate {
  /** The resolved calendar, for the field's Calendar. */
  calendar: CalendarSystem;
  /** Builds the lexicon ahead of the first keystroke. */
  prepare: () => void;
  parse: (text: string) => CalendarDateParseResult;
  formatCommitted: (value: ISODateString) => string;
  /**
   * An example date for an empty focused field, or null for Gregorian. The
   * example is today when the field accepts it, else the nearest date it
   * accepts.
   */
  getFormatHint: () => string | null;
  /** Names the calendar, or null when it is the provider's calendar. */
  calendarDescription: string | null;
  /** The message for a rejected result. */
  errorMessage: (result: CalendarDateParseResult) => string;
}

/** The rejection a result shows: errors of complete text, or of committed text. */
export function typedDateError(
  result: CalendarDateParseResult | null,
  isCommitted: boolean,
): TypedDateError | null {
  if (result == null) {
    return null;
  }
  if (
    result.kind === 'unreadable' ||
    (result.kind === 'incomplete' && isCommitted)
  ) {
    return 'unreadable';
  }
  if (
    (result.kind === 'nonexistent' || result.kind === 'outOfRange') &&
    (result.isComplete || isCommitted)
  ) {
    return result.kind;
  }
  return null;
}

/**
 * Typed entry for a date text field in the active calendar. Values stay
 * Gregorian; the calendar changes only what people type and read.
 */
export function useTypedDate({
  source,
  calendar: calendarProp,
  format,
  min,
  max,
  isDateDisabled,
}: UseTypedDateOptions): TypedDate {
  const t = useComponentTranslator();
  const locale = useLocale();
  const calendar = useCalendarSystem(calendarProp, source);
  const providerCalendar = useCalendarSystem(undefined, source);
  const isGregorian = calendar === 'gregory' || calendar === 'iso8601';

  const prepare = useCallback(() => {
    getCalendarDateLexicon(locale, calendar);
  }, [locale, calendar]);

  const parse = useCallback(
    (text: string): CalendarDateParseResult => {
      const result = parseCalendarDate(
        text,
        getCalendarDateLexicon(locale, calendar),
        {isoIsGregorian: format === 'system_date', isDateDisabled},
      );
      if (
        !isGregorian ||
        (result.kind !== 'unreadable' && result.kind !== 'nonexistent')
      ) {
        return result;
      }
      // Gregorian text that only parseDateInput reads still commits, on Enter
      // or blur only: it is never complete while the person types. This
      // includes a day-first date in a month-first locale, which
      // parseDateInput reads by swapping the order.
      const date = parseDateInput(text, locale);
      if (date == null) {
        return result;
      }
      return isDateDisabled(date)
        ? {kind: 'outOfRange', date, isComplete: false}
        : {kind: 'value', date, isComplete: false};
    },
    [locale, calendar, format, isDateDisabled, isGregorian],
  );

  const formatCommitted = useCallback(
    (value: ISODateString) =>
      typeof format === 'function'
        ? format(value)
        : formatCalendarDateText(
            plainDateFromISO(value),
            format,
            locale,
            calendar,
          ),
    [format, locale, calendar],
  );

  const getFormatHint = useCallback(() => {
    if (isGregorian) {
      return null;
    }
    const example = nearestAcceptedDate(plainDateToday(), {
      min: min != null ? plainDateFromISO(min) : null,
      max: max != null ? plainDateFromISO(max) : null,
      isDateDisabled,
    });
    return t('@astryx.dateInput.formatHint', {
      example: formatCalendarDateHint(example, locale, calendar),
    });
  }, [isGregorian, t, locale, calendar, min, max, isDateDisabled]);

  const calendarName = useMemo(
    () => calendarDisplayName(calendar, locale),
    [calendar, locale],
  );

  const errorMessage = useCallback(
    (result: CalendarDateParseResult) => {
      if (result.kind === 'nonexistent') {
        return t('@astryx.dateInput.nonexistentDate', {calendar: calendarName});
      }
      if (result.kind === 'outOfRange') {
        const boundFormat = typeof format === 'function' ? 'date_long' : format;
        const writeBound = (bound: ISODateString) =>
          formatCalendarDateText(
            plainDateFromISO(bound),
            boundFormat,
            locale,
            calendar,
          );
        const isBeforeMin =
          min != null && plainDateIsBefore(result.date, plainDateFromISO(min));
        const isAfterMax =
          max != null && plainDateIsAfter(result.date, plainDateFromISO(max));
        const bounds =
          !isBeforeMin && !isAfterMax
            ? 'none'
            : min != null && max != null
              ? 'both'
              : min != null
                ? 'min'
                : 'max';
        return t('@astryx.dateInput.outOfRangeDate', {
          bounds,
          min: min != null ? writeBound(min) : '',
          max: max != null ? writeBound(max) : '',
        });
      }
      return t('@astryx.dateInput.invalidDate');
    },
    [t, calendarName, format, locale, calendar, min, max],
  );

  const isProviderCalendar = isGregorian
    ? providerCalendar === 'gregory' || providerCalendar === 'iso8601'
    : calendar === providerCalendar;

  return {
    calendar,
    prepare,
    parse,
    formatCommitted,
    getFormatHint,
    calendarDescription: isProviderCalendar
      ? null
      : t('@astryx.dateInput.calendarDescription', {calendar: calendarName}),
    errorMessage,
  };
}
