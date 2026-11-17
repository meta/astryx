// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CheckboxInput.tooltipCost.test.tsx
 * @input CheckboxInput, with useTooltip and useTooltipInternal wrapped in spies
 * @output Proof that a checkbox whose disabled message cannot show runs no
 *   tooltip hook, and that one whose message can show still has it
 * @position Testing for /packages/core/src/CheckboxInput/CheckboxInput.tsx
 */

import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as tooltipModule from '../Tooltip/useTooltip';
import {CheckboxInput} from './CheckboxInput';

vi.mock('../Tooltip/useTooltip', async importOriginal => {
  const actual = await importOriginal<typeof tooltipModule>();
  return {
    ...actual,
    useTooltip: vi.fn(actual.useTooltip),
    useTooltipInternal: vi.fn(actual.useTooltipInternal),
  };
});

const spies = [
  vi.mocked(tooltipModule.useTooltip),
  vi.mocked(tooltipModule.useTooltipInternal),
];
/** Tooltip hook calls from CheckboxInput, through either entry. */
const tooltipCalls = () =>
  spies.reduce((count, spy) => count + spy.mock.calls.length, 0);

describe('CheckboxInput tooltip cost', () => {
  beforeEach(() => {
    for (const spy of spies) {
      spy.mockClear();
    }
  });

  // A page of many checkboxes pays the tooltip's work only where a disabled
  // message can show.
  it('runs no tooltip hook for a checkbox without a disabled message', () => {
    render(
      <>
        {Array.from({length: 20}, (_, i) => (
          <CheckboxInput
            key={i}
            label={`Option ${i}`}
            value={false}
            onChange={() => {}}
          />
        ))}
        <CheckboxInput
          label="Locked"
          value={false}
          onChange={() => {}}
          disabledMessage="Managed by your administrator"
        />
      </>,
    );
    expect(tooltipCalls()).toBe(0);
  });

  it('keeps the disabled message as the checkbox description', () => {
    render(
      <CheckboxInput
        label="Locked"
        value={false}
        onChange={() => {}}
        isDisabled
        disabledMessage="Managed by your administrator"
      />,
    );
    expect(tooltipCalls()).toBeGreaterThan(0);
    expect(
      screen.getByRole('checkbox', {name: 'Locked'}),
    ).toHaveAccessibleDescription('Managed by your administrator');
  });
});
