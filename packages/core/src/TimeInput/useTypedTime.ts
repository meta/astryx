// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTypedTime.ts
 * @input Provider locale, a time field's hour format, seconds, bounds, the
 *   caller's status, and the shared time parser
 * @output useTypedTime, the typed-time draft and its rejection that TimeInput
 *   and DateTimeInput's time segment share, and TimeInputEntryError
 * @position TimeInput helper hook; used by TimeInput and DateTimeInput
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import type {InputStatus} from '../Field/types';
import {useCommittedRef} from '../hooks/useCommittedRef';
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

function isSameEntryError(
  a: TimeInputEntryError | null,
  b: TimeInputEntryError | null,
): boolean {
  return (
    a === b ||
    (a != null &&
      b != null &&
      a.kind === b.kind &&
      a.text === b.text &&
      a.value === b.value)
  );
}

interface Draft {
  /** The time the text names, when the field accepts it. */
  time: ISOTimeString | null;
  rejection: TimeInputEntryError | null;
  /** A complete rejected time shows its rejection while the person types. */
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
  /** Whether the field may show its own message as its status. */
  canShowMessage: boolean;
  /** The caller's status, which announces itself. */
  status?: InputStatus;
  onEntryErrorChange?: (error: TimeInputEntryError | null) => void;
}

/**
 * The typed draft of a time field and its rejection. A rejection shows once
 * the draft is complete, or at Enter or blur, and stays through edits that
 * leave the draft rejected or unfinished. A native control's rejection, set
 * through `setSurfaceRejected`, shows the same way and is never reported.
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
  canShowMessage,
  status,
  onEntryErrorChange,
}: UseTypedTimeOptions) {
  const locale = useLocale();
  const [pendingInput, setPendingInput] = useState<string | null>(null);
  // How the draft was last committed. After blur, a hidden input carries the
  // field's name until the next edit.
  const [committedBy, setCommittedBy] = useState<'enter' | 'blur' | null>(null);
  // The rejection last revealed. An edit that leaves the draft rejected but
  // not complete keeps it.
  const [keptRejection, setKeptRejection] =
    useState<TimeInputEntryError | null>(null);
  const [isSurfaceRejected, setSurfaceRejected] = useState(false);
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
  // draft. Adjusted during render, so no render shows a stale draft.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (isSurfaceRejected) {
      setSurfaceRejected(false);
    }
    if (lastCommitted === null || value !== lastCommitted.time) {
      setLastCommitted(null);
      if (pendingInput !== null) {
        drop();
      }
    }
  }
  const [wasDisabled, setWasDisabled] = useState(isDisabled);
  if (isDisabled !== wasDisabled) {
    setWasDisabled(isDisabled);
    if (isDisabled && pendingInput !== null) {
      drop();
    }
    if (isDisabled && isSurfaceRejected) {
      setSurfaceRejected(false);
    }
  }
  // A rejection belongs to the surface that showed it. A switch between the
  // typed field and a native control ends it.
  const [hadTypedField, setHadTypedField] = useState(hasTypedField);
  if (hasTypedField !== hadTypedField) {
    setHadTypedField(hasTypedField);
    if (isSurfaceRejected) {
      setSurfaceRejected(false);
    }
  }
  if (!hasTypedField && pendingInput !== null) {
    drop();
  }

  const draft = pendingInput !== null ? readDraft(pendingInput) : EMPTY_DRAFT;
  const freshRejection =
    draft.rejection != null && (committedBy != null || draft.isComplete)
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
  const isSurfaceRejectionShown = !isLocked && isSurfaceRejected;
  const isRejected = entryError != null || isSurfaceRejectionShown;

  // The rejection that the caller last received. Handlers report a rejection
  // that they cause in the same update. A rejection that a prop change causes
  // reaches the caller only after the render. Until then the field keeps the
  // caller's status, so it never shows and announces its own message just
  // before the caller's message replaces it.
  const [heardEntryError, setHeardEntryError] =
    useState<TimeInputEntryError | null>(null);
  const reportedEntryErrorRef = useRef<TimeInputEntryError | null>(null);
  // The callback of the latest commit, for the report at unmount.
  const latestEntryErrorCallbackRef = useCommittedRef(onEntryErrorChange);
  const hasEntryErrorCallback = onEntryErrorChange != null;
  const isCallerBehind =
    hasEntryErrorCallback && !isSameEntryError(entryError, heardEntryError);
  // A caller error with a message shows in place of the field's own message.
  // A warning or a success never hides a rejection.
  const callerErrorMessage =
    status?.type === 'error' && status.message ? status.message : null;
  const ownStatus: InputStatus | undefined =
    isRejected && canShowMessage
      ? {type: 'error', message: errorMessage}
      : undefined;
  const fieldStatus =
    isCallerBehind || callerErrorMessage != null
      ? status
      : (ownStatus ?? status);

  // The caller's status announces itself when it appears or changes. A
  // rejection that starts under the caller's error message changes no status,
  // so with the callback the field's alert announces that message once. This
  // record holds the error message that the status showed while no rejection
  // stood. A change of the shown message during the rejection ends the
  // repeat, because the status announces that change.
  const shownErrorMessage =
    fieldStatus?.type === 'error' ? (fieldStatus.message ?? null) : null;
  const [statusRecord, setStatusRecord] = useState<{
    message: string | null;
    isRepeatable: boolean;
  }>({message: shownErrorMessage, isRepeatable: true});
  const statusRecordInput = `${isRejected}:${shownErrorMessage}`;
  const [prevStatusRecordInput, setPrevStatusRecordInput] =
    useState(statusRecordInput);
  if (statusRecordInput !== prevStatusRecordInput) {
    setPrevStatusRecordInput(statusRecordInput);
    if (!isRejected) {
      if (
        statusRecord.message !== shownErrorMessage ||
        !statusRecord.isRepeatable
      ) {
        setStatusRecord({message: shownErrorMessage, isRepeatable: true});
      }
    } else if (
      statusRecord.isRepeatable &&
      statusRecord.message !== shownErrorMessage
    ) {
      setStatusRecord({message: statusRecord.message, isRepeatable: false});
    }
  }

  let alertMessage = '';
  if (isRejected && !isCallerBehind) {
    if (callerErrorMessage != null) {
      if (!hasEntryErrorCallback) {
        alertMessage = errorMessage;
      } else if (
        statusRecord.isRepeatable &&
        statusRecord.message === callerErrorMessage
      ) {
        alertMessage = callerErrorMessage;
      }
    } else if (ownStatus == null) {
      alertMessage = errorMessage;
    }
  }

  const reportEntryError = useCallback(
    (error: TimeInputEntryError | null) => {
      if (onEntryErrorChange == null) {
        return;
      }
      setHeardEntryError(error);
      if (!isSameEntryError(error, reportedEntryErrorRef.current)) {
        reportedEntryErrorRef.current = error;
        onEntryErrorChange(error);
      }
    },
    [onEntryErrorChange],
  );

  // Syncs the caller's entry error with a rejection that a new `min`, `max`,
  // `value`, or disabled state starts, changes, or ends.
  useEffect(() => {
    if (onEntryErrorChange == null) {
      return;
    }
    if (!isSameEntryError(entryError, reportedEntryErrorRef.current)) {
      reportedEntryErrorRef.current = entryError;
      // Called through the ref: the set-state-in-effect rule takes a call to a
      // hook parameter for the whole hook's body.
      latestEntryErrorCallbackRef.current?.(entryError);
    }
    if (!isSameEntryError(entryError, heardEntryError)) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- shows the field's own message once the caller has the rejection
      setHeardEntryError(entryError);
    }
  }, [
    entryError,
    heardEntryError,
    onEntryErrorChange,
    latestEntryErrorCallbackRef,
  ]);

  // Syncs the caller's entry error at unmount. A presentation or pointer
  // change can replace the field while its reported rejection stands, and
  // the rejection ends with the field.
  useEffect(
    () => () => {
      if (reportedEntryErrorRef.current != null) {
        reportedEntryErrorRef.current = null;
        latestEntryErrorCallbackRef.current?.(null);
      }
    },
    [latestEntryErrorCallbackRef],
  );

  const handleChange = useCallback(
    (text: string) => {
      if (isDisabled) {
        return null;
      }
      setPendingInput(text);
      setCommittedBy(null);
      const next = readDraft(text);
      if (next.rejection == null) {
        reportEntryError(null);
      } else if (next.isComplete) {
        reportEntryError(next.rejection);
      }
      if (next.time == null || next.time === value) {
        return null;
      }
      setLastCommitted({time: next.time});
      return next.time;
    },
    [isDisabled, readDraft, reportEntryError, value],
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
        reportEntryError(current.rejection);
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
    [pendingInput, isDisabled, readDraft, reportEntryError, value, reset],
  );

  return {
    pendingInput,
    /** A rejection is revealed: it sets `aria-invalid`. */
    isRejected,
    /** A native control's rejection shows: a locked field hides it. */
    isSurfaceRejectionShown,
    setSurfaceRejected,
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
