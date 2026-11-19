// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TreeListA11y.stories.tsx
 * @input A TreeList whose rows exercise every way a row can be named: a parent with a chevron, a plain row with a description, a link row, and an action row
 * @output One checked-in story for the Chromium row-naming evidence; excluded from the visual matrix
 * @position Browser fixture for component:TreeList AR1 (rows named by their label and described by their description)
 */

import type {Meta, StoryObj} from '@storybook/react';
import {TreeList} from '@astryxdesign/core/TreeList';

const meta = {
  title: 'A11y/TreeList Row Names',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const RowNames: Story = {
  render: () => (
    <TreeList
      aria-label="Files"
      items={[
        {
          id: 'docs',
          label: 'Documents',
          description: 'Shared with the team',
          children: [{id: 'annual', label: 'Annual report'}],
        },
        {
          id: 'budget',
          label: 'Budget',
          description: 'Updated yesterday',
          startContent: <span>3</span>,
          endContent: <button type="button">Pin</button>,
        },
        {
          id: 'report',
          label: 'Report',
          description: 'Opens the report',
          href: '#report',
        },
        {
          id: 'export',
          label: 'Export',
          description: 'Downloads a file',
          onClick: () => {},
        },
      ]}
    />
  ),
};
