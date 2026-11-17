// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  ChatLayout,
  ChatMessageList,
  ChatMessage,
  ChatMessageBubble,
  ChatComposer,
  ChatTokenizedText,
} from '@astryxdesign/core/Chat';
import {VStack} from '@astryxdesign/core/Stack';

const TOKENS = [{value: '/review', label: '/review', variant: 'blue' as const}];

export default function ChatLayoutShowcase() {
  return (
    <VStack width={450} maxWidth="100%">
      <ChatLayout
        composer={
          <ChatComposer onSubmit={() => {}} placeholder="Ask something..." />
        }>
        <ChatMessageList>
          <ChatMessage sender="user">
            <ChatMessageBubble>
              <ChatTokenizedText tokens={TOKENS}>
                /review the changes in this file
              </ChatTokenizedText>
            </ChatMessageBubble>
          </ChatMessage>
          <ChatMessage sender="assistant">
            <ChatMessageBubble variant="ghost">
              Reading the file now...
            </ChatMessageBubble>
          </ChatMessage>
        </ChatMessageList>
      </ChatLayout>
    </VStack>
  );
}
