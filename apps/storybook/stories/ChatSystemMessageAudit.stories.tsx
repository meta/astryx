// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatSystemMessageAudit.stories.tsx
 * @input ChatSystemMessage in its distinct public visual and semantic partitions
 * @output Checked-in single-subject fixtures for exact-head component audit evidence
 * @position Browser evidence fixtures outside the shared Chat story inventory
 */

import type {Meta, StoryObj} from '@storybook/react';
import {ChatMessageList, ChatSystemMessage} from '@astryxdesign/core/Chat';
import {Icon} from '@astryxdesign/core/Icon';

const LONG_SYSTEM_MESSAGE =
  'Messages are end-to-end encrypted for everyone in this conversation and on every signed-in device.';

const meta = {
  title: 'a11y/ChatSystemMessage audit',
  component: ChatSystemMessage,
  args: {children: 'Conversation started'},
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'Single-subject fixtures for exact-head ChatSystemMessage audit evidence. The dedicated namespace is excluded from stable visual baselines and explicitly routed to the component accessibility owner.',
      },
    },
  },
} satisfies Meta<typeof ChatSystemMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: () => (
    <div style={{display: 'grid', gap: 24, width: 480, maxWidth: '100%'}}>
      <ChatSystemMessage data-system-message-case="default">
        Conversation started
      </ChatSystemMessage>
      <ChatSystemMessage
        data-system-message-case="default-icon"
        icon={<Icon icon="info" size="sm" />}>
        Messages are end-to-end encrypted
      </ChatSystemMessage>
      <ChatSystemMessage data-system-message-case="divider" variant="divider">
        Today
      </ChatSystemMessage>
      <ChatSystemMessage
        data-system-message-case="divider-icon"
        icon={<Icon icon="info" size="sm" />}
        variant="divider">
        March 15, 2026
      </ChatSystemMessage>
      <ChatMessageList align="top">
        <ChatSystemMessage data-system-message-case="nested-log">
          Conversation archived
        </ChatSystemMessage>
      </ChatMessageList>
    </div>
  ),
};

export const Narrow: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gap: 24,
        gridTemplateColumns: 'minmax(0, 1fr)',
        width: 280,
        maxWidth: '100%',
      }}>
      <ChatSystemMessage
        data-system-message-case="narrow-default"
        icon={<Icon icon="info" size="sm" />}>
        Conversation marked as resolved
      </ChatSystemMessage>
      <ChatSystemMessage
        data-system-message-case="narrow-divider"
        variant="divider">
        March 15, 2026
      </ChatSystemMessage>
      <ChatSystemMessage
        data-system-message-case="long-default"
        icon={<Icon icon="info" size="sm" />}>
        {LONG_SYSTEM_MESSAGE}
      </ChatSystemMessage>
    </div>
  ),
};
