// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Controlled team allocation records
 * @output A ListInput pairing a team Selector with a fixed-width percentage
 *   NumberInput, checking that teams are unique and the total is 100%
 * @position Copyable Lab ListInput example
 */

import {useState} from 'react';
import {VStack} from '@astryxdesign/core/Layout';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Selector} from '@astryxdesign/core/Selector';
import {pixel, proportional} from '@astryxdesign/core/Table';
import {ListInput, type ListInputColumn} from '@astryxdesign/lab';

type Allocation = {id: string; team: string; percent: number | null};

const TEAM_OPTIONS = [
  {value: 'design', label: 'Design'},
  {value: 'engineering', label: 'Engineering'},
  {value: 'marketing', label: 'Marketing'},
  {value: 'operations', label: 'Operations'},
];

const COLUMNS: ListInputColumn<Allocation>[] = [
  {
    key: 'team',
    header: 'Team',
    width: proportional(2, {minWidth: 180}),
    renderInput: ({
      item,
      label,
      isLabelHidden,
      status,
      statusVariant,
      isDisabled,
      isLoading,
      updateItem,
    }) => (
      <Selector
        label={label}
        isLabelHidden={isLabelHidden}
        options={TEAM_OPTIONS}
        value={item.team}
        placeholder="Choose a team"
        onChange={team => updateItem({...item, team}, 'team')}
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled || isLoading}
      />
    ),
  },
  {
    key: 'percent',
    header: 'Allocation',
    width: pixel(132),
    renderInput: ({
      item,
      label,
      isLabelHidden,
      status,
      statusVariant,
      isDisabled,
      isLoading,
      updateItem,
    }) => (
      <NumberInput
        label={label}
        isLabelHidden={isLabelHidden}
        value={item.percent}
        onChange={percent => updateItem({...item, percent}, 'percent')}
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled || isLoading}
        min={0}
        max={100}
        units="%"
        isIntegerOnly
      />
    ),
  },
];

export default function ListInputBudgetAllocation() {
  const [allocations, setAllocations] = useState<Allocation[]>([
    {id: 'design', team: 'design', percent: 35},
    {id: 'engineering', team: 'engineering', percent: 40},
    {id: 'marketing', team: 'marketing', percent: 15},
  ]);
  const total = allocations.reduce(
    (sum, allocation) => sum + (allocation.percent ?? 0),
    0,
  );

  return (
    <VStack width={680} maxWidth="100%">
      <ListInput<Allocation>
        label="Quarterly budget allocation"
        description="Assign each team once. The percentages must total 100%."
        value={allocations}
        onChange={setAllocations}
        getItemKey={allocation => allocation.id}
        createItem={() => ({id: crypto.randomUUID(), team: '', percent: null})}
        columns={COLUMNS}
        itemName="allocation"
        isRequired
        maxItems={4}
        status={
          total === 100
            ? undefined
            : {
                type: 'error',
                message: `Allocations must total 100%. Current total: ${total}%.`,
              }
        }
        getItemStatus={allocation =>
          allocation.team !== '' &&
          allocations.some(
            candidate =>
              candidate.id !== allocation.id &&
              candidate.team === allocation.team,
          )
            ? {type: 'error', message: 'Each team can only appear once.'}
            : undefined
        }
      />
    </VStack>
  );
}
