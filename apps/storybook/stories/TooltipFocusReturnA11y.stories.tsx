// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TooltipFocusReturnA11y.stories.tsx
 * @input Uses Popover, Dialog, TextInput, Tooltip and Button from core
 * @output The fixtures the tooltip focus-return regression spec drives in a
 *   real browser: a popover whose trigger also carries a tooltip, and a
 *   dialog with a text field whose trigger carries a tooltip.
 * @position The reproduction path for
 *   `packages/core/src/Tooltip/__tests__/TooltipFocusReturn.a11y.chromium.spec.ts`
 *   (`docs/specs/AST-009/spec.md` FR30: a browser claim is checked against a
 *   checked-in story, not a page a test builds and throws away).
 *
 * Closing the popover from the keyboard hands focus back to its trigger while
 * the engine is still hiding the popover, and the Popover API refuses to show
 * another popover inside that window. The tooltip on the trigger is the layer
 * that asks; the spec checks that the press closes the popover without an
 * error and the tooltip still appears for the keyboard focus that returned.
 *
 * SYNC: The spec navigates to this story id by name. Nothing at compile time
 *   catches a renamed export — the Chromium spec does, when it finds no story.
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Popover} from '@astryxdesign/core/Popover';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Tooltip} from '@astryxdesign/core/Tooltip';

const meta: Meta = {
  title: 'a11y/Tooltip focus return',
  // This fixture exists to be DRIVEN by the regression spec, not photographed:
  // the state under test is a focus hand-off inside one keypress, which no
  // frame can show. Excluding it costs no coverage — it is driven in a real
  // browser.
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'A popover whose trigger carries a tooltip. Tab to the trigger, open the popover with Enter, then close it with Escape: focus returns to the trigger and the tooltip shows again, with no error.',
      },
    },
  },
};

export default meta;

/**
 * A popover trigger that also carries a tooltip — the shape of any toolbar
 * button with a hint that opens a menu or a settings surface.
 */
export const PopoverTriggerWithTooltip: StoryObj = {
  name: 'popover trigger that carries a tooltip',
  render: () => (
    <Popover
      label="Options"
      content={<Button label="Inside action" onClick={() => {}} />}>
      <Tooltip content="More options">
        <Button label="Options" />
      </Tooltip>
    </Popover>
  ),
};

function DialogTriggerWithTooltipExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('report.pdf');
  return (
    <>
      <Tooltip content="Rename this file">
        <Button label="Rename" onClick={() => setIsOpen(true)} />
      </Tooltip>
      <Dialog isOpen={isOpen} onOpenChange={setIsOpen} aria-label="Rename">
        <form
          onSubmit={event => {
            event.preventDefault();
            setIsOpen(false);
          }}>
          <TextInput label="File name" value={name} onChange={setName} />
        </form>
      </Dialog>
    </>
  );
}

/**
 * A dialog trigger that carries a tooltip, with a text field in the dialog.
 * On a touch screen, keys typed into the field are text entry: the focus the
 * dialog returns after Enter submits the form shows no tooltip. Escape is
 * keyboard navigation, so the focus it returns shows the tooltip.
 */
export const DialogTriggerWithTooltip: StoryObj = {
  name: 'dialog trigger that carries a tooltip, with a text field',
  render: () => <DialogTriggerWithTooltipExample />,
};
