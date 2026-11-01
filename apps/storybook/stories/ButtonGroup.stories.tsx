// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {ButtonGroup} from '@astryxdesign/core/ButtonGroup';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {
  ClipboardDocumentIcon,
  ScissorsIcon,
  ClipboardIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof ButtonGroup> = {
  title: 'Core/ButtonGroup',
  component: ButtonGroup,
  tags: ['autodocs'],
  argTypes: {
    orientation: {control: 'select', options: ['horizontal', 'vertical']},
    size: {control: 'select', options: ['sm', 'md', 'lg']},
    elevation: {
      control: 'inline-radio',
      options: ['none', 'low', 'med', 'high'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof ButtonGroup>;

const iconSize = {width: 16, height: 16} as const;

/** Basic horizontal button group with text buttons. */
export const Horizontal: Story = {
  render: () => (
    <ButtonGroup label="Clipboard actions">
      <Button label="Copy" icon={<ClipboardDocumentIcon style={iconSize} />} />
      <Button label="Cut" icon={<ScissorsIcon style={iconSize} />} />
      <Button label="Paste" icon={<ClipboardIcon style={iconSize} />} />
    </ButtonGroup>
  ),
};

/** Vertical button group. */
export const Vertical: Story = {
  render: () => (
    <ButtonGroup label="Actions" orientation="vertical">
      <Button label="Copy" />
      <Button label="Cut" />
      <Button label="Paste" />
    </ButtonGroup>
  ),
};

/**
 * Icon-only button group for compact toolbars.
 *
 * The trailing button carries a tooltip, which renders an invisible layer after
 * it in the DOM — its outer corners must still round (#2508).
 */
export const IconOnly: Story = {
  render: () => (
    <ButtonGroup label="Text formatting">
      <IconButton label="Bold" icon={<Icon icon={BoldIcon} size="sm" />} />
      <IconButton label="Italic" icon={<Icon icon={ItalicIcon} size="sm" />} />
      <IconButton
        label="Underline"
        icon={<Icon icon={UnderlineIcon} size="sm" />}
        tooltip="Underline"
      />
    </ButtonGroup>
  ),
};

/** Undo/redo pair with ghost variant. */
export const GhostPair: Story = {
  render: () => (
    <ButtonGroup label="History">
      <Button
        label="Undo"
        variant="ghost"
        icon={<ArrowUturnLeftIcon style={iconSize} />}
        isIconOnly
      />
      <Button
        label="Redo"
        variant="ghost"
        icon={<ArrowUturnRightIcon style={iconSize} />}
        isIconOnly
      />
    </ButtonGroup>
  ),
};

/** All three sizes side by side. */
export const Sizes: Story = {
  render: () => (
    <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
      <ButtonGroup label="Small actions" size="sm">
        <Button label="Copy" />
        <Button label="Paste" />
      </ButtonGroup>
      <ButtonGroup label="Medium actions" size="md">
        <Button label="Copy" />
        <Button label="Paste" />
      </ButtonGroup>
      <ButtonGroup label="Large actions" size="lg">
        <Button label="Copy" />
        <Button label="Paste" />
      </ButtonGroup>
    </div>
  ),
};

/** Primary variant button group. */
export const PrimaryVariant: Story = {
  render: () => (
    <ButtonGroup label="Save options">
      <Button label="Save" variant="primary" />
      <Button
        label="Save options"
        variant="primary"
        icon={<ChevronDownIcon style={iconSize} />}
        isIconOnly
      />
    </ButtonGroup>
  ),
};

/** Two-button group (common split button pattern). */
export const SplitButton: Story = {
  render: () => (
    <ButtonGroup label="Merge options">
      <Button label="Merge pull request" variant="primary" />
      <Button
        label="More merge options"
        variant="primary"
        icon={<ChevronDownIcon style={iconSize} />}
        isIconOnly
      />
    </ButtonGroup>
  ),
};

/** Mixed button and icon button children. */
export const Mixed: Story = {
  render: () => (
    <ButtonGroup label="Edit actions">
      <Button label="Edit" />
      <IconButton
        label="More options"
        icon={<ChevronDownIcon style={iconSize} />}
      />
    </ButtonGroup>
  ),
};

/**
 * A DropdownMenu composes as a group member — the split-button pattern, with no
 * dedicated primitive. Its popover is an invisible DOM sibling after the
 * trigger, so the trailing corner must still round (#2508).
 */
export const WithDropdownMenu: Story = {
  render: () => (
    <ButtonGroup label="Approve action">
      <Button label="Allow once" variant="primary" />
      <DropdownMenu
        hasChevron={false}
        button={{
          label: 'Allow options',
          variant: 'primary',
          isIconOnly: true,
          icon: <Icon icon="chevronDown" />,
        }}
        items={[{label: 'Allow for 30 minutes'}, {label: 'Always allow'}]}
      />
    </ButtonGroup>
  ),
};

/**
 * Disabled members: the whole group via `isDisabled`, and a single member
 * disabling itself inside an enabled group.
 */
export const Disabled: Story = {
  render: () => (
    <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
      <ButtonGroup label="Clipboard actions" isDisabled>
        <Button label="Copy" />
        <Button label="Cut" />
        <Button label="Paste" />
      </ButtonGroup>
      <ButtonGroup label="History">
        <Button label="Undo" />
        <Button label="Redo" isDisabled />
      </ButtonGroup>
    </div>
  ),
};

/**
 * The connected buttons share one surface, so the shadow sits on the group and
 * lifts them together.
 */
export const Elevation: Story = {
  render: () => (
    <div style={{display: 'flex', gap: 24, alignItems: 'center'}}>
      {(['none', 'low', 'med', 'high'] as const).map(elevation => (
        <ButtonGroup key={elevation} label={elevation} elevation={elevation}>
          <Button label="Copy" />
          <Button label="Paste" />
        </ButtonGroup>
      ))}
    </div>
  ),
};

/**
 * Long labels in a narrow container. Members neither wrap nor truncate, so a
 * group whose labels are wider than its container overflows it.
 */
export const LongLabels: Story = {
  render: () => (
    <div style={{width: 280}}>
      <ButtonGroup label="Review actions">
        <Button label="Approve and merge immediately" />
        <Button label="Request changes" />
      </ButtonGroup>
    </div>
  ),
};

/**
 * `overflow="menu"` in a resizable container. Drag the corner: members that
 * no longer fit collapse into a "More" menu, the group's surface hugs the
 * members that are shown, and they return when the row widens again.
 */
export const OverflowMenu: Story = {
  render: () => (
    <div
      style={{
        resize: 'horizontal',
        overflow: 'hidden',
        border: '1px dashed #ccc',
        padding: 16,
        width: 220,
        minWidth: 80,
        maxWidth: '100%',
      }}>
      <ButtonGroup label="Zoom controls" overflow="menu" elevation="med">
        <Button label="Zoom out" />
        <Button label="Reset" />
        <Button label="Zoom in" />
        <Button label="Delete" variant="destructive" />
      </ButtonGroup>
    </div>
  ),
};
