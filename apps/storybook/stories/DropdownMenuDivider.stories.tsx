// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuDivider.stories.tsx
 * @input Uses DropdownMenu compound mode with a semantic divider between two rows
 * @output Component-owned rendered evidence for DropdownMenuDivider
 * @position Storybook evidence; keeps the divider observable as an open menu state
 */

import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, within} from 'storybook/test';
import {
  DropdownMenu,
  DropdownMenuDivider,
  DropdownMenuItem,
} from '@astryxdesign/core/DropdownMenu';

const meta: Meta<typeof DropdownMenuDivider> = {
  title: 'Core/DropdownMenuDivider',
  component: DropdownMenuDivider,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A non-interactive horizontal separator between groups of pointer-menu rows. In pointer presentations, the same component renders the data API’s `{type: "divider"}` entry.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof DropdownMenuDivider>;

export const MenuSeparator: Story = {
  render: () => (
    <DropdownMenu button={{label: 'Open divider evidence'}}>
      <DropdownMenuItem label="Edit" />
      <DropdownMenuDivider data-testid="dropdown-menu-divider-evidence" />
      <DropdownMenuItem label="Delete" variant="destructive" />
    </DropdownMenu>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', {name: 'Open divider evidence'}),
    );
    await expect(within(document.body).getByRole('separator')).toHaveAttribute(
      'aria-orientation',
      'horizontal',
    );
  },
};
