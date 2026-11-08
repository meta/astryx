// Copyright (c) Meta Platforms, Inc. and affiliates.

// @ts-check

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'EmojiPicker',
  displayName: 'Emoji Picker',
  category: 'Form Controls',
  keywords: ['emoji', 'emoji picker', 'emoji selector', 'emoticon', 'smiley'],
  description:
    'A standalone emoji panel: a search field over every emoji by group, with your frequent emoji first. Place it inline or inside a Popover; picking an emoji calls onSelect.',
  usage: {
    description:
      'An emoji picker inserts an emoji into what the viewer is writing, such as a comment or a message. Put it in a Popover opened from an emoji button, or inline where emoji are the content. For a reaction from a short fixed set, offer the set directly.',
    anatomy: [
      {
        name: 'Search',
        required: true,
        description:
          'Matches every word of the search against the start of an emoji’s name or keywords. Enter picks the first match; Down moves into the emoji.',
      },
      {
        name: 'Groups',
        required: true,
        description:
          'Frequently used first, then every emoji by CLDR group under a heading that stays at the top while its emoji scroll.',
      },
      {
        name: 'Emoji',
        required: true,
        description:
          'Eight to a row, each group a grid, with one tab stop across them all. Arrow keys move through the rows and across groups, Home and End move within a row, Ctrl+Home and Ctrl+End jump to the first and last emoji, and Enter picks.',
      },
      {
        name: 'Preview',
        required: true,
        description: 'Names the emoji under the pointer or focus.',
      },
    ],
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass the viewer’s recent emoji as `frequentEmojis`, so the ones they use most are first.',
      },
      {
        guidance: true,
        description:
          'Open it from a button in a Popover and leave the Popover’s autofocus on, so typing searches right away. Inline or in a Dialog, set `hasAutoFocus` instead.',
      },
      {
        guidance: false,
        description:
          'Use it for reactions with a small fixed vocabulary; offer those options directly instead.',
      },
      {
        guidance: false,
        description:
          'Squeeze it below about 280 pixels wide. The rows keep eight emoji, so narrow pickers shrink every target.',
      },
    ],
    accessibility: [
      {
        name: 'Emoji grids',
        category: 'Keyboard',
        criterion: '2.1.1 Keyboard',
        description:
          'Each group is a WAI-ARIA grid named by its heading, with rows of eight cells. One roving tab stop crosses every group: Tab from the search field lands on it, and the next Tab leaves the picker. Arrow keys follow the layout and mirror in right-to-left text.',
      },
      {
        name: 'Search field',
        category: 'Keyboard',
        description:
          'Down moves into the first emoji, and Up from the first row comes back. Enter picks the first match. While an input method is composing, Enter and the arrows stay with it.',
      },
      {
        name: 'Emoji names',
        category: 'Content',
        description:
          'Each emoji button is named by its CLDR name, such as "Party popper"; the glyph itself is hidden from assistive technology. The bundled names are English: pass `categories` and `frequentEmojis` with localized names for other languages.',
      },
      {
        name: 'Focus ring',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: '3:1',
        description:
          'The focused emoji draws the system focus ring inset, so it never overlaps a neighbor; the ring must keep 3:1 against the popover surface.',
      },
    ],
  },
  theming: {
    targets: [
      {
        className: 'astryx-emoji-picker',
      },
    ],
  },
  props: [
    {
      name: 'onSelect',
      type: '(emoji: string, option: EmojiOption) => void',
      required: true,
      description: 'Called with the picked emoji and its option.',
    },
    {
      name: 'frequentEmojis',
      type: 'readonly EmojiOption[]',
      default: 'DEFAULT_FREQUENT_EMOJIS',
      description:
        'Emoji listed first, under Frequently used. An empty array leaves the row out.',
    },
    {
      name: 'categories',
      type: 'readonly EmojiCategory[]',
      description:
        'The emoji to offer, by group. Omit it to load the bundled set (every emoji through Emoji 15, with English CLDR names) the first time a picker mounts; pass your own for a localized or custom set.',
    },
    {
      name: 'height',
      type: 'SizeValue',
      default: "'calc(var(--spacing-8) * 10)'",
      description: 'Height of the scrolling emoji list.',
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      default: 'false',
      description:
        'Focuses the search field when the picker mounts, inline or in a Dialog. Inside a Popover, rely on the Popover’s own autofocus instead.',
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible name of the emoji list. Defaults to the localized "Emoji".',
    },
    {
      name: 'searchLabel',
      type: 'string',
      description:
        'Placeholder and hidden label of the search field. Defaults to the localized "Search emoji".',
    },
  ],
  examples: [
    {
      label: 'Inline picker',
      code: `import {Card} from '@astryxdesign/core/Card';
import {EmojiPicker} from '@astryxdesign/lab';

<Card padding={0} width={352}>
  <EmojiPicker onSelect={(emoji, option) => insert(emoji)} />
</Card>`,
    },
    {
      label: 'In a popover',
      code: `import {useState} from 'react';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Popover} from '@astryxdesign/core/Popover';
import {EmojiPicker} from '@astryxdesign/lab';

export default function Example() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      label="Add emoji"
      padding={0}
      width={352}
      content={
        <EmojiPicker
          onSelect={emoji => {
            insert(emoji);
            setIsOpen(false);
          }}
        />
      }>
      <IconButton label="Add emoji" icon={<span aria-hidden>🙂</span>} />
    </Popover>
  );
}`,
    },
  ],
};
