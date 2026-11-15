// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadioListDisabledForm.stories.tsx
 * @input Uses RadioList and RadioListItem inside native forms
 * @output Real-browser fixtures for disabled radios in a form: a selected
 *   option that is disabled, a required group with every option disabled, and
 *   two disabled groups sharing one field name in different forms
 * @position Evidence fixtures for
 *   packages/core/src/RadioList/__tests__/RadioListDisabledForm.interaction.browser.spec.ts
 *   (spec:AST-085 FR3); excluded from visual regression.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';

const meta: Meta = {
  title: 'a11y/RadioList disabled in a form',
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'Disabled radios submit no value and never block a submit, while each group stays one native radio group.',
      },
    },
  },
};

export default meta;

/** A required group whose selected option is individually disabled. */
export const SelectedOptionDisabled: StoryObj = {
  render: () => (
    <form aria-label="Delivery form" onSubmit={event => event.preventDefault()}>
      <RadioList
        label="Delivery speed"
        htmlName="delivery"
        value="express"
        onChange={() => {}}
        isRequired>
        <RadioListItem label="Standard" value="standard" />
        <RadioListItem label="Express" value="express" isDisabled />
        <RadioListItem label="Overnight" value="overnight" />
      </RadioList>
      <input type="hidden" name="order" value="1001" />
    </form>
  ),
};

/** A required group with every option disabled and none selected. */
export const AllOptionsDisabledRequired: StoryObj = {
  render: () => (
    <form aria-label="Delivery form" onSubmit={event => event.preventDefault()}>
      <RadioList
        label="Delivery speed"
        htmlName="delivery"
        value=""
        onChange={() => {}}
        isRequired>
        <RadioListItem label="Standard" value="standard" isDisabled />
        <RadioListItem label="Express" value="express" isDisabled />
      </RadioList>
    </form>
  ),
};

/** Two disabled groups that share a field name, each in its own form. */
export const SharedNameInTwoForms: StoryObj = {
  render: () => (
    <>
      <form aria-label="First form">
        <RadioList
          label="First delivery"
          htmlName="delivery"
          value="standard"
          onChange={() => {}}
          isDisabled>
          <RadioListItem label="First standard" value="standard" />
          <RadioListItem label="First express" value="express" />
        </RadioList>
      </form>
      <form aria-label="Second form">
        <RadioList
          label="Second delivery"
          htmlName="delivery"
          value="express"
          onChange={() => {}}
          isDisabled>
          <RadioListItem label="Second standard" value="standard" />
          <RadioListItem label="Second express" value="express" />
        </RadioList>
      </form>
    </>
  ),
};
