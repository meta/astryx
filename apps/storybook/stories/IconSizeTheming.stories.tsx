// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {Icon} from '@astryxdesign/core/Icon';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Selector} from '@astryxdesign/core/Selector';
import {DateInput, type DateInputProps} from '@astryxdesign/core/DateInput';
import {TimeInput, type ISOTimeString} from '@astryxdesign/core/TimeInput';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';
import {BellIcon} from '@heroicons/react/24/outline';

// =============================================================================
// Themes
// =============================================================================

const SIZES = ['xsm', 'sm', 'md', 'lg'] as const;

const FRUITS: string[] = ['Apple', 'Banana', 'Orange'];

/**
 * Icon's own scale is 12/16/20/24px. A theme re-points the whole scale by
 * setting `width` and `height` on each `size:*` key of the `icon` target. A
 * registry icon (`icon="search"`) sizes its 1em artwork from that dimension
 * itself, so no `fontSize` is needed.
 */
function iconScale(
  xsm: string,
  sm: string,
  md: string,
  lg: string,
): Record<string, Record<string, string>> {
  return Object.fromEntries(
    ([xsm, sm, md, lg] as const).map((value, i) => [
      `size:${SIZES[i]}`,
      {width: value, height: value},
    ]),
  );
}

const compactIcons = defineTheme({
  name: 'compact-icons',
  extends: neutralTheme,
  components: {
    icon: iconScale('0.625rem', '0.75rem', '0.875rem', '1rem'),
  },
});

const spaciousIcons = defineTheme({
  name: 'spacious-icons',
  extends: neutralTheme,
  components: {
    icon: iconScale('1rem', '1.375rem', '1.75rem', '2.25rem'),
  },
});

const VARIANTS = [
  {label: 'Default', theme: neutralTheme, scale: '12 / 16 / 20 / 24'},
  {label: 'Compact', theme: compactIcons, scale: '10 / 12 / 14 / 16'},
  {label: 'Spacious', theme: spaciousIcons, scale: '16 / 22 / 28 / 36'},
] as const;

// =============================================================================
// Panels
// =============================================================================

function Panel({
  label,
  scale,
  children,
}: {
  label: string;
  scale: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <VStack gap={3}>
        <VStack gap={1}>
          <Heading level={5}>{label}</Heading>
          <Text size="sm" color="secondary">
            {scale}px
          </Text>
        </VStack>
        {children}
      </VStack>
    </Card>
  );
}

function SizeRow() {
  return (
    <VStack gap={3}>
      <HStack gap={4} vAlign="center">
        {SIZES.map(size => (
          <VStack key={size} gap={1} hAlign="center">
            <Icon icon="search" size={size} color="primary" />
            <Text size="xsm" color="secondary">
              {size}
            </Text>
          </VStack>
        ))}
      </HStack>
      <HStack gap={4} vAlign="center">
        {SIZES.map(size => (
          <VStack key={size} gap={1} hAlign="center">
            <Icon icon={BellIcon} size={size} color="primary" />
            <Text size="xsm" color="secondary">
              {size}
            </Text>
          </VStack>
        ))}
      </HStack>
    </VStack>
  );
}

function InputsWithBuiltInIcons() {
  const [text, setText] = useState('');
  const [fruit, setFruit] = useState('');
  const [date, setDate] = useState<DateInputProps['value']>();
  const [time, setTime] = useState<ISOTimeString | undefined>();

  return (
    <VStack gap={3}>
      <TextInput
        label="Search"
        placeholder="Search…"
        startIcon="search"
        value={text}
        onChange={setText}
      />
      <Selector
        label="Fruit"
        placeholder="Select a fruit…"
        options={FRUITS}
        value={fruit}
        onChange={setFruit}
      />
      <DateInput
        label="Date"
        placeholder="Select a date"
        value={date}
        onChange={setDate}
      />
      <TimeInput
        label="Time"
        placeholder="Select a time"
        value={time}
        onChange={setTime}
      />
    </VStack>
  );
}

function Columns({render}: {render: () => React.ReactNode}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 16,
        alignItems: 'start',
      }}>
      {VARIANTS.map(({label, theme, scale}) => (
        <Theme key={label} theme={theme} mode="light">
          <Panel label={label} scale={scale}>
            {render()}
          </Panel>
        </Theme>
      ))}
    </div>
  );
}

// =============================================================================
// Stories
// =============================================================================

const meta: Meta = {
  title: 'Core/Icon/Size Theming',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Icon size is a themeable property. A theme re-points the whole ' +
          '`xsm`/`sm`/`md`/`lg` scale by targeting the `icon` component with ' +
          '`size:*` keys — no component or call-site changes.\n\n' +
          '```ts\n' +
          'defineTheme({\n' +
          "  name: 'spacious-icons',\n" +
          '  components: {\n' +
          '    icon: {\n' +
          "      'size:sm': {width: '1.375rem', height: '1.375rem'},\n" +
          "      'size:md': {width: '1.75rem', height: '1.75rem'},\n" +
          '    },\n' +
          '  },\n' +
          '});\n' +
          '```\n\n' +
          'Width and height size both registry icons (`icon="search"`), whose ' +
          '1em artwork follows the dimension, and component-mode icons ' +
          '(`icon={BellIcon}`). Give them in `px` or `rem`: a registry icon ' +
          'takes its font size from the dimension, so an `em` value would ' +
          'also grow its box.',
      },
    },
  },
};

export default meta;

/**
 * The four sizes under three themes. Top row is a registry icon
 * (`icon="search"`), bottom row an SVG component (`icon={BellIcon}`) — both
 * follow the theme.
 */
export const SizeScale: StoryObj = {
  render: () => <Columns render={() => <SizeRow />} />,
};

/**
 * The same themes reaching icons a consumer never renders directly: the
 * TextInput start icon, the Selector chevron, the DateInput calendar toggle
 * and the TimeInput clock. Each is an internal `<Icon size="sm">`, so the
 * theme's `size:sm` rule retunes all of them at once.
 */
export const BuiltInComponentIcons: StoryObj = {
  render: () => <Columns render={() => <InputsWithBuiltInIcons />} />,
};
