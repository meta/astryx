// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file AlertDialog.a11y.renders.tsx
 * @input One AlertDialog binding state
 * @output The React tree every lane renders for that state: an opener button and the AlertDialog it opens (the jsdom test directly, the story through Storybook)
 * @position Shared fixture for the AlertDialog binding
 */

import {useState, type ReactElement} from 'react';
import {AlertDialog} from '../AlertDialog';
import {
  ALERT_DIALOG_ACTION_LABEL,
  ALERT_DIALOG_CANCEL_LABEL,
  ALERT_DIALOG_MESSAGE,
  ALERT_DIALOG_OPEN_LABEL,
  ALERT_DIALOG_TITLE,
  type AlertDialogBindingState,
} from './AlertDialog.a11y.states';

function BoundAlertDialog({state}: {state: AlertDialogBindingState}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        {ALERT_DIALOG_OPEN_LABEL}
      </button>
      <AlertDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title={ALERT_DIALOG_TITLE}
        description={ALERT_DIALOG_MESSAGE}
        cancelLabel={ALERT_DIALOG_CANCEL_LABEL}
        actionLabel={ALERT_DIALOG_ACTION_LABEL}
        isActionLoading={state.isActionLoading}
        onAction={() => setIsOpen(false)}
      />
    </>
  );
}

export function renderAlertDialogState(
  state: AlertDialogBindingState,
): ReactElement {
  return (
    <div style={{padding: 24}}>
      <BoundAlertDialog state={state} />
    </div>
  );
}
