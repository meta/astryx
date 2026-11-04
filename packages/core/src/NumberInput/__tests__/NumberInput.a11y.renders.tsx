// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/** Stable NumberInput renders shared by jsdom, Storybook, and Chromium bindings. */

import {useState, type ReactElement} from 'react';
import {NumberInput} from '../NumberInput';
import type {NumberInputA11yRow} from './NumberInput.a11y.states';

function StatefulNumberInput({
  min,
  max,
  formatValue,
  isDisabled,
  isReadOnly,
  disabledMessage,
}: {
  min?: number;
  max?: number;
  formatValue?: (value: number) => string;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  disabledMessage?: string;
}) {
  const [value, setValue] = useState(5);
  return (
    <NumberInput
      data-a11y-spinbutton-subject
      label="Quantity"
      value={value}
      onChange={setValue}
      min={min}
      max={max}
      formatValue={formatValue}
      isDisabled={isDisabled}
      isReadOnly={isReadOnly}
      disabledMessage={disabledMessage}
    />
  );
}

export const NUMBER_INPUT_A11Y_RENDERS: Readonly<
  Record<NumberInputA11yRow['id'], () => ReactElement>
> = {
  'default-value': () => <StatefulNumberInput />,
  'bounded-value': () => <StatefulNumberInput min={1} max={9} />,
  'formatted-value': () => (
    <StatefulNumberInput formatValue={value => `${value} GB`} />
  ),
  'empty-value': () => (
    <NumberInput
      data-a11y-spinbutton-subject
      label="Quantity"
      value={null}
      onChange={() => {}}
    />
  ),
  invalid: () => (
    <NumberInput
      data-a11y-spinbutton-subject
      label="Quantity"
      value={5}
      onChange={() => {}}
      status={{type: 'error', message: 'Quantity is invalid'}}
    />
  ),
  disabled: () => <StatefulNumberInput isDisabled />,
  'disabled-with-message': () => (
    <StatefulNumberInput
      isDisabled
      disabledMessage="Quantity is fixed by policy"
    />
  ),
  'read-only': () => <StatefulNumberInput isReadOnly />,
  'arrow-stepping': () => <StatefulNumberInput />,
};
