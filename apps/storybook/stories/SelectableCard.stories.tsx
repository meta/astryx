// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Text} from '@astryxdesign/core/Text';
import {HStack, VStack} from '@astryxdesign/core/Layout';

const meta: Meta<typeof SelectableCard> = {
  title: 'Core/SelectableCard',
  component: SelectableCard,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'default',
        'transparent',
        'muted',
        'blue',
        'cyan',
        'gray',
        'green',
        'orange',
        'pink',
        'purple',
        'red',
        'teal',
        'yellow',
      ],
    },
    elevation: {
      control: 'inline-radio',
      options: ['none', 'low', 'med', 'high'],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          'A card that toggles between selected and unselected states. ' +
          'Shows an accent border when selected. Manage selection state externally: ' +
          'single value for radio behavior, Set for multi-select.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof SelectableCard>;

export const SingleSelect: Story = {
  name: 'Single Select (Radio)',
  render: () => {
    const [selected, setSelected] = useState<string | null>('basic');
    const plans = [
      {id: 'basic', name: 'Basic', price: '$9/mo'},
      {id: 'pro', name: 'Pro', price: '$29/mo'},
      {id: 'enterprise', name: 'Enterprise', price: '$99/mo'},
    ];

    return (
      <HStack gap={3}>
        {plans.map(plan => (
          <SelectableCard
            key={plan.id}
            label={plan.name}
            isSelected={selected === plan.id}
            onChange={() => setSelected(plan.id)}
            width={200}>
            <VStack gap={1}>
              <Text type="body" weight="bold">
                {plan.name}
              </Text>
              <Text type="supporting" color="secondary">
                {plan.price}
              </Text>
            </VStack>
          </SelectableCard>
        ))}
      </HStack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Radio-style selection: track a single selected ID in state. Clicking a card sets it as selected, deselecting the previous.',
      },
    },
  },
};

export const MultiSelect: Story = {
  name: 'Multi-Select (Checkbox)',
  render: () => {
    const [selected, setSelected] = useState(new Set(['react']));
    const filters = [
      {id: 'react', name: 'React'},
      {id: 'vue', name: 'Vue'},
      {id: 'angular', name: 'Angular'},
      {id: 'svelte', name: 'Svelte'},
    ];

    return (
      <HStack gap={3}>
        {filters.map(f => (
          <SelectableCard
            key={f.id}
            label={f.name}
            isSelected={selected.has(f.id)}
            onChange={isNow => {
              setSelected(prev => {
                const next = new Set(prev);
                if (isNow) {
                  next.add(f.id);
                } else {
                  next.delete(f.id);
                }
                return next;
              });
            }}
            width={150}>
            <Text type="body" weight="bold">
              {f.name}
            </Text>
          </SelectableCard>
        ))}
      </HStack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Checkbox-style selection: track selected IDs in a Set. Multiple cards can be selected simultaneously.',
      },
    },
  },
};

export const ColorVariants: Story = {
  name: 'Color Variants',
  render: () => {
    const [selected, setSelected] = useState(new Set(['blue', 'purple']));
    const variants = [
      'default',
      'muted',
      'blue',
      'cyan',
      'gray',
      'green',
      'orange',
      'pink',
      'purple',
      'red',
      'teal',
      'yellow',
    ] as const;

    return (
      <HStack gap={3} wrap="wrap">
        {variants.map(v => (
          <SelectableCard
            key={v}
            label={v}
            isSelected={selected.has(v)}
            onChange={isNow => {
              setSelected(prev => {
                const next = new Set(prev);
                if (isNow) {
                  next.add(v);
                } else {
                  next.delete(v);
                }
                return next;
              });
            }}
            variant={v}
            width={140}>
            <Text type="body" weight="bold">
              {v}
            </Text>
          </SelectableCard>
        ))}
      </HStack>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'All color variants with selection. The accent border overlays the variant background.',
      },
    },
  },
};

export const Disabled: Story = {
  render: () => (
    <HStack gap={3}>
      <SelectableCard
        label="Enabled"
        isSelected={true}
        onChange={() => {}}
        width={200}>
        <Text type="body" weight="bold">
          Selected & Enabled
        </Text>
      </SelectableCard>
      <SelectableCard
        label="Disabled"
        isSelected={true}
        onChange={() => {}}
        isDisabled
        width={200}>
        <Text type="body" weight="bold">
          Selected & Disabled
        </Text>
      </SelectableCard>
      <SelectableCard
        label="Disabled unselected"
        isSelected={false}
        onChange={() => {}}
        isDisabled
        width={200}>
        <Text type="body" weight="bold">
          Unselected & Disabled
        </Text>
      </SelectableCard>
    </HStack>
  ),
  parameters: {
    docs: {
      description: {
        story:
          '`isDisabled` suppresses toggle and hover; the control remains focusable and exposes aria-disabled. Accent border remains visible on disabled+selected cards.',
      },
    },
  },
};
