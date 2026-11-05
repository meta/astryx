// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RadioGroup.a11y.renders.tsx
 * @input Uses every current Astryx radio-group adopter and the checked state inventory
 * @output Consumer-realistic render functions shared by jsdom and Storybook
 * @position Binding fixture layer; callbacks, form behavior, composition, and styling stay local.
 */

import {useState, type ReactElement} from 'react';
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '../../DropdownMenu';
import {SegmentedControl, SegmentedControlItem} from '../../SegmentedControl';
import {RadioList, RadioListItem} from '../index';
import type {RadioGroupStateId} from './RadioGroup.a11y.states';

function RadioListFixture({
  initial = 'standard',
  orientation = 'horizontal',
  direction = 'ltr',
  description,
  isRequired = false,
  isInvalid = false,
  isDisabled = false,
  disabledMessage,
  disabledOption,
}: {
  initial?: string;
  orientation?: 'horizontal' | 'vertical';
  direction?: 'ltr' | 'rtl';
  description?: string;
  isRequired?: boolean;
  isInvalid?: boolean;
  isDisabled?: boolean;
  disabledMessage?: string;
  disabledOption?: 'express';
}) {
  const [value, setValue] = useState(initial);
  return (
    <div dir={direction}>
      <RadioList
        label="Delivery speed"
        description={description}
        value={value}
        onChange={setValue}
        orientation={orientation}
        isRequired={isRequired}
        isDisabled={isDisabled}
        disabledMessage={disabledMessage}
        status={
          isInvalid
            ? {type: 'error', message: 'Please select an option.'}
            : undefined
        }>
        <RadioListItem
          label="Standard"
          value="standard"
          description={
            description == null ? undefined : 'Arrives in three to five days'
          }
        />
        <RadioListItem
          label="Express"
          value="express"
          isDisabled={disabledOption === 'express'}
        />
        <RadioListItem label="Overnight" value="overnight" />
      </RadioList>
    </div>
  );
}

function SegmentedFixture({
  initial = 'list',
  direction = 'ltr',
  isDisabled = false,
  disabledMessage,
  disabledOption,
  hideSelectedLabel = false,
}: {
  initial?: string;
  direction?: 'ltr' | 'rtl';
  isDisabled?: boolean;
  disabledMessage?: string;
  disabledOption?: 'grid';
  hideSelectedLabel?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div dir={direction}>
      <SegmentedControl
        value={value}
        onChange={setValue}
        label="View mode"
        isDisabled={isDisabled}
        disabledMessage={disabledMessage}>
        <SegmentedControlItem
          value="list"
          label="List"
          isLabelHidden={hideSelectedLabel}
          icon={
            hideSelectedLabel ? <span aria-hidden="true">≡</span> : undefined
          }
        />
        <SegmentedControlItem
          value="grid"
          label="Grid"
          isDisabled={disabledOption === 'grid'}
        />
        <SegmentedControlItem value="table" label="Table" />
      </SegmentedControl>
    </div>
  );
}

function MenuRadioFixture({
  initial = 'newest',
  described = false,
  disabledOption,
}: {
  initial?: string;
  described?: boolean;
  disabledOption?: 'oldest';
}) {
  const [value, setValue] = useState<string | undefined>(initial || undefined);
  return (
    <DropdownMenu button={{label: 'Sort options'}}>
      <DropdownMenuRadioGroup
        value={value}
        onChange={setValue}
        label="Sort by"
        hasCloseOnSelect={false}>
        <DropdownMenuRadioItem value="newest" label="Newest" />
        <DropdownMenuRadioItem
          value="oldest"
          label="Oldest"
          description={described ? 'Oldest items first' : undefined}
          isDisabled={disabledOption === 'oldest'}
        />
        <DropdownMenuRadioItem value="popular" label="Most viewed" />
      </DropdownMenuRadioGroup>
    </DropdownMenu>
  );
}

export type RadioGroupStateRender = () => ReactElement;

export const RADIO_GROUP_STATE_RENDERS: Record<
  RadioGroupStateId,
  RadioGroupStateRender
> = {
  'radio-list-group-selected-ltr': () => <RadioListFixture />,
  'radio-list-group-selected-rtl': () => <RadioListFixture direction="rtl" />,
  'radio-list-group-selected-vertical': () => (
    <RadioListFixture orientation="vertical" />
  ),
  'radio-list-group-none-selected': () => (
    <RadioListFixture initial="" orientation="vertical" />
  ),
  'radio-list-group-required-invalid-described': () => (
    <RadioListFixture
      initial=""
      orientation="vertical"
      description="Choose a delivery speed."
      isRequired
      isInvalid
    />
  ),
  'radio-list-group-disabled-with-message': () => (
    <RadioListFixture
      isDisabled
      disabledMessage="Managed by your administrator"
      orientation="vertical"
    />
  ),
  'radio-list-option-unselected-described': () => (
    <RadioListFixture
      initial="express"
      description="Choose a delivery speed."
    />
  ),
  'radio-list-option-selected': () => <RadioListFixture />,
  'radio-list-option-disabled': () => (
    <RadioListFixture disabledOption="express" />
  ),
  'radio-list-option-group-disabled': () => (
    <RadioListFixture isDisabled orientation="vertical" />
  ),
  'radio-list-option-disabled-with-message': () => (
    <RadioListFixture
      isDisabled
      disabledMessage="Managed by your administrator"
      orientation="vertical"
    />
  ),

  'segmented-group-selected-ltr': () => <SegmentedFixture />,
  'segmented-group-selected-rtl': () => <SegmentedFixture direction="rtl" />,
  'segmented-group-none-selected': () => (
    <SegmentedFixture initial="not-an-option" />
  ),
  'segmented-group-disabled': () => <SegmentedFixture isDisabled />,
  'segmented-group-disabled-with-message': () => (
    <SegmentedFixture
      isDisabled
      disabledMessage="Choose a project to switch views"
    />
  ),
  'segmented-option-unselected': () => <SegmentedFixture />,
  'segmented-option-selected-hidden-label': () => (
    <SegmentedFixture hideSelectedLabel />
  ),
  'segmented-option-disabled': () => <SegmentedFixture disabledOption="grid" />,
  'segmented-option-group-disabled': () => <SegmentedFixture isDisabled />,
  'segmented-option-group-disabled-with-message': () => (
    <SegmentedFixture
      isDisabled
      disabledMessage="Choose a project to switch views"
    />
  ),

  'menu-group-selected': () => <MenuRadioFixture />,
  'menu-group-none-selected': () => <MenuRadioFixture initial="" />,
  'menu-option-unselected-described': () => <MenuRadioFixture described />,
  'menu-option-selected': () => <MenuRadioFixture />,
  'menu-option-disabled': () => <MenuRadioFixture disabledOption="oldest" />,
};
