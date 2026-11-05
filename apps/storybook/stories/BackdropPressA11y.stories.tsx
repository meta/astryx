// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BackdropPressA11y.stories.tsx
 * @input Dialog, Drawer and CommandPalette, each with a text field, opened
 *   from a button; Dialog and Drawer also hold a DropdownMenu; a second
 *   Dialog holds a Typeahead, a DateInput, an InfoTip and a ContextMenu
 * @output Fixtures for the Chromium check that a backdrop press dismisses only
 *   when it starts and ends on the backdrop, and that a press which closes a
 *   menu open inside leaves the host open; excluded from the visual matrix
 * @position Browser fixtures for the shared backdrop-press rule
 */

import {useState} from 'react';
import type {ISODateString} from '@astryxdesign/core/Calendar';
import {ContextMenu} from '@astryxdesign/core/ContextMenu';
import {DateInput} from '@astryxdesign/core/DateInput';
import {InfoTip} from '@astryxdesign/core/InfoTip';
import {Typeahead} from '@astryxdesign/core/Typeahead';
import type {SearchableItem} from '@astryxdesign/core/Typeahead';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {CommandPalette} from '@astryxdesign/core/CommandPalette';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Drawer} from '@astryxdesign/core/Drawer';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {createStaticSource} from '@astryxdesign/core/Typeahead';

const meta: Meta = {
  title: 'A11y/BackdropPress',
  tags: ['no-visual'],
};

export default meta;

const NOTE = 'A long note to select with the pointer and release past the edge';

const menuItems = [
  {label: 'Rename', onClick: () => {}},
  {label: 'Archive', onClick: () => {}},
];

const commands = createStaticSource([
  {id: 'open', label: 'Open file'},
  {id: 'save', label: 'Save file'},
]);

export const Members: StoryObj = {
  render: function MembersStory() {
    const [open, setOpen] = useState<'dialog' | 'drawer' | 'palette' | null>(
      null,
    );
    const close = (isOpen: boolean) => {
      if (!isOpen) {
        setOpen(null);
      }
    };
    return (
      <>
        <Button label="Open dialog" onClick={() => setOpen('dialog')} />
        <Button label="Open drawer" onClick={() => setOpen('drawer')} />
        <Button label="Open palette" onClick={() => setOpen('palette')} />
        <Dialog
          isOpen={open === 'dialog'}
          onOpenChange={close}
          aria-label="Note dialog">
          <input
            aria-label="Note"
            defaultValue={NOTE}
            style={{width: '100%'}}
          />
          <DropdownMenu button={{label: 'Actions'}} items={menuItems} />
        </Dialog>
        <Drawer
          isOpen={open === 'drawer'}
          onOpenChange={close}
          label="Note drawer">
          <input
            aria-label="Note"
            defaultValue={NOTE}
            style={{width: '100%'}}
          />
          <DropdownMenu button={{label: 'Actions'}} items={menuItems} />
        </Drawer>
        <CommandPalette
          isOpen={open === 'palette'}
          onOpenChange={close}
          aria-label="Commands"
          searchSource={commands}
        />
      </>
    );
  },
};

const fruits = createStaticSource<SearchableItem>([
  {id: 'apple', label: 'Apple'},
  {id: 'apricot', label: 'Apricot'},
  {id: 'banana', label: 'Banana'},
]);

/** A Dialog that holds each layer that closes on a press or a focus move. */
export const LayersInDialog: StoryObj = {
  render: function LayersInDialogStory() {
    const [isOpen, setIsOpen] = useState(false);
    const [fruit, setFruit] = useState<SearchableItem | null>(null);
    const [date, setDate] = useState<ISODateString | undefined>(undefined);
    return (
      <>
        <Button label="Open layers dialog" onClick={() => setIsOpen(true)} />
        <Dialog
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          aria-label="Layers dialog">
          <Typeahead
            label="Fruit"
            searchSource={fruits}
            value={fruit}
            onChange={setFruit}
          />
          <DateInput
            label="Date"
            value={date}
            onChange={setDate}
            presentation="popover"
          />
          <InfoTip content="Help text" label="About layers" />
          <ContextMenu items={menuItems}>
            <div style={{padding: 16}}>Right-click here</div>
          </ContextMenu>
        </Dialog>
      </>
    );
  },
};
