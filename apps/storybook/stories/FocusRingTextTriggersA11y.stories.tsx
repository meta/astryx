// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FocusRingTextTriggersA11y.stories.tsx
 * @input ChatMessageList inside a clipping scroll area, and text-only Tooltip
 *   and HoverCard triggers
 * @output Fixtures for the Chromium focus-ring check of the tab stops Astryx
 *   adds; excluded from the visual matrix
 * @position Browser fixtures for the shared focus ring on the chat log and
 *   the text trigger spans
 */

import type {Meta, StoryObj} from '@storybook/react';
import {ChatMessageList, ChatMessageBubble} from '@astryxdesign/core/Chat';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {HoverCard} from '@astryxdesign/core/HoverCard';

const meta = {
  title: 'A11y/FocusRingTextTriggers',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TabStops: Story = {
  render: () => (
    <div style={{display: 'grid', gap: 24, maxWidth: 480}}>
      <div
        data-testid="log-scroller"
        style={{height: 160, overflow: 'auto', display: 'flex'}}>
        <ChatMessageList>
          <ChatMessageBubble>The issue is resolved.</ChatMessageBubble>
        </ChatMessageList>
      </div>
      <p>
        Saved by <Tooltip content="Signed in as Rowan">Rowan</Tooltip> and{' '}
        <HoverCard content={<p>Reviewer since 2024</p>}>Kai</HoverCard>.
      </p>
    </div>
  ),
};
