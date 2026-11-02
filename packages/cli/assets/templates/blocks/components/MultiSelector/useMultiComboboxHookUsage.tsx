// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useId, useRef, useState} from 'react';
import {CheckIcon} from '@heroicons/react/24/outline';
import {Card} from '@astryxdesign/core/Card';
import {Icon} from '@astryxdesign/core/Icon';
import {Item} from '@astryxdesign/core/Item';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {useMultiCombobox} from '@astryxdesign/core/MultiSelector';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Token} from '@astryxdesign/core/Token';

const LABELS = [
  {value: 'bug', label: 'Bug'},
  {value: 'docs', label: 'Documentation'},
  {value: 'a11y', label: 'Accessibility'},
  {value: 'perf', label: 'Performance'},
  {value: 'good-first-issue', label: 'Good first issue'},
];

function filterLabels(query: string) {
  const needle = query.trim().toLowerCase();
  return LABELS.filter(item => item.label.toLowerCase().includes(needle));
}

export default function UseMultiComboboxHookUsage() {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(['bug']);
  const matches = filterLabels(query);

  const toggle = (value: string) =>
    setSelected(current =>
      current.includes(value)
        ? current.filter(item => item !== value)
        : [...current, value],
    );

  const combobox = useMultiCombobox({
    selectableItems: matches,
    isOpen,
    hasSearch: true,
    onOpen: () => setIsOpen(true),
    onClose: () => setIsOpen(false),
    onToggle: toggle,
    listboxId,
  });

  return (
    <Card width={360} padding={4}>
      <VStack gap={2}>
        <HStack gap={1} wrap="wrap">
          {LABELS.filter(item => selected.includes(item.value)).map(item => (
            <Token
              key={item.value}
              label={item.label}
              // The removed token's button unmounts, so focus goes back to
              // the field instead of the page.
              onRemove={() => {
                toggle(item.value);
                inputRef.current?.focus();
              }}
            />
          ))}
        </HStack>
        <TextInput
          ref={inputRef}
          label="Labels"
          placeholder="Filter labels"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={combobox.activeDescendantId}
          value={query}
          onChange={nextQuery => {
            setQuery(nextQuery);
            setIsOpen(true);
            combobox.setHighlightedIndex(
              filterLabels(nextQuery).length > 0 ? 0 : -1,
            );
          }}
          onClick={combobox.onTriggerClick}
          onKeyDown={event => {
            // Home and End move the caret in a text field.
            if (event.key === 'Home' || event.key === 'End') {
              return;
            }
            combobox.onKeyDown(event);
          }}
          onBlur={() => {
            setIsOpen(false);
            combobox.setHighlightedIndex(-1);
          }}
        />
        {isOpen && (
          <VStack
            as="ul"
            gap={0}
            id={listboxId}
            role="listbox"
            aria-label="Labels"
            aria-multiselectable
            // Focus stays on the field when an option is pressed.
            onMouseDown={event => event.preventDefault()}>
            {matches.map((item, index) => (
              <Item
                key={item.value}
                as="li"
                id={combobox.getItemId(index)}
                role="option"
                // Selection is a check mark, so the highlight below stays the
                // only fill on the row and the active option is always visible.
                aria-checked={selected.includes(item.value)}
                density="compact"
                label={item.label}
                endContent={
                  selected.includes(item.value) && (
                    <Icon icon={CheckIcon} size="sm" />
                  )
                }
                isHighlighted={index === combobox.highlightedIndex}
                onClick={() => toggle(item.value)}
                // Highlight follows pointer movement: a list that opens under
                // a resting pointer keeps the active option the keys set.
                onMouseMove={() => combobox.onItemMouseEnter(item, index)}
              />
            ))}
          </VStack>
        )}
      </VStack>
    </Card>
  );
}
