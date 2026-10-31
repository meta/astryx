// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MobilePowerSearchValueEditor.tsx
 * @input OperatorValue, staged FilterValue, onChange, label, timezoneID;
 *   public @astryxdesign/core inputs (Calendar, DateTimeInput, EmptyState,
 *   Icon, List, NumberInput, TextInput, TimeInput, Typeahead, VisuallyHidden)
 * @output Sheet-native value editor for MobilePowerSearch: enum, enum_list and
 *   date_relative as full-row List choices with persistent radio or checkbox
 *   indicators; string_list and entity_list as inline searchable checkbox
 *   rows; every other non-nested value type as the matching public input
 * @position Lab sub-component consumed by MobilePowerSearch.tsx
 *
 * Core's PowerSearchValueEditor is private, so this file rebuilds each editor
 * from public inputs. Closed vocabularies render as rows, open lists keep their
 * search and selectable results inline, and date-only values use an inline
 * Calendar. Every editor stages its value; the sheet footer confirms it.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Calendar, type DateRange} from '@astryxdesign/core/Calendar';
import {DateTimeInput} from '@astryxdesign/core/DateTimeInput';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import {CheckboxIndicator, RadioIndicator} from '@astryxdesign/core/Indicator';
import {List, ListItem} from '@astryxdesign/core/List';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import type {
  DateTimeRangePart,
  FilterValue,
  OperatorValue,
  PowerSearchEntity,
} from '@astryxdesign/core/PowerSearch';
import {TextInput} from '@astryxdesign/core/TextInput';
import {TimeInput} from '@astryxdesign/core/TimeInput';
import {Typeahead} from '@astryxdesign/core/Typeahead';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';
import type {ISODateString, ISOTimeString} from '@astryxdesign/core/utils';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {
  isoDateTimeToUnixSeconds,
  isoDateToUnixSeconds,
  unixSecondsToISODate,
  unixSecondsToISODateTime,
} from './mobilePowerSearchUtils';

const styles = stylex.create({
  input: {
    paddingBlockStart: spacingVars['--spacing-1'],
  },
  inlineCalendar: {
    display: 'flex',
    justifyContent: 'center',
  },
  inlineSearch: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-3'],
  },
});

export interface MobilePowerSearchValueEditorProps {
  operatorValue: OperatorValue;
  filterValue: FilterValue | undefined;
  /** Stage a value without leaving the sheet. */
  onChange: (value: FilterValue) => void;
  /**
   * The field's name. Titles the sheet a list value's tokenizer opens, so it
   * reads as the field being edited.
   */
  label?: string;
  isDisabled?: boolean;
  /** Max suggestions in string and entity value typeaheads. */
  maxMenuItems?: number;
  /** IANA timezone used by date-only, date-time, and date-range editors. */
  timezoneID?: string;
}

const EMPTY_SOURCE: SearchSource<SearchableItem> = {
  search: () => [],
  bootstrap: () => [],
};

// =============================================================================
// Choice rows (enum, enum_list, date_relative)
// =============================================================================

interface ChoiceItem {
  readonly value: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
}

function ChoiceRows({
  items,
  selected,
  selectionMode,
  isDisabled,
  onToggle,
}: {
  items: ReadonlyArray<ChoiceItem>;
  selected: ReadonlySet<string>;
  selectionMode: 'single' | 'multiple';
  isDisabled?: boolean;
  onToggle: (value: string, isSelected: boolean) => void;
}) {
  return (
    <List density="spacious" edge="flush">
      {items.map(item => {
        const isSelected = selected.has(item.value);
        return (
          <ListItem
            key={item.value}
            label={
              isSelected ? (
                <>
                  <span aria-hidden="true">{item.label}</span>
                  <VisuallyHidden>{`${item.label}, selected`}</VisuallyHidden>
                </>
              ) : (
                item.label
              )
            }
            startContent={item.icon}
            isDisabled={isDisabled}
            endContent={
              selectionMode === 'multiple' ? (
                <CheckboxIndicator
                  state={isSelected ? 'checked' : 'unchecked'}
                  isDisabled={isDisabled}
                />
              ) : (
                <RadioIndicator
                  state={isSelected ? 'checked' : 'unchecked'}
                  isDisabled={isDisabled}
                />
              )
            }
            onClick={() => onToggle(item.value, isSelected)}
          />
        );
      })}
    </List>
  );
}

function InlineListSearch({
  label,
  searchSource,
  selectedItems,
  allowsCreate = false,
  renderItem,
  isDisabled,
  maxMenuItems = 10,
  onChange,
}: {
  label: string;
  searchSource: SearchSource<SearchableItem>;
  selectedItems: ReadonlyArray<SearchableItem>;
  allowsCreate?: boolean;
  renderItem?: (item: SearchableItem) => React.ReactNode;
  isDisabled: boolean;
  maxMenuItems?: number;
  onChange: (items: SearchableItem[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchableItem[]>([]);
  const requestIdRef = useRef(0);
  const selectedIds = useMemo(
    () => new Set(selectedItems.map(item => item.id)),
    [selectedItems],
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const trimmed = query.trim();
    const timeout = setTimeout(
      () => {
        let pending: Promise<SearchableItem[]> | SearchableItem[];
        try {
          pending =
            trimmed === ''
              ? searchSource.bootstrap()
              : searchSource.search(trimmed);
        } catch {
          if (requestId === requestIdRef.current) {
            setResults([]);
          }
          return;
        }
        void Promise.resolve(pending).then(
          items => {
            if (requestId === requestIdRef.current) {
              setResults(items.slice(0, maxMenuItems));
            }
          },
          () => {
            if (requestId === requestIdRef.current) {
              setResults([]);
            }
          },
        );
      },
      trimmed === '' ? 0 : 150,
    );
    return () => {
      clearTimeout(timeout);
      searchSource.cancel?.();
    };
  }, [maxMenuItems, query, searchSource]);

  const visibleItems = useMemo(() => {
    const byId = new Map<string, SearchableItem>();
    if (query.trim() === '') {
      for (const item of selectedItems) {
        byId.set(item.id, item);
      }
    }
    for (const item of results) {
      byId.set(item.id, item);
    }
    const trimmed = query.trim();
    if (
      allowsCreate &&
      trimmed !== '' &&
      ![...byId.values()].some(
        item => item.label.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
      )
    ) {
      byId.set(`__inline_create__${trimmed}`, {
        id: `__inline_create__${trimmed}`,
        label: trimmed,
        auxiliaryData: {isCreate: true},
      });
    }
    return [...byId.values()];
  }, [allowsCreate, query, results, selectedItems]);

  return (
    <div {...stylex.props(styles.inlineSearch)}>
      <TextInput
        label={`Search ${label}`}
        isLabelHidden
        value={query}
        onChange={setQuery}
        placeholder="Search…"
        startIcon={<Icon icon="search" size="sm" color="secondary" />}
        hasClear
        size="lg"
        isDisabled={isDisabled}
        width="100%"
      />
      {visibleItems.length === 0 ? (
        <EmptyState
          icon={<Icon icon="search" size="lg" color="secondary" />}
          title={
            allowsCreate && query.trim() === ''
              ? `Add ${label === 'ID' ? 'an ID' : 'a value'}`
              : 'No results found'
          }
          description={
            allowsCreate && query.trim() === ''
              ? `Enter ${label === 'ID' ? 'an ID' : 'a value'} above, then select it to include it.`
              : 'Try a different search.'
          }
          headingLevel={4}
          isCompact
        />
      ) : (
        <List density="spacious" edge="flush">
          {visibleItems.map(item => {
            const isCreate =
              (item.auxiliaryData as {isCreate?: boolean} | undefined)
                ?.isCreate === true;
            const valueId = isCreate ? item.label : item.id;
            const isSelected = selectedIds.has(valueId);
            const visibleLabel = isCreate ? `Add ${item.label}` : item.label;
            return (
              <ListItem
                key={item.id}
                label={
                  renderItem != null && !isCreate ? (
                    renderItem(item)
                  ) : isSelected ? (
                    <>
                      <span aria-hidden="true">{visibleLabel}</span>
                      <VisuallyHidden>{`${visibleLabel}, selected`}</VisuallyHidden>
                    </>
                  ) : (
                    visibleLabel
                  )
                }
                aria-label={
                  renderItem != null
                    ? `${visibleLabel}${isSelected ? ', selected' : ''}`
                    : undefined
                }
                isDisabled={isDisabled}
                endContent={
                  <CheckboxIndicator
                    state={isSelected ? 'checked' : 'unchecked'}
                    isDisabled={isDisabled}
                  />
                }
                onClick={() => {
                  if (isSelected) {
                    onChange(
                      selectedItems.filter(selected => selected.id !== valueId),
                    );
                  } else {
                    onChange([
                      ...selectedItems,
                      isCreate ? {id: item.label, label: item.label} : item,
                    ]);
                  }
                }}
              />
            );
          })}
        </List>
      )}
    </div>
  );
}

function relativeDateChoices(
  operatorValue: OperatorValue & {type: 'date_relative'},
): ChoiceItem[] {
  const result: ChoiceItem[] = [];
  const units = [
    {unit: 'day', plural: 'days', amounts: [1, 3, 7, 14, 30]},
    {unit: 'week', plural: 'weeks', amounts: [1, 2, 4]},
    {unit: 'month', plural: 'months', amounts: [1, 3, 6, 12]},
  ];
  for (const {unit, plural, amounts} of units) {
    for (const amount of amounts) {
      const noun = amount === 1 ? unit : plural;
      if (operatorValue.isPastAllowed !== false) {
        result.push({
          value: `${amount}${unit[0]}_ago`,
          label: `${amount} ${noun} ago`,
        });
      }
      if (operatorValue.isFutureAllowed !== false) {
        result.push({
          value: `${amount}${unit[0]}_from_now`,
          label: `${amount} ${noun} from now`,
        });
      }
    }
  }
  return result;
}

// =============================================================================
// Dates
// =============================================================================

const SECONDS_BY_UNIT = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000,
  year: 31536000,
} as const;

function resolveRangePart(part: DateTimeRangePart, nowSeconds: number): number {
  switch (part.type) {
    case 'NOW':
      return Math.floor(nowSeconds);
    case 'ABSOLUTE':
      return part.unixSeconds;
    case 'RELATIVE':
      return Math.floor(
        nowSeconds - part.backValue * SECONDS_BY_UNIT[part.unit],
      );
  }
}

// =============================================================================
// Editor
// =============================================================================

/**
 * Renders the value control for one filter inside the sheet editor.
 */
export function MobilePowerSearchValueEditor({
  operatorValue,
  filterValue,
  onChange,
  label,
  isDisabled = false,
  maxMenuItems,
  timezoneID,
}: MobilePowerSearchValueEditorProps) {
  const selectedValues = useMemo<ReadonlySet<string>>(() => {
    if (filterValue?.type === 'enum' || filterValue?.type === 'date_relative') {
      return new Set([filterValue.value]);
    }
    if (filterValue?.type === 'enum_list') {
      return new Set(filterValue.value);
    }
    return new Set();
  }, [filterValue]);

  const handleNumberInput = useCallback(
    (event: FormEvent<HTMLElement>) => {
      // NumberInput commits on blur or Enter. Staging the raw text as it is
      // typed lets the footer action enable while the user is still in the
      // field; the committed value replaces it when the input blurs.
      if (operatorValue.type !== 'integer' && operatorValue.type !== 'float') {
        return;
      }
      const raw = (event.currentTarget as HTMLInputElement).value.trim();
      if (raw === '') {
        return;
      }
      const parsed = Number(raw.replace(/,/g, ''));
      if (!Number.isFinite(parsed)) {
        return;
      }
      if (operatorValue.type === 'integer') {
        if (Number.isInteger(parsed)) {
          onChange({type: 'integer', value: parsed});
        }
        return;
      }
      onChange({type: 'float', value: parsed});
    },
    [onChange, operatorValue.type],
  );

  switch (operatorValue.type) {
    case 'empty':
    case 'nested':
      return null;

    case 'string': {
      const current = filterValue?.type === 'string' ? filterValue.value : '';
      if (operatorValue.searchSource) {
        return (
          <div {...stylex.props(styles.input)}>
            <Typeahead
              label="Value"
              isLabelHidden
              size="lg"
              searchSource={operatorValue.searchSource}
              value={current ? {id: current, label: current} : null}
              onChange={item =>
                onChange({type: 'string', value: item?.label ?? ''})
              }
              placeholder="Search..."
              debounceMs={150}
              maxMenuItems={maxMenuItems}
              isDisabled={isDisabled}
              width="100%"
            />
          </div>
        );
      }
      return (
        <div {...stylex.props(styles.input)}>
          <TextInput
            label="Value"
            isLabelHidden
            size="lg"
            value={current}
            placeholder="Enter a value"
            onChange={value => onChange({type: 'string', value})}
            isDisabled={isDisabled}
            width="100%"
          />
        </div>
      );
    }

    case 'string_list': {
      const selectedItems: SearchableItem[] =
        filterValue?.type === 'string_list'
          ? filterValue.value.map(value => ({id: value, label: value}))
          : [];
      return (
        <InlineListSearch
          label={label ?? 'values'}
          searchSource={operatorValue.searchSource ?? EMPTY_SOURCE}
          selectedItems={selectedItems}
          allowsCreate={
            operatorValue.isArbitraryStringAllowed ||
            !operatorValue.searchSource
          }
          isDisabled={isDisabled}
          maxMenuItems={maxMenuItems}
          onChange={items =>
            onChange({
              type: 'string_list',
              value: items.map(item => item.label),
            })
          }
        />
      );
    }

    case 'integer':
    case 'float': {
      const current =
        filterValue?.type === operatorValue.type ? filterValue.value : null;
      return (
        <div {...stylex.props(styles.input)}>
          <NumberInput
            label="Value"
            isLabelHidden
            size="lg"
            value={current}
            onChange={value =>
              onChange(
                operatorValue.type === 'integer'
                  ? {type: 'integer', value}
                  : {type: 'float', value},
              )
            }
            onInput={handleNumberInput}
            min={operatorValue.minValue}
            max={operatorValue.maxValue}
            units={operatorValue.units}
            isIntegerOnly={operatorValue.type === 'integer'}
            placeholder="Enter a number"
            isDisabled={isDisabled}
            width="100%"
          />
        </div>
      );
    }

    case 'time': {
      const current =
        filterValue?.type === 'time'
          ? (filterValue.value as ISOTimeString)
          : undefined;
      return (
        <div {...stylex.props(styles.input)}>
          <TimeInput
            label="Time"
            isLabelHidden
            size="lg"
            value={current}
            onChange={value => {
              if (value != null) {
                onChange({type: 'time', value});
              }
            }}
            min={operatorValue.minValue as ISOTimeString | undefined}
            max={operatorValue.maxValue as ISOTimeString | undefined}
            isDisabled={isDisabled}
            width="100%"
          />
        </div>
      );
    }

    case 'date_absolute': {
      const unixSeconds =
        filterValue?.type === 'date_absolute'
          ? filterValue.unixSeconds
          : undefined;
      if (operatorValue.isDateOnly === false) {
        return (
          <div {...stylex.props(styles.input)}>
            <DateTimeInput
              label="Date and time"
              isLabelHidden
              size="lg"
              value={
                unixSeconds == null
                  ? undefined
                  : unixSecondsToISODateTime(unixSeconds, timezoneID)
              }
              onChange={value => {
                if (value != null) {
                  onChange({
                    type: 'date_absolute',
                    unixSeconds: isoDateTimeToUnixSeconds(value, timezoneID),
                  });
                }
              }}
              isDisabled={isDisabled}
              width="100%"
            />
          </div>
        );
      }
      return (
        <div {...stylex.props(styles.inlineCalendar)}>
          <Calendar
            mode="single"
            value={
              unixSeconds == null
                ? null
                : unixSecondsToISODate(unixSeconds, timezoneID)
            }
            onChange={value => {
              if (!isDisabled) {
                onChange({
                  type: 'date_absolute',
                  unixSeconds: isoDateToUnixSeconds(value, timezoneID),
                });
              }
            }}
            dateConstraints={isDisabled ? [() => false] : undefined}
          />
        </div>
      );
    }

    case 'date_relative':
      return (
        <ChoiceRows
          items={relativeDateChoices(operatorValue)}
          selected={selectedValues}
          selectionMode="single"
          isDisabled={isDisabled}
          onToggle={value => onChange({type: 'date_relative', value})}
        />
      );

    case 'date_range': {
      let current: DateRange | null = null;
      if (filterValue?.type === 'date_range') {
        const nowSeconds = Date.now() / 1000;
        current = {
          start: unixSecondsToISODate(
            resolveRangePart(filterValue.value.start, nowSeconds),
            timezoneID,
          ),
          end: unixSecondsToISODate(
            resolveRangePart(filterValue.value.end, nowSeconds),
            timezoneID,
          ),
        };
      }
      return (
        <div {...stylex.props(styles.inlineCalendar)}>
          <Calendar
            mode="range"
            value={current}
            onChange={range => {
              if (!isDisabled) {
                onChange({
                  type: 'date_range',
                  value: {
                    start: {
                      type: 'ABSOLUTE',
                      unixSeconds: isoDateToUnixSeconds(
                        range.start as ISODateString,
                        timezoneID,
                      ),
                    },
                    end: {
                      type: 'ABSOLUTE',
                      unixSeconds: isoDateToUnixSeconds(
                        range.end as ISODateString,
                        timezoneID,
                      ),
                    },
                  },
                });
              }
            }}
            dateConstraints={isDisabled ? [() => false] : undefined}
          />
        </div>
      );
    }

    case 'enum':
      return (
        <ChoiceRows
          items={operatorValue.values}
          selected={selectedValues}
          selectionMode="single"
          isDisabled={isDisabled}
          onToggle={value => onChange({type: 'enum', value})}
        />
      );

    case 'enum_list':
      return (
        <ChoiceRows
          items={operatorValue.values}
          selected={selectedValues}
          selectionMode="multiple"
          isDisabled={isDisabled}
          onToggle={(value, isSelected) => {
            const existing =
              filterValue?.type === 'enum_list' ? filterValue.value : [];
            onChange({
              type: 'enum_list',
              value: isSelected
                ? existing.filter(v => v !== value)
                : [...existing, value],
            });
          }}
        />
      );

    case 'entity_list': {
      const selectedItems: SearchableItem[] =
        filterValue?.type === 'entity_list'
          ? filterValue.value.map((entity: PowerSearchEntity) => ({
              id: entity.id,
              label: entity.label,
              auxiliaryData: entity.photo ? {photo: entity.photo} : undefined,
            }))
          : [];
      return (
        <InlineListSearch
          label={label ?? 'entities'}
          searchSource={operatorValue.searchSource ?? EMPTY_SOURCE}
          selectedItems={selectedItems}
          renderItem={operatorValue.renderItem}
          isDisabled={isDisabled}
          maxMenuItems={maxMenuItems}
          onChange={items =>
            onChange({
              type: 'entity_list',
              value: items.map(item => {
                const auxiliaryData = item.auxiliaryData as
                  {photo?: string} | undefined;
                return {
                  id: item.id,
                  label: item.label,
                  ...(auxiliaryData?.photo ? {photo: auxiliaryData.photo} : {}),
                };
              }),
            })
          }
        />
      );
    }

    case 'custom': {
      const EditorComponent = operatorValue.Editor;
      return (
        <div {...stylex.props(styles.input)}>
          <EditorComponent
            isDisabled={isDisabled}
            onChange={value => {
              if (value != null) {
                onChange({type: 'custom', value});
              }
            }}
            placeholder="Enter a value"
            value={filterValue?.type === 'custom' ? filterValue.value : null}
          />
        </div>
      );
    }

    default:
      return null;
  }
}

MobilePowerSearchValueEditor.displayName = 'MobilePowerSearchValueEditor';
