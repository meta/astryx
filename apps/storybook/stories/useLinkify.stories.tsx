// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {useLinkify} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {Stack} from '@astryxdesign/core/Stack';
import {TextInput} from '@astryxdesign/core/TextInput';

// ---------------------------------------------------------------------------
// Wrapper — hooks need a component
// ---------------------------------------------------------------------------

interface LinkifyDemoProps {
  text: string;
  hasBuiltins: boolean;
  hasTaskPattern: boolean;
  hasDiffPattern: boolean;
}

function LinkifyDemo({
  text,
  hasBuiltins,
  hasTaskPattern,
  hasDiffPattern,
}: LinkifyDemoProps) {
  const patterns = [];
  if (hasTaskPattern) {
    patterns.push({
      pattern: /\bT(\d+)\b/g,
      href: (m: RegExpMatchArray) => `https://tasks.example.com/${m[1]}`,
      isExternal: true,
    });
  }
  if (hasDiffPattern) {
    patterns.push({
      pattern: /\bD(\d+)\b/g,
      href: (m: RegExpMatchArray) => `https://phabricator.example.com/${m[0]}`,
      isExternal: true,
    });
  }

  const nodes = useLinkify(text, {
    patterns: patterns.length > 0 ? patterns : undefined,
    hasBuiltins,
  });

  return (
    <Stack gap={4}>
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          background: 'var(--color-background-muted, #f5f5f5)',
          minHeight: 40,
        }}>
        <Text type="body">{nodes}</Text>
      </div>
      <Text type="supporting" color="secondary">
        {nodes.length} node{nodes.length !== 1 ? 's' : ''} rendered
      </Text>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof LinkifyDemo> = {
  title: 'Core/Hooks/useLinkify',
  component: LinkifyDemo,
  tags: ['autodocs'],
  argTypes: {
    text: {control: 'text'},
    hasBuiltins: {control: 'boolean'},
    hasTaskPattern: {control: 'boolean'},
    hasDiffPattern: {control: 'boolean'},
  },
};

export default meta;
type Story = StoryObj<typeof LinkifyDemo>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const URLs: Story = {
  args: {
    text: 'Check out https://react.dev and also https://github.com/facebook/react for the source.',
    hasBuiltins: true,
    hasTaskPattern: false,
    hasDiffPattern: false,
  },
};

export const Emails: Story = {
  args: {
    text: 'Contact us at support@example.com or sales@example.com for help.',
    hasBuiltins: true,
    hasTaskPattern: false,
    hasDiffPattern: false,
  },
};

export const CustomPatterns: Story = {
  name: 'Custom patterns (T/D numbers)',
  args: {
    text: 'Fixed in T123456 and D789012. Also see T999.',
    hasBuiltins: true,
    hasTaskPattern: true,
    hasDiffPattern: true,
  },
};

export const MixedContent: Story = {
  args: {
    text: 'See T123456 for the task. The fix is in D789012. Docs at https://example.com/docs. Questions? Email team@example.com.',
    hasBuiltins: true,
    hasTaskPattern: true,
    hasDiffPattern: true,
  },
};

export const PlainText: Story = {
  name: 'Plain text (no links)',
  args: {
    text: 'This is just regular text with no links, emails, or patterns to match.',
    hasBuiltins: true,
    hasTaskPattern: false,
    hasDiffPattern: false,
  },
};

export const BuiltinsDisabled: Story = {
  name: 'Builtins disabled (custom only)',
  args: {
    text: 'T123 is a task. https://example.com is a URL that should NOT become a link.',
    hasBuiltins: false,
    hasTaskPattern: true,
    hasDiffPattern: false,
  },
};

/** Interactive playground: type text and see it linkified in real time */
export const Interactive: Story = {
  render: () => {
    const [text, setText] = useState(
      'Check T12345, visit https://react.dev, or email hi@example.com',
    );

    const nodes = useLinkify(text, {
      patterns: [
        {
          pattern: /\bT(\d+)\b/g,
          href: (m: RegExpMatchArray) => `https://tasks.example.com/${m[1]}`,
          isExternal: true,
        },
        {
          pattern: /\bD(\d+)\b/g,
          href: (m: RegExpMatchArray) =>
            `https://phabricator.example.com/${m[0]}`,
          isExternal: true,
        },
      ],
    });

    return (
      <Stack gap={4}>
        <TextInput
          label="Enter text to linkify"
          value={text}
          onChange={newValue => setText(newValue)}
        />
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: 'var(--color-background-muted, #f5f5f5)',
            minHeight: 40,
          }}>
          <Text type="body">{nodes}</Text>
        </div>
      </Stack>
    );
  },
};
