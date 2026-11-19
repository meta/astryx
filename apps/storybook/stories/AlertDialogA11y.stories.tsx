// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AlertDialogA11y.stories.tsx
 * @input The AlertDialog binding states, rendered through the binding's own renderer so the jsdom and Chromium lanes see the same tree
 * @output One checked-in story per state for the Chromium accessibility lane; excluded from the visual matrix
 * @position Browser fixtures for component:AlertDialog AR1 (ALERT_DIALOG_PATTERN)
 */

import type {Meta, StoryObj} from '@storybook/react';
import {renderAlertDialogState} from '../../../packages/core/src/AlertDialog/__tests__/AlertDialog.a11y.renders';
import {ALERT_DIALOG_BINDING_STATES} from '../../../packages/core/src/AlertDialog/__tests__/AlertDialog.a11y.states';

const meta = {
  title: 'A11y/AlertDialog',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function storyFor(
  id: (typeof ALERT_DIALOG_BINDING_STATES)[number]['id'],
): Story {
  const state = ALERT_DIALOG_BINDING_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(`no AlertDialog binding state "${id}"`);
  }
  return {render: () => renderAlertDialogState(state)};
}

export const ModalConfirm = storyFor('modal-confirm');
export const ModalActionLoading = storyFor('modal-action-loading');
