// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file caseIds.ts
 * @input None
 * @output The AlertDialog case ids, their labels, and the parser for `?case=`
 * @position Shared by the AlertDialog cases page and its cases.
 *
 * SYNC: A new case needs a component in cases.tsx.
 */

export const ALERT_DIALOG_CASES = [
  'alert-over-a-toast',
  'dialog-closed-after-save',
  'interruptions',
] as const;

export type AlertDialogCaseId = (typeof ALERT_DIALOG_CASES)[number];

export const ALERT_DIALOG_CASE_LABELS: Readonly<
  Record<AlertDialogCaseId, string>
> = {
  'alert-over-a-toast':
    'An alert over a toast: Delete raises a toast as the alert closes',
  'dialog-closed-after-save':
    'A dialog closed after a save: Save raises a toast, and the dialog closes when the save is done',
  interruptions:
    'Interruptions: the program closes the alert while it enters, or reopens it while it leaves',
};

export function parseAlertDialogCase(value: string | null): AlertDialogCaseId {
  return (ALERT_DIALOG_CASES as readonly string[]).includes(value ?? '')
    ? (value as AlertDialogCaseId)
    : ALERT_DIALOG_CASES[0];
}
