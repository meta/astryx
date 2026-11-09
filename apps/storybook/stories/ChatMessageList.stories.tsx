// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatMessageList.stories.tsx
 * @input ChatMessageList and the existing Chat message primitives
 * @output Reusable transcript, empty, density/alignment, overflow, and loading fixtures
 * @position Component-owned Storybook evidence for ChatMessageList
 */

import type {Meta, StoryObj} from '@storybook/react';
import {
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatSystemMessage,
} from '@astryxdesign/core/Chat';
import {Text} from '@astryxdesign/core/Text';

const meta = {
  title: 'Core/ChatMessageList',
  component: ChatMessageList,
  tags: ['autodocs'],
  args: {children: null},
} satisfies Meta<typeof ChatMessageList>;

export default meta;
type Story = StoryObj<typeof meta>;

const pendingOlderMessages = () =>
  new Promise<void>(() => {
    // Hold the documented pending state for repeatable browser evidence.
  });

export const Conversation: Story = {
  args: {density: 'balanced', align: 'bottom', isStreaming: false},
  render: args => (
    <div style={{height: 440, display: 'flex', flexDirection: 'column'}}>
      <ChatMessageList {...args}>
        <ChatSystemMessage variant="divider">Today</ChatSystemMessage>
        <ChatMessage sender="user">
          <ChatMessageBubble>Could you summarize the update?</ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="assistant">
          <ChatMessageBubble>
            The issue is resolved. The next update will include the remaining
            details.
          </ChatMessageBubble>
        </ChatMessage>
      </ChatMessageList>
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <div style={{display: 'flex', flexWrap: 'wrap', gap: 16}}>
      <div
        style={{
          width: 280,
          height: 320,
          display: 'flex',
          flexDirection: 'column',
        }}>
        <ChatMessageList
          aria-label="Text empty state"
          emptyState={<Text>No messages yet</Text>}>
          {[]}
        </ChatMessageList>
      </div>
      <div
        style={{
          width: 280,
          height: 320,
          display: 'flex',
          flexDirection: 'column',
        }}>
        <ChatMessageList aria-label="Numeric empty state" emptyState={0}>
          {[]}
        </ChatMessageList>
      </div>
    </div>
  ),
};

export const DensityAndAlignment: Story = {
  render: () => (
    <div style={{display: 'flex', flexWrap: 'wrap', gap: 16}}>
      {(['compact', 'balanced', 'spacious'] as const).map((density, index) => (
        <div
          key={density}
          style={{
            width: 280,
            height: 320,
            display: 'flex',
            flexDirection: 'column',
          }}>
          <Text type="supporting">
            {density} / {index === 0 ? 'top' : 'bottom'}
          </Text>
          <ChatMessageList
            density={density}
            align={index === 0 ? 'top' : 'bottom'}>
            <ChatMessage sender="assistant">
              <ChatMessageBubble>A short conversation.</ChatMessageBubble>
            </ChatMessage>
          </ChatMessageList>
        </div>
      ))}
    </div>
  ),
};

export const Overflow: Story = {
  render: () => (
    <div style={{height: 220, overflowY: 'auto'}}>
      <ChatMessageList align="top">
        {Array.from({length: 8}, (_, index) => (
          <ChatMessage
            key={index}
            sender={index % 2 === 0 ? 'user' : 'assistant'}>
            <ChatMessageBubble>
              Conversation item {index + 1}. This message wraps on narrower
              screens while the surrounding transcript remains scrollable.
            </ChatMessageBubble>
          </ChatMessage>
        ))}
      </ChatMessageList>
    </div>
  ),
};

export const LoadingOlder: Story = {
  render: () => (
    <div style={{height: 320, display: 'flex', flexDirection: 'column'}}>
      <ChatMessageList align="top" scrollToTopAction={pendingOlderMessages}>
        <ChatMessage sender="assistant">
          <ChatMessageBubble>
            Earlier message remains readable while older messages load.
          </ChatMessageBubble>
        </ChatMessage>
      </ChatMessageList>
    </div>
  ),
};
