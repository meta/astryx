// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TextReflowA11y.stories.tsx
 * @input Text, Heading, CommandPaletteEmpty and Banner given a long unbroken token
 * @output Browser fixtures for Text and Heading FR3 at 320 CSS px (spec:AST-020
 *   FR1, WCAG 2.2 1.4.10): untruncated text wraps the token; single-line
 *   truncation still clips; Text inside a container that wraps with `anywhere`
 *   keeps `anywhere`
 * @position Read by TextReflow.a11y.chromium.spec.ts; `no-visual`, so the
 *   stable visual plan never captures these fixtures
 */

import type {Meta, StoryObj} from '@storybook/react';
import {Banner} from '@astryxdesign/core/Banner';
import {CommandPaletteEmpty} from '@astryxdesign/core/CommandPalette';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';

const TOKEN =
  'https://example.com/releases/2026/aVeryLongUnbrokenTokenThatIsMuchWiderThanAPhone';

const meta = {
  title: 'A11y/Text reflow',
  tags: ['no-visual'],
  parameters: {layout: 'fullscreen'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Untruncated Text (inline and block) and Heading with the token. */
export const Untruncated: Story = {
  render: () => (
    <div style={{padding: 8}}>
      <Heading level={1} data-testid="heading">
        {TOKEN}
      </Heading>
      <Text data-testid="text-inline">{TOKEN}</Text>
      <Text display="block" data-testid="text-block">
        {TOKEN}
      </Text>
    </div>
  ),
};

/** Single-line truncation keeps clipping the token on one line. */
export const Truncated: Story = {
  render: () => (
    <div style={{padding: 8}}>
      <Heading level={1} maxLines={1} data-testid="heading">
        {TOKEN}
      </Heading>
      <Text maxLines={1} data-testid="text">
        {TOKEN}
      </Text>
    </div>
  ),
};

/** A `<Text>` message in the command palette's empty state. */
export const CommandPaletteEmptyText: Story = {
  render: () => (
    <CommandPaletteEmpty>
      <Text data-testid="text">{`No results for ${TOKEN}`}</Text>
    </CommandPaletteEmpty>
  ),
};

/** A `<Text>` description in a banner. */
export const BannerText: Story = {
  render: () => (
    <div style={{padding: 8}}>
      <Banner
        status="info"
        title="Release notes"
        description={<Text data-testid="text">{TOKEN}</Text>}
      />
    </div>
  ),
};
