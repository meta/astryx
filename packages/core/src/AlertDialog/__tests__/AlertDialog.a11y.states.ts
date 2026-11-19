// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AlertDialog.a11y.states.ts
 * @input AlertDialog's representative modal states and the facts ALERT_DIALOG_PATTERN reads
 * @output ALERT_DIALOG_BINDING_STATES, the shared labels, and the explicit ownership exclusions for this binding
 * @position Binding inventory shared by the jsdom test, the Chromium spec, and the story (component:AlertDialog AR1)
 */

import type {AlertDialogStateFacts} from '@astryxdesign/a11y-spec';

export const ALERT_DIALOG_OPEN_LABEL = 'Delete report';
export const ALERT_DIALOG_TITLE = 'Delete this report?';
export const ALERT_DIALOG_MESSAGE =
  'This permanently deletes the report and its 12 comments.';
export const ALERT_DIALOG_CANCEL_LABEL = 'Keep report';
export const ALERT_DIALOG_ACTION_LABEL = 'Delete';

export interface AlertDialogBindingState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  readonly facts: AlertDialogStateFacts;
  readonly isActionLoading?: boolean;
}

const facts: AlertDialogStateFacts = {
  modal: true,
  // Dialog `purpose="form"`: Escape closes, a backdrop click does nothing.
  dismissesOnEscape: true,
  dismissesOnBackdrop: false,
};

const story = (id: string) => `a11y-alertdialog--${id}`;

export const ALERT_DIALOG_BINDING_STATES = [
  {
    id: 'modal-confirm',
    summary:
      'a modal AlertDialog with a destructive action, opened from a button',
    storyId: story('modal-confirm'),
    facts,
  },
  {
    id: 'modal-action-loading',
    summary:
      'the same AlertDialog while its action is loading: Cancel stays the first focus and Escape still cancels',
    storyId: story('modal-action-loading'),
    facts,
    isActionLoading: true,
  },
] as const satisfies ReadonlyArray<AlertDialogBindingState>;

export const ALERT_DIALOG_EXCLUSIONS = [
  {
    id: 'modal-mechanics',
    owner:
      'MODAL_DIALOG_PATTERN bound by Dialog (Dialog.a11y.test.tsx and its Chromium spec)',
    reason:
      'AlertDialog composes Dialog for the top layer, the inert page behind it, focus entering after modal presentation, and focus returning to the opener on close. Those outcomes are proven once on Dialog; this binding proves only what the alert dialog adds: its role, references, modality claim, initial focus on Cancel, and its dismissal rules.',
  },
  {
    id: 'inline-preview',
    owner: 'AlertDialog.test.tsx (inline preview suite)',
    reason:
      'The `isInline` preview renders the same anatomy as a plain `role="group"` without modality; it is not an alert dialog and makes none of this pattern\'s claims, so it is not a binding state.',
  },
] as const;
