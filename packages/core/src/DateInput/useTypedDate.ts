// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTypedDate.ts
 * @input Provider locale and calendar, a field's format, bounds and constraints;
 *   calendarDateParser, and parseDateInput for other Gregorian text
 * @output Typed-date reading, committed text, the format hint, the calendar
 *   description and rejection messages for a date text field, and the typed
 *   entry state that DateInput and DateTimeInput share
 * @position DateInput helper hook; used by DateInput and DateTimeInput
 */

import {useCallback, useMemo, useRef, useState} from 'react';
import type {InputStatus} from '../Field/types';
import {useLocale} from '../i18n/useLocale';
import {useCalendarSystem} from '../i18n/useCalendarSystem';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/DateInput/useTypedDate.generated';
import {
  type CalendarSystem,
  isGregorianCalendar,
} from '../utils/calendarSystem';
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
  plainDateToISO,
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
  const isGregorian = isGregorianCalendar(calendar);

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
    ? isGregorianCalendar(providerCalendar)
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

export interface UseTypedDateFieldOptions extends UseTypedDateOptions {
  /** The committed date. */
  value: ISODateString | undefined;
  /** The date the field shows, which leads `value` while a commit is in flight. */
  shownValue: ISODateString | undefined;
  /** Reports a typed date. */
  onChange: (value: ISODateString) => void;
  /** Runs when Enter or blur commits emptied text. */
  onClear: () => void;
  /** Runs when typing completes a new date, such as to show its month. */
  onTypedDate?: (value: ISODateString) => void;
  /**
   * A disabled or busy field ignores typing, Enter and blur, and hides a typed
   * rejection. Typed text stays until the next Enter or blur once the field is
   * editable, or until `value` changes. Once the field is editable, text whose
   * date typing already reported gives way to the field's value.
   */
  isDisabled: boolean;
  /** The caller's status. Rejected text that stays shows its own error instead. */
  status?: InputStatus;
  /** Whether the shown status announces itself, as Field's status does. */
  isStatusAnnounced: boolean;
  /** Whether the caller gave a placeholder, which replaces the format hint. */
  hasPlaceholder: boolean;
}

export interface TypedDateField {
  typedDate: TypedDate;
  /** The text the input shows. */
  displayValue: string;
  /** The format hint for an empty focused field. */
  formatHint: string | null;
  /** Whether typed text waits to commit. */
  isPending: boolean;
  isInvalid: boolean;
  /** The status the field shows. */
  fieldStatus: InputStatus | undefined;
  /** A typed rejection that the field status does not announce. */
  alertMessage: string;
  handleChange: (text: string) => void;
  /** Commits typed text, on Enter or blur. */
  commit: () => void;
  handleFocus: () => void;
  handleBlur: () => void;
  /** Drops typed text after a date is picked another way. */
  reset: () => void;
}

/** The typed entry of a date text field: its text, rejections, and commits. */
export function useTypedDateField({
  value,
  shownValue,
  onChange,
  onClear,
  onTypedDate,
  isDisabled,
  status,
  isStatusAnnounced,
  hasPlaceholder,
  ...options
}: UseTypedDateFieldOptions): TypedDateField {
  const typedDate = useTypedDate(options);
  // Typed text, or null when the field shows the committed value.
  const [pendingInput, setPendingInput] = useState<string | null>(null);
  // Set when Enter or blur keeps rejected text so the person can correct it.
  const [isRejectionCommitted, setIsRejectionCommitted] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // The date that typing last reported, so one typing session reports each
  // date once.
  const lastFiredRef = useRef<ISODateString | undefined>(undefined);

  const typedResult =
    pendingInput !== null && pendingInput.trim()
      ? typedDate.parse(pendingInput)
      : null;
  // A locked field hides the rejection but keeps its state, so the rejection
  // shows again once the field is editable.
  const typedError = isDisabled
    ? null
    : typedDateError(typedResult, isRejectionCommitted);
  const errorMessage =
    typedError != null && typedResult != null
      ? typedDate.errorMessage(typedResult)
      : null;
  // Text that stays in the field shows its reason as well as announcing it.
  const isErrorShown =
    typedError === 'nonexistent' ||
    typedError === 'outOfRange' ||
    (typedError === 'unreadable' && isRejectionCommitted);
  const typedStatus: InputStatus | undefined =
    isErrorShown && errorMessage != null
      ? {type: 'error', message: errorMessage}
      : undefined;
  const fieldStatus = typedStatus ?? status;

  const reset = useCallback(() => {
    setPendingInput(null);
    setIsRejectionCommitted(false);
  }, []);

  // A value from outside drops typed text. Computed during render, so it
  // takes no extra render.
  const prevValueRef = useRef(value);
  if (value !== prevValueRef.current) {
    prevValueRef.current = value;
    if (value !== lastFiredRef.current) {
      lastFiredRef.current = undefined;
      if (pendingInput !== null) {
        setPendingInput(null);
        setIsRejectionCommitted(false);
      }
    }
  }

  // Typing already reported this date through `onChange`. Once the field is
  // editable, it shows its value. A retyped date then reports again. A focused
  // field keeps the text until Enter or blur, which end the typing session.
  const wasDisabledRef = useRef(isDisabled);
  if (isDisabled !== wasDisabledRef.current) {
    wasDisabledRef.current = isDisabled;
    if (
      !isDisabled &&
      !isFocused &&
      typedResult?.kind === 'value' &&
      plainDateToISO(typedResult.date) === lastFiredRef.current
    ) {
      lastFiredRef.current = undefined;
      setPendingInput(null);
      setIsRejectionCommitted(false);
    }
  }

  const report = useCallback(
    (date: ISODateString) => {
      if (date === value || date === lastFiredRef.current) {
        return false;
      }
      lastFiredRef.current = date;
      onChange(date);
      return true;
    },
    [value, onChange],
  );

  const handleChange = useCallback(
    (text: string) => {
      if (isDisabled) {
        return;
      }
      setPendingInput(text);
      setIsRejectionCommitted(false);
      // Report a date only once more typing cannot change it.
      const result = typedDate.parse(text);
      if (result.kind === 'value' && result.isComplete) {
        const date = plainDateToISO(result.date);
        if (report(date)) {
          onTypedDate?.(date);
        }
      }
    },
    [isDisabled, typedDate, report, onTypedDate],
  );

  const commit = useCallback(() => {
    if (pendingInput === null || isDisabled) {
      return;
    }
    if (!pendingInput.trim()) {
      onClear();
      reset();
      return;
    }
    const result = typedDate.parse(pendingInput);
    if (
      result.kind === 'incomplete' ||
      result.kind === 'nonexistent' ||
      result.kind === 'outOfRange'
    ) {
      // Keep the text and show why it cannot commit; never finish or adjust
      // the date.
      setIsRejectionCommitted(true);
      return;
    }
    if (result.kind === 'value') {
      report(plainDateToISO(result.date));
    }
    // A new typing session reports a retyped date again.
    lastFiredRef.current = undefined;
    reset();
  }, [pendingInput, isDisabled, onClear, typedDate, report, reset]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    typedDate.prepare();
  }, [typedDate]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    commit();
  }, [commit]);

  const displayValue =
    pendingInput !== null
      ? pendingInput
      : shownValue != null && /^\d{4}-\d{2}-\d{2}$/.test(shownValue)
        ? typedDate.formatCommitted(shownValue)
        : '';

  return {
    typedDate,
    displayValue,
    formatHint:
      !hasPlaceholder && isFocused && !displayValue
        ? typedDate.getFormatHint()
        : null,
    isPending: pendingInput !== null,
    isInvalid: typedError != null,
    fieldStatus,
    alertMessage:
      isStatusAnnounced && typedStatus != null ? '' : (errorMessage ?? ''),
    handleChange,
    commit,
    handleFocus,
    handleBlur,
    reset,
  };
}
