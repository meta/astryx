// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file WheelProofs.stories.tsx
 * @input Uses React and the internal Wheel (packages/core/src/DateInput)
 * @output The Wheel alone, for its browser proofs: a 60-row minute column at
 *   00, its committed minute shown in a read-only field; and the touch column
 *   alone, whatever the primary pointer, for the trackpad proofs
 * @position A checked-in reproduction path for
 *   packages/core/src/DateInput/__tests__/Wheel.interaction.browser.spec.ts.
 *   The proofs test the Wheel itself, so they open a column that stays a plain
 *   Wheel whatever rules the sheets that use it add (looping, bounds, a date
 *   that moves with the month).
 */

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {PickerWheel} from '../../../packages/core/src/DateInput/PickerWheel';
import {Wheel} from '../../../packages/core/src/DateInput/Wheel';

const MINUTES = Array.from({length: 60}, (_, minute) => ({
  value: minute,
  label: String(minute).padStart(2, '0'),
}));

/**
 * The readout takes the theme's text colour on the theme's surface. A bare
 * field keeps the browser's white fill under the theme's text colour, which a
 * dark theme makes unreadable.
 */
const READOUT_STYLE = {color: 'inherit', backgroundColor: 'transparent'};

const meta = {
  title: 'Core/Wheel',
  tags: ['no-visual', '!autodocs'],
  parameters: {layout: 'centered'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A finger gets the touch column, a mouse the scrolling column; either commits
 * into the field above it.
 */
export const Minutes: Story = {
  render: () => {
    const [minute, setMinute] = useState(0);
    return (
      <div style={{display: 'grid', gap: 16, inlineSize: 160}}>
        <input
          aria-label="Committed minute"
          readOnly
          style={READOUT_STYLE}
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

/**
 * The touch column alone, whatever the primary pointer: WebKit's driver sends
 * a trackpad's precise deltas only from a desktop context, whose primary
 * pointer is fine, and its mobile emulation sends no wheel at all.
 */
export const TouchMinutes: Story = {
  render: () => {
    const [minute, setMinute] = useState(0);
    return (
      <div style={{display: 'grid', gap: 16, inlineSize: 160}}>
        <input
          aria-label="Committed minute"
          readOnly
          style={READOUT_STYLE}
          value={String(minute).padStart(2, '0')}
        />
        <PickerWheel
          label="Minute"
          options={MINUTES}
          value={minute}
          onChange={setMinute}
        />
      </div>
    );
  },
};
