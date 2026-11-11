// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input Nothing: a conversation of 400 messages of mixed height, and an
 *   Add message button that appends one more
 * @output Lab's ChatVirtualizer attached to the page's own scroller, with a
 *   heading and a card above the list, anchored to the first message
 * @position Raw page for phone checks of ChatVirtualizer on the page scroller.
 *   The document scrolls; there is no inner scroll container.
 */

import {useLayoutEffect, useRef, useState} from 'react';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {ChatMessage, ChatMessageBubble} from '@astryxdesign/core/Chat';
import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {ChatVirtualizer, type ChatVirtualizerHandle} from '@astryxdesign/lab';

interface Message {
  id: number;
  sender: 'user' | 'assistant';
  text: string;
  time: string;
}

const LINES = [
  'Can you help me plan a weekend trip to the coast?',
  'A two-day trip works well: arrive on Saturday morning, walk the cliffs in the afternoon, and keep Sunday for the harbor and the market.',
  'What should I pack for changeable weather?',
  'Pack layers: a light rain jacket, a warm sweater and shoes with good grip. The wind on the cliffs is often stronger than in town, so a hat helps too.',
  'Is there a good place to watch the sunset?',
  'The headland past the lighthouse faces west. Get there about 30 minutes early, because the path is narrow and the light changes fast. Bring a torch for the walk back.',
  'Thanks!',
  'The harbor has a few small seafood places. Most close their kitchens at 9, so book a table for the evening if you can. The one by the ferry steps has a terrace that stays warm after dark, and it takes walk-ins before 7.',
];

const messageAt = (id: number): Message => {
  const minutes = 9 * 60 + id;
  return {
    id,
    sender: id % 2 === 0 ? 'user' : 'assistant',
    // Repeats some lines so heights vary from one line to several.
    text: Array.from(
      {length: 1 + ((id * 7) % 3)},
      () => LINES[(id * 5) % LINES.length],
    ).join(' '),
    time: `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, '0')}`,
  };
};

const MESSAGES: Message[] = Array.from({length: 400}, (_, id) => messageAt(id));

export default function ChatPageScrollerPage() {
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [messages, setMessages] = useState(MESSAGES);
  const handle = useRef<ChatVirtualizerHandle>(null);
  // The page's own scroller exists only in the browser.
  useLayoutEffect(() => {
    setScroller(document.scrollingElement as HTMLElement | null);
  }, []);
  useLayoutEffect(() => {
    if (scroller != null) {
      handle.current?.anchorToKey('0', 0);
    }
  }, [scroller]);
  return (
    <VStack gap={0}>
      <VStack gap={3} padding={4}>
        <Heading level={1}>Trip planning</Heading>
        <Text color="secondary">
          A long conversation on the page&apos;s own scroller. The heading and
          the card sit above the list, in the same scroller. Scroll with a
          finger, fling, and let the momentum end. At the end of the
          conversation, Add message appends one more.
        </Text>
        <Card>
          <VStack gap={1}>
            <Text weight="semibold">400 messages</Text>
            <Text color="secondary">
              Messages have different heights. Only the messages near the screen
              are rendered.
            </Text>
          </VStack>
        </Card>
      </VStack>
      <ChatVirtualizer<Message>
        data={messages}
        getRowKey={message => String(message.id)}
        estimatedItemSize={96}
        handleRef={handle}
        scrollElement={scroller}
        renderItem={({item}) => (
          <VStack paddingInline={4} paddingBlock={2}>
            <ChatMessage
              sender={item.sender}
              name={item.sender === 'user' ? 'Sam' : 'Guide'}
              avatar={
                <Avatar
                  name={item.sender === 'user' ? 'Sam Lee' : 'Trip Guide'}
                  size="sm"
                />
              }>
              <ChatMessageBubble metadata={item.time}>
                {item.text}
              </ChatMessageBubble>
            </ChatMessage>
          </VStack>
        )}
      />
      <div style={{position: 'fixed', insetInlineEnd: 16, insetBlockEnd: 16}}>
        <Button
          label="Add message"
          onClick={() =>
            setMessages(current => [...current, messageAt(current.length)])
          }
        />
      </div>
    </VStack>
  );
}
