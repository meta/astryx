// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTypedTime.ts
 * @input Provider locale, a time field's hour format, seconds, bounds, the
 *   caller's status, the shared time parser, Field/useEntryErrorReport for
 *   the rejection status, alert and report, Field/useValueReplacesEntry for
 *   when a new value replaces the kept draft, and the field's resolved entry
 *   error behavior
 * @output useTypedTime, the typed-time draft and its rejection that TimeInput
 *   and DateTimeInput's time segment share, and TimeInputEntryError
 * @position TimeInput helper hook; used by TimeInput and DateTimeInput
 */

import {useCallback, useState} from 'react';
import type {InputStatus} from '../Field/types';
import type {EntryErrorBehavior} from '../FormLayout/FormLayoutContext';
import {
  isSameEntryError,
  useEntryErrorReport,
} from '../Field/useEntryErrorReport';
import {useValueReplacesEntry} from '../Field/useValueReplacesEntry';
import {useLocale} from '../i18n/useLocale';
import {isTimeInRange, type ISOTimeString} from '../utils/timeParser';
import {
  isLocaleTimeComplete,
  parseLocaleTime,
  type HourFormat,
} from '../utils/timeFormat';

/**
 * Why a time field rejects the text that a person typed. The field reports it
 * through `onEntryErrorChange`, so the app can word its own message.
 */
export interface TimeInputEntryError {
  /**
   * The reason, independent of the locale:
   * - `'unreadable'`: text that is not a time
   * - `'outOfRange'`: a time before `min` or after `max`
   */
  kind: 'unreadable' | 'outOfRange';
  /** The typed text. */
  text: string;
  /** The ISO time that the text names. It is set for `outOfRange`. */
  value?: ISOTimeString;
}

interface Draft {
  /** The time the text names, when the field accepts it. */
  time: ISOTimeString | null;
  rejection: TimeInputEntryError | null;
  /**
   * Under `'complete'`, a complete rejected time shows its rejection while the
   * person types.
   */
  isComplete: boolean;
}

const EMPTY_DRAFT: Draft = {time: null, rejection: null, isComplete: false};

export interface UseTypedTimeOptions {
  /** The committed time. A change from outside drops the draft. */
  value: ISOTimeString | undefined;
  hourFormat: HourFormat;
  hasSeconds: boolean;
  min: ISOTimeString | undefined;
  max: ISOTimeString | undefined;
  /** Becoming disabled drops the draft; while disabled, typing and commits do nothing. */
  isDisabled: boolean;
  /** A disabled or busy field hides its rejection and reports `null`. */
  isLocked: boolean;
  /** Without the typed input, the field drops its draft. */
  hasTypedField: boolean;
  errorMessage: string;
  /** Whether the shown status announces itself, as Field's status does. */
  isStatusAnnounced: boolean;
  /** The caller's status. */
  status?: InputStatus;
  onEntryErrorChange?: (error: TimeInputEntryError | null) => void;
  /**
   * Under `'blur-or-enter'`, typing and native edits reveal no rejection:
   * only Enter or blur does. An edit that the field accepts or empties still
   * clears a revealed rejection at once.
   */
  entryErrorBehavior: EntryErrorBehavior;
}

/** The rejection of a native control: none, waiting for a commit, or shown. */
type SurfaceRejection = 'none' | 'held' | 'shown';

/**
 * The typed draft of a time field and its rejection. A rejection shows at
 * Enter or blur, or under `'complete'` once the draft is complete, and stays
 * through edits that leave the draft rejected or unfinished. A native
 * control's rejection, set through `setSurfaceRejected`, shows at once under
 * `'complete'` and at `commitSurface` under `'blur-or-enter'`. It is never
 * reported.
 * `handleChange` and `commit` return the time for the owner to commit:
 * `undefined` for emptied text, null for none.
 */
export function useTypedTime({
  value,
  hourFormat,
  hasSeconds,
  min,
  max,
  isDisabled,
  isLocked,
  hasTypedField,
  errorMessage,
  isStatusAnnounced,
  status,
  onEntryErrorChange,
  entryErrorBehavior,
}: UseTypedTimeOptions) {
  const revealsComplete = entryErrorBehavior === 'complete';
  const locale = useLocale();
  const [pendingInput, setPendingInput] = useState<string | null>(null);
  // How the draft was last committed. After blur, a hidden input carries the
  // field's name until the next edit.
  const [committedBy, setCommittedBy] = useState<'enter' | 'blur' | null>(null);
  // Counts the commits that kept a rejected draft.
  const [keptCommits, setKeptCommits] = useState(0);
  // The rejection last revealed. An edit that leaves the draft rejected but
  // not complete keeps it.
  const [keptRejection, setKeptRejection] =
    useState<TimeInputEntryError | null>(null);
  const [surfaceRejection, setSurfaceRejection] =
    useState<SurfaceRejection>('none');
  // The time that typing last committed, so its echo through `value` keeps
  // the draft.
  const [lastCommitted, setLastCommitted] = useState<{
    time: ISOTimeString | undefined;
  } | null>(null);

  const readDraft = useCallback(
    (text: string): Draft => {
      if (!text.trim()) {
        return EMPTY_DRAFT;
      }
      const time = parseLocaleTime(text, locale, hasSeconds);
      if (time == null) {
        return {
          time: null,
          rejection: {kind: 'unreadable', text},
          isComplete: false,
        };
      }
      if (!isTimeInRange(time, min, max)) {
        return {
          time: null,
          rejection: {kind: 'outOfRange', text, value: time},
          isComplete: isLocaleTimeComplete(
            text,
            locale,
            hourFormat,
            hasSeconds,
          ),
        };
      }
      return {time, rejection: null, isComplete: true};
    },
    [locale, hasSeconds, min, max, hourFormat],
  );

  const drop = useCallback(() => {
    setPendingInput(null);
    setCommittedBy(null);
    setKeptRejection(null);
  }, []);

  // A value from outside, disabling, and leaving the typed surface drop the
  // draft. Adjusted during render, so no render shows a stale draft. The echo
  // of a time that typing committed keeps the draft.
  const isNewValue = useValueReplacesEntry(value, keptCommits);
  const isEcho = lastCommitted !== null && value === lastCommitted.time;
  if (isNewValue && surfaceRejection !== 'none') {
    setSurfaceRejection('none');
  }
  if (isNewValue && !isEcho) {
    setLastCommitted(null);
    if (pendingInput !== null) {
      drop();
    }
  }
  const [wasDisabled, setWasDisabled] = useState(isDisabled);
  if (isDisabled !== wasDisabled) {
    setWasDisabled(isDisabled);
    if (isDisabled && pendingInput !== null) {
      drop();
    }
    if (isDisabled && surfaceRejection !== 'none') {
      setSurfaceRejection('none');
    }
  }
  // A rejection belongs to the surface that showed it. A switch between the
  // typed field and a native control ends it.
  const [hadTypedField, setHadTypedField] = useState(hasTypedField);
  if (hasTypedField !== hadTypedField) {
    setHadTypedField(hasTypedField);
    if (surfaceRejection !== 'none') {
      setSurfaceRejection('none');
    }
  }
  if (!hasTypedField && pendingInput !== null) {
    drop();
  }

  const draft = pendingInput !== null ? readDraft(pendingInput) : EMPTY_DRAFT;
  const freshRejection =
    draft.rejection != null &&
    (committedBy != null || (revealsComplete && draft.isComplete))
      ? draft.rejection
      : null;
  if (draft.rejection == null) {
    if (keptRejection != null) {
      setKeptRejection(null);
    }
  } else if (
    freshRejection != null &&
    !isSameEntryError(freshRejection, keptRejection)
  ) {
    setKeptRejection(freshRejection);
  }
  const entryError =
    isLocked || draft.rejection == null
      ? null
      : (freshRejection ?? keptRejection);
  const isSurfaceRejectionShown =
    !isLocked &&
    (surfaceRejection === 'shown' ||
      (revealsComplete && surfaceRejection === 'held'));
  const isRejected = entryError != null || isSurfaceRejectionShown;

  // A caller error with a message always shows in place of the field's own
  // message.
  const {fieldStatus, alertMessage, reportEntryError} = useEntryErrorReport({
    entryError,
    rejectionMessage: isRejected ? errorMessage : null,
    status,
    isStatusAnnounced,
    callerErrorPrecedence: 'always',
    onEntryErrorChange,
  });

  // A locked field reports once it is editable.
  const reportIfEditable = useCallback(
    (error: TimeInputEntryError | null) => !isLocked && reportEntryError(error),
    [isLocked, reportEntryError],
  );

  const handleChange = useCallback(
    (text: string) => {
      if (isDisabled) {
        return null;
      }
      setPendingInput(text);
      setCommittedBy(null);
      const next = readDraft(text);
      if (next.rejection == null || (revealsComplete && next.isComplete)) {
        reportIfEditable(next.rejection);
      }
      if (next.time == null || next.time === value) {
        return null;
      }
      setLastCommitted({time: next.time});
      return next.time;
    },
    [isDisabled, readDraft, revealsComplete, reportIfEditable, value],
  );

  const reset = useCallback(() => {
    drop();
    reportEntryError(null);
  }, [drop, reportEntryError]);

  const commit = useCallback(
    (trigger: 'enter' | 'blur') => {
      if (pendingInput === null || isDisabled) {
        return null;
      }
      const current = readDraft(pendingInput);
      if (current.rejection != null) {
        // Keep the text and show why it cannot commit.
        setCommittedBy(by => (by === 'blur' ? by : trigger));
        setKeptCommits(count => count + 1);
        reportIfEditable(current.rejection);
        return null;
      }
      if (trigger === 'blur') {
        reset();
      }
      const time = current.time ?? undefined;
      if (time === value) {
        return null;
      }
      setLastCommitted({time});
      return time;
    },
    [pendingInput, isDisabled, readDraft, reportIfEditable, value, reset],
  );

  // An edit that stays rejected keeps a shown rejection.
  const setSurfaceRejected = useCallback(
    (isRejected: boolean) =>
      setSurfaceRejection(prev => {
        if (!isRejected) {
          return 'none';
        }
        return revealsComplete || prev === 'shown' ? 'shown' : 'held';
      }),
    [revealsComplete],
  );
  const commitSurface = useCallback(() => {
    if (!isDisabled) {
      setSurfaceRejection(prev => (prev === 'held' ? 'shown' : prev));
    }
  }, [isDisabled]);

  return {
    pendingInput,
    /** A rejection is revealed: it sets `aria-invalid`. */
    isRejected,
    /** A native control's rejection shows: a locked field hides it. */
    isSurfaceRejectionShown,
    setSurfaceRejected,
    /** Shows a native control's rejection that waits, at Enter or blur. */
    commitSurface,
    fieldStatus,
    /** The rejection message that no shown status announces. */
    alertMessage,
    /** Blur kept a rejected draft: a hidden input posts the committed time. */
    isNameOnHiddenInput: committedBy === 'blur' && pendingInput !== null,
    handleChange,
    commit,
    /** Drops the draft, as a picked or stepped time does. */
    reset,
  };
}
