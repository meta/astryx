// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
} from '@astryxdesign/core/Chat';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Text} from '@astryxdesign/core/Text';

const meta: Meta<typeof ChatMessage> = {
  title: 'Core/ChatMessage',
  component: ChatMessage,
  tags: ['autodocs', 'visual-theme-matrix'],
  parameters: {
    layout: 'centered',
  },
};
export default meta;

type Story = StoryObj<typeof meta>;

function RendersNothing() {
  return null;
}

export const Default: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        width: 'min(720px, 90vw)',
      }}>
      <section
        aria-label="Sender roles"
        style={{display: 'flex', flexDirection: 'column', gap: 20}}>
        <ChatMessage
          sender="assistant"
          avatar={<Avatar name="Astra" size="md" />}
          name="Astra"
          metadata={
            <Text type="supporting" color="secondary">
              Updated just now
            </Text>
          }>
          <Text type="body">
            Here is the summary you asked for, with the sender identity and
            message metadata attached to the message wrapper.
          </Text>
        </ChatMessage>

        <ChatMessage sender="user">
          <ChatMessageBubble>
            Thanks. Keep the follow-up concise and include the next action.
          </ChatMessageBubble>
        </ChatMessage>

        <ChatMessage
          sender="system"
          avatar={<Avatar name="System" size="md" />}
          name="System"
          metadata={<span>Suppressed metadata</span>}>
          <Text type="supporting" color="secondary">
            Conversation archived
          </Text>
        </ChatMessage>
      </section>

      <section aria-label="Density precedence">
        <ChatMessageList
          density="compact"
          style={{
            border: '1px solid var(--color-border-primary)',
            borderRadius: 'var(--radius-container)',
          }}>
          <ChatMessage
            sender="assistant"
            avatar={<Avatar name="Astra" size="sm" />}>
            <ChatMessageBubble>Inherited compact density</ChatMessageBubble>
            <ChatMessageBubble>Second grouped response</ChatMessageBubble>
          </ChatMessage>
          <ChatMessage sender="user" density="spacious">
            <ChatMessageBubble>
              Explicit spacious density overrides the compact list.
            </ChatMessageBubble>
          </ChatMessage>
        </ChatMessageList>
      </section>

      <section
        aria-label="Slots that render nothing"
        style={{display: 'flex', flexDirection: 'column', gap: 20}}>
        <ChatMessage
          sender="assistant"
          avatar={<RendersNothing />}
          name={<></>}
          metadata={[]}>
          <ChatMessageBubble>
            Empty avatar, name, and metadata slots collapse; the message keeps
            its fallback label.
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="user" avatar={false} name="" metadata={false}>
          <ChatMessageBubble>
            Booleans and empty strings render no slot.
          </ChatMessageBubble>
        </ChatMessage>
      </section>

      <section
        aria-label="Narrow long content"
        style={{width: 320, maxWidth: '100%'}}>
        <ChatMessage sender="assistant" name="Astra">
          <ChatMessageBubble>
            Long messages wrap inside a narrow conversation without changing the
            sender alignment or forcing the message beyond its container. This
            sentence intentionally expands the content across several lines.
          </ChatMessageBubble>
        </ChatMessage>
      </section>
    </div>
  ),
};
