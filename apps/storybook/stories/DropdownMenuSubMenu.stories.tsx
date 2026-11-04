// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuSubMenu.stories.tsx
 * @input One open menu whose sub-menu rows cover icon, description, loading, disabled, long-label, nested, and caller-callback states
 * @output Component-owned rendered evidence for DropdownMenuSubMenu rows, flyouts, and drilled-in views at each menu size
 * @position Storybook audit surface; header-and-footer sub-menus keep their DropdownMenu stories
 */

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {expect, within} from 'storybook/test';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSubMenu,
  type DropdownMenuSubMenuPresentation,
} from '@astryxdesign/core/DropdownMenu';

type RowStatesArgs = {
  size: 'sm' | 'md' | 'lg';
  presentation: DropdownMenuSubMenuPresentation;
};

const meta: Meta<RowStatesArgs> = {
  title: 'Core/DropdownMenuSubMenu',
  tags: ['autodocs', 'visual-theme-matrix'],
  parameters: {
    // The menu opens from the inline start of the canvas so a flyout has room
    // beside its row in both directions; the viewport flip stays reachable at
    // narrow widths.
    layout: 'padded',
    docs: {
      description: {
        component:
          'A menu row that reveals its own rows: a flyout beside the row, or a drilled-in view led by a Back row. The row owns its menuitem semantics, popup state, caret or spinner, and disabled paint; DropdownMenu owns the root surface and the drill-in stack.',
      },
    },
  },
  argTypes: {
    size: {control: 'inline-radio', options: ['sm', 'md', 'lg']},
    presentation: {
      control: 'inline-radio',
      options: ['adaptive', 'flyout', 'drill-in'],
    },
  },
  args: {size: 'md', presentation: 'adaptive'},
};

export default meta;
type Story = StoryObj<RowStatesArgs>;

function RowStatesFixture({size, presentation}: RowStatesArgs) {
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [picked, setPicked] = useState('none');
  const [openCount, setOpenCount] = useState(0);
  const [closeCount, setCloseCount] = useState(0);
  // The Share sub-menu reports every open and close, so browser evidence can
  // observe the callback contract alongside the rendered state.
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setOpenCount(count => count + 1);
    } else {
      setCloseCount(count => count + 1);
    }
  };
  return (
    <div
      data-testid="dropdown-menu-submenu-audit"
      data-picked={picked}
      data-open-count={openCount}
      data-close-count={closeCount}>
      <DropdownMenu
        button={{label: 'Actions', size}}
        isMenuOpen={isMenuOpen}
        onOpenChange={setIsMenuOpen}
        menuWidth={280}
        presentation="popover">
        <DropdownMenuItem label="Rename" onClick={() => setPicked('rename')} />
        <DropdownMenuSubMenu
          label="Share"
          icon="externalLink"
          presentation={presentation}
          menuDataTestId="dropdown-menu-submenu-flyout"
          onOpenChange={handleOpenChange}>
          <DropdownMenuItem
            label="Copy link"
            icon="copy"
            onClick={() => setPicked('copy-link')}
          />
          <DropdownMenuItem label="Email" onClick={() => setPicked('email')} />
          <DropdownMenuSubMenu label="Embed" presentation={presentation}>
            <DropdownMenuItem
              label="Inline frame"
              onClick={() => setPicked('inline-frame')}
            />
          </DropdownMenuSubMenu>
        </DropdownMenuSubMenu>
        <DropdownMenuSubMenu
          label="Move to"
          description="Choose a folder"
          presentation={presentation}>
          <DropdownMenuItem
            label="Folder A"
            onClick={() => setPicked('folder-a')}
          />
        </DropdownMenuSubMenu>
        <DropdownMenuSubMenu
          label="Export"
          hasSpinner
          presentation={presentation}>
          {null}
        </DropdownMenuSubMenu>
        <DropdownMenuSubMenu
          label="Archive"
          isDisabled
          presentation={presentation}>
          <DropdownMenuItem label="This year" onClick={() => {}} />
        </DropdownMenuSubMenu>
        <DropdownMenuSubMenu
          label="Send to every connected workspace, channel, and shared inbox"
          presentation={presentation}>
          <DropdownMenuItem label="All" onClick={() => setPicked('all')} />
        </DropdownMenuSubMenu>
      </DropdownMenu>
    </div>
  );
}

export const RowStates: Story = {
  render: args => <RowStatesFixture {...args} />,
  play: async () => {
    const [menu] = await within(document.body).findAllByRole('menu');
    const share = within(menu).getByRole('menuitem', {name: /^Share/});
    await expect(share).toHaveAttribute('aria-haspopup', 'menu');
    await expect(share).toHaveAttribute('aria-expanded', 'false');
    await expect(
      within(menu).getByRole('menuitem', {name: /^Archive/}),
    ).toHaveAttribute('aria-disabled', 'true');
  },
};
