// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatMessageMetadata.stories.tsx
 * @input ChatMessageMetadata in message context with status and caller-owned slots
 * @output Reusable status, empty-slot, composition, and overflow browser fixtures
 * @position Component-owned Storybook evidence for ChatMessageMetadata
 */

import type {Meta, StoryObj} from '@storybook/react';
import {
  ChatMessage,
  ChatMessageBubble,
  ChatMessageMetadata,
} from '@astryxdesign/core/Chat';
import {Button} from '@astryxdesign/core/Button';

const meta = {
  title: 'Core/ChatMessageMetadata',
  component: ChatMessageMetadata,
  tags: ['autodocs'],
} satisfies Meta<typeof ChatMessageMetadata>;
export default meta;
type Story = StoryObj<typeof meta>;

// Every case is a reusable composition, not a story per scalar or screenshot.
export const States: Story = {
  render: () => (
    <div style={{display: 'grid', gap: 16, maxWidth: 640}}>
      {(['sending', 'sent', 'delivered', 'read', 'error'] as const).map(
        status => (
          <section key={status} data-metadata-case={`status-${status}`}>
            <ChatMessage sender="user">
              <ChatMessageBubble
                metadata={
                  <ChatMessageMetadata timestamp="10:30" status={status} />
                }>
                {status} message
              </ChatMessageBubble>
            </ChatMessage>
          </section>
        ),
      )}
      <section data-metadata-case="assistant-footer">
        <ChatMessage sender="assistant">
          <ChatMessageBubble>Reply</ChatMessageBubble>
          <ChatMessageMetadata
            timestamp="10:31"
            footer={<Button label="Copy reply" onClick={() => {}} size="sm" />}
          />
        </ChatMessage>
      </section>
      <section data-metadata-case="empty-footer">
        <ChatMessage sender="assistant">
          <ChatMessageMetadata timestamp="10:32" footer={false} />
        </ChatMessage>
      </section>
      <section data-metadata-case="empty-timestamp">
        <ChatMessage sender="assistant">
          <ChatMessageMetadata timestamp={false} footer="Model info" />
        </ChatMessage>
      </section>
      <section data-metadata-case="empty-row" style={{minHeight: 24}}>
        <ChatMessage sender="assistant">
          <ChatMessageMetadata timestamp="" footer={false} />
        </ChatMessage>
      </section>
      <section data-metadata-case="numeric-slots">
        <ChatMessage sender="user">
          <ChatMessageMetadata timestamp={0} footer={0} />
        </ChatMessage>
      </section>
      <section data-metadata-case="standalone">
        <ChatMessageMetadata timestamp="11:00" status="read" />
      </section>
    </div>
  ),
};

export const NarrowOverflow: Story = {
  render: () => (
    <div
      data-metadata-case="narrow-overflow"
      style={{width: 320, maxWidth: '100%'}}>
      <ChatMessage sender="assistant">
        <ChatMessageMetadata
          timestamp="10:32"
          footer="A longer metadata description that can grow when translated into a different language"
          status="delivered"
        />
      </ChatMessage>
    </div>
  ),
};
