// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BackdropPressA11y.stories.tsx
 * @input Dialog, Drawer and CommandPalette, each with a text field, opened
 *   from a button
 * @output Fixtures for the Chromium check that a backdrop press dismisses only
 *   when it starts and ends on the backdrop; excluded from the visual matrix
 * @position Browser fixtures for the shared backdrop-press rule
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {CommandPalette} from '@astryxdesign/core/CommandPalette';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Drawer} from '@astryxdesign/core/Drawer';
import {createStaticSource} from '@astryxdesign/core/Typeahead';

const meta: Meta = {
  title: 'A11y/BackdropPress',
  tags: ['no-visual'],
};

export default meta;

const NOTE = 'A long note to select with the pointer and release past the edge';

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
