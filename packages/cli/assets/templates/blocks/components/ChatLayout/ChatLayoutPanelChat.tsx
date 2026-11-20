// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  ChatLayout,
  ChatMessageList,
  ChatMessage,
  ChatMessageBubble,
  ChatSystemMessage,
  ChatComposer,
} from '@astryxdesign/core/Chat';
import {Markdown} from '@astryxdesign/core/Markdown';
import type {CSSProperties} from 'react';

const panel: CSSProperties = {
  width: 450,
  maxWidth: '100%',
  height: 600,
  borderRadius: 8,
  overflow: 'hidden',
  border: '1px solid var(--color-border)',
};

export default function ChatLayoutPanelChat() {
  return (
    <div style={panel}>
      <ChatLayout
        composer={
          <ChatComposer onSubmit={() => {}} placeholder="Ask something..." />
        }>
        <ChatMessageList>
          <ChatSystemMessage variant="divider">Today</ChatSystemMessage>

          <ChatMessage sender="user">
            <ChatMessageBubble>
              Can you review the Button component and fix the focus ring?
            </ChatMessageBubble>
          </ChatMessage>

          <ChatMessage sender="assistant">
            <Markdown density="compact">{`I'll check the Button component now.

Found the issue — the border radius was hardcoded. Replaced with the theme token.`}</Markdown>
          </ChatMessage>

          <ChatMessage sender="user">
            <ChatMessageBubble>
              Nice, can you also check the Card component?
            </ChatMessageBubble>
          </ChatMessage>

          <ChatMessage sender="assistant">
            <Markdown density="compact">{`Checking the component now.

Found the issue — the border radius was hardcoded. Replaced with the theme token.`}</Markdown>
          </ChatMessage>
        </ChatMessageList>
      </ChatLayout>
    </div>
  );
}
