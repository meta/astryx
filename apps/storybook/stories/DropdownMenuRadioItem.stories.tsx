// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuRadioItem.stories.tsx
 * @input One open, controlled menu whose radio rows cover checked, unchecked, icon, description, end content, long text, disabled, and consumer handlers
 * @output Component-owned rendered evidence for DropdownMenuRadioItem rows at each menu size
 * @position Storybook audit surface; the group and parent menu keep their own stories
 */

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {expect, within} from 'storybook/test';
import {Badge} from '@astryxdesign/core/Badge';
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';

type RowStatesArgs = {size: 'sm' | 'md' | 'lg'};

const meta: Meta<RowStatesArgs> = {
  title: 'Core/DropdownMenuRadioItem',
  tags: ['autodocs', 'visual-theme-matrix'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'One menuitemradio row inside a DropdownMenuRadioGroup. The row owns its checked state, decorative radio marker, icon, description, end content, and disabled paint; the group owns the value and DropdownMenu owns keyboard navigation.',
      },
    },
  },
  argTypes: {
    size: {control: 'inline-radio', options: ['sm', 'md', 'lg']},
  },
  args: {size: 'md'},
};

export default meta;
type Story = StoryObj<RowStatesArgs>;

function RowStatesFixture({size}: RowStatesArgs) {
  const [view, setView] = useState('board');
  const [clickCount, setClickCount] = useState(0);
  const [pointerMoveCount, setPointerMoveCount] = useState(0);
  // Consumer handlers on every row record what reaches them, so browser
  // evidence can observe that row activation and hover focus compose with
  // the caller's own handlers.
  const consumerHandlers = {
    onClick: () => setClickCount(count => count + 1),
    onPointerMove: () => setPointerMoveCount(count => count + 1),
  };
  return (
    <div
      data-testid="dropdown-menu-radio-item-audit"
      data-row-click-count={clickCount}
      data-row-pointer-move-count={pointerMoveCount}>
      <DropdownMenu
        button={{label: 'View', size}}
        isMenuOpen
        menuWidth={300}
        presentation="popover">
        <DropdownMenuRadioGroup
          value={view}
          onChange={setView}
          label="View as"
          hasCloseOnSelect={false}>
          <DropdownMenuRadioItem
            {...consumerHandlers}
            value="board"
            label="Board"
            icon="viewColumns"
          />
          <DropdownMenuRadioItem
            {...consumerHandlers}
            value="list"
            label="List"
            description="One row per card"
          />
          <DropdownMenuRadioItem
            {...consumerHandlers}
            value="timeline"
            label="Timeline"
            endContent={<Badge label="Beta" />}
          />
          <DropdownMenuRadioItem
            {...consumerHandlers}
            value="calendar"
            label="Calendar with every scheduled milestone, review, and release date"
          />
          <DropdownMenuRadioItem
            {...consumerHandlers}
            value="archive"
            label="Archive"
            description="Requires an owner role"
            isDisabled
          />
        </DropdownMenuRadioGroup>
      </DropdownMenu>
    </div>
  );
}

export const RowStates: Story = {
  render: args => <RowStatesFixture {...args} />,
  play: async () => {
    const menu = await within(document.body).findByRole('menu');
    const rows = within(menu).getAllByRole('menuitemradio');
    await expect(rows).toHaveLength(5);
    await expect(rows[0]).toHaveAttribute('aria-checked', 'true');
    await expect(rows[4]).toHaveAttribute('aria-disabled', 'true');
  },
};
