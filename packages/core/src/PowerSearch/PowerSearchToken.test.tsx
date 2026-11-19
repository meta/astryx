// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PowerSearchToken.test.tsx
 * @input Uses vitest, @testing-library/react, PowerSearchToken
 * @output Unit tests for the default PowerSearch token pill
 * @position Testing; validates PowerSearchToken.tsx label composition,
 *   value truncation budget, and click/remove/disabled wiring
 *
 * SYNC: When PowerSearchToken.tsx changes, update tests to match
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {PowerSearchToken} from './PowerSearchToken';
import type {
  FilterValue,
  PowerSearchConfig,
  PowerSearchField,
  PowerSearchOperator,
} from './types';

// =============================================================================
// Fixtures
// =============================================================================

const isOperator: PowerSearchOperator = {
  key: 'is',
  label: 'is',
  value: {type: 'string'},
};

const statusField: PowerSearchField = {
  key: 'status',
  label: 'Status',
  operators: [isOperator],
};

const config: PowerSearchConfig = {
  name: 'TestSearch',
  fields: [statusField],
};

/** 26 characters — long enough that every truncation budget below bites. */
const LONG_VALUE = 'abcdefghijklmnopqrstuvwxyz';

function renderToken(
  overrides: {
    field?: PowerSearchField;
    operator?: PowerSearchOperator;
    value?: FilterValue;
    maxLength?: number;
    onClick?: () => void;
    onRemove?: () => void;
    isDisabled?: boolean;
  } = {},
) {
  const field = overrides.field ?? statusField;
  const operator = overrides.operator ?? isOperator;
  const value = overrides.value ?? {type: 'string', value: 'open'};
  return render(
    <PowerSearchToken
      config={config}
      filter={{field: field.key, operator: operator.key, value}}
      field={field}
      operator={operator}
      maxLength={overrides.maxLength ?? 60}
      onClick={overrides.onClick}
      onRemove={overrides.onRemove}
      isDisabled={overrides.isDisabled}
    />,
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('PowerSearchToken', () => {
  it('joins the field label and the operator label with a colon', () => {
    renderToken();
    expect(screen.getByText('Status: is')).toBeInTheDocument();
  });

  it('drops the colon when the operator resolves to an empty label', () => {
    renderToken({
      operator: {key: 'any', label: '', value: {type: 'string'}},
    });
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.queryByText('Status:')).toBeNull();
  });

  it('resolves an i18nKey operator through the translator', () => {
    renderToken({
      operator: {
        key: 'contains',
        i18nKey: '@astryx.powersearch.operator.contains',
        value: {type: 'string'},
      },
    });
    expect(screen.getByText('Status: contains')).toBeInTheDocument();
  });

  it('renders the formatted value in its own element beside the label', () => {
    const {container} = renderToken({value: {type: 'string', value: 'open'}});
    const label = screen.getByText('Status: is');
    const value = screen.getByText('open');
    expect(value).not.toBe(label);
    expect(container.firstElementChild?.childElementCount).toBe(2);
  });

  it('renders no value element when the value formats to an empty string', () => {
    const {container} = renderToken({value: {type: 'empty'}});
    // Only the label element remains — the value span is dropped entirely.
    expect(container.firstElementChild?.childElementCount).toBe(1);
    expect(container.firstElementChild).toHaveTextContent(/^Status: is$/);
  });

  it('formats the value with the operator value definition, not the raw value', () => {
    const enumOperator: PowerSearchOperator = {
      key: 'is',
      label: 'is',
      value: {
        type: 'enum',
        values: [
          {value: 'open', label: 'Open'},
          {value: 'closed', label: 'Closed'},
        ],
      },
    };
    renderToken({
      operator: enumOperator,
      value: {type: 'enum', value: 'open'},
    });
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText('open')).toBeNull();
  });

  it('renders the value in full when the label leaves enough budget', () => {
    // 60 - len('Status') - len('is') = 52 >= 26
    renderToken({maxLength: 60, value: {type: 'string', value: LONG_VALUE}});
    expect(screen.getByText(LONG_VALUE)).toBeInTheDocument();
  });

  it('shrinks the value budget by the field and operator label lengths', () => {
    // 30 - len('Status') - len('contains') = 16 -> 15 chars + ellipsis
    renderToken({
      operator: {key: 'contains', label: 'contains', value: {type: 'string'}},
      maxLength: 30,
      value: {type: 'string', value: LONG_VALUE},
    });
    expect(screen.getByText('abcdefghijklmno…')).toBeInTheDocument();
  });

  it('never shrinks the value budget below ten characters', () => {
    // 20 - 38 - 8 is negative, so the floor of 10 applies: 9 chars + ellipsis
    renderToken({
      field: {
        key: 'status',
        label: 'Extremely Long Field Label For Testing',
        operators: [isOperator],
      },
      operator: {key: 'contains', label: 'contains', value: {type: 'string'}},
      maxLength: 20,
      value: {type: 'string', value: LONG_VALUE},
    });
    expect(screen.getByText('abcdefghi…')).toBeInTheDocument();
  });

  it('calls onClick when the token is activated', () => {
    const onClick = vi.fn();
    renderToken({onClick});
    fireEvent.click(screen.getByRole('button', {name: 'Status: is'}));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('stops the activation click from reaching an enclosing handler', () => {
    const onClick = vi.fn();
    const onOuterClick = vi.fn();
    render(
      <div onClick={onOuterClick}>
        <PowerSearchToken
          config={config}
          filter={{
            field: 'status',
            operator: 'is',
            value: {type: 'string', value: 'open'},
          }}
          field={statusField}
          operator={isOperator}
          maxLength={60}
          onClick={onClick}
        />
        <button type="button">outside</button>
      </div>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Status: is'}));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onOuterClick).not.toHaveBeenCalled();

    // Control: a click that is not stopped does reach the enclosing handler.
    fireEvent.click(screen.getByRole('button', {name: 'outside'}));
    expect(onOuterClick).toHaveBeenCalledTimes(1);
  });

  it('renders no remove button when onRemove is omitted', () => {
    renderToken();
    expect(
      screen.queryByRole('button', {name: 'Remove Status: is'}),
    ).toBeNull();
  });

  it('calls onRemove when the remove button is clicked', () => {
    const onRemove = vi.fn();
    renderToken({onRemove});
    fireEvent.click(screen.getByRole('button', {name: 'Remove Status: is'}));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('marks both the activation and remove buttons disabled when isDisabled is set', () => {
    renderToken({onClick: vi.fn(), onRemove: vi.fn(), isDisabled: true});
    // spec:AST-085 FR1: focusable, exposed through aria-disabled.
    for (const name of ['Status: is', 'Remove Status: is']) {
      const button = screen.getByRole('button', {name});
      expect(button).not.toHaveAttribute('disabled');
      expect(button).toHaveAttribute('aria-disabled', 'true');
    }
  });
});
