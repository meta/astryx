// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useId, useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {useAnnounce} from '@astryxdesign/core/hooks';
import {Item} from '@astryxdesign/core/Item';
import {VStack} from '@astryxdesign/core/Layout';
import {useCombobox} from '@astryxdesign/core/Selector';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';

type Teammate = {value: string; label: string; disabled?: boolean};

const TEAMMATES: Teammate[] = [
  {value: 'ada', label: 'Ada Lovelace'},
  {value: 'alan', label: 'Alan Turing'},
  {value: 'grace', label: 'Grace Hopper (away)', disabled: true},
  {value: 'katherine', label: 'Katherine Johnson'},
  {value: 'margaret', label: 'Margaret Hamilton'},
];

function matching(query: string): Teammate[] {
  const needle = query.trim().toLowerCase();
  return TEAMMATES.filter(teammate =>
    teammate.label.toLowerCase().includes(needle),
  );
}

export default function UseComboboxHookUsage() {
  const listboxId = useId();
  const announce = useAnnounce({hasReplace: true});
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [assignee, setAssignee] = useState<string>();
  const options = matching(query);

  const combobox = useCombobox({
    selectableItems: options,
    isOpen,
    onOpen: () => setIsOpen(true),
    onClose: () => setIsOpen(false),
    onSelect: value => {
      setAssignee(TEAMMATES.find(teammate => teammate.value === value)?.label);
      setQuery('');
    },
    listboxId,
  });

  return (
    <Card width={320} padding={4}>
      <VStack gap={2}>
        <TextInput
          label="Assign to"
          value={query}
          onChange={next => {
            const matches = matching(next);
            setQuery(next);
            setIsOpen(true);
            // A new query makes its first enabled match active, so Enter
            // picks it.
            combobox.setHighlightedIndex(
              matches.findIndex(teammate => !teammate.disabled),
            );
            if (next.trim() !== query.trim()) {
              announce(
                matches.length === 0
                  ? 'No one matches'
                  : matches.length === 1
                    ? '1 teammate'
                    : `${matches.length} teammates`,
              );
            }
          }}
          onBlur={() => {
            setIsOpen(false);
            combobox.setHighlightedIndex(-1);
          }}
          {...combobox.getFieldProps()}
        />
        {isOpen && options.length > 0 ? (
          <VStack
            as="ul"
            gap={0}
            aria-label="Teammates"
            {...combobox.getListboxProps()}>
            {options.map((teammate, index) => (
              <Item
                key={teammate.value}
                as="li"
                density="compact"
                label={teammate.label}
                isHighlighted={index === combobox.highlightedIndex}
                // Item writes aria-selected from isSelected, so the active
                // option has to be passed here to keep aria-selected="true".
                isSelected={index === combobox.highlightedIndex}
                isDisabled={teammate.disabled}
                {...combobox.getOptionProps(index)}
              />
            ))}
          </VStack>
        ) : null}
        {isOpen && options.length === 0 ? (
          <Text type="supporting">No one matches</Text>
        ) : null}
        <Text type="supporting">
          {assignee == null ? 'Unassigned' : `Assigned to ${assignee}`}
        </Text>
      </VStack>
    </Card>
  );
}
