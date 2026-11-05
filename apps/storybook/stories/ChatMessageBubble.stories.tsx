// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {CSSProperties, ReactNode} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  ChatMessage,
  ChatMessageBubble,
  ChatMessageMetadata,
} from '@astryxdesign/core/Chat';

const meta: Meta<typeof ChatMessageBubble> = {
  title: 'Core/ChatMessageBubble',
  component: ChatMessageBubble,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ChatMessageBubble>;

const fixtureStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  maxWidth: 720,
};

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  border: '1px solid var(--color-border-primary)',
  borderRadius: 8,
};

const labelStyle: CSSProperties = {
  color: 'var(--color-text-secondary)',
  fontSize: 12,
  fontWeight: 600,
};

function Panel({state, children}: {state: string; children: ReactNode}) {
  return (
    <section data-bubble-audit-state={state} style={panelStyle}>
      <div style={labelStyle}>{state}</div>
      {children}
    </section>
  );
}

export const States: Story = {
  render: () => (
    <div data-chat-message-bubble-audit style={fixtureStyle}>
      <Panel state="sender-alignment">
        <ChatMessage sender="assistant">
          <ChatMessageBubble name="Navi">Assistant message</ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="user">
          <ChatMessageBubble name="You">User message</ChatMessageBubble>
        </ChatMessage>
      </Panel>

      <Panel state="filled-and-ghost">
        <ChatMessage sender="assistant">
          <ChatMessageBubble>Filled assistant bubble</ChatMessageBubble>
          <ChatMessageBubble variant="ghost" width="100%">
            Ghost assistant content spans the message column
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="user">
          <ChatMessageBubble>Filled user bubble</ChatMessageBubble>
          <ChatMessageBubble variant="ghost">
            Ghost user content
          </ChatMessageBubble>
        </ChatMessage>
      </Panel>

      <Panel state="assistant-group">
        <ChatMessage sender="assistant">
          <ChatMessageBubble
            data-testid="assistant-group-first"
            group="first"
            name="Navi">
            First assistant bubble
          </ChatMessageBubble>
          <ChatMessageBubble
            data-testid="assistant-group-middle"
            group="middle">
            Middle assistant bubble
          </ChatMessageBubble>
          <ChatMessageBubble
            data-testid="assistant-group-last"
            group="last"
            metadata={<ChatMessageMetadata timestamp="10:32 AM" />}>
            Last assistant bubble
          </ChatMessageBubble>
        </ChatMessage>
      </Panel>

      <Panel state="user-group">
        <ChatMessage sender="user">
          <ChatMessageBubble
            data-testid="user-group-first"
            group="first"
            name="You">
            First user bubble
          </ChatMessageBubble>
          <ChatMessageBubble data-testid="user-group-middle" group="middle">
            Middle user bubble
          </ChatMessageBubble>
          <ChatMessageBubble
            data-testid="user-group-last"
            group="last"
            metadata={
              <ChatMessageMetadata timestamp="10:33 AM" status="read" />
            }>
            Last user bubble
          </ChatMessageBubble>
        </ChatMessage>
      </Panel>

      <Panel state="density">
        {(['compact', 'balanced', 'spacious'] as const).map(density => (
          <ChatMessage key={density} sender="assistant" density={density}>
            <ChatMessageBubble>{density} density</ChatMessageBubble>
          </ChatMessage>
        ))}
      </Panel>

      <Panel state="numeric-slots">
        <ChatMessage sender="assistant">
          <ChatMessageBubble
            data-testid="numeric-slot-bubble"
            name={0}
            metadata={0}>
            Zero is valid React content
          </ChatMessageBubble>
        </ChatMessage>
      </Panel>

      <Panel state="empty-content">
        <ChatMessage sender="assistant">
          <ChatMessageBubble>{null}</ChatMessageBubble>
        </ChatMessage>
      </Panel>
    </div>
  ),
};

export const NarrowLongContent: Story = {
  render: () => (
    <div
      data-chat-message-bubble-narrow
      style={{...fixtureStyle, width: 320, maxWidth: '100%'}}>
      <Panel state="narrow-long-content">
        <ChatMessage sender="assistant">
          <ChatMessageBubble name="Navi">
            A long message wraps without forcing horizontal scrolling, including
            the unbroken value
            abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz0123456789.
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="user">
          <ChatMessageBubble width="100%">
            A full-width bubble remains inside its narrow parent.
          </ChatMessageBubble>
        </ChatMessage>
      </Panel>
    </div>
  ),
};
