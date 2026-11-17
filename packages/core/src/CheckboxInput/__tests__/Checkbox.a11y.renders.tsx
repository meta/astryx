// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Checkbox.a11y.renders.tsx
 * @input Uses every current checkbox-bearing Astryx component and the state-id
 *   union from Checkbox.a11y.states.ts
 * @output CHECKBOX_STATE_RENDERS — one consumer-realistic rendering per inventory
 *   row, shared by jsdom and checked-in Storybook stories.
 * @position Binding fixture layer. Component-specific callbacks and form behavior
 *   remain in their local suites.
 */

import {useState, type ReactElement, type ReactNode} from 'react';
import {CheckboxInput} from '../CheckboxInput';
import {CheckboxList, CheckboxListItem} from '../../CheckboxList';
import {DropdownMenu, DropdownMenuCheckboxItem} from '../../DropdownMenu';
import {FormLayout} from '../../FormLayout';
import {List} from '../../List';
import {SelectableCard} from '../../SelectableCard';
import type {CheckboxStateId} from './Checkbox.a11y.states';

function VisibleLabel({children}: {children: ReactNode}) {
  return <span data-a11y-visible-label>{children}</span>;
}

function ControlledInput({
  initial,
  hasChangeHandler = true,
  ...props
}: {
  initial: boolean | 'indeterminate';
  hasChangeHandler?: boolean;
  label: string;
  description?: string;
  isLabelHidden?: boolean;
  isDisabled?: boolean;
  disabledMessage?: string;
  isLoading?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  status?: {type: 'error' | 'warning' | 'success'; message: string};
}) {
  const [value, setValue] = useState<boolean | 'indeterminate'>(initial);
  return (
    <CheckboxInput
      {...props}
      value={value}
      onChange={hasChangeHandler ? setValue : undefined}
    />
  );
}

function UnderRequiredDefaultInput() {
  return (
    <FormLayout defaultOptionality="required">
      <ControlledInput initial={false} label="Marketing consent" />
    </FormLayout>
  );
}

function StandaloneListItem({
  initial,
  label,
  description,
  isDisabled,
  isLoading,
  plainLabel = false,
  omitAriaLabel = false,
}: {
  initial: boolean | 'indeterminate';
  label: string;
  description?: ReactNode;
  isDisabled?: boolean;
  isLoading?: boolean;
  plainLabel?: boolean;
  omitAriaLabel?: boolean;
}) {
  const [checked, setChecked] = useState<boolean | 'indeterminate'>(initial);
  return (
    <List>
      <CheckboxListItem
        data-a11y-visible-label={plainLabel || undefined}
        label={plainLabel ? label : <VisibleLabel>{label}</VisibleLabel>}
        aria-label={plainLabel || omitAriaLabel ? undefined : label}
        description={description}
        isChecked={checked}
        onCheck={setChecked}
        isDisabled={isDisabled}
        isLoading={isLoading}
      />
    </List>
  );
}

function CollectionListItem({initial}: {initial: boolean}) {
  const [value, setValue] = useState<string[]>(initial ? ['email'] : []);
  return (
    <CheckboxList
      label="Notification methods"
      value={value}
      onChange={setValue}>
      <CheckboxListItem
        label={<VisibleLabel>Email</VisibleLabel>}
        aria-label="Email"
        value="email"
      />
    </CheckboxList>
  );
}

function ReadOnlyCollectionListItem() {
  return (
    <CheckboxList label="Notification methods" value={['email']} isReadOnly>
      <CheckboxListItem data-a11y-visible-label label="Email" value="email" />
    </CheckboxList>
  );
}

function HandlerlessListItem() {
  return (
    <List>
      <CheckboxListItem
        data-a11y-visible-label
        label="Completed task"
        isChecked
      />
    </List>
  );
}

function GroupDisabledListItem() {
  return (
    <CheckboxList
      label="Notification methods"
      value={['email']}
      onChange={() => {}}
      isDisabled
      disabledMessage="Managed by your administrator">
      <CheckboxListItem
        label={<VisibleLabel>Email</VisibleLabel>}
        aria-label="Email"
        value="email"
      />
    </CheckboxList>
  );
}

function MenuCheckbox({
  initial,
  isDisabled = false,
  description,
  hasChangeHandler = true,
}: {
  initial: boolean;
  isDisabled?: boolean;
  description?: ReactNode;
  hasChangeHandler?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DropdownMenu button={{label: 'View options'}}>
      <DropdownMenuCheckboxItem
        label="Show archived"
        description={description}
        value={value}
        onChange={hasChangeHandler ? setValue : undefined}
        isDisabled={isDisabled}
      />
    </DropdownMenu>
  );
}

function ControlledCard({
  initial,
  isDisabled = false,
}: {
  initial: boolean;
  isDisabled?: boolean;
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <SelectableCard
      data-a11y-pointer-target
      label="Analytics"
      isSelected={selected}
      onChange={setSelected}
      isDisabled={isDisabled}>
      <VisibleLabel>Analytics</VisibleLabel>
    </SelectableCard>
  );
}

export type CheckboxStateRender = () => ReactElement;

export const CHECKBOX_STATE_RENDERS: Record<
  CheckboxStateId,
  CheckboxStateRender
> = {
  'input-unchecked': () => (
    <ControlledInput initial={false} label="Email notifications" />
  ),
  'input-checked': () => (
    <ControlledInput initial={true} label="Email notifications" />
  ),
  'input-mixed': () => (
    <ControlledInput initial="indeterminate" label="Select all notifications" />
  ),
  'input-described': () => (
    <ControlledInput
      initial={false}
      label="Share usage data"
      description="Help improve the product"
    />
  ),
  'input-hidden-label': () => (
    <ControlledInput initial={false} label="Select row" isLabelHidden />
  ),
  'input-disabled': () => (
    <ControlledInput initial={false} label="Managed setting" isDisabled />
  ),
  'input-disabled-with-message': () => (
    <ControlledInput
      initial={false}
      label="Managed setting"
      isDisabled
      disabledMessage="Managed by your administrator"
    />
  ),
  'input-loading': () => (
    <ControlledInput initial={false} label="Email notifications" isLoading />
  ),
  'input-read-only': () => (
    <ControlledInput initial={true} label="Policy acknowledged" isReadOnly />
  ),
  'input-handlerless-read-only': () => (
    <ControlledInput
      initial={true}
      label="Policy acknowledged"
      hasChangeHandler={false}
    />
  ),
  'input-required': () => (
    <ControlledInput initial={false} label="Accept terms" isRequired />
  ),
  'input-under-required-default': () => <UnderRequiredDefaultInput />,
  'input-invalid': () => (
    <ControlledInput
      initial={false}
      label="Accept terms"
      status={{type: 'error', message: 'You must accept the terms'}}
    />
  ),
  'input-warning': () => (
    <ControlledInput
      initial={false}
      label="Enable sharing"
      status={{type: 'warning', message: 'This setting affects all workspaces'}}
    />
  ),
  'input-success': () => (
    <ControlledInput
      initial={true}
      label="Email notifications"
      status={{type: 'success', message: 'Preference saved'}}
    />
  ),

  'list-item-unchecked': () => (
    <StandaloneListItem initial={false} label="Email" plainLabel />
  ),
  'list-item-checked': () => <CollectionListItem initial />,
  'list-item-mixed': () => (
    <StandaloneListItem initial="indeterminate" label="Select all" />
  ),
  'list-item-described': () => (
    <StandaloneListItem
      initial={false}
      label="Email"
      description="Receive notifications by email"
    />
  ),
  'list-item-rich-label-visible-name': () => (
    <StandaloneListItem initial={false} label="Pro plan" omitAriaLabel />
  ),
  'list-item-disabled': () => (
    <StandaloneListItem initial={false} label="SMS" isDisabled />
  ),
  'list-item-loading': () => (
    <StandaloneListItem initial={false} label="Push notifications" isLoading />
  ),
  'list-item-read-only': () => <ReadOnlyCollectionListItem />,
  'list-item-handlerless-read-only': () => <HandlerlessListItem />,
  'list-item-group-disabled-with-message': () => <GroupDisabledListItem />,

  'menu-item-unchecked': () => <MenuCheckbox initial={false} />,
  'menu-item-checked': () => <MenuCheckbox initial />,
  'menu-item-described': () => (
    <MenuCheckbox initial={false} description="Include unpublished items" />
  ),
  'menu-item-handlerless-inert': () => (
    <MenuCheckbox initial={false} hasChangeHandler={false} />
  ),
  'menu-item-disabled': () => <MenuCheckbox initial={false} isDisabled />,

  'card-unchecked': () => <ControlledCard initial={false} />,
  'card-checked': () => <ControlledCard initial />,
  'card-disabled': () => <ControlledCard initial={false} isDisabled />,
};
