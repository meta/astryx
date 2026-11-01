// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {InfoTip} from '@astryxdesign/core/InfoTip';
import {HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

const meta: Meta<typeof InfoTip> = {
  title: 'Core/InfoTip',
  component: InfoTip,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['xsm', 'sm', 'md', 'lg'],
      description: 'Size of the info icon',
    },
  },
};

export default meta;
type Story = StoryObj<typeof InfoTip>;

export const Default: Story = {
  args: {
    content: 'Editors can change this field; viewers cannot.',
  },
};

export const NextToALabel: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <HStack gap={1} align="center">
        <Text>Rolling average</Text>
        <InfoTip
          content="30-day rolling average, recomputed nightly."
          label="About this metric"
        />
      </HStack>
    </div>
  ),
};

/**
 * Revealing the help is the button's only purpose, so `InfoTip` sets
 * `pressTrigger="toggle"`: tap the icon on a phone (or with touch emulation
 * on), click it, or press Enter or Space and the help pins open; tap outside
 * and it dismisses.
 */
export const Touch: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <HStack gap={1} align="center">
        <Text>Rolling average</Text>
        <InfoTip
          content="30-day rolling average, recomputed nightly."
          label="About this metric"
        />
      </HStack>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <HStack gap={4} align="center">
        <InfoTip content="Extra small" size="xsm" />
        <InfoTip content="Small (default)" size="sm" />
        <InfoTip content="Medium" size="md" />
        <InfoTip content="Large" size="lg" />
      </HStack>
    </div>
  ),
};
