// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatSystemMessage.stories.tsx
 * @input ChatSystemMessage default and divider variants
 * @output Canonical Storybook fixture for component and RTL discovery
 * @position Public ChatSystemMessage story outside the audit-only namespace
 */

import type {Meta, StoryObj} from '@storybook/react';
import {ChatSystemMessage} from '@astryxdesign/core/Chat';

const meta = {
  title: 'Core/ChatSystemMessage',
  component: ChatSystemMessage,
  tags: ['no-visual'],
  args: {
    children: 'Conversation started',
  },
} satisfies Meta<typeof ChatSystemMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <div style={{display: 'grid', gap: 16, width: 320}}>
      <ChatSystemMessage icon={<span aria-hidden="true">●</span>}>
        Conversation started
      </ChatSystemMessage>
      <ChatSystemMessage variant="divider">Today</ChatSystemMessage>
    </div>
  ),
};
