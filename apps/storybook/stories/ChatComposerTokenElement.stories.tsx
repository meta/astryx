// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {ChatComposerTokenElement} from '@astryxdesign/core/Chat';

const meta = {
  title: 'Core/ChatComposerTokenElement',
  component: ChatComposerTokenElement,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ChatComposerTokenElement>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BadgeToken: Story = {
  args: {
    token: {
      value: '@ada',
      label: 'Ada',
      variant: 'blue',
    },
  },
};

export const CustomToken: Story = {
  args: {
    token: {
      value: '#design',
      render: () => <strong>Design</strong>,
    },
  },
};
