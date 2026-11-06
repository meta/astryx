// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {FieldLabel} from '@astryxdesign/core/Field';
import {Icon} from '@astryxdesign/core/Icon';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';

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
/**
 * A hidden label's info button inside real fields, in a stacked layout and in
 * a horizontal-labels FormLayout. Tab to the button: it shows just above its
 * field.
 */
export const HiddenLabelInfo: Story = {
  render: () => (
    <VStack gap={6}>
      <Text type="body">Directory</Text>
      <TextInput
        label="Search people"
        value=""
        onChange={() => {}}
        isLabelHidden
        labelTooltip="Searches names and teams."
        placeholder="Search people"
      />
      <FormLayout direction="horizontal-labels">
        <TextInput
          label="Search teams"
          value=""
          onChange={() => {}}
          isLabelHidden
          labelTooltip="Searches team names."
          placeholder="Search teams"
        />
      </FormLayout>
    </VStack>
  ),
};

/**
 * A hidden label's info button on the first field of a dialog's scrolling
 * body. Tab to the button: it shows in flow above the field, inside the body.
 */
export const HiddenLabelInfoInDialog: Story = {
  render: () => (
    <Dialog isOpen onOpenChange={() => {}} maxHeight="50vh">
      <Layout
        header={<DialogHeader title="Files" onOpenChange={() => {}} />}
        content={
          <LayoutContent>
            <TextInput
              label="Search files"
              value=""
              onChange={() => {}}
              isLabelHidden
              labelTooltip="Searches file names only."
              placeholder="Search files"
            />
            {Array.from({length: 12}, (_, index) => (
              <Text type="body" as="p" display="block" key={index}>
                File {index + 1}
              </Text>
            ))}
          </LayoutContent>
        }
      />
    </Dialog>
  ),
};

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
