// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuRadioGroup.stories.tsx
 * @input Uses one controlled open-menu fixture covering selected, unselected, described, and retained-open states
 * @output Component-owned rendered evidence for DropdownMenuRadioGroup semantics, selection, layout, and direction
 * @position Storybook audit surface; keeps the group contract reachable without auditing the aggregate DropdownMenu story
 */

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {expect, within} from 'storybook/test';
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';

const meta: Meta<typeof DropdownMenuRadioGroup> = {
  title: 'Core/DropdownMenuRadioGroup',
  component: DropdownMenuRadioGroup,
  tags: ['autodocs', 'visual-theme-matrix'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A named controlled single-selection group inside DropdownMenu. The group owns value propagation and close policy; DropdownMenu owns keyboard navigation and each DropdownMenuRadioItem owns its row semantics and paint.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof DropdownMenuRadioGroup>;

function ControlledSelectionFixture() {
  const [sort, setSort] = useState('newest');
  const [closeRequestCount, setCloseRequestCount] = useState(0);
  return (
    <div
      data-testid="dropdown-menu-radio-group-audit"
      data-close-request-count={closeRequestCount}>
      <DropdownMenu
        button={{label: 'Sort'}}
        isMenuOpen
        onOpenChange={isOpen => {
          if (!isOpen) {
            setCloseRequestCount(count => count + 1);
          }
        }}
        menuWidth={280}
        presentation="popover">
        <DropdownMenuRadioGroup
          data-testid="sort-group"
          value={sort}
          onChange={setSort}
          label="Sort options"
          hasCloseOnSelect={false}>
          <DropdownMenuRadioItem value="newest" label="Newest first" />
          <DropdownMenuRadioItem
            value="oldest"
            label="Oldest first"
            description="Use creation date"
          />
          <DropdownMenuRadioItem value="name" label="Name" />
        </DropdownMenuRadioGroup>
      </DropdownMenu>
    </div>
  );
}

export const ControlledSelection: Story = {
  render: () => <ControlledSelectionFixture />,
  play: async () => {
    const menu = await within(document.body).findByRole('menu');
    const scope = within(menu);
    const group = scope.getByRole('group', {name: 'Sort options'});
    await expect(within(group).getAllByRole('menuitemradio')).toHaveLength(3);
    await expect(
      within(group).getByRole('menuitemradio', {name: 'Newest first'}),
    ).toHaveAttribute('aria-checked', 'true');
  },
};
