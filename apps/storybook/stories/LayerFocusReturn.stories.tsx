// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerFocusReturn.stories.tsx
 * @input DropdownMenu, Dialog, Popover and Button from @astryxdesign/core
 * @output A story whose controlled menu closes in the commit that opens a
 *   Dialog from its row, so the row is gone when the Dialog closes. A story
 *   whose Popover trigger remounts while the popover is open
 * @position Fixture for Layer/__tests__/LayerFocusReturn.interaction.browser.spec.ts
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {DropdownMenu, DropdownMenuItem} from '@astryxdesign/core/DropdownMenu';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Popover} from '@astryxdesign/core/Popover';
import {Button} from '@astryxdesign/core/Button';

const meta: Meta = {
  title: 'Core/Layer Focus Return',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
};
export default meta;

type Story = StoryObj;

function MenuThenDialogFixture() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  return (
    <>
      <DropdownMenu
        button={{label: 'Actions'}}
        isMenuOpen={isMenuOpen}
        onOpenChange={setIsMenuOpen}>
        <DropdownMenuItem
          label="Rename"
          onClick={() => setIsDialogOpen(true)}
        />
      </DropdownMenu>
      <Dialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        aria-label="Rename">
        <Button label="Done" onClick={() => setIsDialogOpen(false)} />
      </Dialog>
    </>
  );
}

/** A controlled menu whose row opens a Dialog as the menu closes. */
export const MenuThenDialog: Story = {
  render: () => <MenuThenDialogFixture />,
};

function RemountedTriggerFixture() {
  const [generation, setGeneration] = useState(0);
  return (
    <Popover
      label="Filter"
      hasLightDismiss={false}
      content={
        <Button
          label="Apply"
          onClick={() => setGeneration(current => current + 1)}
        />
      }>
      <Button key={generation} label={`Filter ${generation}`} />
    </Popover>
  );
}

/** A Popover whose trigger is replaced by a new element while it is open. */
export const RemountedTrigger: Story = {
  render: () => <RemountedTriggerFixture />,
};
