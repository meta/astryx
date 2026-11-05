// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Kbd} from '@astryxdesign/core/Kbd';
import {Text} from '@astryxdesign/core/Text';

const meta: Meta<typeof Kbd> = {
  title: 'Core/Kbd',
  component: Kbd,
  tags: ['autodocs'],
  argTypes: {
    keys: {
      control: 'text',
      description:
        'Keyboard shortcut string. Use "+" to separate keys. Special keys: mod, ctrl, alt, shift, enter, backspace, escape, tab, up, down, left, right, plus. Aliases: esc for escape and return for enter.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Kbd>;

// =============================================================================
// Basic Usage
// =============================================================================

export const Default: Story = {
  args: {
    keys: 'k',
  },
};

// =============================================================================
// Modifier Combinations
// =============================================================================

export const ModifierCombinations: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
      <Kbd keys="mod+k" />
      <Kbd keys="shift+enter" />
      <Kbd keys="ctrl+c" />
      <Kbd keys="alt+tab" />
    </div>
  ),
};

// =============================================================================
// Multiple Modifiers
// =============================================================================

export const MultipleModifiers: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
      <Kbd keys="mod+shift+z" />
      <Kbd keys="ctrl+alt+delete" />
      <Kbd keys="mod+shift+p" />
    </div>
  ),
};

// =============================================================================
// Special Keys
// =============================================================================

export const SpecialKeys: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Text type="label" style={{width: '100px'}}>
          Escape:
        </Text>
        <Kbd keys="escape" />
        <Kbd keys="esc" />
      </div>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Text type="label" style={{width: '100px'}}>
          Enter:
        </Text>
        <Kbd keys="enter" />
        <Kbd keys="return" />
      </div>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Text type="label" style={{width: '100px'}}>
          Backspace:
        </Text>
        <Kbd keys="backspace" />
      </div>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Text type="label" style={{width: '100px'}}>
          Tab:
        </Text>
        <Kbd keys="tab" />
      </div>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Text type="label" style={{width: '100px'}}>
          Space:
        </Text>
        <Kbd keys="space" />
      </div>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Text type="label" style={{width: '100px'}}>
          Arrow Keys:
        </Text>
        <Kbd keys="up" />
        <Kbd keys="down" />
        <Kbd keys="left" />
        <Kbd keys="right" />
      </div>
    </div>
  ),
};

// =============================================================================
// Single Letter Keys
// =============================================================================

export const SingleLetterKeys: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
      <Kbd keys="a" />
      <Kbd keys="b" />
      <Kbd keys="c" />
      <Kbd keys="x" />
      <Kbd keys="y" />
      <Kbd keys="z" />
    </div>
  ),
};

// =============================================================================
// All Modifier Symbols
// =============================================================================

export const AllModifierSymbols: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Text type="label" style={{width: '120px'}}>
          Cmd (mod):
        </Text>
        <Kbd keys="mod" />
        <Text type="supporting">⌘</Text>
      </div>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Text type="label" style={{width: '120px'}}>
          Ctrl:
        </Text>
        <Kbd keys="ctrl" />
        <Text type="supporting">⌃</Text>
      </div>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Text type="label" style={{width: '120px'}}>
          Alt/Option:
        </Text>
        <Kbd keys="alt" />
        <Text type="supporting">⌥</Text>
      </div>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Text type="label" style={{width: '120px'}}>
          Shift:
        </Text>
        <Kbd keys="shift" />
        <Text type="supporting">⇧</Text>
      </div>
    </div>
  ),
};

// =============================================================================
// Inline with Text
// =============================================================================

export const InlineWithText: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
      <Text type="body">
        Press <Kbd keys="mod+k" /> to open the command palette.
      </Text>
      <Text type="body">
        Use <Kbd keys="mod+shift+p" /> to access all commands.
      </Text>
      <Text type="body">
        Press <Kbd keys="escape" /> to close the dialog.
      </Text>
      <Text type="body">
        Navigate with <Kbd keys="up" /> and <Kbd keys="down" /> arrow keys, then
        press <Kbd keys="enter" /> to select.
      </Text>
    </div>
  ),
};

// =============================================================================
// Real-World Examples
// =============================================================================

export const MenuShortcuts: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '8px',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        width: '250px',
      }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px',
        }}>
        <Text type="body">Cut</Text>
        <Kbd keys="mod+x" />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px',
        }}>
        <Text type="body">Copy</Text>
        <Kbd keys="mod+c" />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px',
        }}>
        <Text type="body">Paste</Text>
        <Kbd keys="mod+v" />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px',
        }}>
        <Text type="body">Undo</Text>
        <Kbd keys="mod+z" />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px',
        }}>
        <Text type="body">Redo</Text>
        <Kbd keys="mod+shift+z" />
      </div>
    </div>
  ),
};
