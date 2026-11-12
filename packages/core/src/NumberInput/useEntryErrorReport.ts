// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useEntryErrorReport.ts
 * @input A NumberInput's rejection of typed text, the caller's status and
 *   onEntryErrorChange, and whether a shown status announces itself
 * @output NumberInputEntryError, the status the field shows, the message its
 *   alert announces, and the report of each changed rejection to the caller
 * @position NumberInput helper hook; used by NumberInput.tsx
 *
 * SYNC: When modified, update /packages/core/src/NumberInput/NumberInput.tsx
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {useCommittedRef} from '../hooks/useCommittedRef';
import type {InputStatus} from '../Field/types';
import type {NumberInputRejection} from './numberInputCommit';

/**
 * Why a NumberInput rejects the text that a person typed. The field reports
 * it through `onEntryErrorChange`, so the app can word its own message.
 */
export interface NumberInputEntryError {
  /**
   * The reason, independent of the locale:
   * - `'unreadable'`: text that is not a number
   * - `'fractional'`: a number with a fraction in an `isIntegerOnly` field
   * - `'outOfRange'`: any number while `min` is above `max`, so no number fits
   */
  kind: 'unreadable' | 'fractional' | 'outOfRange';
  /** The typed text. */
  text: string;
  /** The number that the text names. It is set for `fractional` and `outOfRange`. */
  value?: number;
}

export function toEntryError(
  text: string,
  rejection: NumberInputRejection | null,
): NumberInputEntryError | null {
  if (rejection == null) {
    return null;
  }
  return rejection.kind === 'unreadable'
    ? {kind: 'unreadable', text}
    : {kind: rejection.kind, text, value: rejection.value};
}

export function isSameEntryError(
  a: NumberInputEntryError | null,
  b: NumberInputEntryError | null,
): boolean {
  return (
    a === b ||
    (a != null &&
      b != null &&
      a.kind === b.kind &&
      a.text === b.text &&
      Object.is(a.value, b.value))
  );
}

interface UseEntryErrorReportOptions {
  /** The rejection that the field holds, or null while it is disabled. */
  entryError: NumberInputEntryError | null;
  /** The rejection that the field shows: none while a held stepper runs. */
  shownEntryError: NumberInputEntryError | null;
  /** The caller's status. */
  status: InputStatus | undefined;
  /** The field's own message for a rejection. */
  rejectionMessage: string;
  /** Whether the shown status announces itself, as Field's status does. */
  isStatusAnnounced: boolean;
  onEntryErrorChange:
    ((error: NumberInputEntryError | null) => void) | undefined;
}

interface EntryErrorReport {
  /** The status the field shows. */
  fieldStatus: InputStatus | undefined;
  /** The rejection message that the field status does not announce. */
  alertMessage: string;
  /** Reports a rejection that a handler causes, in the same update. */
  reportEntryError: (error: NumberInputEntryError | null) => void;
}

export function useEntryErrorReport(
  options: UseEntryErrorReportOptions,
): EntryErrorReport {
  const {
    entryError,
    shownEntryError,
    status,
    rejectionMessage,
    isStatusAnnounced,
    onEntryErrorChange,
  } = options;
  // The rejection that the caller last received. Handlers report a rejection
  // that they cause in the same update. A rejection that a prop change causes
  // reaches the caller only after the render. Until then the field keeps the
  // caller's status, so it never shows and announces its own message just
  // before the caller's message replaces it.
  const [heardEntryError, setHeardEntryError] =
    useState<NumberInputEntryError | null>(null);
  const reportedEntryErrorRef = useRef<NumberInputEntryError | null>(null);
  // The callback of the latest commit, for the report at unmount.
  const latestEntryErrorCallbackRef = useCommittedRef(onEntryErrorChange);
  const hasEntryErrorCallback = onEntryErrorChange != null;
  const isCallerBehind =
    hasEntryErrorCallback && !isSameEntryError(entryError, heardEntryError);
  // A caller error message shows in place of the field's message. A warning
  // or a success never hides a rejection.
  const callerErrorMessage =
    status?.type === 'error' && status.message ? status.message : null;
  const fieldStatus: InputStatus | undefined =
    shownEntryError == null || isCallerBehind || callerErrorMessage != null
      ? status
      : {type: 'error', message: rejectionMessage};

  // Field announces its status when the status appears or changes. A
  // rejection that starts under the caller's error message changes no status,
  // so the field's alert announces that message once for a caller that words
  // the rejection. This record holds the error message that the status showed
  // while no rejection stood. A change of the shown message during the
  // rejection ends the repeat, because Field announces that change.
  const shownErrorMessage =
    fieldStatus?.type === 'error' ? (fieldStatus.message ?? null) : null;
  const [statusRecord, setStatusRecord] = useState<{
    message: string | null;
    isRepeatable: boolean;
  }>({message: shownErrorMessage, isRepeatable: true});
  // The alert and the status change in the same render.
  const statusRecordInput = `${shownEntryError != null}:${shownErrorMessage}`;
  const [recordedInput, setRecordedInput] = useState(statusRecordInput);
  if (hasEntryErrorCallback && statusRecordInput !== recordedInput) {
    setRecordedInput(statusRecordInput);
    if (shownEntryError == null) {
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

  // The rejection message that no shown status announces.
  let alertMessage = '';
  if (shownEntryError != null && !isCallerBehind) {
    if (callerErrorMessage == null) {
      alertMessage = isStatusAnnounced ? '' : rejectionMessage;
    } else if (hasEntryErrorCallback) {
      const isStatusRepeated =
        statusRecord.isRepeatable &&
        statusRecord.message === callerErrorMessage;
      alertMessage =
        !isStatusAnnounced || isStatusRepeated ? callerErrorMessage : '';
    } else {
      alertMessage = rejectionMessage;
    }
  }

  const reportEntryError = useCallback(
    (error: NumberInputEntryError | null) => {
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

  // Syncs the caller's entry error with a rejection that a new `value`,
  // `min`, `max`, `isIntegerOnly`, or disabled state changes or ends.
  useEffect(() => {
    if (onEntryErrorChange == null) {
      return;
    }
    if (!isSameEntryError(entryError, reportedEntryErrorRef.current)) {
      reportedEntryErrorRef.current = entryError;
      onEntryErrorChange(entryError);
    }
    if (!isSameEntryError(entryError, heardEntryError)) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- shows the field's own message once the caller has the rejection
      setHeardEntryError(entryError);
    }
  }, [entryError, heardEntryError, onEntryErrorChange]);

  // Syncs the caller's entry error at unmount: the rejection ends with the
  // field.
  useEffect(
    () => () => {
      if (reportedEntryErrorRef.current != null) {
        reportedEntryErrorRef.current = null;
        latestEntryErrorCallbackRef.current?.(null);
      }
    },
    [latestEntryErrorCallbackRef],
  );

  return {fieldStatus, alertMessage, reportEntryError};
}
