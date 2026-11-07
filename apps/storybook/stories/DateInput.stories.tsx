// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import {DateInput, type DateInputProps} from '@astryxdesign/core/DateInput';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Text} from '@astryxdesign/core/Text';
import {InputGroup, InputGroupText} from '@astryxdesign/core/InputGroup';
import type {ISODateString} from '@astryxdesign/core/Calendar';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import {
  type CalendarSystem,
  InternationalizationProvider,
} from '@astryxdesign/core/i18n';

const meta: Meta<typeof DateInput> = {
  title: 'Core/DateInput',
  component: DateInput,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A date field that fits the pointer it is used with. Every story ' +
          'below shows the pointer surface — a text input you can type into ' +
          'with a calendar in a popover — because that is the right answer ' +
          'for the mouse you are reading this with.\n\n' +
          'Where the primary pointer is a finger (`pointer: coarse`), the ' +
          'same component renders a picker built for one instead: a bottom ' +
          'sheet of months swiped sideways, with month and year wheels ' +
          'behind the header title, and no text entry (the keyboard would ' +
          'cover the sheet it is meant to fill in). Same props either way — ' +
          'there is nothing to opt into.\n\n' +
          '**Seeing the touch surface:** open any story below on a phone or ' +
          'tablet, or in a device-emulated tab reporting a coarse pointer. ' +
          'Every one of them renders it — they are the same stories, and ' +
          'that is the point. There is no separate touch story because there ' +
          'is no separate thing to adopt.',
      },
    },
  },
  argTypes: {
    label: {
      control: 'text',
      description: 'Label text (required)',
    },
    isLabelHidden: {
      control: 'boolean',
      description:
        'Visually hide the label (still accessible to screen readers)',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    description: {
      control: 'text',
      description: 'Description text displayed between the label and input',
    },
    isOptional: {
      control: 'boolean',
      description:
        'Whether the field is optional (mutually exclusive with isRequired)',
    },
    isRequired: {
      control: 'boolean',
      description:
        'Whether the field is required (mutually exclusive with isOptional)',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Whether the input is disabled',
    },
    disabledMessage: {
      control: 'text',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and describes the focusable controls of the field (activation stays blocked). Use this instead of wrapping a disabled DateInput in Tooltip.',
    },
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
      description: 'Size of the input',
    },
    numberOfMonths: {
      control: 'radio',
      options: [1, 2],
      description: 'Number of months to display in calendar',
    },
    weekStartsOn: {
      control: 'select',
      options: [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        'sun',
        'mon',
        'tue',
        'wed',
        'thu',
        'fri',
        'sat',
      ],
      description:
        'First day of week in the calendar popover (0 = Sunday, or a three-letter day name)',
    },
    format: {
      control: 'select',
      options: ['date_long', 'date', 'date_weekday', 'system_date'],
      description:
        "Display format for the committed value, reusing Timestamp's vocabulary. Defaults to 'date_long' (long-month date).",
    },
    presentation: {
      control: 'select',
      options: [
        'popover',
        'bottom-sheet',
        'native',
        'adaptive-bottom-sheet',
        'adaptive-native',
      ],
      description:
        'Which surface draws the picker (spec:AST-043); nativePicker is deprecated',
    },
    nativePicker: {
      control: 'radio',
      options: ['touch', 'always', 'never'],
      description:
        "Deprecated — use presentation ('touch' → 'adaptive-native', 'always' → 'native', 'never' → 'adaptive-bottom-sheet'); presentation wins when both are set",
    },
  },
};

export default meta;
type Story = StoryObj<typeof DateInput>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Date',
    placeholder: 'Select a date',
  },
};

export const WithValue: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(
      '2026-01-25' as ISODateString,
    );
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Event date',
  },
};

/**
 * A day-first locale: typed numeric dates read day, then month. The line
 * under the field shows each value the field reports.
 */
export const DayFirstLocale: Story = {
  tags: ['!autodocs'],
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    const [reported, setReported] = useState<string[]>([]);
    return (
      <InternationalizationProvider locale="en-GB">
        <DateInput
          {...args}
          value={value}
          onChange={next => {
            setValue(next);
            setReported(previous => [...previous, String(next)]);
          }}
        />
        <Text data-testid="reported">{reported.join(', ')}</Text>
      </InternationalizationProvider>
    );
  },
  args: {
    label: 'Start date',
  },
};

export const MondayFirstWeek: Story = {
  name: 'Week starts on Monday',
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Date',
    placeholder: 'Select a date',
    weekStartsOn: 'mon',
  },
};

/**
 * The committed date value can be rendered in different shapes via `format`,
 * reusing `Timestamp`'s format vocabulary so the same literal renders the same
 * date shape in both components. It defaults to `'date_long'` (a long-month
 * date, "March 21, 2026"). While the user is typing, the raw text is shown
 * verbatim — `format` applies only to the committed value.
 */
export const Formats: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString | undefined>(
      '2026-03-21' as ISODateString,
    );
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <DateInput
          label="Default (format='date_long')"
          value={value}
          onChange={setValue}
        />
        <DateInput
          label="format='date'"
          value={value}
          onChange={setValue}
          format="date"
        />
        <DateInput
          label="format='date_weekday'"
          value={value}
          onChange={setValue}
          format="date_weekday"
        />
        <DateInput
          label="format='system_date'"
          value={value}
          onChange={setValue}
          format="system_date"
        />
        <DateInput
          label="Custom function"
          value={value}
          onChange={setValue}
          format={iso =>
            new Intl.DateTimeFormat('en-GB', {dateStyle: 'full'}).format(
              new Date(iso + 'T00:00'),
            )
          }
        />
      </div>
    );
  },
};

const CALENDAR_FIELDS: ReadonlyArray<{
  locale: string;
  calendar: CalendarSystem;
  label: string;
  dir: 'ltr' | 'rtl';
  min?: ISODateString;
  max?: ISODateString;
}> = [
  {locale: 'fa-IR', calendar: 'persian', label: 'تاریخ شروع', dir: 'rtl'},
  {locale: 'he', calendar: 'hebrew', label: 'תאריך התחלה', dir: 'rtl'},
  {locale: 'ja-JP', calendar: 'japanese', label: '開始日', dir: 'ltr'},
  {
    locale: 'th-TH',
    calendar: 'buddhist',
    label: 'วันที่เริ่มต้น',
    dir: 'ltr',
    min: '2020-01-01' as ISODateString,
    max: '2030-12-31' as ISODateString,
  },
  {
    locale: 'en',
    calendar: 'hebrew',
    label: 'Start date (Hebrew calendar)',
    dir: 'ltr',
  },
];

function CalendarField({
  locale,
  calendar,
  label,
  dir,
  min,
  max,
}: (typeof CALENDAR_FIELDS)[number]) {
  const [value, setValue] = useState<ISODateString | undefined>(
    '2026-11-02' as ISODateString,
  );
  return (
    <InternationalizationProvider locale={locale}>
      <div
        dir={dir}
        lang={locale}
        data-calendar-field={`${locale}-${calendar}`}
        style={{display: 'flex', flexDirection: 'column', gap: 4}}>
        <DateInput
          label={label}
          calendar={calendar}
          value={value}
          onChange={setValue}
          min={min}
          max={max}
          width={320}
        />
        <Text type="supporting" color="secondary">
          <code data-value>{`value: ${value ?? '—'}`}</code>
        </Text>
      </div>
    </InternationalizationProvider>
  );
}

/**
 * `calendar` sets the calendar the field reads and writes typed dates in.
 * `value` and `onChange` stay Gregorian ISO dates. Type in the locale's
 * digits or Latin digits; the field reports a date only when it is complete,
 * and names a date the calendar does not have. The Buddhist field sets `min`
 * and `max`, so a Gregorian year typed by mistake is caught. Calendars other
 * than Gregorian, Buddhist, Minguo, and Japanese need `Temporal`.
 */
export const CalendarSystems: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
      {CALENDAR_FIELDS.map(field => (
        <CalendarField key={`${field.locale}-${field.calendar}`} {...field} />
      ))}
    </div>
  ),
};

const PRESENTATION_FIELDS: ReadonlyArray<{
  id: string;
  locale: string;
  calendar: CalendarSystem;
  label: string;
  dir: 'ltr' | 'rtl';
  value: ISODateString;
  min?: ISODateString;
  max?: ISODateString;
  presentation?: DateInputProps['presentation'];
}> = [
  {
    id: 'fa-persian',
    locale: 'fa-IR',
    calendar: 'persian',
    label: 'تاریخ شروع',
    dir: 'rtl',
    value: '2026-11-02' as ISODateString,
  },
  {
    id: 'en-persian-native',
    locale: 'en',
    calendar: 'persian',
    label: 'Start date (Persian, presentation="native")',
    dir: 'ltr',
    value: '2026-11-02' as ISODateString,
    presentation: 'native',
  },
  {
    id: 'en-hebrew-leap',
    locale: 'en',
    calendar: 'hebrew',
    label: 'Start date (Hebrew, a leap year)',
    dir: 'ltr',
    value: '2024-02-15' as ISODateString,
    min: '2020-01-01' as ISODateString,
    max: '2030-12-31' as ISODateString,
  },
  {
    id: 'ja-japanese',
    locale: 'ja-JP',
    calendar: 'japanese',
    label: '開始日',
    dir: 'ltr',
    value: '2026-11-02' as ISODateString,
    min: '2015-01-01' as ISODateString,
    max: '2030-12-31' as ISODateString,
  },
  {
    id: 'en-ethiopic-pagume',
    locale: 'en',
    calendar: 'ethiopic',
    label: 'Start date (Ethiopic, the thirteenth month)',
    dir: 'ltr',
    value: '2026-09-08' as ISODateString,
  },
  {
    id: 'en-gregory',
    locale: 'en',
    calendar: 'gregory',
    label: 'Start date (Gregorian)',
    dir: 'ltr',
    value: '2026-11-02' as ISODateString,
  },
];

function PresentationField({
  id,
  locale,
  calendar,
  label,
  dir,
  value: initialValue,
  min,
  max,
  presentation,
}: (typeof PRESENTATION_FIELDS)[number]) {
  const [value, setValue] = useState<ISODateString | undefined>(initialValue);
  return (
    <InternationalizationProvider locale={locale}>
      <div
        dir={dir}
        lang={locale}
        data-calendar-field={id}
        style={{display: 'flex', flexDirection: 'column', gap: 4}}>
        <DateInput
          label={label}
          calendar={calendar}
          value={value}
          onChange={setValue}
          min={min}
          max={max}
          presentation={presentation}
          width={320}
        />
        <Text type="supporting" color="secondary">
          <code data-value>{`value: ${value ?? '—'}`}</code>
        </Text>
      </div>
    </InternationalizationProvider>
  );
}

/**
 * In a calendar other than Gregorian, the field never shows the native date
 * control, which is Gregorian: the default and `presentation="native"` open
 * the calendar popover on a mouse and the bottom sheet on a touch screen. The
 * bottom sheet shows months of the calendar, its month wheel lists the months
 * of the calendar year, including leap months, and its year wheel names the
 * era. Values stay Gregorian ISO dates.
 */
export const CalendarSystemPresentations: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
      {PRESENTATION_FIELDS.map(field => (
        <PresentationField key={field.id} {...field} />
      ))}
    </div>
  ),
};

export const NativePickerModes: Story = {
  name: 'Native picker modes',
  render: () => {
    const [value, setValue] = useState<ISODateString | undefined>(
      '2026-03-21' as ISODateString,
    );
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <DateInput
          label="presentation='adaptive-native' (default)"
          description="Native picker on a coarse pointer; Astryx picker otherwise"
          value={value}
          onChange={setValue}
          presentation="adaptive-native"
        />
        <DateInput
          label="presentation='native'"
          description="Native picker wherever the browser supports it"
          value={value}
          onChange={setValue}
          presentation="native"
        />
        <DateInput
          label="presentation='adaptive-bottom-sheet'"
          description="Astryx picker on every pointer type"
          value={value}
          onChange={setValue}
          presentation="adaptive-bottom-sheet"
        />
      </div>
    );
  },
};

export const WithDescription: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Birthday',
    description: 'Enter your date of birth',
    placeholder: 'Select your birthday',
  },
};

export const WithHiddenLabel: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Date',
    isLabelHidden: true,
    placeholder: 'Select a date',
  },
};

export const Optional: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Preferred date',
    isOptional: true,
    placeholder: 'Select a date (optional)',
  },
};

export const Required: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Start date',
    isRequired: true,
    placeholder: 'Select a start date',
  },
};

export const Disabled: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(
      '2026-01-25' as ISODateString,
    );
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Locked date',
    isDisabled: true,
  },
};

// Disabled with an explanation tooltip. Hover or keyboard-focus the field to
// see why it's disabled — the reason is announced to assistive tech via
// aria-describedby on the field's focusable controls (activation is still
// blocked). Use disabledMessage instead of wrapping a disabled DateInput in
// Tooltip, so the reason is tied to the field.
export const DisabledWithMessage: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Event date',
    isDisabled: true,
    disabledMessage: 'You need the Editor role to change this',
  },
};

export const SmallSize: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Date',
    size: 'sm',
    placeholder: 'Select a date',
  },
};

export const WithMinMax: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Booking date',
    min: '2026-01-15' as ISODateString,
    max: '2026-02-15' as ISODateString,
    description: 'Available dates: Jan 15 - Feb 15, 2026',
    placeholder: 'Select a booking date',
  },
};

/**
 * The bottom-sheet calendar pages its months like the iOS date picker. One
 * month moves per swipe, and the title follows the drag.
 */
export const BottomSheetCalendar: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(
      '2026-10-15' as ISODateString,
    );
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Date',
    presentation: 'bottom-sheet',
    min: '2026-01-01' as ISODateString,
    max: '2026-12-31' as ISODateString,
  },
};

export const WithMaxDateInLayout: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return (
      <Layout
        height="auto"
        content={
          <LayoutContent>
            <DateInput {...args} value={value} onChange={setValue} />
          </LayoutContent>
        }
      />
    );
  },
  args: {
    label: 'End date',
    max: new Date().toISOString().slice(0, 10) as ISODateString,
    description:
      'Max is today; open the calendar to verify the label does not turn grey when nav buttons are disabled',
    placeholder: 'Select an end date',
  },
};

export const TwoMonthCalendar: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(undefined);
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Travel date',
    numberOfMonths: 2,
    placeholder: 'Select a travel date',
  },
};

export const WithErrorStatus: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(
      '2026-01-25' as ISODateString,
    );
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Event date',
    status: {
      type: 'error',
      message: 'This date is not available',
    },
  },
};

export const WithWarningStatus: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(
      '2026-01-01' as ISODateString,
    );
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Meeting date',
    status: {
      type: 'warning',
      message: 'This is a holiday - are you sure?',
    },
  },
};

export const WithSuccessStatus: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(
      '2026-02-10' as ISODateString,
    );
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Appointment date',
    status: {
      type: 'success',
      message: 'Date is available',
    },
  },
};

export const OpenCalendarAudit: Story = {
  tags: ['visual-theme-matrix'],
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(
      '2026-01-25' as ISODateString,
    );
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Appointment date',
    presentation: 'popover',
  },
  play: async ({canvasElement}) => {
    const input =
      canvasElement.querySelector<HTMLInputElement>('[role="combobox"]');
    if (input == null) {
      throw new Error('DateInput audit fixture is missing its combobox');
    }
    input.click();
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (input.getAttribute('aria-expanded') !== 'true') {
      throw new Error('DateInput audit fixture did not open its calendar');
    }
    if (canvasElement.ownerDocument.querySelector('[role="dialog"]') == null) {
      throw new Error('DateInput audit fixture rendered no Calendar dialog');
    }
  },
};

export const AllVariations: Story = {
  tags: ['visual-theme-matrix'],
  render: () => {
    const [value1, setValue1] = useState<ISODateString | undefined>(undefined);
    const [value2, setValue2] = useState<ISODateString | undefined>(
      '2026-01-25' as ISODateString,
    );
    const [value3, setValue3] = useState<ISODateString | undefined>(undefined);
    const [value4, setValue4] = useState<ISODateString | undefined>(undefined);
    const [value5, setValue5] = useState<ISODateString | undefined>(undefined);
    const [value6, setValue6] = useState<ISODateString | undefined>(
      '2026-03-10' as ISODateString,
    );
    const [value7, setValue7] = useState<ISODateString | undefined>(
      '2026-01-25' as ISODateString,
    );

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '300px',
        }}>
        <DateInput
          label="Default"
          value={value1}
          onChange={setValue1}
          placeholder="Select a date"
        />
        <DateInput label="With value" value={value2} onChange={setValue2} />
        <DateInput
          label="With description"
          description="Pick your preferred date"
          value={value3}
          onChange={setValue3}
          placeholder="Select a date"
        />
        <DateInput
          label="Optional field"
          isOptional
          value={value4}
          onChange={setValue4}
          placeholder="Select a date (optional)"
        />
        <DateInput
          label="Required field"
          isRequired
          value={value5}
          onChange={setValue5}
          placeholder="Select a date"
        />
        <DateInput
          label="Disabled"
          isDisabled
          value={value6}
          onChange={setValue6}
        />
        <DateInput
          label="With error"
          value={value7}
          onChange={setValue7}
          status={{
            type: 'error',
            message: 'Invalid date selection',
          }}
        />
      </div>
    );
  },
};

export const Clearable: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>('2026-04-06');
    return <DateInput {...args} value={value} onChange={setValue} hasClear />;
  },
  args: {
    label: 'Event date',
    placeholder: 'Select a date',
  },
};

/**
 * Selects a date, clears the controlled value, and reopens the calendar. The
 * final frame is the regression endpoint: an empty field with no selected day.
 */
export const ClearedCalendarSelection: Story = {
  tags: ['visual-baseline'],
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>('2026-04-06');
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Event date',
    hasClear: true,
    min: '2026-04-01',
    max: '2026-04-30',
    presentation: 'popover',
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', {name: 'Open calendar'}));
    await userEvent.click(canvas.getByRole('button', {name: /April 15, 2026/}));
    await userEvent.click(
      canvas.getByRole('button', {name: 'Clear Event date'}),
    );
    await expect(canvas.getByRole('combobox')).toHaveValue('');
    await userEvent.click(canvas.getByRole('button', {name: 'Open calendar'}));

    await waitFor(() => {
      expect(
        canvas.queryAllByRole('gridcell', {selected: true, hidden: true}),
      ).toHaveLength(0);
    });
  },
};

export const ClearableWithStatus: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>('2026-04-06');
    return <DateInput {...args} value={value} onChange={setValue} hasClear />;
  },
  args: {
    label: 'Deadline',
    status: {type: 'error', message: 'Date is in the past'},
  },
};

export const StatusVariantComparison: Story = {
  render: () => {
    const [a, setA] = useState<ISODateString | undefined>(
      '2026-01-25' as ISODateString,
    );
    const [b, setB] = useState<ISODateString | undefined>(
      '2026-01-25' as ISODateString,
    );
    return (
      <div
        style={{display: 'flex', flexDirection: 'column', gap: 24, width: 280}}>
        <DateInput
          label="Attached (default)"
          value={a}
          onChange={setA}
          status={{type: 'error', message: 'This date is not available'}}
        />
        <DateInput
          label="Detached"
          value={b}
          onChange={setB}
          status={{type: 'error', message: 'This date is not available'}}
          statusVariant="detached"
        />
      </div>
    );
  },
};

/**
 * Theme the clear glyph precisely via `defineTheme`.
 *
 * `components['input-clear-icon'].base` scopes overrides to the clear
 * icon itself (via the `astryx-input-clear-icon` target), so a theme can
 * recolor it, morph its color on hover, and resize it — without a fragile
 * descendant selector or raw CSS. Same-element rules in `@layer astryx-theme`
 * win over the icon's own base color/size.
 */
const clearIconTheme = defineTheme({
  name: 'input-clear-icon-demo',
  components: {
    'input-clear-icon': {
      base: {
        width: '12px',
        height: '12px',
        fontSize: '12px',
        color: 'var(--color-icon-secondary)',
        ':hover': {color: 'var(--color-accent)'},
      },
    },
  },
});

export const ThemedClearIcon: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString | undefined>(
      '2026-01-25' as ISODateString,
    );
    return (
      <Theme theme={clearIconTheme} mode="light">
        <DateInput
          label="Clear icon themed (12px, accent on hover)"
          value={value}
          onChange={setValue}
          hasClear
        />
      </Theme>
    );
  },
};

/**
 * Theme the calendar-toggle glyph precisely via `defineTheme`.
 *
 * - `components['date-input-toggle-icon'].base` scopes overrides to the toggle
 *   icon itself (via the `astryx-date-input-toggle-icon` target), so a theme
 *   can resize and recolor it — without a fragile descendant selector or raw
 *   CSS. Same-element rules in `@layer astryx-theme` win over the icon's own
 *   base color/size.
 * - `state:expanded` restyles the open state, which the icon reflects as a
 *   `data-state` attribute.
 */
const toggleIconTheme = defineTheme({
  name: 'date-input-toggle-icon-demo',
  components: {
    'date-input-toggle-icon': {
      base: {
        width: '14px',
        height: '14px',
        fontSize: '14px',
        color: 'var(--color-icon-secondary)',
      },
      'state:expanded': {
        color: 'var(--color-accent)',
      },
    },
  },
});

export const ThemedCalendarToggleIcon: Story = {
  render: () => {
    const [value, setValue] = useState<ISODateString | undefined>(
      '2026-01-25' as ISODateString,
    );
    return (
      <Theme theme={toggleIconTheme} mode="light">
        <DateInput
          label="Calendar toggle icon themed (14px, accent when open)"
          value={value}
          onChange={setValue}
        />
      </Theme>
    );
  },
};

const CONTROL_STYLE = {outline: '2px dashed #c800ff', outlineOffset: 3};
const CONTAINER_STYLE = {
  backgroundColor: 'rgba(0, 150, 255, 0.16)',
  padding: 8,
  borderRadius: 8,
};

/**
 * Where each styling part lands (family:input-fields FR10). The dashed outline
 * is `controlStyle` on the visual control box. The blue tint is
 * `containerStyle` on the Field box; in a `horizontal-labels` FormLayout and
 * inside InputGroup no Field box renders, so there it has no effect (and warns
 * in development).
 */
export const StylingParts: Story = {
  render: () => (
    <div style={{display: 'grid', gap: 24, maxWidth: 360}}>
      <div style={{display: 'grid', gap: 12}}>
        <Text type="label">controlStyle</Text>
        <div data-parts-row="control-popover" style={{display: 'grid', gap: 4}}>
          <Text type="supporting">presentation="popover"</Text>
          <DateInput
            label="Due date"
            presentation="popover"
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div data-parts-row="control-native" style={{display: 'grid', gap: 4}}>
          <Text type="supporting">presentation="native"</Text>
          <DateInput
            label="Due date"
            presentation="native"
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div
          data-parts-row="control-bottom-sheet"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">presentation="bottom-sheet"</Text>
          <DateInput
            label="Due date"
            presentation="bottom-sheet"
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div
          data-parts-row="control-form-layout"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">horizontal-labels FormLayout</Text>
          <FormLayout direction="horizontal-labels">
            <DateInput label="Due date" controlStyle={CONTROL_STYLE} />
          </FormLayout>
        </div>
        <div
          data-parts-row="control-input-group"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">InputGroup</Text>
          <InputGroup label="Due date group">
            <InputGroupText>At</InputGroupText>
            <DateInput
              label="Due date"
              isLabelHidden
              controlStyle={CONTROL_STYLE}
            />
          </InputGroup>
        </div>
      </div>
      <div style={{display: 'grid', gap: 12}}>
        <Text type="label">containerStyle and controlStyle</Text>
        <div
          data-parts-row="container-popover"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">presentation="popover"</Text>
          <DateInput
            label="Due date"
            presentation="popover"
            containerStyle={CONTAINER_STYLE}
            controlStyle={CONTROL_STYLE}
          />
        </div>
        <div
          data-parts-row="container-form-layout"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">horizontal-labels FormLayout</Text>
          <FormLayout direction="horizontal-labels">
            <DateInput
              label="Due date"
              containerStyle={CONTAINER_STYLE}
              controlStyle={CONTROL_STYLE}
            />
          </FormLayout>
        </div>
        <div
          data-parts-row="container-input-group"
          style={{display: 'grid', gap: 4}}>
          <Text type="supporting">InputGroup</Text>
          <InputGroup label="Due date group">
            <InputGroupText>At</InputGroupText>
            <DateInput
              label="Due date"
              isLabelHidden
              containerStyle={CONTAINER_STYLE}
              controlStyle={CONTROL_STYLE}
            />
          </InputGroup>
        </div>
      </div>
    </div>
  ),
};

/**
 * The bottom sheet with two centuries of years: the year wheel has 200 rows.
 * Under a finger, opening the month and year wheels costs about the same as
 * for two years: each year is drawn once, as a flat row.
 */
export const BottomSheetWideRange: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(
      '2026-03-15' as ISODateString,
    );
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Date of birth',
    presentation: 'bottom-sheet',
    min: '1900-01-01' as ISODateString,
    max: '2099-12-31' as ISODateString,
  },
};

/** The same sheet with two years: the year wheel has 2 rows. */
export const BottomSheetNarrowRange: Story = {
  render: args => {
    const [value, setValue] = useState<ISODateString | undefined>(
      '2026-03-15' as ISODateString,
    );
    return <DateInput {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Date of birth',
    presentation: 'bottom-sheet',
    min: '2026-01-01' as ISODateString,
    max: '2027-12-31' as ISODateString,
  },
};
