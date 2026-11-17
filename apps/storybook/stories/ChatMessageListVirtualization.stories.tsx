// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatMessageListVirtualization.stories.tsx
 * @input ChatLayout, ChatMessageList's item model and
 *   useChatMessageListVirtualization
 * @output A windowed conversation of thousands of messages with a streaming
 *   reply, older history that loads at the top, and a jump to a message
 * @position Storybook evidence for ChatMessageList windowing
 */

import type {Meta, StoryObj} from '@storybook/react';
import {useCallback, useEffect, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  ChatComposer,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  useChatMessageListVirtualization,
  type ChatMessageListHandle,
} from '@astryxdesign/core/Chat';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const meta: Meta = {
  title: 'Core/ChatMessageList virtualization',
  tags: ['autodocs'],
  parameters: {layout: 'fullscreen'},
};
export default meta;

type Story = StoryObj;

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
}

const SENTENCES = [
  'The build passed on every platform.',
  'Can you check the release notes before Friday?',
  'Here is the summary of the three open questions and the owner of each one.',
  'The table keeps its header visible while the rows scroll under it.',
  'Thanks, that answers it.',
];

/** A deterministic message of one to six sentences. */
function messageAt(index: number): Message {
  const sender = index % 2 === 0 ? 'user' : 'assistant';
  const count = sender === 'user' ? 1 : (index % 6) + 1;
  const text = Array.from(
    {length: count},
    (_, sentence) => SENTENCES[(index + sentence) % SENTENCES.length],
  ).join(' ');
  return {id: `message-${index}`, sender, text: `#${index} ${text}`};
}

function messagesBetween(start: number, end: number): Message[] {
  return Array.from({length: end - start}, (_, offset) =>
    messageAt(start + offset),
  );
}

const styles = stylex.create({
  page: {
    height: '100dvh',
    display: 'flex',
    flexDirection: 'column',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    padding: spacingVars['--spacing-3'],
  },
  layout: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
});

const renderMessage = (message: Message) => (
  <ChatMessage sender={message.sender}>
    <ChatMessageBubble>{message.text}</ChatMessageBubble>
  </ChatMessage>
);
const keyOf = (message: Message) => message.id;
const estimateOf = (message: Message) => (message.sender === 'user' ? 64 : 120);

/** The words a streaming reply gains on each tick. */
const STREAM_WORDS =
  'Here is a longer answer that arrives a few words at a time, so the list keeps the end of the conversation in view while the last message grows.'.split(
    ' ',
  );

function LongConversationDemo({total}: {total: number}) {
  const virtualization = useChatMessageListVirtualization();
  const handleRef = useRef<ChatMessageListHandle>(null);
  // The newest `total` messages are loaded; older ones load at the top.
  const [first, setFirst] = useState(Math.max(0, total - 2000));
  const [messages, setMessages] = useState(() =>
    messagesBetween(Math.max(0, total - 2000), total),
  );
  const [streamingId, setStreamingId] = useState<string | null>(null);

  const loadOlder = useCallback(async () => {
    if (first === 0) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 400));
    const start = Math.max(0, first - 500);
    setMessages(current => [...messagesBetween(start, first), ...current]);
    setFirst(start);
  }, [first]);

  const startReply = () => {
    const id = `reply-${Date.now()}`;
    setMessages(current => [...current, {id, sender: 'assistant', text: ''}]);
    setStreamingId(id);
  };

  // Syncs the streaming timer with the reply that is streaming.
  useEffect(() => {
    if (streamingId == null) {
      return undefined;
    }
    let word = 0;
    const timer = setInterval(() => {
      word += 1;
      setMessages(current =>
        current.map(message =>
          message.id === streamingId
            ? {...message, text: STREAM_WORDS.slice(0, word).join(' ')}
            : message,
        ),
      );
      if (word >= STREAM_WORDS.length) {
        setStreamingId(null);
      }
    }, 120);
    return () => clearInterval(timer);
  }, [streamingId]);

  const send = (text: string) => {
    setMessages(current => [
      ...current,
      {id: `sent-${Date.now()}`, sender: 'user', text},
    ]);
  };

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.toolbar)}>
        <Text>
          {messages.length.toLocaleString()} loaded of {total.toLocaleString()}{' '}
          messages
        </Text>
        <Button
          label="Stream a reply"
          variant="primary"
          size="sm"
          isDisabled={streamingId != null}
          onClick={startReply}
        />
        <Button
          label="Jump to the first loaded message"
          size="sm"
          variant="secondary"
          onClick={() => handleRef.current?.scrollToItem(messages[0].id)}
        />
        <Button
          label="Center the middle message"
          size="sm"
          variant="secondary"
          onClick={() =>
            handleRef.current?.scrollToItem(
              messages[Math.floor(messages.length / 2)].id,
              {align: 'center'},
            )
          }
        />
      </div>
      <div {...stylex.props(styles.layout)}>
        <ChatLayout composer={<ChatComposer onSubmit={send} />}>
          <ChatMessageList
            items={messages}
            getItemKey={keyOf}
            renderItem={renderMessage}
            estimateItemSize={estimateOf}
            virtualization={virtualization}
            handleRef={handleRef}
            isStreaming={streamingId != null}
            scrollToTopAction={first === 0 ? undefined : loadOlder}
          />
        </ChatLayout>
      </div>
    </div>
  );
}

/**
 * 5,000 messages, with the newest 2,000 loaded. Only the rows near the
 * scrollport mount. Scroll to the top to load 500 older messages: the
 * message you were reading stays in place. Stream a reply to watch the end
 * stay in view as the last message grows.
 */
export const LongConversation: Story = {
  render: () => <LongConversationDemo total={5000} />,
};

/** 20,000 messages, loaded in pages of 500 as you reach the top. */
export const VeryLongConversation: Story = {
  render: () => <LongConversationDemo total={20_000} />,
};
