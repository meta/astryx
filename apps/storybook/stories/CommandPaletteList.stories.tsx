// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useMemo} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  CommandPalette,
  CommandPaletteItem,
  CommandPaletteList,
} from '@astryxdesign/core/CommandPalette';
import {createStaticSource} from '@astryxdesign/core/Typeahead';

const meta: Meta<typeof CommandPaletteList> = {
  title: 'Core/CommandPaletteList',
  component: CommandPaletteList,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** A standalone results listbox with its translated default name. */
export const Default: Story = {
  render: () => (
    <CommandPaletteList>
      <CommandPaletteItem value="home" onSelect={() => {}}>
        Go home
      </CommandPaletteItem>
      <CommandPaletteItem value="settings" onSelect={() => {}}>
        Open settings
      </CommandPaletteItem>
      <CommandPaletteItem value="profile" onSelect={() => {}}>
        View profile
      </CommandPaletteItem>
    </CommandPaletteList>
  ),
};

/** More results than fit: the list scrolls inside CommandPalette. */
export const ScrollingResults: Story = {
  render: function Render() {
    const source = useMemo(
      () =>
        createStaticSource(
          Array.from({length: 24}, (_, index) => ({
            id: `command-${index + 1}`,
            label: `Command ${index + 1}`,
          })),
        ),
      [],
    );
    return (
      <CommandPalette
        isOpen
        isInline
        onOpenChange={() => {}}
        searchSource={source}
        width={480}
        maxHeight={320}
      />
    );
  },
};
