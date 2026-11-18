// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferListSelector.stories.tsx
 * @input TransferListSelector option data and commit behavior
 * @output Storybook examples for the popover-backed immediate and staged selectors
 * @position Lab Storybook documentation and visual validation
 *
 * Covers the selector wrapper only. The TransferList primitive it hosts has its
 * own story file: a Storybook title maps to exactly one component, and the
 * accessibility audit resolves the component it audits from that title, so a
 * primitive documented under the wrapper's title is invisible to the gate.
 *
 * SYNC: When selector commit behavior changes, update source, docs, and tests.
 */

import {useMemo, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {createReorderable} from '@astryxdesign/core';
import {TransferListSelector} from '@astryxdesign/lab';
import type {TransferListOption, TransferListProps} from '@astryxdesign/lab';

const meta: Meta<typeof TransferListSelector> = {
  title: 'Lab/TransferListSelector',
  component: TransferListSelector,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div
        style={{
          width: 'min(900px, calc(100vw - 64px))',
          minHeight: 480,
        }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const BASIC_OPTIONS: ReadonlyArray<TransferListOption<string>> = [
  {
    value: 'name',
    label: 'Name',
    description: 'Primary display name for the record',
  },
  {
    value: 'owner',
    label: 'Owner',
    description: 'Person responsible for the record',
  },
  {
    value: 'status',
    label: 'Status',
    description: 'Current workflow state',
  },
  {
    value: 'priority',
    label: 'Priority',
    description: 'Relative urgency',
  },
  {
    value: 'team',
    label: 'Team',
    description: 'Owning team',
  },
  {
    value: 'updated',
    label: 'Last updated',
    description: 'Most recent change time',
  },
  {
    value: 'created',
    label: 'Created',
    description: 'Original creation time',
  },
];

const BASIC_DESCRIPTION =
  'Choose which fields appear. Changes take effect immediately, and drag reorder commits on release.';

const BASIC_TRANSFER_LIST_PROPS = {
  label: 'Visible fields',
  options: BASIC_OPTIONS,
  selectedLabel: 'Visible fields',
  availableLabel: 'Available fields',
  hasSelectAll: true,
  hasClear: true,
} satisfies Omit<TransferListProps<string>, 'value' | 'onChange'>;

/** The owner's reorder: each move lands in `setValue`'s value where reported. */
function useMoveReorderable<T extends string>(
  setValue: (update: (value: readonly T[]) => readonly T[]) => void,
  isReorderable?: (value: T) => boolean,
) {
  return useMemo(
    () =>
      createReorderable<T>({
        onReorder: ({key, to}) =>
          setValue(current => {
            const next = current.filter(item => item !== key);
            next.splice(to, 0, key);
            return next;
          }),
        isReorderable,
      }),
    [setValue, isReorderable],
  );
}

function DefaultExample() {
  const defaults = ['name', 'owner', 'status'];
  const [value, setValue] = useState<readonly string[]>(defaults);
  const reorderable = useMoveReorderable(setValue);
  return (
    <TransferListSelector
      {...BASIC_TRANSFER_LIST_PROPS}
      description={BASIC_DESCRIPTION}
      value={value}
      onChange={setValue}
      reorderable={reorderable}
      triggerLabel={`${value.length} visible fields`}
    />
  );
}

export const Default: Story = {
  render: () => <DefaultExample />,
};

function StagedChangesExample() {
  const defaults = ['name', 'owner', 'status'];
  const [value, setValue] = useState<readonly string[]>(defaults);
  // Staged: the selector moves its draft, and Apply commits it.
  const stagedReorderable = useMoveReorderable(setValue);
  return (
    <TransferListSelector
      {...BASIC_TRANSFER_LIST_PROPS}
      description="Review the complete field selection before applying it."
      value={value}
      onChange={setValue}
      reorderable={stagedReorderable}
      commitBehavior="staged"
      triggerLabel={`${value.length} visible fields`}
    />
  );
}

export const StagedChanges: Story = {
  render: () => <StagedChangesExample />,
};

const GROUPED_OPTIONS: ReadonlyArray<TransferListOption<string>> = [
  {
    value: 'name',
    label: 'Name',
    description: 'Required identity field',
    group: 'Identity',
    isTransferDisabled: true,
    disabledMessage: 'Name is required and fixed in position.',
  },
  {
    value: 'owner',
    label: 'Owner',
    description: 'Person responsible for the work',
    group: 'Identity',
    isTransferDisabled: true,
    disabledMessage: 'Owner must remain visible but can be reordered.',
  },
  {
    value: 'team',
    label: 'Team',
    description: 'Owning team',
    group: 'Identity',
  },
  {
    value: 'status',
    label: 'Status',
    description: 'Current workflow state',
    group: 'Planning',
  },
  {
    value: 'priority',
    label: 'Priority',
    description: 'Relative urgency',
    group: 'Planning',
  },
  {
    value: 'due',
    label: 'Due date',
    description: 'Planned completion date',
    group: 'Planning',
  },
  {
    value: 'updated',
    label: 'Last updated',
    description: 'Most recent change time',
    group: 'Activity',
  },
  {
    value: 'created',
    label: 'Created',
    description: 'Original creation time',
    group: 'Activity',
  },
];

const isMovableField = (field: string) =>
  field !== 'name' && field !== 'status';

function GroupedAndLockedExample() {
  const defaults = ['name', 'owner', 'status', 'updated'];
  const [value, setValue] = useState<readonly string[]>(defaults);
  const reorderable = useMoveReorderable(setValue, isMovableField);

  return (
    <TransferListSelector
      label="Record fields"
      description="Fields are grouped by purpose. Removal and reordering constraints can be applied independently."
      options={GROUPED_OPTIONS}
      value={value}
      onChange={setValue}
      // Name and Status keep their place.
      reorderable={reorderable}
      selectedLabel="Shown"
      availableLabel="Hidden"
      hasSelectAll
      hasClear
      triggerLabel={`${value.length} shown fields`}
    />
  );
}

export const GroupedAndLocked: Story = {
  render: () => <GroupedAndLockedExample />,
};

function UnorderedExample() {
  const [value, setValue] = useState<readonly string[]>([
    'status',
    'priority',
    'team',
  ]);

  return (
    <TransferListSelector
      label="Included filters"
      description="Use an unordered transfer list when selection matters but display order does not."
      options={BASIC_OPTIONS}
      value={value}
      onChange={setValue}
      selectedLabel="Included"
      availableLabel="Not included"
      hasSelectAll
      hasClear
      triggerLabel={`${value.length} included filters`}
    />
  );
}

export const Unordered: Story = {
  render: () => <UnorderedExample />,
};

function NarrowContainerExample() {
  const [value, setValue] = useState<readonly string[]>([
    'name',
    'owner',
    'status',
  ]);
  return (
    <TransferListSelector
      label="Mobile field settings"
      description="The two panels stack when horizontal space is limited."
      options={BASIC_OPTIONS}
      value={value}
      onChange={setValue}
      triggerLabel={`${value.length} visible fields`}
      width="min(360px, calc(100vw - 32px))"
      placement="below"
      selectedLabel="Visible"
      availableLabel="Available"
      hasSelectAll
      hasClear
    />
  );
}

export const NarrowContainer: Story = {
  render: () => <NarrowContainerExample />,
};

const LARGE_POOL_OPTIONS: ReadonlyArray<TransferListOption<string>> =
  Array.from({length: 200}, (_, index) => {
    const number = index + 1;
    return {
      value: `field-${number}`,
      label: `Field ${String(number).padStart(3, '0')}`,
      description: `Configurable field ${number}`,
      group: `Group ${Math.floor(index / 40) + 1}`,
    };
  });

function LargePoolExample() {
  const [value, setValue] = useState<readonly string[]>(
    LARGE_POOL_OPTIONS.slice(0, 12).map(option => option.value),
  );

  return (
    <TransferListSelector
      label="Report fields"
      description="Search a pool of 200 options while preserving the chosen display order."
      options={LARGE_POOL_OPTIONS}
      value={value}
      onChange={setValue}
      selectedLabel="In report"
      availableLabel="Available"
      hasSearch
      searchPlaceholder="Search 200 fields"
      hasSelectAll
      hasClear
      triggerLabel={`${value.length} report fields`}
    />
  );
}

export const LargePool: Story = {
  render: () => <LargePoolExample />,
};
