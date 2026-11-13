// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useEntryErrorReport.ts
 * @input A field's rejection of typed text and its message, the caller's
 *   status and onEntryErrorChange, and the member's status precedence
 * @output The status the field shows, the message its alert announces, and
 *   the report of each changed rejection to the caller
 * @position Shared internal hook of the input-field family; used by
 *   DateInput/useTypedDate.ts (DateInput, DateTimeInput) and NumberInput.tsx
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Field/useEntryErrorReport.test.tsx
 * - /packages/core/src/DateInput/useTypedDate.ts
 * - /packages/core/src/NumberInput/NumberInput.tsx
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {useCommittedRef} from '../hooks/useCommittedRef';
import type {InputStatus} from './types';

/** A field's rejection of typed text, as the field reports it to its caller. */
export interface EntryError {
  kind: string;
  text: string;
}

/** Whether two reported rejections carry the same fields. */
export function isSameEntryError<E extends EntryError>(
  a: E | null,
  b: E | null,
): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return false;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!Object.is(a[key as keyof E], b[key as keyof E])) {
      return false;
    }
  }
  return true;
}

export interface UseEntryErrorReportOptions<E extends EntryError> {
  /** The rejection that the field holds and reports, or null. */
  entryError: E | null;
  /** The field's message for the rejection it shows, or null when it shows none. */
  rejectionMessage: string | null;
  /** The caller's status. */
  status: InputStatus | undefined;
  /** Whether the shown status announces itself, as Field's status does. */
  isStatusAnnounced: boolean;
  /**
   * When a caller `error` status with a message shows in place of the field's
   * message: `'always'`, or only `'withCallback'`, when the caller receives
   * the rejections. A `warning` or `success` status never replaces it.
   */
  callerErrorPrecedence: 'always' | 'withCallback';
  onEntryErrorChange: ((error: E | null) => void) | undefined;
}

export interface EntryErrorReport<E extends EntryError> {
  /** The status the field shows. */
  fieldStatus: InputStatus | undefined;
  /** The rejection message that the field status does not announce. */
  alertMessage: string;
  /** Reports a rejection that a handler causes, in the same update. */
  reportEntryError: (error: E | null) => void;
}

/**
 * The status, the alert, and the caller report of a field that rejects typed
 * text. Each member keeps its own rules for when an entry is rejected and
 * what the message says.
 */
export function useEntryErrorReport<E extends EntryError>(
  options: UseEntryErrorReportOptions<E>,
): EntryErrorReport<E> {
  const {
    entryError,
    rejectionMessage,
    status,
    isStatusAnnounced,
    callerErrorPrecedence,
    onEntryErrorChange,
  } = options;
  // The rejection that the caller last received. Handlers report a rejection
  // that they cause in the same update. A rejection that a prop change causes
  // reaches the caller only after the render. Until then the field keeps the
  // caller's status, so it never shows and announces its own message just
  // before the caller's message replaces it.
  const [heardEntryError, setHeardEntryError] = useState<E | null>(null);
  const reportedEntryErrorRef = useRef<E | null>(null);
  // The callback of the latest commit, for the report at unmount.
  const latestEntryErrorCallbackRef = useCommittedRef(onEntryErrorChange);
  const hasEntryErrorCallback = onEntryErrorChange != null;
  const isCallerBehind =
    hasEntryErrorCallback && !isSameEntryError(entryError, heardEntryError);
  const callerErrorMessage =
    (callerErrorPrecedence === 'always' || hasEntryErrorCallback) &&
    status?.type === 'error' &&
    status.message
      ? status.message
      : null;
  const fieldStatus: InputStatus | undefined =
    rejectionMessage == null || isCallerBehind || callerErrorMessage != null
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
  const statusRecordInput = `${rejectionMessage != null}:${shownErrorMessage}`;
  const [recordedInput, setRecordedInput] = useState(statusRecordInput);
  if (hasEntryErrorCallback && statusRecordInput !== recordedInput) {
    setRecordedInput(statusRecordInput);
    if (rejectionMessage == null) {
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

  // Inside an InputGroup no Field shows a status, so the alert carries the
  // message.
  let alertMessage = '';
  if (rejectionMessage != null && !isCallerBehind) {
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
    (error: E | null) => {
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

  // Syncs the caller's entry error with a rejection that a prop change
  // starts, changes, or ends.
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
