// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateLocaleConsistency.stories.tsx
 * @input InternationalizationProvider locale plus a controlled Gregorian date or empty value
 * @output Side-by-side French and Thai date-formatting evidence
 * @position Storybook verification story for shared date semantics
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Calendar, type ISODateString} from '@astryxdesign/core/Calendar';
import {DateInput} from '@astryxdesign/core/DateInput';
import {
  InternationalizationProvider,
  type Locale,
} from '@astryxdesign/core/i18n';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const meta = {
  title: 'Core/Internationalization/Date consistency',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const DATE = '2026-08-22' as ISODateString;

function LocaleDateExamples({locale}: {locale: Locale}) {
  const [value, setValue] = useState<ISODateString | undefined>(DATE);

  return (
    <InternationalizationProvider locale={locale}>
      <section
        aria-label={`${locale} date examples`}
        {...stylex.props(styles.panel)}>
        <Heading level={2}>{locale}</Heading>
        <DateInput
          label="Selected date"
          value={value}
          onChange={setValue}
          format="date_long"
          nativePicker="never"
        />
        <Text>
          Timestamp:{' '}
          <Timestamp value="2026-08-22T12:00:00Z" format="date_long" />
        </Text>
        <Calendar
          mode="single"
          value={value ?? null}
          onChange={setValue}
          focusDate="2026-08-01"
        />
      </section>
    </InternationalizationProvider>
  );
}

export const FrenchAndThaiGregorian: Story = {
  render: () => (
    <div {...stylex.props(styles.comparison)}>
      <LocaleDateExamples locale="fr-FR" />
      <LocaleDateExamples locale="th-TH" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Calendar, DateInput, and Timestamp all follow the provider locale while preserving Gregorian year 2026. Thai must not render Buddhist year 2569.',
      },
    },
  },
};

const styles = stylex.create({
  comparison: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: spacingVars['--spacing-8'],
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-4'],
    minWidth: 0,
  },
});
