// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useLayoutEffect, useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {ChatVirtualizer, type ChatVirtualizerHandle} from '@astryxdesign/lab';
import {Heading, Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof ChatVirtualizer> = {
  title: 'Lab/ChatVirtualizer',
  component: ChatVirtualizer,
  parameters: {
    layout: 'fullscreen',
    pageFrame: true,
  },
};

export default meta;
type Story = StoryObj<typeof ChatVirtualizer>;

// =============================================================================
// Data
// =============================================================================

type Message = {id: number; text: string};

const WORDS =
  'the quick brown fox jumps over a lazy dog while the river runs past the old mill and a bell rings twice'.split(
    ' ',
  );

/** 10,000 messages of one to six lines, the same on every load. */
const MESSAGES: Message[] = Array.from({length: 10_000}, (_, id) => {
  const words = 4 + ((id * 37) % 60);
  return {
    id,
    text: `Message ${id + 1}: ${Array.from(
      {length: words},
      (_, w) => WORDS[(id + w) % WORDS.length],
    ).join(' ')}`,
  };
});

// =============================================================================
// Stories
// =============================================================================

/**
 * Attach mode on the page's own scroller (`document.scrollingElement`), with
 * a header above the list. Anchored to the first message, the page opens at
 * the top with the header and the first messages in view.
 */
export const PageScroller: Story = {
  render: function PageScrollerStory() {
    const [scroller, setScroller] = useState<HTMLElement | null>(null);
    const handle = useRef<ChatVirtualizerHandle>(null);
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
        <VStack gap={2} padding={4}>
          <Heading level={1}>Conversation history</Heading>
          <Text color="secondary">
            The page scrolls. This header sits above the list, inside the same
            scroller.
          </Text>
        </VStack>
        <ChatVirtualizer<Message>
          data={MESSAGES}
          getRowKey={message => String(message.id)}
          estimatedItemSize={48}
          handleRef={handle}
          scrollElement={scroller}
          renderItem={({item}) => (
            <VStack padding={3}>
              <Text>{item.text}</Text>
            </VStack>
          )}
        />
      </VStack>
    );
  },
};
