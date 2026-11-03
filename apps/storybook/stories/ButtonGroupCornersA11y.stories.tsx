// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonGroupCornersA11y.stories.tsx
 * @input ButtonGroup, Button, DropdownMenu, Tooltip, InputGroup and TextInput,
 *   with layer pieces (popovers, templates, dialogs) placed after members
 * @output Browser fixtures for ButtonGroup FR3: one group per member shape,
 *   each member marked with `data-corner-case`, so a browser spec reads which
 *   members round their trailing corners
 * @position Read by ButtonGroupCorners.interaction.browser.spec.ts;
 *   `no-visual`, so the stable visual plan never captures these fixtures
 */

import type {ReactNode} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {ButtonGroup} from '@astryxdesign/core/ButtonGroup';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {InputGroup} from '@astryxdesign/core/InputGroup';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Tooltip} from '@astryxdesign/core/Tooltip';

const meta = {
  title: 'A11y/ButtonGroup corners',
  tags: ['no-visual'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** `count` closed layer pieces of one kind, as inline siblings. */
function pieces(kind: 'popover' | 'template' | 'dialog', count: number) {
  return Array.from({length: count}, (_, index) => {
    const key = `${kind}-${index}`;
    if (kind === 'template') {
      return <template key={key} />;
    }
    if (kind === 'dialog') {
      return <dialog key={key} />;
    }
    return <div key={key} popover="manual" />;
  });
}

/**
 * Each group's members carry `data-corner-case="<shape>"` and
 * `data-trailing="round"` or `"square"`: the corners ButtonGroup FR3 promises.
 */
function Shape({
  name,
  orientation = 'horizontal',
  children,
}: {
  name: string;
  orientation?: 'horizontal' | 'vertical';
  children: ReactNode;
}) {
  return (
    <div data-corner-shape={name} style={{padding: 8}}>
      <ButtonGroup label={name} orientation={orientation}>
        {children}
      </ButtonGroup>
    </div>
  );
}

const member = (name: string, trailing: 'round' | 'square', label: string) => (
  <Button label={label} data-corner-case={name} data-trailing={trailing} />
);

export const Shapes: Story = {
  render: () => (
    <div>
      <Shape name="two">
        {member('two', 'square', 'One')}
        {member('two', 'round', 'Two')}
      </Shape>
      <Shape name="two-vertical" orientation="vertical">
        {member('two-vertical', 'square', 'One')}
        {member('two-vertical', 'round', 'Two')}
      </Shape>
      <Shape name="popover-and-template-after">
        {member('popover-and-template-after', 'square', 'One')}
        {member('popover-and-template-after', 'round', 'Two')}
        {pieces('popover', 1)}
        {pieces('template', 1)}
      </Shape>
      <Shape name="dialog-then-raw-child">
        {member('dialog-then-raw-child', 'square', 'One')}
        {pieces('dialog', 1)}
        <button type="button">Raw</button>
      </Shape>
      <Shape name="contents-wrapper-follows">
        {member('contents-wrapper-follows', 'square', 'One')}
        <div style={{display: 'contents'}}>
          <Button label="Wrapped" />
        </div>
      </Shape>
      <Shape name="between-popovers">
        {pieces('popover', 1)}
        {member('between-popovers', 'round', 'Only')}
        {pieces('popover', 1)}
      </Shape>
      <Shape name="four-pieces-each">
        {member('four-pieces-each', 'square', 'One')}
        {pieces('popover', 2)}
        {pieces('template', 2)}
        {member('four-pieces-each', 'round', 'Two')}
        {pieces('popover', 2)}
        {pieces('template', 2)}
      </Shape>
      {[5, 6, 7].map(count => (
        <Shape key={count} name={`${count}-pieces-after`}>
          {member(`${count}-pieces-after`, 'square', 'One')}
          {member(`${count}-pieces-after`, 'round', 'Two')}
          {pieces('popover', count)}
        </Shape>
      ))}
      <Shape name="tooltip-trailing">
        {member('tooltip-trailing', 'square', 'Save')}
        <Button
          label="More"
          tooltip="More options"
          data-corner-case="tooltip-trailing"
          data-trailing="round"
        />
      </Shape>
      <Shape name="dropdown-trailing">
        {member('dropdown-trailing', 'square', 'Allow once')}
        <DropdownMenu
          button={{
            label: 'Allow options',
            'data-corner-case': 'dropdown-trailing',
            'data-trailing': 'round',
          }}
          items={[{label: 'Always allow'}]}
        />
      </Shape>
      <Shape name="tooltip-wrapper-follows">
        {member('tooltip-wrapper-follows', 'square', 'Save')}
        <Tooltip content="Rich tip">
          <Button label="More" />
        </Tooltip>
      </Shape>
      <div data-corner-shape="input-group-addon" style={{padding: 8}}>
        <InputGroup label="Visibility">
          <TextInput
            label="Audience"
            isLabelHidden
            value="Members"
            onChange={() => {}}
          />
          <Button
            label="Save"
            data-corner-case="input-group-addon"
            data-trailing="round"
          />
        </InputGroup>
      </div>
      <div
        data-corner-shape="input-group-addon-then-member"
        style={{padding: 8}}>
        <InputGroup label="Visibility">
          <Button
            label="Pick"
            data-corner-case="input-group-addon-then-member"
            data-trailing="square"
          />
          <TextInput
            label="Audience"
            isLabelHidden
            value="Members"
            onChange={() => {}}
          />
        </InputGroup>
      </div>
    </div>
  ),
};
