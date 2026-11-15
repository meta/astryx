// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BoxHoldA11y.stories.tsx
 * @input A ContextMenu around a CheckboxInput and a CheckboxList, and a
 *   popover ContextMenu around a CheckboxInput. A useLongPress row and an
 *   onContextMenu row, each around a CheckboxInput.
 * @output Fixtures for the real-touch check of a long press on a box. Inside
 *   a ContextMenu, a long-press row or an onContextMenu row, the long press
 *   acts and the box adds no click. The visual matrix skips them.
 * @position Browser fixtures for the box hold
 *   (packages/core/src/utils/boxHold.ts)
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {ContextMenu} from '@astryxdesign/core/ContextMenu';
import {useLongPress} from '@astryxdesign/core/hooks';

const meta: Meta = {
  title: 'A11y/BoxHold',
  tags: ['no-visual'],
};

export default meta;

const rowActions = [
  {label: 'Rename', onClick: () => {}},
  {label: 'Archive', onClick: () => {}},
];

export const InContextMenu: StoryObj = {
  name: 'Boxes in a ContextMenu',
  render: function InContextMenuStory() {
    const [isAccepted, setIsAccepted] = useState(false);
    const [channels, setChannels] = useState<string[]>([]);
    return (
      <ContextMenu items={rowActions} label="Row actions">
        <CheckboxInput
          label="Accept terms"
          value={isAccepted}
          onChange={setIsAccepted}
        />
        <CheckboxList
          label="Notifications"
          value={channels}
          onChange={setChannels}>
          <CheckboxListItem label="Email" value="email" />
          <CheckboxListItem label="SMS" value="sms" />
        </CheckboxList>
      </ContextMenu>
    );
  },
};

export const InPopoverContextMenu: StoryObj = {
  name: 'A box in a popover ContextMenu',
  render: function InPopoverContextMenuStory() {
    const [isAccepted, setIsAccepted] = useState(false);
    return (
      <ContextMenu
        items={rowActions}
        label="Row actions"
        presentation="popover">
        <CheckboxInput
          label="Accept terms"
          value={isAccepted}
          onChange={setIsAccepted}
        />
      </ContextMenu>
    );
  },
};

export const InLongPressRow: StoryObj = {
  name: 'A box in a long-press row',
  render: function InLongPressRowStory() {
    const [isAccepted, setIsAccepted] = useState(false);
    const [longPresses, setLongPresses] = useState(0);
    const {onTouchStart, onTouchMove, onTouchEnd, onTouchCancel} = useLongPress(
      {onLongPress: () => setLongPresses(count => count + 1)},
    );
    return (
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}>
        <CheckboxInput
          label="Accept terms"
          value={isAccepted}
          onChange={setIsAccepted}
        />
        <div>{`Long presses: ${longPresses}`}</div>
      </div>
    );
  },
};

export const InOnContextMenuRow: StoryObj = {
  name: 'A box in an onContextMenu row',
  render: function InOnContextMenuRowStory() {
    const [isAccepted, setIsAccepted] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    return (
      <div
        onContextMenu={event => {
          event.preventDefault();
          setIsMenuOpen(true);
        }}>
        <CheckboxInput
          label="Accept terms"
          value={isAccepted}
          onChange={setIsAccepted}
        />
        <div>{`Row menu: ${isMenuOpen ? 'open' : 'closed'}`}</div>
      </div>
    );
  },
};
