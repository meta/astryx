// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Card} from '@astryxdesign/core/Card';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack} from '@astryxdesign/core/Layout';
import {Popover} from '@astryxdesign/core/Popover';
import {Text} from '@astryxdesign/core/Text';
import {EmojiPicker} from '@astryxdesign/lab';
import EmojiPickerShowcase from '../../../packages/lab/blocks/EmojiPickerShowcase';

const meta: Meta = {
  title: 'Lab/EmojiPicker',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj;

export const Inline: Story = {
  render: () => <EmojiPickerShowcase />,
};

/** Opened from a button, the picker focuses its search. */
export const InAPopover: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    const [text, setText] = useState('');
    return (
      <HStack gap={2} align="center">
        <Popover
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          label="Add emoji"
          padding={0}
          width={352}
          // The Popover's own autofocus lands on the picker's search field.
          content={
            <EmojiPicker
              onSelect={emoji => {
                setText(current => current + emoji);
                setIsOpen(false);
              }}
            />
          }>
          <IconButton
            label="Add emoji"
            variant="secondary"
            icon={<span aria-hidden="true">🙂</span>}
          />
        </Popover>
        <Text type="large">{text === '' ? 'Pick some emoji' : text}</Text>
      </HStack>
    );
  },
};

/** Your own set: the viewer's recent emoji and a custom group. */
export const CustomSet: Story = {
  render: () => (
    <Card padding={0} width={352}>
      <EmojiPicker
        frequentEmojis={[
          {emoji: '🚀', name: 'Rocket'},
          {emoji: '✅', name: 'Check mark button'},
        ]}
        categories={[
          {
            name: 'Status',
            emojis: [
              {emoji: '🟢', name: 'Green circle', keywords: ['ok', 'healthy']},
              {emoji: '🟡', name: 'Yellow circle', keywords: ['warning']},
              {emoji: '🔴', name: 'Red circle', keywords: ['error', 'down']},
            ],
          },
        ]}
        onSelect={() => {}}
      />
    </Card>
  ),
};
