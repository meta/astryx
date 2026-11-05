// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useMemo, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  CommandPalette,
  CommandPaletteInput,
} from '@astryxdesign/core/CommandPalette';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import {Kbd} from '@astryxdesign/core/Kbd';

const meta: Meta<typeof CommandPaletteInput> = {
  title: 'Core/CommandPaletteInput',
  component: CommandPaletteInput,
  tags: ['autodocs', 'visual-theme-matrix'],
  parameters: {
    layout: 'centered',
    docs: {story: {inline: false, height: '600px'}},
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Independent search field with a visible trailing shortcut hint. */
export const Standalone: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <div
        style={{
          width: 'min(22rem, calc(100vw - 4rem))',
          border: '1px solid currentColor',
          borderRadius: 8,
        }}>
        <CommandPaletteInput
          value={value}
          onValueChange={setValue}
          hasAutoFocus={false}
          label="Search documentation"
          endContent={
            <span data-testid="input-end-content">
              <Kbd keys="mod+k" />
            </span>
          }
        />
      </div>
    );
  },
};

/** Popup-backed query field with the real CommandPalette context and list. */
export const PopupContext: Story = {
  render: function Render() {
    const source = useMemo(
      () =>
        createStaticSource([
          {id: 'home', label: 'Go home'},
          {id: 'settings', label: 'Open settings'},
          {id: 'help', label: 'Open help'},
        ]),
      [],
    );
    return (
      <CommandPalette
        isOpen
        onOpenChange={() => {}}
        searchSource={source}
        input={
          <CommandPaletteInput
            hasAutoFocus={false}
            label="Search commands"
            endContent={<Kbd keys="mod+k" />}
          />
        }
      />
    );
  },
};
