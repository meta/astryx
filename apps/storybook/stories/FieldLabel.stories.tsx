// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {FieldLabel} from '@astryxdesign/core/Field';
import {Icon} from '@astryxdesign/core/Icon';

const meta: Meta<typeof FieldLabel> = {
  title: 'Core/FieldLabel',
  component: FieldLabel,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FieldLabel>;

const groupStyle = {
  display: 'grid',
  gap: 6,
};

/**
 * One bounded fixture for every component-owned FieldLabel state. The associated
 * controls make label, group, hidden-label, and description semantics observable
 * without turning each prop into a permanent story.
 */
export const States: Story = {
  render: () => (
    <div style={{display: 'grid', gap: 24, maxWidth: 480}}>
      <div style={groupStyle}>
        <FieldLabel label="Email" inputID="field-label-default" />
        <input id="field-label-default" defaultValue="hello@example.com" />
      </div>

      <div style={groupStyle}>
        <FieldLabel
          label="Workspace"
          inputID="field-label-description"
          description="Shown in navigation and invitations."
          descriptionID="field-label-description-help"
        />
        <input
          id="field-label-description"
          aria-describedby="field-label-description-help"
        />
      </div>

      <div style={groupStyle}>
        <FieldLabel
          label="Owner"
          inputID="field-label-required"
          isRequired
          labelIcon={<Icon icon="info" />}
        />
        <input id="field-label-required" required />
      </div>

      <div style={groupStyle}>
        <FieldLabel
          label="Nickname"
          inputID="field-label-optional"
          isOptional
          labelTooltip="This name is shown to collaborators."
        />
        <input id="field-label-optional" />
      </div>

      <div style={groupStyle}>
        <FieldLabel
          label="Archived field"
          inputID="field-label-disabled"
          isDisabled
        />
        <input id="field-label-disabled" disabled />
      </div>

      <div style={groupStyle}>
        <FieldLabel
          label="Visibility"
          inputID="field-label-group"
          labelID="field-label-group-label"
          isGroupLabel
        />
        <div
          id="field-label-group"
          role="radiogroup"
          aria-labelledby="field-label-group-label">
          <label>
            <input type="radio" name="visibility" defaultChecked /> Private
          </label>{' '}
          <label>
            <input type="radio" name="visibility" /> Public
          </label>
        </div>
      </div>

      <div style={groupStyle}>
        <FieldLabel
          label="Search"
          inputID="field-label-hidden"
          description="Search every workspace."
          descriptionID="field-label-hidden-help"
          isLabelHidden
        />
        <input
          id="field-label-hidden"
          aria-describedby="field-label-hidden-help"
          placeholder="Search every workspace"
        />
      </div>
    </div>
  ),
};
