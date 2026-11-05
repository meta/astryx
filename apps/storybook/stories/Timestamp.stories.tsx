// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {Text} from '@astryxdesign/core/Text';

const meta: Meta<typeof Timestamp> = {
  title: 'Core/Timestamp',
  component: Timestamp,
  tags: ['autodocs'],
  argTypes: {
    format: {
      control: 'select',
      options: [
        'relative',
        'relative_short',
        'auto',
        'date',
        'date_long',
        'date_weekday',
        'date_time',
        'time',
        'system_date',
        'system_date_time',
        'system_time',
      ],
      description: 'Display format',
    },
    type: {
      control: 'select',
      options: [
        'body',
        'large',
        'label',
        'supporting',
        'code',
        'display-1',
        'display-2',
        'display-3',
      ],
      description: 'Semantic text type (from Text)',
    },
    size: {
      control: 'select',
      options: [
        '4xs',
        '3xs',
        '2xs',
        'xsm',
        'sm',
        'base',
        'lg',
        'xl',
        '2xl',
        '3xl',
        '4xl',
      ],
      description: 'Font size override',
    },
    color: {
      control: 'select',
      options: [
        'primary',
        'secondary',
        'disabled',
        'placeholder',
        'accent',
        'inherit',
      ],
      description: 'Text color',
    },
    weight: {
      control: 'select',
      options: ['normal', 'medium', 'semibold', 'bold'],
      description: 'Font weight',
    },
    isLive: {
      control: 'boolean',
      description: 'Live-update relative time',
    },
    hasTooltip: {
      control: 'boolean',
      description: 'Show copyable hover card on hover',
    },
    isTimezoneShown: {
      control: 'boolean',
      description: 'Append timezone abbreviation',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Timestamp>;

export const Default: Story = {
  args: {
    value: '2026-03-25T12:00:00Z',
  },
};

export const RelativeFormat: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        alignItems: 'flex-start',
      }}>
      <Timestamp value={Date.now() / 1000 - 5} format="relative" />
      <Timestamp value={Date.now() / 1000 - 120} format="relative" />
      <Timestamp value={Date.now() / 1000 - 3600} format="relative" />
      <Timestamp value={Date.now() / 1000 - 86400} format="relative" />
      <Timestamp value={Date.now() / 1000 - 259200} format="relative" />
      <Timestamp value={Date.now() / 1000 - 90 * 86400} format="relative" />
      <Timestamp value={Date.now() / 1000 - 730 * 86400} format="relative" />
    </div>
  ),
};

export const RelativeShortFormat: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        alignItems: 'flex-start',
      }}>
      <Timestamp value={Date.now() / 1000 - 5} format="relative_short" />
      <Timestamp value={Date.now() / 1000 - 120} format="relative_short" />
      <Timestamp value={Date.now() / 1000 - 3600} format="relative_short" />
      <Timestamp value={Date.now() / 1000 - 86400} format="relative_short" />
      <Timestamp value={Date.now() / 1000 - 259200} format="relative_short" />
      <Timestamp
        value={Date.now() / 1000 - 90 * 86400}
        format="relative_short"
      />
      <Timestamp
        value={Date.now() / 1000 - 730 * 86400}
        format="relative_short"
      />
    </div>
  ),
};

const relativeThresholds = [
  {label: 'Present clamp · 5 seconds ago', offsetSeconds: -5},
  {label: 'Past seconds begin · 10 seconds ago', offsetSeconds: -10},
  {label: 'Past minutes begin · 60 seconds ago', offsetSeconds: -60},
  {label: 'Past hours begin · 1 hour ago', offsetSeconds: -3600},
  {label: 'Past days begin · 1 day ago', offsetSeconds: -86400},
  {label: 'Past months begin · 30 days ago', offsetSeconds: -30 * 86400},
  {label: 'Past years begin · 365 days ago', offsetSeconds: -365 * 86400},
  {label: 'Future skew clamp · 30 seconds', offsetSeconds: 30},
  {label: 'Future seconds begin · 31 seconds', offsetSeconds: 31},
  {label: 'Future minutes begin · 60 seconds', offsetSeconds: 60},
  {label: 'Future hours begin · 1 hour', offsetSeconds: 3600},
  {label: 'Future days begin · 1 day', offsetSeconds: 86400},
  {label: 'Future months begin · 30 days', offsetSeconds: 30 * 86400},
  {label: 'Future years begin · 365 days', offsetSeconds: 365 * 86400},
] as const;

function RelativeThresholds({locale}: {locale: string}) {
  const now = Date.now() / 1000;
  return (
    <InternationalizationProvider locale={locale}>
      <div style={{width: 680}}>
        <Text type="large" weight="bold">
          Relative-time transition points
        </Text>
        <Text type="supporting" color="secondary" display="block">
          Provider locale: {locale}
        </Text>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 1fr) minmax(160px, auto)',
            gap: '10px 32px',
            marginTop: 20,
          }}>
          {relativeThresholds.map(({label, offsetSeconds}) => (
            <div key={label} style={{display: 'contents'}}>
              <Text type="supporting" color="secondary">
                {label}
              </Text>
              <Timestamp
                value={now + offsetSeconds}
                format="relative"
                hasTooltip={false}
                type="body"
                color="primary"
              />
            </div>
          ))}
        </div>
      </div>
    </InternationalizationProvider>
  );
}

export const RelativeThresholdsEnglish: Story = {
  name: 'Relative thresholds · English',
  render: () => <RelativeThresholds locale="en-US" />,
};

export const DateFormat: Story = {
  args: {
    value: '2026-02-19T17:00:00Z',
    format: 'date',
  },
};

export const DateLongFormat: Story = {
  args: {
    value: '2026-02-19T17:00:00Z',
    format: 'date_long',
  },
};

export const DateWeekdayFormat: Story = {
  args: {
    value: '2026-02-19T17:00:00Z',
    format: 'date_weekday',
  },
};

export const DateTimeFormat: Story = {
  args: {
    value: '2026-02-19T17:00:00Z',
    format: 'date_time',
  },
};

export const DateTimeWithTimezone: Story = {
  args: {
    value: '2026-02-19T17:00:00Z',
    format: 'date_time',
    isTimezoneShown: true,
  },
};

export const TimeFormat: Story = {
  args: {
    value: '2026-02-19T17:00:00Z',
    format: 'time',
  },
};

export const TooltipTimezones: Story = {
  name: 'Hover card — configuration examples',
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '32px'}}>
      <div>
        <Text type="supporting" color="secondary">
          Local + UTC, default format — hover or tab to the timestamp, then copy
          any row
        </Text>
        <div>
          <Timestamp
            value="2026-02-19T17:00:00Z"
            format="relative"
            tooltipEntries={[
              {label: 'Local'},
              {timezoneID: 'UTC', label: 'UTC'},
            ]}
          />
        </div>
      </div>
      <div>
        <Text type="supporting" color="secondary">
          Three labelled zones — the widest case the card holds
        </Text>
        <div>
          <Timestamp
            value="2026-02-19T17:00:00Z"
            format="date"
            tooltipEntries={[
              {
                timezoneID: 'America/New_York',
                format: 'date_time',
                label: 'New York',
              },
              {
                timezoneID: 'Europe/London',
                format: 'date_time',
                label: 'London',
              },
              {timezoneID: 'Asia/Tokyo', format: 'date_time', label: 'Tokyo'},
            ]}
          />
        </div>
      </div>
      <div>
        <Text type="supporting" color="secondary">
          One zone, two formats — friendly line plus a machine-precise line
        </Text>
        <div>
          <Timestamp
            value="2026-02-19T17:00:00Z"
            format="date_time"
            tooltipEntries={[
              {format: 'full'},
              {format: 'system_date_time', label: 'ISO'},
            ]}
          />
        </div>
      </div>
      <div>
        <Text type="supporting" color="secondary">
          UTC only — an audit log that never shows local time
        </Text>
        <div>
          <Timestamp
            value="2026-02-19T17:00:00Z"
            format="date_time"
            tooltipEntries={[{timezoneID: 'UTC', label: 'UTC'}]}
          />
        </div>
      </div>
    </div>
  ),
};

export const CopyableHoverCard: Story = {
  name: 'Copyable hover card',
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '32px'}}>
      <div>
        <Text type="supporting" color="secondary">
          Local, UTC, another zone, and Unix seconds — hover or tab, then copy
          any row
        </Text>
        <div>
          <Timestamp
            value="2026-02-19T17:00:00Z"
            format="relative"
            tooltipEntries={[
              {label: 'Local'},
              {timezoneID: 'UTC', label: 'UTC'},
              {
                timezoneID: 'Asia/Tokyo',
                format: 'date_time',
                label: 'Tokyo',
              },
              {
                timezoneID: 'UTC',
                format: 'system_date_time',
                label: 'ISO (UTC)',
              },
            ]}
          />
        </div>
      </div>
      <div>
        <Text type="supporting" color="secondary">
          A single UTC entry — one copyable row, on an absolute format that has
          no hover card of its own
        </Text>
        <div>
          <Timestamp
            value="2026-02-19T17:00:00Z"
            format="date_time"
            tooltipEntries={[{timezoneID: 'UTC', label: 'UTC'}]}
          />
        </div>
      </div>
    </div>
  ),
};

export const PerEntryCopyable: Story = {
  name: 'Per-entry copyable',
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '32px'}}>
      <div>
        <Text type="supporting" color="secondary">
          Mixed: human-readable rows are read-only; only the machine value opts
          into a copy button
        </Text>
        <div>
          <Timestamp
            value="2026-02-19T17:00:00Z"
            format="relative"
            tooltipEntries={[
              {label: 'Local'},
              {timezoneID: 'UTC', label: 'UTC'},
              {
                timezoneID: 'UTC',
                format: 'system_date_time',
                label: 'ISO (UTC)',
                isCopyable: true,
              },
            ]}
          />
        </div>
      </div>
      <div>
        <Text type="supporting" color="secondary">
          Fully read-only card — no row opts in, so there is no copy button and
          no trailing action column
        </Text>
        <div>
          <Timestamp
            value="2026-02-19T17:00:00Z"
            format="relative"
            tooltipEntries={[
              {label: 'Local'},
              {timezoneID: 'UTC', label: 'UTC'},
            ]}
          />
        </div>
      </div>
      <div>
        <Text type="supporting" color="secondary">
          Single read-only row with no label — the value sits flush at the
          leading edge
        </Text>
        <div>
          <Timestamp
            value="2026-02-19T17:00:00Z"
            format="relative"
            tooltipEntries={[{}]}
          />
        </div>
      </div>
    </div>
  ),
};

export const SystemFormats: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
      <div>
        <Text type="label" color="secondary">
          system_date:{' '}
        </Text>
        <Timestamp
          value="2026-02-19T17:00:00Z"
          format="system_date"
          type="code"
        />
      </div>
      <div>
        <Text type="label" color="secondary">
          system_date_time:{' '}
        </Text>
        <Timestamp
          value="2026-02-19T17:00:00Z"
          format="system_date_time"
          type="code"
        />
      </div>
      <div>
        <Text type="label" color="secondary">
          system_time:{' '}
        </Text>
        <Timestamp
          value="2026-02-19T17:00:00Z"
          format="system_time"
          type="code"
        />
      </div>
    </div>
  ),
};

export const AllFormats: Story = {
  render: () => {
    const date = '2026-02-19T17:00:00Z';
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
        <div>
          <Text type="label" color="secondary">
            relative:{' '}
          </Text>
          <Timestamp value={Date.now() / 1000 - 3600} format="relative" />
        </div>
        <div>
          <Text type="label" color="secondary">
            date:{' '}
          </Text>
          <Timestamp value={date} format="date" />
        </div>
        <div>
          <Text type="label" color="secondary">
            date_long:{' '}
          </Text>
          <Timestamp value={date} format="date_long" />
        </div>
        <div>
          <Text type="label" color="secondary">
            date_weekday:{' '}
          </Text>
          <Timestamp value={date} format="date_weekday" />
        </div>
        <div>
          <Text type="label" color="secondary">
            date_time:{' '}
          </Text>
          <Timestamp value={date} format="date_time" />
        </div>
        <div>
          <Text type="label" color="secondary">
            time:{' '}
          </Text>
          <Timestamp value={date} format="time" />
        </div>
        <div>
          <Text type="label" color="secondary">
            system_date:{' '}
          </Text>
          <Timestamp value={date} format="system_date" type="code" />
        </div>
        <div>
          <Text type="label" color="secondary">
            system_date_time:{' '}
          </Text>
          <Timestamp value={date} format="system_date_time" type="code" />
        </div>
        <div>
          <Text type="label" color="secondary">
            system_time:{' '}
          </Text>
          <Timestamp value={date} format="system_time" type="code" />
        </div>
      </div>
    );
  },
};

export const LiveUpdating: Story = {
  args: {
    value: Date.now() / 1000 - 5,
    format: 'relative',
    isLive: true,
  },
};

export const TextTypes: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="date_time"
        type="supporting"
      />
      <Timestamp value="2026-02-19T17:00:00Z" format="date_time" type="body" />
      <Timestamp value="2026-02-19T17:00:00Z" format="date_time" type="large" />
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="date_time"
        type="label"
        weight="semibold"
      />
    </div>
  ),
};

export const Colors: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="date_time"
        color="primary"
      />
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="date_time"
        color="secondary"
      />
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="date_time"
        color="disabled"
      />
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="date_time"
        color="accent"
      />
    </div>
  ),
};

export const AutoFormat: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
      <div>
        <Text type="label" color="secondary">
          Recent (relative):{' '}
        </Text>
        <Timestamp value={Date.now() / 1000 - 3600} format="auto" />
      </div>
      <div>
        <Text type="label" color="secondary">
          Old (date_time):{' '}
        </Text>
        <Timestamp value="2025-01-01T12:00:00Z" format="auto" />
      </div>
    </div>
  ),
};

export const FutureDates: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        alignItems: 'flex-start',
      }}>
      <Timestamp value={Date.now() / 1000 + 60} format="relative" />
      <Timestamp value={Date.now() / 1000 + 3600} format="relative" />
      <Timestamp value={Date.now() / 1000 + 86400} format="relative" />
    </div>
  ),
};
