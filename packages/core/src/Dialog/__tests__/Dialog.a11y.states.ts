// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Dialog.a11y.states.ts
 * @input Uses ModalDialogStateFacts from @astryxdesign/a11y-spec
 * @output DIALOG_MODAL_BINDING_STATES — the Dialog states that can change the
 *   shared modal-dialog outcome
 * @position Data-only inventory shared by the jsdom and Chromium bindings.
 *
 * `purpose="required"` and AlertDialog are excluded because they expose
 * `alertdialog`, a distinct pattern. `isInline` is excluded because it
 * deliberately has no modal behavior. MobileNav is excluded because its
 * current record is draft and does not adopt this exact modal-dialog model.
 * Nested-surface ordering remains owned by family:overlay-dismissal and the
 * existing Dialog component tests.
 *
 * SYNC: Every storyId and label must match the dedicated stories in
 * /apps/storybook/stories/DialogA11y.stories.tsx.
 */

import type {ModalDialogStateFacts} from '@astryxdesign/a11y-spec';

export const DIALOG_CONTRACT_OPEN_LABEL = 'Open contract dialog';
export const DIALOG_CONTRACT_BACKGROUND_LABEL = 'Background action';
export const DIALOG_CONTRACT_CLOSE_LABEL = 'Close';

export type DialogInitialTarget =
  | {readonly kind: 'dialog'}
  | {readonly kind: 'heading'; readonly name: string}
  | {readonly kind: 'textbox'; readonly name: string};

export interface DialogModalBindingState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  readonly facts: ModalDialogStateFacts;
  readonly initialTarget: DialogInitialTarget;
  readonly visibleTitle: string | null;
  readonly render:
    'labelled-described' | 'explicit-focus' | 'conditional' | 'no-focusable';
}

const MODAL_FACTS = {
  labelledBy: true,
  hasDescriptionReference: false,
  hasDeclaredInitialTarget: true,
  usesNativeFocusFallback: false,
  exercisesFocusRestoration: true,
  makesBackgroundInert: true,
} as const satisfies ModalDialogStateFacts;

export const DIALOG_MODAL_BINDING_STATES: ReadonlyArray<DialogModalBindingState> =
  [
    {
      id: 'labelled-described-default-title',
      summary:
        'an informational dialog labelled by DialogHeader, described by supporting text, and containing explicit actions',
      storyId: 'a11y-dialog-modal-pattern--labelled-described-default-title',
      render: 'labelled-described',
      initialTarget: {kind: 'heading', name: 'Review changes'},
      visibleTitle: 'Review changes',
      facts: {
        ...MODAL_FACTS,
        hasDescriptionReference: true,
      },
    },
    {
      id: 'explicit-descendant-focus',
      summary:
        'a form dialog whose supported TextInput request wins over an earlier focusable action',
      storyId: 'a11y-dialog-modal-pattern--explicit-descendant-focus',
      render: 'explicit-focus',
      initialTarget: {kind: 'textbox', name: 'Name'},
      visibleTitle: 'Edit profile',
      facts: MODAL_FACTS,
    },
    {
      id: 'conditional-content-focus-restoration',
      summary:
        'a dialog whose focus-requesting content mounts only on the opening transition and unmounts on close',
      storyId:
        'a11y-dialog-modal-pattern--conditional-content-focus-restoration',
      render: 'conditional',
      initialTarget: {kind: 'heading', name: 'Sensitive review'},
      visibleTitle: 'Sensitive review',
      facts: {...MODAL_FACTS, labelledBy: false},
    },
    {
      id: 'no-focusable-content',
      summary:
        'a named informational dialog with no eligible descendant focus request or tabbable content',
      storyId: 'a11y-dialog-modal-pattern--no-focusable-content',
      render: 'no-focusable',
      initialTarget: {kind: 'dialog'},
      visibleTitle: null,
      facts: {
        ...MODAL_FACTS,
        labelledBy: false,
        hasDeclaredInitialTarget: false,
        usesNativeFocusFallback: true,
        exercisesFocusRestoration: false,
      },
    },
  ];
