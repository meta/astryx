// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Controlled tag records and blur-tracked fields
 * @output A reorderable ListInput of tag options with field, record, and list
 *   validation
 * @position Lab ListInput's docsite showcase and copyable CLI block
 */

import {useMemo, useState} from 'react';
import {VStack} from '@astryxdesign/core/Layout';
import {Selector} from '@astryxdesign/core/Selector';
import {proportional} from '@astryxdesign/core/Table';
import {TextInput} from '@astryxdesign/core/TextInput';
import {ListInput, type ListInputColumn} from '@astryxdesign/lab';

type TagOption = {id: string; color: string; label: string};

const COLOR_OPTIONS = [
  {value: 'blue', label: 'Blue'},
  {value: 'green', label: 'Green'},
  {value: 'amber', label: 'Amber'},
  {value: 'red', label: 'Red'},
  {value: 'purple', label: 'Purple'},
];

const INITIAL_TAGS: TagOption[] = [
  {id: 'tag-new', color: 'blue', label: 'New'},
  {id: 'tag-blocked', color: 'green', label: 'Blocked'},
  {id: 'tag-draft', color: 'amber', label: ''},
  {id: 'tag-review', color: 'purple', label: 'In review'},
];

export default function ListInputShowcase() {
  const [tags, setTags] = useState(INITIAL_TAGS);
  // Field errors wait until the field has been left once.
  const [touchedLabels, setTouchedLabels] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const columns = useMemo<ListInputColumn<TagOption>[]>(
    () => [
      {
        key: 'color',
        header: 'Color',
        width: proportional(1, {minWidth: 120}),
        renderInput: ({
          item,
          label,
          isLabelHidden,
          status,
          statusVariant,
          isDisabled,
          updateItem,
        }) => (
          <Selector
            label={label}
            isLabelHidden={isLabelHidden}
            options={COLOR_OPTIONS}
            value={item.color}
            onChange={color => updateItem({...item, color}, 'color')}
            status={status}
            statusVariant={statusVariant}
            isDisabled={isDisabled}
          />
        ),
      },
      {
        key: 'label',
        header: 'Label',
        width: proportional(2, {minWidth: 200}),
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
          <TextInput
            label={label}
            isLabelHidden={isLabelHidden}
            value={item.label}
            onChange={nextLabel =>
              updateItem({...item, label: nextLabel}, 'label')
            }
            onBlur={() =>
              setTouchedLabels(current =>
                current.has(item.id) ? current : new Set(current).add(item.id),
              )
            }
            status={status}
            statusVariant={statusVariant}
            isDisabled={isDisabled}
            isLoading={isLoading}
          />
        ),
      },
    ],
    [],
  );

  return (
    <VStack width={680} maxWidth="100%">
      <ListInput<TagOption>
        label="Tag options"
        description="Add at least five tags and drag rows to set their order."
        value={tags}
        onChange={setTags}
        getItemKey={tag => tag.id}
        createItem={() => ({id: crypto.randomUUID(), color: 'blue', label: ''})}
        columns={columns}
        itemName="tag"
        isReorderable
        status={
          tags.length < 5
            ? {type: 'error', message: 'Add at least five tag options.'}
            : undefined
        }
        getItemStatus={tag =>
          tag.color === 'green' && tag.label.trim().toLowerCase() === 'blocked'
            ? {type: 'error', message: `“${tag.label}” cannot use green.`}
            : undefined
        }
        getFieldStatus={(tag, columnKey) =>
          columnKey === 'label' &&
          touchedLabels.has(tag.id) &&
          tag.label.trim() === ''
            ? {type: 'error', message: 'Enter a label.'}
            : undefined
        }
      />
    </VStack>
  );
}
