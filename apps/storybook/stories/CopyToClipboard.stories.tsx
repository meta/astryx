// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {CopyToClipboard} from '@astryxdesign/core/CopyToClipboard';

const meta: Meta<typeof CopyToClipboard> = {
  title: 'Core/CopyToClipboard',
  component: CopyToClipboard,
  tags: ['autodocs'],
  argTypes: {
    text: {
      control: 'text',
      description: 'Text written to the clipboard on activation',
    },
    label: {
      control: 'text',
      description: 'Accessible label and tooltip override',
    },
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'destructive'],
      description: 'Visual style variant of the underlying button',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size of the underlying button',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
  },
};

export default meta;
type Story = StoryObj<typeof CopyToClipboard>;

export const Default: Story = {
  args: {
    text: 'npm install @astryxdesign/core',
  },
};

export const SpecificLabel: Story = {
  name: 'Specific label',
  args: {
    text: 'AASH-2026-11-17',
    label: 'Copy invitation code',
  },
};

export const Secondary: Story = {
  args: {
    text: 'https://astryx.design/docs',
    variant: 'secondary',
  },
};

export const Small: Story = {
  args: {
    text: 'hello@astryx.design',
    size: 'sm',
    label: 'Copy email address',
  },
};

export const Disabled: Story = {
  args: {
    text: 'Hello World',
    isDisabled: true,
  },
};
