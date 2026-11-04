// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CalendarSystems.stories.tsx
 * @input InternationalizationProvider locale and calendar, Calendar,
 *   Timestamp, PowerSearch
 * @output Calendar in each kind of calendar system, with its Gregorian value,
 *   and the built-in date formatters in the provider's calendar
 * @position Storybook verification stories for calendar systems; excluded from
 *   the visual matrix because the months depend on the runtime's Temporal
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Calendar, type ISODateString} from '@astryxdesign/core/Calendar';
import {
  InternationalizationProvider,
  getLocaleDirection,
  type CalendarSystem,
  type Locale,
} from '@astryxdesign/core/i18n';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {
  PowerSearch,
  type PowerSearchConfig,
  type PowerSearchFilter,
} from '@astryxdesign/core/PowerSearch';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const meta = {
  title: 'Core/Internationalization/Calendar systems',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

interface CalendarCase {
  title: string;
  locale: Locale;
  /** The provider's calendar. */
  calendar?: CalendarSystem;
  /** The Calendar's own calendar, over the provider's. */
  componentCalendar?: CalendarSystem;
  value: ISODateString;
  numberOfMonths?: 1 | 2;
  weekStartsOn?: 'sun' | 'mon' | 'sat';
}

function CalendarCaseView({
  title,
  locale,
  calendar,
  componentCalendar,
  value: initialValue,
  numberOfMonths,
  weekStartsOn,
}: CalendarCase) {
  const [value, setValue] = useState<ISODateString>(initialValue);
  return (
    <InternationalizationProvider locale={locale} calendar={calendar}>
      <section aria-label={title} {...stylex.props(styles.panel)}>
        <Heading level={2}>{title}</Heading>
        <div dir={getLocaleDirection(locale)}>
          <Calendar
            calendar={componentCalendar}
            value={value}
            onChange={setValue}
            numberOfMonths={numberOfMonths}
            weekStartsOn={weekStartsOn}
          />
        </div>
        <Text>
          value: <code data-testid="value">{value}</code>
        </Text>
      </section>
    </InternationalizationProvider>
  );
}

function story(calendarCase: CalendarCase, description: string): Story {
  return {
    render: () => <CalendarCaseView {...calendarCase} />,
    parameters: {docs: {description: {story: description}}},
  };
}

export const PersianFarsi = story(
  {
    title: 'Persian, fa-IR',
    locale: 'fa-IR',
    calendar: 'persian',
    value: '2026-10-30',
    weekStartsOn: 'sat',
  },
  'Aban 1405 in Farsi with Persian digits. The value stays the Gregorian ISO date.',
);

export const PersianEnglish = story(
  {
    title: 'Persian calendar, English',
    locale: 'en',
    calendar: 'persian',
    value: '2026-10-30',
    weekStartsOn: 'sat',
  },
  'The calendar is independent of the language.',
);

export const PersianFromLocaleKeyword = story(
  {
    title: 'fa-IR-u-ca-persian',
    locale: 'fa-IR-u-ca-persian',
    value: '2026-10-30',
    weekStartsOn: 'sat',
  },
  'A `-u-ca-` keyword in the provider locale selects the calendar.',
);

export const LocaleAloneStaysGregorian = story(
  {
    title: 'fa-IR, no calendar',
    locale: 'fa-IR',
    value: '2026-10-30',
    weekStartsOn: 'sat',
  },
  "A locale's default calendar never applies: `fa-IR` alone shows Gregorian months.",
);

export const ComponentCalendarOverProvider = story(
  {
    title: 'Gregorian Calendar in a Persian provider',
    locale: 'fa-IR',
    calendar: 'persian',
    componentCalendar: 'gregory',
    value: '2026-10-30',
    weekStartsOn: 'sat',
  },
  "The Calendar's own `calendar` prop takes precedence over the provider's.",
);

export const HebrewLeapYear = story(
  {
    title: 'Hebrew leap year',
    locale: 'en',
    calendar: 'hebrew',
    value: '2024-03-01',
    numberOfMonths: 2,
  },
  'Adar I and Adar II of 5784 are distinct months. Shift+PageDown from Adar I lands in Adar of 5785.',
);

export const JapaneseEraChange = story(
  {
    title: 'Japanese era change',
    locale: 'ja-JP',
    calendar: 'japanese',
    value: '2019-04-30',
    numberOfMonths: 2,
  },
  'Heisei 31 April and Reiwa 1 May. Japanese months are Gregorian, so no Temporal is needed.',
);

export const ChineseLeapMonth = story(
  {
    title: 'Chinese leap second month',
    locale: 'zh-CN',
    calendar: 'chinese',
    value: '2023-03-01',
    numberOfMonths: 2,
    weekStartsOn: 'mon',
  },
  'The second month of 2023 is followed by a leap second month.',
);

export const EthiopicThirteenthMonth = story(
  {
    title: 'Ethiopic thirteenth month',
    locale: 'am-ET',
    calendar: 'ethiopic',
    value: '2026-09-08',
    numberOfMonths: 2,
  },
  'Pagume 2018 has five days and keeps the fixed six-row grid.',
);

export const IslamicUmmAlQura = story(
  {
    title: 'Islamic (Umm al-Qura), ar-SA',
    locale: 'ar-SA',
    calendar: 'islamic-umalqura',
    value: '2026-10-30',
    weekStartsOn: 'sat',
  },
  'A right-to-left locale with Arabic-Indic digits.',
);

export const BuddhistThai = story(
  {
    title: 'Buddhist, th-TH',
    locale: 'th-TH',
    calendar: 'buddhist',
    value: '2026-10-30',
  },
  'Buddhist years on Gregorian months. No Temporal is needed.',
);

export const Iso8601 = story(
  {
    title: 'ISO 8601, English',
    locale: 'en',
    calendar: 'iso8601',
    value: '2026-10-30',
    weekStartsOn: 'mon',
  },
  'The ISO 8601 calendar has Gregorian months and uses Gregorian month names.',
);

const formatterConfig: PowerSearchConfig = {
  name: 'Dates',
  fields: [
    {
      key: 'created',
      label: 'Created',
      defaultOperator: 'after',
      operators: [
        {key: 'after', label: 'after', value: {type: 'date_absolute'}},
      ],
    },
  ],
};

const formatterFilters: PowerSearchFilter[] = [
  {
    field: 'created',
    operator: 'after',
    value: {
      type: 'date_absolute',
      unixSeconds: Date.parse('2026-10-30T12:00:00Z') / 1000,
    },
  },
];

const FORMATTED_INSTANT = '2026-10-30T12:00:00Z';

function FormattedDatesView({
  title,
  locale,
  calendar,
}: {
  title: string;
  locale: Locale;
  calendar?: CalendarSystem;
}) {
  return (
    <InternationalizationProvider locale={locale} calendar={calendar}>
      <section
        aria-label={title}
        dir={getLocaleDirection(locale)}
        {...stylex.props(styles.panel)}>
        <Heading level={2}>{title}</Heading>
        {(['date', 'date_long', 'date_weekday', 'date_time'] as const).map(
          format => (
            <Text key={format}>
              <code>{format}</code>:{' '}
              <Timestamp
                value={FORMATTED_INSTANT}
                format={format}
                data-testid={`timestamp-${format}`}
              />
            </Text>
          ),
        )}
        <Text>
          <code>system_date_time</code>:{' '}
          <Timestamp
            value={FORMATTED_INSTANT}
            format="system_date_time"
            data-testid="timestamp-system_date_time"
          />
        </Text>
        <div {...stylex.props(styles.search)}>
          <PowerSearch
            config={formatterConfig}
            filters={formatterFilters}
            onChange={() => {}}
            timezoneID="UTC"
          />
        </div>
        <Calendar value="2026-10-30" />
      </section>
    </InternationalizationProvider>
  );
}

export const FormattedDatesPersian: Story = {
  render: () => (
    <div {...stylex.props(styles.row)}>
      <FormattedDatesView
        title="Persian calendar, English"
        locale="en"
        calendar="persian"
      />
      <FormattedDatesView
        title="Persian, fa-IR"
        locale="fa-IR"
        calendar="persian"
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Timestamp's date formats, a PowerSearch date value, and Calendar follow the provider's calendar. `system_date_time` stays Gregorian ISO.",
      },
    },
  },
};

const styles = stylex.create({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-4'],
    alignItems: 'flex-start',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacingVars['--spacing-8'],
    alignItems: 'flex-start',
  },
  search: {
    width: 360,
  },
});
