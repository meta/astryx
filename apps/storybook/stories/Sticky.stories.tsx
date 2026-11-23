// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Sticky} from '@astryxdesign/core/Sticky';

const meta: Meta<typeof Sticky> = {
  title: 'Core/Sticky',
  component: Sticky,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Sticky>;

export const Default: Story = {
  render: () => (
    <div
      style={{
        height: 240,
        overflowY: 'auto',
        border: '1px solid #888',
        padding: 16,
      }}>
      <div style={{height: 560}}>
        <Sticky
          style={{
            background: 'white',
            borderBottom: '1px solid #888',
            padding: 12,
          }}>
          Scroll this container to see the header stick to its top edge.
        </Sticky>
        <p>Content below the sticky header.</p>
      </div>
    </div>
  ),
};

export const WithOffset: Story = {
  render: () => (
    <div
      style={{
        height: 240,
        overflowY: 'auto',
        border: '1px solid #888',
        padding: 16,
      }}>
      <div style={{height: 560}}>
        <Sticky
          offsetTop={24}
          style={{
            background: 'white',
            borderBottom: '1px solid #888',
            padding: 12,
          }}>
          Sticky header with a 24px top offset.
        </Sticky>
        <p>Content below the sticky header.</p>
      </div>
    </div>
  ),
};
