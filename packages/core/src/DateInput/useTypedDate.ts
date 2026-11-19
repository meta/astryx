// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTypedDate.ts
 * @input Provider locale and calendar, a field's format, bounds and constraints;
 *   calendarDateParser, parseDateInput for other Gregorian text,
 *   Field/useEntryErrorReport for the rejection status, alert and report,
 *   Field/useValueReplacesEntry for when a new value replaces a kept entry, and
 *   the field's resolved entry error behavior
 * @output Typed-date reading, committed text, the format hint, the calendar
 *   description and rejection messages for a date text field, the typed
 *   entry state that DateInput and DateTimeInput share, the
 *   DateInputEntryError that the field reports to its caller, and the
 *   rejection state of a native date control
 * @position DateInput helper hook; used by DateInput and DateTimeInput
 */

import {useCallback, useMemo, useState} from 'react';
import type {InputStatus} from '../Field/types';
import type {EntryErrorBehavior} from '../FormLayout/FormLayoutContext';
import {useEntryErrorReport} from '../Field/useEntryErrorReport';
import {useValueReplacesEntry} from '../Field/useValueReplacesEntry';
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

/**
 * Why a date field rejects the text that a person typed. The field reports it
 * through `onEntryErrorChange`, so the app can word its own message.
 */
export interface DateInputEntryError {
  /**
   * The reason, independent of the locale and the calendar:
   * - `'unreadable'`: text that is not a date
   * - `'incomplete'`: part of a date that Enter or blur cannot finish
   * - `'nonexistent'`: a date that the calendar does not have
   * - `'outOfRange'`: a date before `min` or after `max`
   * - `'unavailable'`: a date that `dateConstraints` rules out
   */
  kind:
    'unreadable' | 'incomplete' | 'nonexistent' | 'outOfRange' | 'unavailable';
  /** The typed text. */
  text: string;
  /**
   * The Gregorian ISO date that the text names. It is set for `outOfRange` and
   * `unavailable`.
   */
  date?: ISODateString;
}

function isOutsideBounds(
  date: PlainDate,
  min: ISODateString | undefined,
  max: ISODateString | undefined,
): boolean {
  return (
    (min != null && plainDateIsBefore(date, plainDateFromISO(min))) ||
    (max != null && plainDateIsAfter(date, plainDateFromISO(max)))
  );
}

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

/**
 * The rejection a result shows: the error of text that Enter or blur
 * committed, or, under `'complete'`, of a complete date. Text that is not a
 * date is never complete, so its error waits for the commit.
 */
export function typedDateError(
  result: CalendarDateParseResult | null,
  isCommitted: boolean,
  entryErrorBehavior: EntryErrorBehavior,
): TypedDateError | null {
  if (result == null) {
    return null;
  }
  if (
    (result.kind === 'unreadable' || result.kind === 'incomplete') &&
    isCommitted
  ) {
    return 'unreadable';
  }
  if (
    (result.kind === 'nonexistent' || result.kind === 'outOfRange') &&
    (isCommitted || (result.isComplete && entryErrorBehavior === 'complete'))
  ) {
    return result.kind;
  }
  return null;
}

/** Whether a result is a date that typing commits, which ends a rejection. */
function isAcceptedDate(result: CalendarDateParseResult): boolean {
  return result.kind === 'value' && result.isComplete;
}

/** The rejection a result shows, as the field reports it to its caller. */
function dateEntryError(
  result: CalendarDateParseResult | null,
  isCommitted: boolean,
  text: string,
  min: ISODateString | undefined,
  max: ISODateString | undefined,
  entryErrorBehavior: EntryErrorBehavior,
): DateInputEntryError | null {
  const error = typedDateError(result, isCommitted, entryErrorBehavior);
  if (error == null || result == null) {
    return null;
  }
  if (result.kind === 'incomplete') {
    return {kind: 'incomplete', text};
  }
  if (result.kind === 'outOfRange') {
    return {
      kind: isOutsideBounds(result.date, min, max)
        ? 'outOfRange'
        : 'unavailable',
      text,
      date: plainDateToISO(result.date),
    };
  }
  return {kind: error, text};
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

  const isProviderCalendar = isGregorian
    ? isGregorianCalendar(providerCalendar)
    : calendar === providerCalendar;

  const errorMessage = useCallback(
    (result: CalendarDateParseResult) => {
      if (result.kind === 'nonexistent') {
        return t('@astryx.dateInput.nonexistentDate', {
          named: isProviderCalendar ? 'no' : 'yes',
          calendar: calendarName,
        });
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
        const bounds = !isOutsideBounds(result.date, min, max)
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
    [t, isProviderCalendar, calendarName, format, locale, calendar, min, max],
  );

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
   * rejection. Typed text and its rejection stay, and show again once the
   * field is editable; the next Enter or blur commits the text, and a new
   * `value` replaces it. Once the field is editable, text whose date typing
   * already reported gives way to the field's value.
   */
  isDisabled: boolean;
  /**
   * The caller's status. A shown rejection shows its own error instead,
   * except that a caller with `onEntryErrorChange` words the error: its error
   * status shows in place of the field's own message.
   */
  status?: InputStatus;
  /** Whether the shown status announces itself, as Field's status does. */
  isStatusAnnounced: boolean;
  /**
   * Reports each change of the typed rejection, and null when it ends or when
   * the field unmounts while it stands.
   */
  onEntryErrorChange?: (error: DateInputEntryError | null) => void;
  /** Whether the caller gave a placeholder, which replaces the format hint. */
  hasPlaceholder: boolean;
  /**
   * Under `'blur-or-enter'`, typing reveals no rejection: only Enter or blur
   * does. An edit that makes the text a date or empties it still clears a
   * revealed rejection at once.
   */
  entryErrorBehavior: EntryErrorBehavior;
}

export interface TypedDateField {
  typedDate: TypedDate;
  /** The text the input shows. */
  displayValue: string;
  /** The format hint for an empty focused field. */
  formatHint: string | null;
  /**
   * Whether typed text waits to commit. Unreadable text that Enter or blur
   * kept does not wait: the next Enter submits a surrounding form.
   */
  isPending: boolean;
  /**
   * The text that a hidden input posts under the field's `name` while Enter
   * or blur keeps unreadable text, or null when the text input posts.
   */
  hiddenFormValue: string | null;
  isInvalid: boolean;
  /** The status the field shows. */
  fieldStatus: InputStatus | undefined;
  /** The rejection message that the field status does not announce. */
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
  onEntryErrorChange,
  hasPlaceholder,
  entryErrorBehavior,
  ...options
}: UseTypedDateFieldOptions): TypedDateField {
  const typedDate = useTypedDate(options);
  // Typed text, or null when the field shows the committed value.
  const [pendingInput, setPendingInput] = useState<string | null>(null);
  // Set when Enter or blur keeps rejected text so the person can correct it.
  const [isRejectionCommitted, setIsRejectionCommitted] = useState(false);
  // Counts each Enter or blur that keeps rejected text.
  const [keptCommits, setKeptCommits] = useState(0);
  // Rejected text whose rejection stays shown while an edit leaves the entry
  // rejected or unfinished.
  const [keptText, setKeptText] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  // The date that typing last reported, so one typing session reports each
  // date once. Only the handlers write it. A value from outside and a
  // re-enable retire it by moving `firedEpoch` on, during render, so no
  // render React discards can retire it.
  const [lastFired, setLastFired] = useState<{
    date: ISODateString | undefined;
    epoch: number;
  }>({date: undefined, epoch: 0});
  const [firedEpoch, setFiredEpoch] = useState(0);
  const lastFiredDate =
    lastFired.epoch === firedEpoch ? lastFired.date : undefined;

  const typedResult =
    pendingInput !== null && pendingInput.trim()
      ? typedDate.parse(pendingInput)
      : null;
  const ownError = typedDateError(
    typedResult,
    isRejectionCommitted,
    entryErrorBehavior,
  );
  const keptResult =
    ownError == null &&
    keptText !== null &&
    typedResult != null &&
    !isAcceptedDate(typedResult)
      ? typedDate.parse(keptText)
      : null;
  // The rejection the field shows. A locked field hides it but keeps its
  // state, so the rejection shows again once the field is editable.
  const shown = isDisabled
    ? null
    : ownError != null && typedResult != null && pendingInput !== null
      ? {text: pendingInput, result: typedResult}
      : keptResult != null &&
          keptText !== null &&
          typedDateError(keptResult, true, entryErrorBehavior) != null
        ? {text: keptText, result: keptResult}
        : null;
  const errorMessage =
    shown != null ? typedDate.errorMessage(shown.result) : null;
  const entryError =
    shown != null
      ? dateEntryError(
          shown.result,
          true,
          shown.text,
          options.min,
          options.max,
          entryErrorBehavior,
        )
      : null;
  const shownText = shown?.text ?? null;
  // Unreadable text that Enter or blur kept: the form posts the committed
  // date, as it does where the text gives way to it.
  const isKeptUnreadable =
    isRejectionCommitted && typedResult?.kind === 'unreadable';

  const {fieldStatus, alertMessage, reportEntryError} = useEntryErrorReport({
    entryError,
    rejectionMessage: errorMessage,
    status,
    isStatusAnnounced,
    callerErrorPrecedence: 'withCallback',
    onEntryErrorChange,
  });

  const reset = useCallback(() => {
    setPendingInput(null);
    setIsRejectionCommitted(false);
    setKeptText(null);
    reportEntryError(null);
  }, [reportEntryError]);

  // A new value drops typed text. A value that arrives with an Enter or blur
  // that keeps rejected text does not drop it. A caller can restore its own
  // value there.
  const isEntryReplaced = useValueReplacesEntry(value, keptCommits);
  // A value from outside also retires the date that typing last reported, so
  // a retyped date reports again. Adjusted during render, so it takes no extra
  // commit; state, so a render React discards takes its adjustment with it.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value !== lastFiredDate) {
      setFiredEpoch(epoch => epoch + 1);
      if (pendingInput !== null && isEntryReplaced) {
        setPendingInput(null);
        setIsRejectionCommitted(false);
        setKeptText(null);
      }
    }
  }

  // Typing already reported this date through `onChange`. Once the field is
  // editable, it shows its value. A retyped date then reports again. A focused
  // field keeps the text until Enter or blur, which end the typing session.
  const [wasDisabled, setWasDisabled] = useState(isDisabled);
  if (isDisabled !== wasDisabled) {
    setWasDisabled(isDisabled);
    if (
      !isDisabled &&
      !isFocused &&
      typedResult?.kind === 'value' &&
      plainDateToISO(typedResult.date) === lastFiredDate
    ) {
      setFiredEpoch(epoch => epoch + 1);
      setPendingInput(null);
      setIsRejectionCommitted(false);
      setKeptText(null);
    }
  }

  const report = useCallback(
    (date: ISODateString) => {
      if (date === value || date === lastFiredDate) {
        return false;
      }
      setLastFired({date, epoch: firedEpoch});
      onChange(date);
      return true;
    },
    [value, lastFiredDate, firedEpoch, onChange],
  );

  const handleChange = useCallback(
    (text: string) => {
      if (isDisabled) {
        return;
      }
      // Report a date only once more typing cannot change it.
      const result = typedDate.parse(text);
      const isEmpty = !text.trim();
      const error = isEmpty
        ? null
        : dateEntryError(
            result,
            false,
            text,
            options.min,
            options.max,
            entryErrorBehavior,
          );
      // An edit that leaves the entry rejected or unfinished keeps the shown
      // rejection.
      const nextKeptText =
        error != null || isEmpty || isAcceptedDate(result) ? null : shownText;
      setPendingInput(text);
      setIsRejectionCommitted(false);
      setKeptText(nextKeptText);
      reportEntryError(error ?? (nextKeptText !== null ? entryError : null));
      if (result.kind === 'value' && result.isComplete) {
        const date = plainDateToISO(result.date);
        if (report(date)) {
          onTypedDate?.(date);
        }
      }
    },
    [
      isDisabled,
      typedDate,
      shownText,
      entryError,
      reportEntryError,
      options.min,
      options.max,
      entryErrorBehavior,
      report,
      onTypedDate,
    ],
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
      result.kind === 'unreadable' ||
      result.kind === 'incomplete' ||
      result.kind === 'nonexistent' ||
      result.kind === 'outOfRange'
    ) {
      // Keep the text and show why it cannot commit; never finish or adjust
      // the date.
      setIsRejectionCommitted(true);
      setKeptCommits(count => count + 1);
      setKeptText(null);
      reportEntryError(
        dateEntryError(
          result,
          true,
          pendingInput,
          options.min,
          options.max,
          entryErrorBehavior,
        ),
      );
      return;
    }
    if (result.kind === 'value') {
      report(plainDateToISO(result.date));
    }
    // A new typing session reports a retyped date again.
    setLastFired({date: undefined, epoch: firedEpoch});
    reset();
  }, [
    pendingInput,
    isDisabled,
    onClear,
    typedDate,
    reportEntryError,
    options.min,
    options.max,
    entryErrorBehavior,
    report,
    reset,
    firedEpoch,
  ]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    typedDate.prepare();
  }, [typedDate]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    commit();
  }, [commit]);

  const committedText =
    shownValue != null && /^\d{4}-\d{2}-\d{2}$/.test(shownValue)
      ? typedDate.formatCommitted(shownValue)
      : '';
  const displayValue = pendingInput ?? committedText;

  return {
    typedDate,
    displayValue,
    formatHint:
      !hasPlaceholder && isFocused && !displayValue
        ? typedDate.getFormatHint()
        : null,
    isPending: pendingInput !== null && !isKeptUnreadable,
    hiddenFormValue: isKeptUnreadable ? committedText : null,
    isInvalid: shown != null,
    fieldStatus,
    alertMessage,
    handleChange,
    commit,
    handleFocus,
    handleBlur,
    reset,
  };
}

export interface UseNativeDateRejectionOptions {
  /** The component that names itself in development warnings. */
  source: string;
  /** The format that writes the bounds in the message. */
  format: SharedDateFormat | ((value: ISODateString) => string);
  min?: ISODateString;
  max?: ISODateString;
  isDateDisabled: (date: PlainDate) => boolean;
  /** The committed date. A new value ends the rejection. */
  value: ISODateString | undefined;
  /** A disabled or busy field hides the rejection and ignores commits. */
  isLocked: boolean;
  /**
   * The caller's status. A shown rejection shows its own error instead,
   * except that a caller with `onEntryErrorChange` words the error: its error
   * status with a message shows in place of the field's own message.
   */
  status?: InputStatus;
  /** Whether the caller passes `onEntryErrorChange`. */
  hasEntryErrorCallback: boolean;
  /** Whether the shown status announces itself, as Field's status does. */
  isStatusAnnounced: boolean;
}

export interface NativeDateRejection {
  /** Null until Enter or blur reveals a refused date. */
  message: string | null;
  /** The status the field shows. */
  fieldStatus: InputStatus | undefined;
  /** The rejection message that the field status does not announce. */
  alertMessage: string;
  /** Whether a refused date waits for the next commit or shows. */
  isRefused: boolean;
  /** Holds a date that the field refuses until the next commit. */
  refuse: (date: PlainDate) => void;
  /** Ends the rejection, for an accepted date or an emptied control. */
  clear: () => void;
  /** Shows the rejection of the refused date that waits, on Enter or blur. */
  commit: () => void;
}

const NO_REFUSAL = {held: null, shown: null} as const;

/**
 * The rejection of a native date control. While a person types the year, the
 * control reports each partial year as a date, so a refused date waits for
 * Enter or blur. The rejection then stays after the control restores the
 * committed date, until the control reports a date the field accepts or
 * nothing.
 */
export function useNativeDateRejection({
  value,
  isLocked,
  status,
  hasEntryErrorCallback,
  isStatusAnnounced,
  ...options
}: UseNativeDateRejectionOptions): NativeDateRejection {
  const typedDate = useTypedDate({...options, calendar: 'gregory'});
  const [refusal, setRefusal] = useState<{
    held: ISODateString | null;
    shown: ISODateString | null;
  }>(NO_REFUSAL);
  // Counts each Enter or blur, which shows a refused date that stands.
  const [commits, setCommits] = useState(0);
  // A new value ends the rejection. A value that arrives with an Enter or blur
  // that shows the rejection does not end it. A caller can restore its own
  // value there.
  const isRefusalReplaced = useValueReplacesEntry(value, commits);
  if (isRefusalReplaced && refusal !== NO_REFUSAL) {
    setRefusal(NO_REFUSAL);
  }

  const refuse = useCallback((date: PlainDate) => {
    const held = plainDateToISO(date);
    setRefusal(prev => (prev.held === held ? prev : {...prev, held}));
  }, []);
  const clear = useCallback(() => setRefusal(NO_REFUSAL), []);
  const commit = useCallback(() => {
    if (!isLocked) {
      setCommits(count => count + 1);
      setRefusal(prev =>
        prev.held === null ? prev : {held: null, shown: prev.held},
      );
    }
  }, [isLocked]);

  const message =
    !isLocked && refusal.shown !== null
      ? typedDate.errorMessage({
          kind: 'outOfRange',
          date: plainDateFromISO(refusal.shown),
          isComplete: true,
        })
      : null;
  const callerErrorMessage =
    hasEntryErrorCallback && status?.type === 'error' && status.message
      ? status.message
      : null;

  // A rejection that starts under the caller's error message changes no
  // status, so the alert announces that message once. A later change of the
  // caller's message ends the repeat, because Field announces the change.
  const isRejected = message != null;
  const [repeat, setRepeat] = useState<{
    isRejected: boolean;
    message: string | null;
  }>({isRejected: false, message: null});
  if (repeat.isRejected !== isRejected) {
    setRepeat({isRejected, message: isRejected ? callerErrorMessage : null});
  } else if (repeat.message !== null && repeat.message !== callerErrorMessage) {
    setRepeat({isRejected, message: null});
  }

  let alertMessage = '';
  if (message != null) {
    if (!isStatusAnnounced) {
      alertMessage = callerErrorMessage ?? message;
    } else if (
      callerErrorMessage != null &&
      callerErrorMessage === repeat.message
    ) {
      alertMessage = callerErrorMessage;
    }
  }

  return {
    message,
    fieldStatus:
      message != null && callerErrorMessage == null
        ? {type: 'error', message}
        : status,
    alertMessage,
    isRefused: refusal !== NO_REFUSAL,
    refuse,
    clear,
    commit,
  };
}
