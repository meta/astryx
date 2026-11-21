// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MetadataListReflowA11y.stories.tsx
 * @input MetadataList values at a 320 CSS px viewport: an amount beside its
 *   description in a row, and a long unbroken token in side-by-side, stacked,
 *   horizontal and two-column lists
 * @output Browser fixtures for MetadataListItem FR1 ("break long words"): an
 *   ordinary word or number keeps its own width, and a word longer than its
 *   line wraps inside the list, so the page never scrolls sideways
 * @position Read by MetadataListReflow.a11y.chromium.spec.ts; `no-visual`, so
 *   the stable visual plan never captures these fixtures
 */

import type {Meta, StoryObj} from '@storybook/react';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {HStack, StackItem} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';

const TOKEN =
  'https://example.com/orders/2026/aVeryLongUnbrokenOrderIdentifierWiderThanAPhone';

const meta = {
  title: 'A11y/MetadataList reflow',
  tags: ['no-visual'],
  parameters: {layout: 'fullscreen'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** An amount beside a long description, in a side-by-side list. */
export const AmountInRow: Story = {
  render: () => (
    <div style={{padding: 8}}>
      <MetadataList>
        <MetadataListItem label="Shipping">
          <HStack>
            <StackItem size="fill">
              <Text type="body">
                Free shipping by ground, three to five days
              </Text>
            </StackItem>
            <Text type="body" data-testid="amount">
              $1,234.56
            </Text>
          </HStack>
        </MetadataListItem>
      </MetadataList>
    </div>
  ),
};

/** A long unbroken token as a value, side by side. */
export const TokenSideBySide: Story = {
  render: () => (
    <div style={{padding: 8}} data-testid="frame">
      <MetadataList>
        <MetadataListItem label="Link">
          <Text type="body" data-testid="token">
            {TOKEN}
          </Text>
        </MetadataListItem>
      </MetadataList>
    </div>
  ),
};

/** A long unbroken token as a value, labels on top. */
export const TokenStacked: Story = {
  render: () => (
    <div style={{padding: 8}} data-testid="frame">
      <MetadataList label={{position: 'top'}}>
        <MetadataListItem label="Link">
          <Text type="body" data-testid="token">
            {TOKEN}
          </Text>
        </MetadataListItem>
      </MetadataList>
    </div>
  ),
};

/** A long unbroken token as a value, in a horizontal list. */
export const TokenHorizontal: Story = {
  render: () => (
    <div style={{padding: 8}} data-testid="frame">
      <MetadataList orientation="horizontal">
        <MetadataListItem label="Link">
          <Text type="body" data-testid="token">
            {TOKEN}
          </Text>
        </MetadataListItem>
        <MetadataListItem label="Status">Shipped</MetadataListItem>
      </MetadataList>
    </div>
  ),
};

/** A long unbroken token as a value, in a two-column list. */
export const TokenTwoColumns: Story = {
  render: () => (
    <div style={{padding: 8}} data-testid="frame">
      <MetadataList columns={2}>
        <MetadataListItem label="Link">
          <Text type="body" data-testid="token">
            {TOKEN}
          </Text>
        </MetadataListItem>
        <MetadataListItem label="Status">Shipped</MetadataListItem>
      </MetadataList>
    </div>
  ),
};

/** A label word longer than its column, in a two-column list. */
export const LongLabelTwoColumns: Story = {
  render: () => (
    <div style={{padding: 8}} data-testid="frame">
      <MetadataList columns={2}>
        <MetadataListItem label="Internationalizationconfigurationidentifier">
          Enabled
        </MetadataListItem>
        <MetadataListItem label="Status">Shipped</MetadataListItem>
      </MetadataList>
    </div>
  ),
};
