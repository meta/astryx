// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverTriggerSwitch.stories.tsx
 * @input Popover and Button from @astryxdesign/core
 * @output A Popover whose children switch from a Button element to a render
 *   function that renders a different button further along the row
 * @position Fixture for
 *   Popover/__tests__/PopoverTriggerSwitch.interaction.browser.spec.ts
 *
 * SYNC: The spec opens this story by id and finds "Switch the trigger" and
 *   "Second trigger" by name.
 */

import {useState, type ReactNode} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {
  Popover,
  type PopoverTriggerRenderProps,
} from '@astryxdesign/core/Popover';

const meta: Meta = {
  title: 'Core/Popover Trigger Switch',
  tags: ['no-visual', '!autodocs'],
  parameters: {layout: 'padded'},
};
export default meta;

type Story = StoryObj;

function renderSecondTrigger(trigger: PopoverTriggerRenderProps): ReactNode {
  return (
    <button
      type="button"
      ref={trigger.ref}
      onClick={trigger.onClick}
      aria-haspopup={trigger['aria-haspopup']}
      aria-expanded={trigger['aria-expanded']}
      aria-controls={trigger['aria-controls']}
      style={{marginInlineStart: 300}}>
      Second trigger
    </button>
  );
}

function SwitchElementToRenderFunction(): ReactNode {
  const [isRenderFunction, setIsRenderFunction] = useState(false);
  return (
    <>
      <Button
        label="Switch the trigger"
        variant="secondary"
        onClick={() => setIsRenderFunction(true)}
      />
      <Popover label="Anchor check" content={<span>Popover content</span>}>
        {isRenderFunction ? (
          renderSecondTrigger
        ) : (
          <Button label="First trigger" />
        )}
      </Popover>
    </>
  );
}

export const SwitchElementToRender: Story = {
  render: () => <SwitchElementToRenderFunction />,
};
