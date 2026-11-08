// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuGroup.stories.tsx
 * @input Uses named and unnamed DropdownMenuGroup compositions inside one open pointer menu
 * @output Component-owned rendered evidence for DropdownMenuGroup semantics, theme, and layout
 * @position Storybook evidence; keeps every group state reachable from one bounded fixture
 */

import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, within} from 'storybook/test';
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
} from '@astryxdesign/core/DropdownMenu';

const meta: Meta<typeof DropdownMenuGroup> = {
  title: 'Core/DropdownMenuGroup',
  component: DropdownMenuGroup,
  tags: ['autodocs', 'visual-theme-matrix'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Groups related compound-menu rows under an optional non-interactive heading. A visible heading names role="group"; an untitled group remains unnamed.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof DropdownMenuGroup>;

export const NamedAndUnnamedGroups: Story = {
  render: () => (
    <DropdownMenu
      button={{label: 'Open group evidence'}}
      presentation="popover">
      <DropdownMenuGroup title="Version history">
        <DropdownMenuItem label="Restore this version" onClick={() => {}} />
        <DropdownMenuItem label="Compare with current" onClick={() => {}} />
      </DropdownMenuGroup>
      <DropdownMenuGroup>
        <DropdownMenuItem
          label="Delete version"
          variant="destructive"
          onClick={() => {}}
        />
      </DropdownMenuGroup>
    </DropdownMenu>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', {name: 'Open group evidence'}),
    );
    const menu = await within(document.body).findByRole('menu');
    const menuScope = within(menu);
    const groups = menuScope.getAllByRole('group');
    await expect(groups).toHaveLength(2);
    await expect(
      menuScope.getByRole('group', {name: 'Version history'}),
    ).toBeInTheDocument();
    await expect(groups[1]).not.toHaveAttribute('aria-labelledby');
  },
};
