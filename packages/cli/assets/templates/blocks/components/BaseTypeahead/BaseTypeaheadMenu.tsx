// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {BaseTypeahead, createStaticSource} from '@astryxdesign/core/Typeahead';
import type {
  BaseTypeaheadHandle,
  BaseTypeaheadMenu,
  SearchableItem,
} from '@astryxdesign/core/Typeahead';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Text} from '@astryxdesign/core/Text';
import {
  borderVars,
  colorVars,
  focusVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {FunnelIcon} from '@heroicons/react/24/outline';

type Field = SearchableItem & {values: string[]};

const fields: Field[] = [
  {id: 'status', label: 'Status', values: ['Open', 'In review', 'Closed']},
  {id: 'priority', label: 'Priority', values: ['High', 'Medium', 'Low']},
  {id: 'owner', label: 'Owner', values: ['Me', 'My team', 'Anyone']},
];

const source = createStaticSource<Field>(fields);

type Filter = {field: Field; value: string};

const styles = stylex.create({
  root: {
    width: '100%',
    maxWidth: 420,
  },
  // The ring follows the field's own input; the menu's dialog renders inside
  // this box and holds inputs of its own.
  field: {
    backgroundColor: colorVars['--color-background-surface'],
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-element'],
    borderStyle: 'solid',
    borderWidth: borderVars['--border-width'],
    paddingBlock: spacingVars['--spacing-1-5'],
    paddingInline: spacingVars['--spacing-2'],
    outlineColor: {
      default: 'transparent',
      ':has(> input:focus-visible)': focusVars['--focus-outline-color'],
    },
    outlineOffset: focusVars['--focus-outline-offset'],
    outlineStyle: 'solid',
    outlineWidth: {
      default: '0',
      ':has(> input:focus-visible)': focusVars['--focus-outline-width'],
    },
  },
  menuNote: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-3'],
  },
  editor: {
    padding: spacingVars['--spacing-3'],
    minWidth: 260,
  },
});

/**
 * A filter field built on BaseTypeahead's `menu`. Typing lists the fields
 * with a heading and a key hint around the list. Picking a field switches the
 * same menu to a dialog that edits its value; a filter's button reopens that
 * dialog, and Escape returns focus to the button.
 */
export default function BaseTypeaheadMenu() {
  const fieldRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef<BaseTypeaheadHandle>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [editing, setEditing] = useState<Filter | null>(null);
  const [draft, setDraft] = useState('');

  const edit = (filter: Filter) => {
    setEditing(filter);
    setDraft(filter.value);
    typeahead.current?.open();
  };

  const menu: BaseTypeaheadMenu =
    editing == null
      ? {
          role: 'listbox',
          render: ({listbox, query}) => (
            <>
              <Text
                type="supporting"
                color="secondary"
                xstyle={styles.menuNote}>
                {query === '' ? 'Filter by' : `Fields matching “${query}”`}
              </Text>
              {listbox}
              <Text
                type="supporting"
                color="secondary"
                xstyle={styles.menuNote}>
                Arrow keys move, Enter picks
              </Text>
            </>
          ),
        }
      : {
          role: 'dialog',
          label: `${editing.field.label} filter`,
          render: ({close}) => (
            <VStack gap={3} xstyle={styles.editor}>
              <RadioList
                label={editing.field.label}
                value={draft}
                onChange={setDraft}>
                {editing.field.values.map(value => (
                  <RadioListItem key={value} label={value} value={value} />
                ))}
              </RadioList>
              <HStack gap={2} hAlign="end">
                <Button label="Cancel" variant="secondary" onClick={close} />
                <Button
                  label="Apply"
                  variant="primary"
                  onClick={() => {
                    const next = {field: editing.field, value: draft};
                    setFilters(current => [
                      ...current.filter(f => f.field.id !== next.field.id),
                      next,
                    ]);
                    close();
                  }}
                />
              </HStack>
            </VStack>
          ),
        };

  return (
    <VStack gap={3} xstyle={styles.root}>
      <HStack ref={fieldRef} gap={2} vAlign="center" xstyle={styles.field}>
        <Icon icon={FunnelIcon} size="sm" color="secondary" />
        <BaseTypeahead<Field>
          aria-label="Add a filter"
          searchSource={source}
          value={null}
          onChange={field => {
            if (field != null) {
              // A field that already has a filter opens on its applied value.
              edit(
                filters.find(filter => filter.field.id === field.id) ?? {
                  field,
                  value: field.values[0],
                },
              );
            }
          }}
          onOpenChange={isOpen => {
            if (!isOpen) {
              setEditing(null);
            }
          }}
          handleRef={typeahead}
          menu={menu}
          anchorRef={fieldRef}
          placeholder="Add a filter…"
          hasEntriesOnFocus
          debounceMs={0}
        />
      </HStack>
      <HStack gap={2} wrap="wrap">
        {filters.length === 0 ? (
          <Text type="supporting" color="secondary">
            No filters
          </Text>
        ) : (
          filters.map(filter => (
            <Button
              key={filter.field.id}
              label={`${filter.field.label}: ${filter.value}`}
              variant="secondary"
              size="sm"
              onClick={() => edit(filter)}
            />
          ))
        )}
      </HStack>
    </VStack>
  );
}
