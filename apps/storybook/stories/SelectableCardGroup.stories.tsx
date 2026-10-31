// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {
  SelectableCardGroup,
  SelectableCardGroupItem,
} from '@astryxdesign/lab/SelectableCardGroup';

const meta: Meta<typeof SelectableCardGroup> = {
  title: 'Lab/SelectableCardGroup',
  component: SelectableCardGroup,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A set of selectable cards with the semantics of its selection. One choice is a radio group (one tab stop, arrow keys, "2 of 3" spoken); several are a group of checkboxes.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof SelectableCardGroup>;

const PLANS = [
  {id: 'basic', name: 'Basic', price: '$9/mo'},
  {id: 'pro', name: 'Pro', price: '$29/mo'},
  {id: 'team', name: 'Team', price: '$99/mo'},
];

function PlanContent({name, price}: {name: string; price: string}) {
  return (
    <VStack gap={1}>
      <Text type="body" weight="bold">
        {name}
      </Text>
      <Text type="supporting" color="secondary">
        {price}
      </Text>
    </VStack>
  );
}

export const SingleChoice: Story = {
  name: 'Single choice (radio group)',
  render: () => {
    const [plan, setPlan] = useState<string | null>('basic');
    return (
      <SelectableCardGroup
        label="Plan"
        description="Billed monthly"
        value={plan}
        onChange={setPlan}>
        {PLANS.map(p => (
          <SelectableCardGroupItem
            key={p.id}
            value={p.id}
            label={p.name}
            width={160}>
            <PlanContent name={p.name} price={p.price} />
          </SelectableCardGroupItem>
        ))}
      </SelectableCardGroup>
    );
  },
};

export const MultipleChoice: Story = {
  name: 'Multiple choice (checkboxes)',
  render: () => {
    const [addOns, setAddOns] = useState<string[]>(['pro']);
    return (
      <SelectableCardGroup
        label="Add-ons"
        selectionMode="multiple"
        value={addOns}
        onChange={setAddOns}>
        {PLANS.map(p => (
          <SelectableCardGroupItem
            key={p.id}
            value={p.id}
            label={p.name}
            width={160}>
            <PlanContent name={p.name} price={p.price} />
          </SelectableCardGroupItem>
        ))}
      </SelectableCardGroup>
    );
  },
};

export const Vertical: Story = {
  render: () => {
    const [plan, setPlan] = useState<string | null>(null);
    return (
      <SelectableCardGroup
        label="Plan"
        orientation="vertical"
        value={plan}
        onChange={setPlan}>
        {PLANS.map(p => (
          <SelectableCardGroupItem
            key={p.id}
            value={p.id}
            label={p.name}
            maxWidth={320}>
            <PlanContent name={p.name} price={p.price} />
          </SelectableCardGroupItem>
        ))}
      </SelectableCardGroup>
    );
  },
};

export const Disabled: Story = {
  render: () => (
    <SelectableCardGroup
      label="Plan"
      value="pro"
      isDisabled
      onChange={() => {}}>
      {PLANS.map(p => (
        <SelectableCardGroupItem
          key={p.id}
          value={p.id}
          label={p.name}
          width={160}>
          <PlanContent name={p.name} price={p.price} />
        </SelectableCardGroupItem>
      ))}
    </SelectableCardGroup>
  ),
};
