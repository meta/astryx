// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {CircleCheckIndicator} from '@astryxdesign/lab/CircleCheckIndicator';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Theme, defineTheme} from '@astryxdesign/core/theme';

const meta: Meta<typeof CircleCheckIndicator> = {
  title: 'Lab/CircleCheckIndicator',
  component: CircleCheckIndicator,
  tags: ['autodocs'],
  argTypes: {
    state: {
      control: 'inline-radio',
      options: ['unchecked', 'checked', 'indeterminate'],
    },
    size: {control: 'inline-radio', options: ['sm', 'md']},
    isDisabled: {control: 'boolean'},
  },
  args: {state: 'checked', size: 'md', isDisabled: false},
  parameters: {
    docs: {
      description: {
        component:
          'The iOS multiple-selection circle. Decorative: map it to `checkbox` in a theme so CheckboxInput and CheckboxList draw it and keep their semantics.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof CircleCheckIndicator>;

export const Default: Story = {};

export const States: Story = {
  render: () => (
    <VStack gap={3}>
      {(['md', 'sm'] as const).map(size => (
        <HStack key={size} gap={4} vAlign="center">
          <Text type="supporting" color="secondary">
            {size}
          </Text>
          <CircleCheckIndicator state="unchecked" size={size} />
          <CircleCheckIndicator state="checked" size={size} />
          <CircleCheckIndicator state="indeterminate" size={size} />
          <CircleCheckIndicator state="unchecked" size={size} isDisabled />
          <CircleCheckIndicator state="checked" size={size} isDisabled />
        </HStack>
      ))}
    </VStack>
  ),
};

const circleTheme = defineTheme({
  name: 'circle-check-indicator-demo',
  indicators: {checkbox: CircleCheckIndicator},
});

/**
 * A theme maps the circle to `checkbox`: the list keeps its group, its
 * checkboxes, its focus ring and its press, and draws circles.
 */
export const MappedCheckboxList: Story = {
  render: function MappedCheckboxListStory(_args, context) {
    const [value, setValue] = useState<string[]>(['beach']);
    return (
      <Theme
        theme={circleTheme}
        mode={context.globals.colorMode === 'dark' ? 'dark' : 'light'}>
        <CheckboxList label="Photos to share" value={value} onChange={setValue}>
          <CheckboxListItem label="Beach" value="beach" />
          <CheckboxListItem label="Mountains" value="mountains" />
          <CheckboxListItem label="City at night" value="city" />
          <CheckboxListItem label="Forest trail" value="forest" />
        </CheckboxList>
      </Theme>
    );
  },
};

export const MappedCheckboxInput: Story = {
  render: function MappedCheckboxInputStory(_args, context) {
    const [value, setValue] = useState(false);
    return (
      <Theme
        theme={circleTheme}
        mode={context.globals.colorMode === 'dark' ? 'dark' : 'light'}>
        <VStack gap={3}>
          <CheckboxInput
            label="Include location"
            value={value}
            onChange={setValue}
          />
          <CheckboxInput label="Partly selected" value="indeterminate" />
          <CheckboxInput label="Disabled" value={true} isDisabled />
        </VStack>
      </Theme>
    );
  },
};
