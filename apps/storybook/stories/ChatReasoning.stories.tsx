// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  ChatMessageList,
  ChatMessage,
  ChatMessageBubble,
} from '@astryxdesign/core/Chat';
import {ChatReasoning} from '@astryxdesign/lab';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Markdown} from '@astryxdesign/core/Markdown';
import {useState, useEffect} from 'react';

const meta: Meta = {
  title: 'Lab/ChatReasoning',
  component: ChatReasoning,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div style={{width: 600, padding: 40}}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

/** Collapsed (default) — shows label, duration, and ellipsis preview */
export const Collapsed: StoryObj = {
  render: () => (
    <ChatReasoning duration="12s">
      Let me work through the constraints systematically. The farmer has 3
      fields and rotates wheat, corn, soy. No same crop in adjacent fields and
      no same crop in the same field two years in a row...
    </ChatReasoning>
  ),
};

/** Expanded — shows full reasoning content */
export const Expanded: StoryObj = {
  render: () => (
    <ChatReasoning duration="8s" defaultIsExpanded>
      <Markdown density="compact">{`First, I need to understand the constraints:
1. Three fields, three crops (wheat, corn, soy)
2. No adjacent fields can have the same crop
3. No field can repeat its crop from the previous year

For **Year 1**: 3 \u00d7 2 \u00d7 2 = 12 arrangements...`}</Markdown>
    </ChatReasoning>
  ),
};

/** Streaming — shimmer effect on label while thinking */
export const Streaming: StoryObj = {
  render: () => {
    const [streaming, setStreaming] = useState(true);
    useEffect(() => {
      const t = setTimeout(() => setStreaming(false), 5000);
      return () => clearTimeout(t);
    }, []);
    return (
      <div>
        <ChatReasoning isStreaming={streaming} label="Thinking">
          Working through the combinatorial constraints...
        </ChatReasoning>
        {!streaming && (
          <p
            style={{
              marginTop: 8,
              fontSize: 13,
              color: 'var(--color-text-secondary)',
            }}>
            (Shimmer stopped after 5s)
          </p>
        )}
      </div>
    );
  },
};

/** Custom label */
export const CustomLabel: StoryObj = {
  render: () => (
    <ChatReasoning label="Analyzing" duration="3s">
      Checking the codebase for similar patterns...
    </ChatReasoning>
  ),
};

/** In a message — reasoning above the response */
export const InMessage: StoryObj = {
  render: () => (
    <ChatMessageList>
      <ChatMessage sender="user">
        <ChatMessageBubble>
          How many valid planting arrangements are possible over 3 years?
        </ChatMessageBubble>
      </ChatMessage>
      <ChatMessage sender="assistant" avatar={<Avatar name="AI" size="md" />}>
        <ChatReasoning duration="12s">
          Let me work through the constraints systematically...
        </ChatReasoning>
        <Markdown density="compact">{`There are **42** valid planting arrangements over 3 years.`}</Markdown>
      </ChatMessage>
    </ChatMessageList>
  ),
};
