// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {CSSProperties} from 'react';
import {
  ChatComposer,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  useChatMessageListVirtualization,
} from '@astryxdesign/core/Chat';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
}

const messages: Message[] = Array.from({length: 2000}, (_, index) => ({
  id: `message-${index}`,
  sender: index % 2 === 0 ? 'user' : 'assistant',
  text:
    index % 2 === 0
      ? `Question ${index / 2 + 1}: what changed in this build?`
      : `Answer ${(index + 1) / 2}: the release notes list three fixes and one new option. Each fix names the component it changes.`,
}));

const panel: CSSProperties = {height: 560, display: 'flex'};

const renderMessage = (message: Message) => (
  <ChatMessage sender={message.sender}>
    <ChatMessageBubble>{message.text}</ChatMessageBubble>
  </ChatMessage>
);

export default function UseChatMessageListVirtualizationHookUsage() {
  // Only the rows near the scrollport mount, and the list opens at the
  // newest message. Spacers stand for the other messages at their estimates
  // until those rows have rendered.
  const virtualization = useChatMessageListVirtualization();
  return (
    <div style={panel}>
      <ChatLayout composer={<ChatComposer onSubmit={() => {}} />}>
        <ChatMessageList
          items={messages}
          getItemKey={message => message.id}
          renderItem={renderMessage}
          estimateItemSize={message => (message.sender === 'user' ? 64 : 112)}
          virtualization={virtualization}
        />
      </ChatLayout>
    </div>
  );
}
