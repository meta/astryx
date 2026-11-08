// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  Calendar,
  type ISODateString,
  type DateRange,
} from '@astryxdesign/core/Calendar';
import {Theme, defineTheme} from '@astryxdesign/core/theme';

const meta: Meta<typeof Calendar> = {
  title: 'Core/Calendar',
  component: Calendar,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Calendar>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return (
      <Calendar mode="single" value={value} onChange={val => setValue(val)} />
    );
  },
};

export const WithSelectedDate: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString>('2026-01-15');
    return (
      <Calendar
        mode="single"
        value={value}
        onChange={val => setValue(val)}
        focusDate="2026-01-01"
      />
    );
  },
};

export const RangeSelection: Story = {
  render: () => {
    const [value, setValue] = useState<DateRange | undefined>(undefined);
    return (
      <Calendar
        mode="range"
        value={value}
        onChange={range => setValue(range)}
        focusDate="2026-01-01"
      />
    );
  },
};

export const RangeWithValue: Story = {
  render: () => {
    const [value, setValue] = useState<DateRange>({
      start: '2026-01-10',
      end: '2026-01-20',
    });
    return (
      <Calendar
        mode="range"
        value={value}
        onChange={range => setValue(range)}
        focusDate="2026-01-01"
      />
    );
  },
};

export const RangeWithMaxSpan: Story = {
  render: () => {
    const [value, setValue] = useState<DateRange | undefined>(undefined);
    return (
      <Calendar
        mode="range"
        value={value}
        onChange={range => setValue(range)}
        focusDate="2026-01-01"
        maxRangeSpan={7}
      />
    );
  },
};

export const RangeWithSpanBounds: Story = {
  render: () => {
    const [value, setValue] = useState<DateRange | undefined>(undefined);
    return (
      <Calendar
        mode="range"
        value={value}
        onChange={range => setValue(range)}
        focusDate="2026-01-01"
        minRangeSpan={2}
        maxRangeSpan={14}
      />
    );
  },
};

export const TwoMonths: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return (
      <Calendar
        mode="single"
        numberOfMonths={2}
        value={value}
        onChange={val => setValue(val)}
        focusDate="2026-01-01"
      />
    );
  },
};

export const TwoMonthsRangeSelection: Story = {
  render: () => {
    const [value, setValue] = useState<DateRange | undefined>(undefined);
    return (
      <Calendar
        mode="range"
        numberOfMonths={2}
        value={value}
        onChange={range => setValue(range)}
        focusDate="2026-01-01"
      />
    );
  },
};

/**
 * The two-month layout inside a container narrower than the two months need.
 * The second month wraps below the first instead of overflowing, so a 320px
 * viewport does not scroll sideways and the next-month button stays on screen.
 */
export const TwoMonthsNarrowContainer: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return (
      <div style={{width: 320}}>
        <Calendar
          mode="single"
          numberOfMonths={2}
          value={value}
          onChange={val => setValue(val)}
          focusDate="2026-01-01"
        />
      </div>
    );
  },
};

export const MinMaxBoundary: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return (
      <Calendar
        mode="single"
        min={'2026-01-10' as ISODateString}
        max={'2026-03-20' as ISODateString}
        value={value}
        onChange={val => setValue(val)}
        focusDate={'2026-01-01' as ISODateString}
      />
    );
  },
};

export const WindowAwayFromToday: Story = {
  name: 'Min/max window away from today',
  render: () => {
    const [past, setPast] = useState<ISODateString | undefined>(undefined);
    const [future, setFuture] = useState<ISODateString | undefined>(undefined);
    // Windows three years either side of today, so neither contains today.
    const year = new Date().getFullYear();
    return (
      <div style={{display: 'flex', gap: 24, flexWrap: 'wrap'}}>
        <Calendar
          mode="single"
          min={`${year - 3}-02-03` as ISODateString}
          max={`${year - 3}-05-19` as ISODateString}
          value={past}
          onChange={val => setPast(val)}
        />
        <Calendar
          mode="single"
          min={`${year + 3}-08-11` as ISODateString}
          max={`${year + 3}-11-24` as ISODateString}
          value={future}
          onChange={val => setFuture(val)}
        />
      </div>
    );
  },
};

export const WithDateConstraints: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return (
      <Calendar
        mode="single"
        min={'2026-01-10' as ISODateString}
        max={'2026-01-25' as ISODateString}
        value={value}
        onChange={val => setValue(val)}
        focusDate="2026-01-01"
      />
    );
  },
};

export const WeekdaysOnly: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    const isWeekday = (date: Date) => {
      const day = date.getDay();
      return day !== 0 && day !== 6;
    };
    return (
      <Calendar
        mode="single"
        dateConstraints={[isWeekday]}
        value={value}
        onChange={val => setValue(val)}
        focusDate="2026-01-01"
      />
    );
  },
};

export const WithWeekNumbers: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return (
      <Calendar
        mode="single"
        hasWeekNumbers
        value={value}
        onChange={val => setValue(val)}
        focusDate="2026-01-01"
      />
    );
  },
};

export const MondayStart: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return (
      <Calendar
        mode="single"
        weekStartsOn={1}
        value={value}
        onChange={val => setValue(val)}
        focusDate="2026-01-01"
      />
    );
  },
};

export const RTL: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return (
      <div dir="rtl">
        <Calendar
          mode="single"
          value={value}
          onChange={val => setValue(val)}
          focusDate="2026-01-01"
        />
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Under dir="rtl" the header flips: "Previous month" sits on the visual right with its chevron mirrored to point right (outward), "Next month" on the visual left pointing left (#3388).',
      },
    },
  },
};

export const RTLRange: Story = {
  render: () => {
    const [value, setValue] = useState<DateRange>({
      start: '2026-01-10',
      end: '2026-01-20',
    });
    return (
      <div dir="rtl">
        <Calendar
          mode="range"
          value={value}
          onChange={range => setValue(range)}
          focusDate="2026-01-01"
        />
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'A committed range under dir="rtl". The range-fill pill uses logical CSS, so its rounded caps follow the reading direction: the start of the range (earliest date) rounds on the inline-start edge and the end (latest date) on the inline-end edge, mirrored from LTR.',
      },
    },
  },
};

export const AllVariations: Story = {
  render: () => {
    const [singleValue, setSingleValue] = useState<ISODateString | undefined>(
      undefined,
    );
    const [rangeValue, setRangeValue] = useState<DateRange | undefined>(
      undefined,
    );
    const [constrainedValue, setConstrainedValue] = useState<
      ISODateString | undefined
    >(undefined);

    const isWeekday = (date: Date) => {
      const day = date.getDay();
      return day !== 0 && day !== 6;
    };

    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: '32px'}}>
        <div>
          <h3 style={{marginBottom: '8px'}}>Single Date Selection</h3>
          <Calendar
            mode="single"
            value={singleValue}
            onChange={val => setSingleValue(val)}
            focusDate="2026-01-01"
          />
          <p
            style={{
              marginTop: '8px',
              fontSize: '14px',
              color: 'var(--color-text-secondary)',
            }}>
            Selected: {singleValue ?? 'None'}
          </p>
        </div>

        <div>
          <h3 style={{marginBottom: '8px'}}>Range Selection (Two Months)</h3>
          <Calendar
            mode="range"
            numberOfMonths={2}
            value={rangeValue}
            onChange={range => setRangeValue(range)}
            focusDate="2026-01-01"
          />
          <p
            style={{
              marginTop: '8px',
              fontSize: '14px',
              color: 'var(--color-text-secondary)',
            }}>
            Range:{' '}
            {rangeValue
              ? `${rangeValue.start} to ${rangeValue.end}`
              : 'None selected'}
          </p>
        </div>

        <div>
          <h3 style={{marginBottom: '8px'}}>Weekdays Only with Week Numbers</h3>
          <Calendar
            mode="single"
            hasWeekNumbers
            dateConstraints={[isWeekday]}
            value={constrainedValue}
            onChange={val => setConstrainedValue(val)}
            focusDate="2026-01-01"
          />
          <p
            style={{
              marginTop: '8px',
              fontSize: '14px',
              color: 'var(--color-text-secondary)',
            }}>
            Selected: {constrainedValue ?? 'None'}
          </p>
        </div>
      </div>
    );
  },
};

/**
 * Theme the selected-date and today rings precisely via `defineTheme`.
 *
 * The day cell reflects a compound `marker` state that maps 1:1 to the
 * treatment actually drawn — `marker:today-only` for a plain today cell and
 * `marker:today-in-range` for today inside a range — plus the existing
 * `selected` state for the selection fill. A theme can restyle each without
 * needing a `:not()` exclusion or over-matching the states where no ring is
 * shown.
 *
 * Defaults are unchanged; this story only demonstrates the override channel.
 */
const markerTheme = defineTheme({
  name: 'calendar-marker-demo',
  components: {
    'calendar-day': {
      selected: {
        backgroundColor: 'var(--color-success)',
      },
      'marker:today-only': {
        boxShadow: 'inset 0 0 0 2px var(--color-accent)',
      },
      'marker:today-in-range': {
        boxShadow: 'inset 0 0 0 2px var(--color-warning)',
      },
    },
  },
});

export const ThemedSelectedAndTodayRing: Story = {
  render: () => {
    const [value, setValue] = useState<DateRange | undefined>(undefined);
    return (
      <Theme theme={markerTheme} mode="light">
        <Calendar
          mode="range"
          value={value}
          onChange={range => setValue(range)}
        />
      </Theme>
    );
  },
};

/**
 * Theme the month-nav controls and the selected-date ring independently of the
 * rest of the app, using `defineTheme`.
 *
 * - `components['calendar-nav']` scopes overrides to the prev/next month
 *   buttons only (via the `astryx-calendar-nav` target), instead of the global
 *   `astryx-button` handle that would hit every Button in the app. The
 *   `nav` visual prop and `disabled` state are reflected as data
 *   attributes, so a theme can target one arrow or the disabled edge alone.
 * - `components['calendar-day'].selected` restyles the selected-date treatment
 *   (the `astryx-calendar-day` target with its `selected` state).
 */
const navRingTheme = defineTheme({
  name: 'calendar-nav-ring',
  components: {
    'calendar-nav': {
      base: {
        color: 'var(--color-accent)',
        borderRadius: 'var(--radius-inner)',
      },
      'nav:next': {
        backgroundColor: 'var(--color-accent-muted)',
      },
    },
    'calendar-day': {
      selected: {
        backgroundColor: 'var(--color-success)',
        boxShadow: 'inset 0 0 0 2px var(--color-on-accent)',
      },
    },
  },
});

export const ThemedNavAndSelectedRing: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString>('2026-01-15');
    return (
      <Theme theme={navRingTheme} mode="light">
        <Calendar
          mode="single"
          value={value}
          onChange={val => setValue(val)}
          focusDate="2026-01-01"
        />
      </Theme>
    );
  },
};
