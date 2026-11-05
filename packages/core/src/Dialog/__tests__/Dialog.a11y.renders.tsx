// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Dialog.a11y.renders.tsx
 * @input Uses Dialog, DialogHeader, and the modal-dialog binding inventory
 * @output The one render map shared by Dialog's jsdom and Storybook bindings
 * @position Keeps both evidence lanes on identical component composition and
 *   controlled open/close wiring.
 */

import {useState, type ReactElement, type ReactNode} from 'react';
import {Dialog} from '../Dialog';
import {DialogHeader} from '../DialogHeader';
import {TextInput} from '../../TextInput';
import {
  DIALOG_CONTRACT_BACKGROUND_LABEL,
  DIALOG_CONTRACT_CLOSE_LABEL,
  DIALOG_CONTRACT_OPEN_LABEL,
  type DialogModalBindingState,
} from './Dialog.a11y.states';

function DialogBinding({state}: {state: DialogModalBindingState}) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');

  let content: ReactNode;
  switch (state.render) {
    case 'labelled-described':
      content = (
        <>
          <DialogHeader title="Review changes" />
          <div id="dialog-contract-description">
            Confirm the changes before continuing.
          </div>
          <button type="button">Previous</button>
          <button type="button" onClick={() => setIsOpen(false)}>
            {DIALOG_CONTRACT_CLOSE_LABEL}
          </button>
        </>
      );
      break;
    case 'explicit-focus':
      content = (
        <>
          <DialogHeader title="Edit profile" />
          <button type="button">Before requested field</button>
          <TextInput
            label="Name"
            value={name}
            onChange={setName}
            hasAutoFocus
          />
          <button type="button" onClick={() => setIsOpen(false)}>
            {DIALOG_CONTRACT_CLOSE_LABEL}
          </button>
        </>
      );
      break;
    case 'conditional':
      content = isOpen ? (
        <>
          <DialogHeader title="Sensitive review" />
          <div>This content exists only while the task is open.</div>
          <button type="button" onClick={() => setIsOpen(false)}>
            {DIALOG_CONTRACT_CLOSE_LABEL}
          </button>
        </>
      ) : null;
      break;
    case 'no-focusable':
      content = <div>There are no controls in this task.</div>;
      break;
  }

  const namingProps =
    state.render === 'labelled-described'
      ? {'aria-describedby': 'dialog-contract-description'}
      : state.render === 'explicit-focus'
        ? {}
        : state.render === 'conditional'
          ? {'aria-label': 'Sensitive review'}
          : {'aria-label': 'Read terms'};

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        {DIALOG_CONTRACT_OPEN_LABEL}
      </button>
      <button type="button">{DIALOG_CONTRACT_BACKGROUND_LABEL}</button>
      <Dialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        purpose={state.render === 'explicit-focus' ? 'form' : 'info'}
        {...namingProps}>
        {content}
      </Dialog>
    </>
  );
}

export function renderDialogModalState(
  state: DialogModalBindingState,
): ReactElement {
  return <DialogBinding state={state} />;
}
