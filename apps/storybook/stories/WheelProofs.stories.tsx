// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file WheelProofs.stories.tsx
 * @input Uses React and the internal Wheel (packages/core/src/DateInput)
 * @output The Wheel alone, for its browser proofs: a 60-row minute column at
 *   00, its committed minute shown in a read-only field
 * @position A checked-in reproduction path for
 *   packages/core/src/DateInput/__tests__/Wheel.interaction.browser.spec.ts.
 *   The proofs test the Wheel itself, so they open a column that stays a plain
 *   Wheel whatever rules the sheets that use it add (looping, bounds, a date
 *   that moves with the month).
 */

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {Wheel} from '../../../packages/core/src/DateInput/Wheel';

const MINUTES = Array.from({length: 60}, (_, minute) => ({
  value: minute,
  label: String(minute).padStart(2, '0'),
}));

const meta = {
  title: 'Core/Wheel',
  tags: ['no-visual', '!autodocs'],
  parameters: {layout: 'centered'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A finger gets the touch column, a mouse today's column; either commits into
 * the field above it.
 */
export const Minutes: Story = {
  render: () => {
    const [minute, setMinute] = useState(0);
    return (
      <div style={{display: 'grid', gap: 16, inlineSize: 160}}>
        <input
          aria-label="Committed minute"
          readOnly
          value={String(minute).padStart(2, '0')}
        />
        <Wheel
          label="Minute"
          options={MINUTES}
          value={minute}
          onChange={setMinute}
        />
      </div>
    );
  },
};
