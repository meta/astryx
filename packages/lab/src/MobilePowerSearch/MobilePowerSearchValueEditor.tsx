// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MobilePowerSearchValueEditor.tsx
 * @input OperatorValue, staged FilterValue, onChange, label;
 *   public @astryxdesign/core inputs (DateInput, DateRangeInput,
 *   DateTimeInput, Icon, List, NumberInput, TextInput, TimeInput, Typeahead,
 *   VisuallyHidden) and the Lab MobileTokenizer
 * @output Sheet-native value editor for MobilePowerSearch: enum, enum_list and
 *   date_relative as full-row List choices with trailing checks; string_list
 *   and entity_list as a MobileTokenizer whose own sheet opens over the step;
 *   every other non-nested value type as the matching public input
 * @position Lab sub-component consumed by MobilePowerSearch.tsx
 *
 * Core's PowerSearchValueEditor is private, so this file rebuilds each
 * editor from public inputs. Closed vocabularies (enum, enum_list,
 * date_relative) are rendered as rows instead of a Selector or Tokenizer,
 * because a dropdown layer inside a sheet stacks a second overlay on a surface
 * the user is already inside. Open lists (string_list, entity_list) use the
 * touch MobileTokenizer instead of Core's chip input with a popover menu: its
 * trigger shows the staged tokens in the step, and tapping it opens a tall
 * searchable sheet titled with the field's name. The step's heading and
 * operator rows already name the field, so that tokenizer's label is hidden.
 * Every editor stages its value; the sheet footer confirms it.
 */

import React, {useCallback, useMemo, type FormEvent} from 'react';
import * as stylex from '@stylexjs/stylex';
import {DateInput} from '@astryxdesign/core/DateInput';
import {
  DateRangeInput,
  type DateRange,
} from '@astryxdesign/core/DateRangeInput';
import {Icon} from '@astryxdesign/core/Icon';
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
import {MobileTokenizer} from '../MobileTokenizer';
import {
  isoDateToUnixSeconds,
  unixSecondsToISODate,
} from './mobilePowerSearchUtils';

const styles = stylex.create({
  input: {
    paddingBlockStart: spacingVars['--spacing-1'],
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
}

// The date editors read and write the UTC day, as the Core PowerSearch
// editor does (`component:PowerSearch` DEC-3): a `date_absolute` is the UTC
// midnight of the chosen day, and `isDateOnly: false` gets the same date-only
// editor, so one filter means the same instant in both presentations.
const DATE_ZONE = 'UTC';

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
  isDisabled,
  onToggle,
}: {
  items: ReadonlyArray<ChoiceItem>;
  selected: ReadonlySet<string>;
  isDisabled?: boolean;
  onToggle: (value: string, isSelected: boolean) => void;
}) {
  // The sheet body publishes its inline padding as container padding, so
  // `bleed` runs the rows edge to edge (a tap anywhere across the sheet width
  // lands on the row) while choice text keeps the body's inset and lines up
  // with the sheet title and the operator radios.
  return (
    <List hasDividers density="spacious" edge="bleed">
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
            isSelected={isSelected}
            isDisabled={isDisabled}
            endContent={
              isSelected ? (
                <Icon icon="check" size="sm" color="accent" />
              ) : undefined
            }
            onClick={() => onToggle(item.value, isSelected)}
          />
        );
      })}
    </List>
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
      const current: SearchableItem[] =
        filterValue?.type === 'string_list'
          ? filterValue.value.map(v => ({id: v, label: v}))
          : [];
      const hasCreate =
        operatorValue.isArbitraryStringAllowed || !operatorValue.searchSource;
      return (
        <div {...stylex.props(styles.input)}>
          <MobileTokenizer
            label={label ?? 'Values'}
            isLabelHidden
            searchSource={operatorValue.searchSource ?? EMPTY_SOURCE}
            value={current}
            onChange={items =>
              onChange({
                type: 'string_list',
                value: items.map(item => item.label),
              })
            }
            placeholder="Add values..."
            debounceMs={operatorValue.searchSource ? 150 : 0}
            hasCreate={hasCreate}
            maxMenuItems={maxMenuItems}
            isDisabled={isDisabled}
          />
        </div>
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
      return (
        <div {...stylex.props(styles.input)}>
          <DateInput
            label="Date"
            isLabelHidden
            value={
              unixSeconds == null
                ? undefined
                : unixSecondsToISODate(unixSeconds, DATE_ZONE)
            }
            onChange={value => {
              if (value != null) {
                onChange({
                  type: 'date_absolute',
                  unixSeconds: isoDateToUnixSeconds(value, DATE_ZONE),
                });
              }
            }}
            isDisabled={isDisabled}
            width="100%"
          />
        </div>
      );
    }

    case 'date_relative':
      return (
        <ChoiceRows
          items={relativeDateChoices(operatorValue)}
          selected={selectedValues}
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
            DATE_ZONE,
          ),
          end: unixSecondsToISODate(
            resolveRangePart(filterValue.value.end, nowSeconds),
            DATE_ZONE,
          ),
        };
      }
      return (
        <div {...stylex.props(styles.input)}>
          <DateRangeInput
            label="Date range"
            isLabelHidden
            value={current}
            onChange={range => {
              if (range == null) {
                return;
              }
              onChange({
                type: 'date_range',
                value: {
                  start: {
                    type: 'ABSOLUTE',
                    unixSeconds: isoDateToUnixSeconds(
                      range.start as ISODateString,
                      DATE_ZONE,
                    ),
                  },
                  end: {
                    type: 'ABSOLUTE',
                    unixSeconds: isoDateToUnixSeconds(
                      range.end as ISODateString,
                      DATE_ZONE,
                    ),
                  },
                },
              });
            }}
            hasClear={false}
            numberOfMonths={1}
            isDisabled={isDisabled}
            width="100%"
          />
        </div>
      );
    }

    case 'enum':
      return (
        <ChoiceRows
          items={operatorValue.values}
          selected={selectedValues}
          isDisabled={isDisabled}
          onToggle={value => onChange({type: 'enum', value})}
        />
      );

    case 'enum_list':
      return (
        <ChoiceRows
          items={operatorValue.values}
          selected={selectedValues}
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
      const current: SearchableItem[] =
        filterValue?.type === 'entity_list'
          ? filterValue.value.map((entity: PowerSearchEntity) => ({
              id: entity.id,
              label: entity.label,
              auxiliaryData: entity.photo ? {photo: entity.photo} : undefined,
            }))
          : [];
      return (
        <div {...stylex.props(styles.input)}>
          <MobileTokenizer
            label={label ?? 'Entities'}
            isLabelHidden
            searchSource={operatorValue.searchSource ?? EMPTY_SOURCE}
            value={current}
            onChange={items =>
              onChange({
                type: 'entity_list',
                value: items.map(item => {
                  const aux = item.auxiliaryData as
                    {photo?: string} | undefined;
                  return {
                    id: item.id,
                    label: item.label,
                    ...(aux?.photo ? {photo: aux.photo} : {}),
                  };
                }),
              })
            }
            renderItem={operatorValue.renderItem}
            placeholder="Search..."
            debounceMs={operatorValue.searchSource ? 150 : 0}
            maxMenuItems={maxMenuItems}
            isDisabled={isDisabled}
          />
        </div>
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
