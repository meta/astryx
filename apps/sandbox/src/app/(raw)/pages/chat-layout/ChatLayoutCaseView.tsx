// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatLayoutCaseView.tsx
 * @input One of the Chat Layout page's cases (cases.ts).
 * @output That case's ChatLayout: a transcript, a composer that adds each sent
 *   message and, in the streaming case, replies that stream in.
 * @position Rendered by the Chat Layout page.
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {AtSymbolIcon, PaperClipIcon} from '@heroicons/react/24/outline';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {
  ChatComposer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatSystemMessage,
} from '@astryxdesign/core/Chat';
import {Icon} from '@astryxdesign/core/Icon';
import {Markdown} from '@astryxdesign/core/Markdown';
import {VStack} from '@astryxdesign/core/Stack';
import {CHAT_LAYOUT_CASE_INFO, type ChatLayoutCase} from './cases';

interface Message {
  id: number;
  sender: 'user' | 'assistant';
  text: string;
}

const CONVERSATION: Array<Omit<Message, 'id'>> = [
  {
    sender: 'user',
    text: 'Can you help me plan a weekend trip to the coast?',
  },
  {
    sender: 'assistant',
    text: 'Sure. A two-day trip works well: arrive on Saturday morning, walk the cliffs in the afternoon, and keep Sunday for the harbor and the market.',
  },
  {sender: 'user', text: 'What should I pack for changeable weather?'},
  {
    sender: 'assistant',
    text: 'Pack layers: a light rain jacket, a warm sweater and shoes with good grip. The wind on the cliffs is often stronger than in town.',
  },
  {sender: 'user', text: 'Is there a good place to watch the sunset?'},
  {
    sender: 'assistant',
    text: 'The headland past the lighthouse faces west. Get there about 30 minutes early, because the path is narrow and the light changes fast.',
  },
  {sender: 'user', text: 'And somewhere to eat after that?'},
  {
    sender: 'assistant',
    text: 'The harbor has a few small seafood places. Most close their kitchens at 9, so book a table for the evening if you can.',
  },
  {sender: 'user', text: 'How early does the market open on Sunday?'},
  {
    sender: 'assistant',
    text: 'It opens at 8. The bakery stalls sell out first, so go early and leave the harbor walk for later in the morning.',
  },
  {sender: 'user', text: 'Can I get there by train?'},
  {
    sender: 'assistant',
    text: 'Yes. The coast line runs every hour, and the station is a ten minute walk from the harbor. Trains on Sunday evening fill up, so take an earlier one home.',
  },
];

const REPLY =
  'Here is a plan for Saturday. Take the 8:40 train and leave your bag at the station. Walk the cliff path north to the lighthouse, which takes about two hours with stops. Have lunch at the harbor, then rest before the sunset walk. Book dinner for 8:30 so the kitchen is still open when you get back.';

/** Characters a streamed reply grows by on each step, and the step, in ms. */
const STREAM_STEP = 6;
const STREAM_INTERVAL_MS = 50;

function seedFor(chatCase: ChatLayoutCase): Message[] {
  // The long case repeats the conversation, so the transcript is several
  // screens tall on a phone.
  const turns = chatCase === 'long' ? 3 : 1;
  return Array.from({length: turns}, () => CONVERSATION)
    .flat()
    .map((message, index) => ({...message, id: index + 1}));
}

export function ChatLayoutCaseView({chatCase}: {chatCase: ChatLayoutCase}) {
  const info = CHAT_LAYOUT_CASE_INFO[chatCase];
  // The document scrolls the transcript. Server rendering has no document.
  const documentRef = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : document.documentElement,
  );
  const [messages, setMessages] = useState(() => seedFor(chatCase));
  const [streamingId, setStreamingId] = useState<number | null>(null);
  // Ids for the messages added after the page opens, above every seeded id.
  const nextId = useRef(1000);
  const hasOpeningReply = useRef(false);

  const startReply = useCallback(() => {
    const id = nextId.current++;
    setMessages(previous => [...previous, {id, sender: 'assistant', text: ''}]);
    setStreamingId(id);
  }, []);

  // The streaming case streams one reply as the page opens, and one after
  // each sent message.
  useEffect(() => {
    if (chatCase === 'streaming' && !hasOpeningReply.current) {
      hasOpeningReply.current = true;
      startReply();
    }
  }, [chatCase, startReply]);

  useEffect(() => {
    if (streamingId == null) {
      return undefined;
    }
    const timer = setInterval(() => {
      setMessages(previous =>
        previous.map(message =>
          message.id === streamingId
            ? {
                ...message,
                text: REPLY.slice(0, message.text.length + STREAM_STEP),
              }
            : message,
        ),
      );
    }, STREAM_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [streamingId]);

  const isReplyDone = messages.some(
    message =>
      message.id === streamingId && message.text.length >= REPLY.length,
  );
  useEffect(() => {
    if (isReplyDone) {
      setStreamingId(null);
    }
  }, [isReplyDone]);

  const send = (text: string) => {
    const id = nextId.current++;
    setMessages(previous => [...previous, {id, sender: 'user', text}]);
    if (chatCase === 'streaming') {
      startReply();
    }
  };

  const layout = (
    <ChatLayout
      scrollRef={info.scroll === 'document' ? documentRef : undefined}
      composer={
        <ChatComposer
          onSubmit={send}
          input={<ChatComposerInput placeholder="Message" />}
          headerActions={
            chatCase === 'composer' ? (
              <>
                <Button
                  label="Mention"
                  variant="ghost"
                  size="sm"
                  icon={<Icon icon={AtSymbolIcon} />}
                  isIconOnly
                />
                <Button
                  label="Attach"
                  variant="ghost"
                  size="sm"
                  icon={<Icon icon={PaperClipIcon} />}
                  isIconOnly
                />
              </>
            ) : undefined
          }
        />
      }>
      <ChatMessageList>
        <ChatSystemMessage variant="divider">{info.label}</ChatSystemMessage>
        {messages.map(message =>
          message.sender === 'user' ? (
            <ChatMessage key={message.id} sender="user">
              <ChatMessageBubble>{message.text}</ChatMessageBubble>
            </ChatMessage>
          ) : (
            <ChatMessage key={message.id} sender="assistant">
              <Markdown density="compact">{message.text}</Markdown>
            </ChatMessage>
          ),
        )}
      </ChatMessageList>
    </ChatLayout>
  );

  if (info.scroll === 'document') {
    return layout;
  }
  return (
    <VStack height="100dvh" padding={4}>
      <Card height="70dvh" padding={0}>
        <VStack height="100%">{layout}</VStack>
      </Card>
    </VStack>
  );
}
