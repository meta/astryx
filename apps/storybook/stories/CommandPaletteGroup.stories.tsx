// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  CommandPaletteGroup,
  CommandPaletteItem,
  CommandPaletteList,
} from '@astryxdesign/core/CommandPalette';
import {Theme, defineTheme} from '@astryxdesign/core/theme';

const meta: Meta<typeof CommandPaletteGroup> = {
  title: 'Core/CommandPaletteGroup',
  component: CommandPaletteGroup,
  tags: ['autodocs', 'visual-theme-matrix'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

function GroupFixture({heading = 'Navigation'}: {heading?: string}) {
  return (
    <CommandPaletteList label="Grouped commands">
      <CommandPaletteGroup heading={heading}>
        <CommandPaletteItem value="home" onSelect={() => {}}>
          Home
        </CommandPaletteItem>
        <CommandPaletteItem value="settings" onSelect={() => {}}>
          Settings
        </CommandPaletteItem>
        <CommandPaletteItem value="profile" onSelect={() => {}}>
          Profile
        </CommandPaletteItem>
      </CommandPaletteGroup>
    </CommandPaletteList>
  );
}

/** A labeled group in its supported listbox composition. */
export const Default: Story = {
  render: () => <GroupFixture />,
};

const groupHeadingTheme = defineTheme({
  name: 'command-palette-group-heading-audit',
  components: {
    'command-palette-group-heading': {
      base: {
        color: 'var(--color-accent)',
        fontWeight: 'var(--font-weight-bold)',
        textTransform: 'uppercase',
      },
    },
  },
});

/** The public heading target remains independently themeable. */
export const ThemedHeading: Story = {
  render: () => (
    <Theme theme={groupHeadingTheme} mode="light">
      <GroupFixture heading="Suggestions" />
    </Theme>
  ),
};
