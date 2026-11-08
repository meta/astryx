// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TextInput.a11y.renders.tsx
 * @input Uses TextInput, TextArea, InputGroup, and the binding state-id union
 * @output TEXT_INPUT_STATE_RENDERS — one real component rendering per state row
 * @position Shared fixture layer for jsdom bindings and checked-in stories.
 */

import {useState, type ReactElement} from 'react';
import {InputGroup, InputGroupText} from '../../InputGroup';
import {TextArea, type TextAreaProps} from '../../TextArea';
import {TextInput, type TextInputProps} from '../TextInput';
import type {TextInputStateId} from './TextInput.a11y.states';

function ControlledTextInput({
  initial = '',
  ...props
}: Omit<TextInputProps, 'value' | 'onChange'> & {initial?: string}) {
  const [value, setValue] = useState(initial);
  return (
    <TextInput
      {...props}
      data-a11y-text-input-subject
      value={value}
      onChange={setValue}
    />
  );
}

function ControlledTextArea({
  initial = '',
  ...props
}: Omit<TextAreaProps, 'value' | 'onChange'> & {initial?: string}) {
  const [value, setValue] = useState(initial);
  return (
    <TextArea
      {...props}
      data-a11y-text-input-subject
      value={value}
      onChange={setValue}
    />
  );
}

export type TextInputStateRender = () => ReactElement;

export const TEXT_INPUT_STATE_RENDERS: Record<
  TextInputStateId,
  TextInputStateRender
> = {
  'input-empty-placeholder': () => (
    <ControlledTextInput label="Name" placeholder="Enter your name" />
  ),
  'input-valued': () => (
    <ControlledTextInput label="Name" initial="Ada Lovelace" />
  ),
  'input-hidden-label': () => (
    <ControlledTextInput label="Search" isLabelHidden placeholder="Search" />
  ),
  'input-described': () => (
    <ControlledTextInput
      label="Display name"
      description="Use the name shown on your profile."
    />
  ),
  'input-optional': () => <ControlledTextInput label="Nickname" isOptional />,
  'input-required': () => <ControlledTextInput label="Username" isRequired />,
  'input-error': () => (
    <ControlledTextInput
      label="Email"
      initial="invalid@"
      status={{type: 'error', message: 'Enter a valid email address.'}}
    />
  ),
  'input-error-without-message': () => (
    <ControlledTextInput
      label="Email"
      initial="invalid@"
      status={{type: 'error'}}
    />
  ),
  'input-warning-detached': () => (
    <ControlledTextInput
      label="Username"
      initial="user123"
      status={{type: 'warning', message: 'This username may be taken.'}}
      statusVariant="detached"
    />
  ),
  'input-success-tooltip': () => (
    <ControlledTextInput
      label="Username"
      initial="validuser"
      status={{type: 'success', message: 'Username is available.'}}
      statusVariant="tooltip"
    />
  ),
  'input-disabled': () => (
    <ControlledTextInput label="Owner" initial="Locked" isDisabled />
  ),
  'input-disabled-with-message': () => (
    <ControlledTextInput
      label="Owner"
      initial="alice@example.com"
      isDisabled
      disabledMessage="You need the Editor role to change this."
    />
  ),
  'input-read-only': () => (
    <ControlledTextInput
      label="Account number"
      initial="ACCT-4417-9920"
      isReadOnly
    />
  ),
  'input-password': () => (
    <ControlledTextInput label="Password" type="password" />
  ),
  'input-group-described': () => (
    <InputGroup label="Price" description="Enter the amount in USD.">
      <InputGroupText>$</InputGroupText>
      <ControlledTextInput label="Amount" isLabelHidden />
    </InputGroup>
  ),

  'textarea-empty-placeholder': () => (
    <ControlledTextArea label="Description" placeholder="Enter a description" />
  ),
  'textarea-valued': () => (
    <ControlledTextArea label="Notes" initial="Existing notes" />
  ),
  'textarea-hidden-label': () => (
    <ControlledTextArea label="Comments" isLabelHidden placeholder="Comment" />
  ),
  'textarea-described': () => (
    <ControlledTextArea
      label="Description"
      description="Summarize the change."
    />
  ),
  'textarea-optional': () => (
    <ControlledTextArea label="Additional notes" isOptional />
  ),
  'textarea-required': () => <ControlledTextArea label="Feedback" isRequired />,
  'textarea-error': () => (
    <ControlledTextArea
      label="Description"
      initial="Too short"
      status={{
        type: 'error',
        message: 'Description must be at least 50 characters.',
      }}
    />
  ),
  'textarea-error-without-message': () => (
    <ControlledTextArea
      label="Description"
      initial="Invalid"
      status={{type: 'error'}}
    />
  ),
  'textarea-warning-detached': () => (
    <ControlledTextArea
      label="Content"
      initial="Review this text"
      status={{type: 'warning', message: 'Content may need review.'}}
      statusVariant="detached"
    />
  ),
  'textarea-success-tooltip': () => (
    <ControlledTextArea
      label="Description"
      initial="Complete description"
      status={{type: 'success', message: 'Description looks good.'}}
      statusVariant="tooltip"
    />
  ),
  'textarea-disabled': () => (
    <ControlledTextArea label="Notes" initial="Locked notes" isDisabled />
  ),
  'textarea-disabled-with-message': () => (
    <ControlledTextArea
      label="Notes"
      initial="Locked notes"
      isDisabled
      disabledMessage="Notes are locked after submission."
    />
  ),
  'textarea-read-only': () => (
    <ControlledTextArea
      label="Import summary"
      initial="Generated by the importer."
      isReadOnly
    />
  ),
  'textarea-over-limit': () => (
    <ControlledTextArea label="Summary" initial="abcdef" maxLength={5} />
  ),
};
