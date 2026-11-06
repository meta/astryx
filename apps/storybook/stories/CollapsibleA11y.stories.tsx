// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CollapsibleA11y.stories.tsx
 * @input Uses Collapsible and the shared accessibility binding inventory
 * @output Stable standalone disclosure states for Chromium contract verification
 * @position Accessibility contract fixtures only; excluded from visual baselines.
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import type {CollapsibleProps} from '@astryxdesign/core/Collapsible';

const meta = {
  title: 'A11y/Collapsible Disclosure',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Fixture({
  label,
  initialOpen,
  controlled = false,
  direction = 'ltr',
  ...props
}: Omit<
  CollapsibleProps,
  'children' | 'trigger' | 'isOpen' | 'onOpenChange'
> & {
  readonly label: string;
  readonly initialOpen: boolean;
  readonly controlled?: boolean;
  readonly direction?: 'ltr' | 'rtl';
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div dir={direction}>
      {controlled ? (
        <Collapsible
          {...props}
          trigger={label}
          isOpen={open}
          onOpenChange={setOpen}>
          Disclosure content
        </Collapsible>
      ) : (
        <Collapsible {...props} trigger={label} defaultIsOpen={initialOpen}>
          Disclosure content
        </Collapsible>
      )}
      <button type="button">After disclosure</button>
    </div>
  );
}

export const UncontrolledOpenEndLtr: Story = {
  render: () => <Fixture label="Account details" initialOpen />,
};

export const UncontrolledClosedStartRtl: Story = {
  render: () => (
    <Fixture
      label="Privacy details"
      initialOpen={false}
      chevronPosition="start"
      direction="rtl"
    />
  ),
};

export const ControlledOpenEndLtr: Story = {
  render: () => <Fixture label="Notification details" initialOpen controlled />,
};

export const ControlledClosedStartLtr: Story = {
  render: () => (
    <Fixture
      label="Security details"
      initialOpen={false}
      controlled
      chevronPosition="start"
    />
  ),
};

export const DisabledOpenEndLtr: Story = {
  render: () => <Fixture label="Archived details" initialOpen isDisabled />,
};

export const DisabledClosedStartRtl: Story = {
  render: () => (
    <Fixture
      label="Restricted details"
      initialOpen={false}
      isDisabled
      chevronPosition="start"
      direction="rtl"
    />
  ),
};
