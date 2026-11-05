// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  CommandPaletteItem,
  CommandPaletteList,
} from '@astryxdesign/core/CommandPalette';
import {Kbd} from '@astryxdesign/core/Kbd';

const meta: Meta<typeof CommandPaletteItem> = {
  title: 'Core/CommandPaletteItem',
  component: CommandPaletteItem,
  tags: ['autodocs', 'visual-theme-matrix'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Default, highlighted, selected, and disabled states in the supported listbox composition. */
export const States: Story = {
  render: () => (
    <CommandPaletteList
      label="Command item states"
      style={{inlineSize: 'min(22rem, calc(100vw - 4rem))'}}>
      <CommandPaletteItem value="open-file" onSelect={() => {}}>
        Open file
        <Kbd keys="mod+o" />
      </CommandPaletteItem>
      <CommandPaletteItem
        value="search-files"
        isHighlighted
        onSelect={() => {}}>
        Search files
      </CommandPaletteItem>
      <CommandPaletteItem value="settings" isSelected onSelect={() => {}}>
        Settings
      </CommandPaletteItem>
      <CommandPaletteItem value="archived" isDisabled onSelect={() => {}}>
        Archived command
      </CommandPaletteItem>
    </CommandPaletteList>
  ),
};

/** Coincident visual state and long content remain measurable without changing option semantics. */
export const CombinedAndLong: Story = {
  render: () => (
    <CommandPaletteList
      label="Combined and long command item states"
      style={{inlineSize: 'min(22rem, calc(100vw - 4rem))'}}>
      <CommandPaletteItem
        value="selected-highlighted"
        isHighlighted
        isSelected
        onSelect={() => {}}>
        Selected and highlighted
      </CommandPaletteItem>
      <CommandPaletteItem value="long-label" onSelect={() => {}}>
        Review every pending workspace configuration change before continuing
        <Kbd keys="mod+shift+p" />
      </CommandPaletteItem>
    </CommandPaletteList>
  ),
};
