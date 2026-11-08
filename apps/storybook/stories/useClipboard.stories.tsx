// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useClipboard} from '@astryxdesign/core/hooks';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';

interface ClipboardDemoProps {
  value: string;
  announce: string;
  resetAfterMs: number;
}

/**
 * The overwhelmingly common shape: a compact ghost `IconButton` over the hook.
 * The tooltip stays "Copy" — the copy → check icon flip is the confirmation —
 * and the announce message is spoken to a polite live region on success.
 */
function IconButtonDemo({value, announce, resetAfterMs}: ClipboardDemoProps) {
  const {copy, isCopied} = useClipboard({announce, resetAfterMs});
  return (
    <VStack gap={3}>
      <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
        <IconButton
          variant="ghost"
          size="sm"
          tooltip="Copy"
          label={isCopied ? 'Copied' : 'Copy'}
          icon={<Icon icon={isCopied ? 'check' : 'copy'} size="sm" />}
          onClick={() => void copy(value)}
        />
        <Text type="supporting">{value}</Text>
      </div>
      <Text type="supporting">isCopied: {String(isCopied)}</Text>
    </VStack>
  );
}

/**
 * The hook is not tied to an icon button — the same behavior drives a labeled
 * text button whose label reflects `isCopied`.
 */
function TextButtonDemo({value, announce, resetAfterMs}: ClipboardDemoProps) {
  const {copy, isCopied} = useClipboard({announce, resetAfterMs});
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={<Icon icon={isCopied ? 'check' : 'copy'} size="sm" />}
      label={isCopied ? 'Copied' : 'Copy link'}
      onClick={() => void copy(value)}
    />
  );
}

const meta: Meta<typeof IconButtonDemo> = {
  title: 'Core/Hooks/useClipboard',
  component: IconButtonDemo,
  tags: ['autodocs'],
  argTypes: {
    value: {control: 'text'},
    announce: {control: 'text'},
    resetAfterMs: {control: {type: 'range', min: 500, max: 4000, step: 100}},
  },
  args: {
    value: 'npm install @astryxdesign/core',
    announce: 'Copied',
    resetAfterMs: 2000,
  },
};

export default meta;
type Story = StoryObj<typeof IconButtonDemo>;

export const CopyIconButton: Story = {
  name: 'Copy icon button (common case)',
};

export const CopyTextButton: Story = {
  name: 'Labeled copy button',
  render: args => <TextButtonDemo {...args} />,
};

export const NoAnnounce: Story = {
  name: 'Without announcement',
  args: {announce: ''},
};
