// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MonthPagerProofs.stories.tsx
 * @input Uses React and the internal MonthPager (packages/core/src/DateInput)
 * @output The month pager alone, whatever the primary pointer: 2026 from
 *   March, its shown month in a read-only field
 * @position A checked-in reproduction path for the trackpad proofs in
 *   packages/core/src/DateInput/__tests__/MonthPager.interaction.browser.spec.ts.
 *   WebKit's driver sends a trackpad's precise deltas only from a desktop
 *   context, where the sheets show the mouse calendar instead.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {MonthPager} from '../../../packages/core/src/DateInput/MonthPager';
import {
  createMonthModel,
  fromMonthIndex,
  toMonthIndex,
} from '../../../packages/core/src/DateInput/monthGeometry';

const FIRST = toMonthIndex(2026, 1);
const LAST = toMonthIndex(2026, 12);
const MARCH = toMonthIndex(2026, 3);
const TODAY = {year: 2026, month: 3, day: 15};
const GREGORY = createMonthModel('gregory');

/**
 * The readout takes the theme's text colour on the theme's surface, not the
 * browser's white field.
 */
const READOUT_STYLE = {color: 'inherit', backgroundColor: 'transparent'};

const meta = {
  title: 'Core/MonthPager',
  tags: ['no-visual', '!autodocs'],
  parameters: {layout: 'centered'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The pager alone. Its field names the month it shows. */
export const Pager: Story = {
  render: () => {
    const [shown, setShown] = useState(MARCH);
    const {year, month} = fromMonthIndex(shown);
    return (
      <div style={{display: 'grid', gap: 16, inlineSize: 360}}>
        <input
          aria-label="Shown month"
          readOnly
          style={READOUT_STYLE}
          value={`${year}-${String(month).padStart(2, '0')}`}
        />
        <MonthPager
          monthModel={GREGORY}
          minMonthIndex={FIRST}
          maxMonthIndex={LAST}
          initialMonthIndex={MARCH}
          onVisibleMonthChange={setShown}
          selectedDate={null}
          today={TODAY}
          isDateDisabled={() => false}
          weekStartsOn={0}
          onSelect={() => {}}
        />
      </div>
    );
  },
};
