// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferListSelector.fr10.test.tsx
 * @input Uses vitest, Testing Library, the shared FR10 suites, and
 *   TransferListSelector
 * @output Tests that TransferListSelector's base props, container*, and
 *   control* reach their family:input-fields FR10 targets
 * @position Tests; TransferListSelector's FR10 conformance alongside
 *   TransferListSelector.test.tsx
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';
import {
  TransferListSelector,
  type TransferListSelectorProps,
} from './TransferListSelector';

const OPTIONS = [
  {value: 'name', label: 'Name'},
  {value: 'status', label: 'Status'},
];

// jsdom has no Popover API; reflect open state the way the browser does.
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
});

describe('TransferListSelector props type (family:input-fields FR10)', () => {
  it('accepts container* and control* and no root styling', () => {
    expectFieldInputProps<TransferListSelectorProps>();
  });
});

describeFieldInputParts('TransferListSelector', {
  renderMember: props => (
    <TransferListSelector
      label="Columns"
      options={OPTIONS}
      value={['name']}
      onChange={() => {}}
      {...props}
    />
  ),
  getControl: () => screen.getByRole('combobox', {name: 'Columns'}),
  inGroup: false,
});

describe('TransferListSelector FR10 targets', () => {
  it('puts control* on the control box around the trigger and container* on the Field box', () => {
    render(
      <TransferListSelector
        label="Columns"
        options={OPTIONS}
        value={['name']}
        onChange={() => {}}
        controlClassName="fr10-control"
        containerClassName="fr10-container"
      />,
    );
    const trigger = screen.getByRole('combobox', {name: 'Columns'});
    const controlBox = document.querySelector('.fr10-control');
    expect(controlBox).toHaveClass('astryx-complex-selector');
    expect(controlBox).toContainElement(trigger);
    expect(document.querySelector('.fr10-container')).toHaveClass(
      'astryx-field',
    );
  });
});
