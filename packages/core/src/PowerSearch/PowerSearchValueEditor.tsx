// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PowerSearchValueEditor.tsx
 * @input OperatorValue, FilterValue, onChange callback
 * @output Renders the appropriate editor for a filter value type
 * @position Sub-component; consumed by PowerSearchEditPopover
 *
 * SYNC: When modified, update:
 * - /packages/core/src/PowerSearch/index.ts
 */

import React, {
  useCallback,
  useMemo,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type {
  OperatorValue,
  FilterValue,
  EnumItem,
  PowerSearchEntity,
  DateTimeRangePart,
} from './types';
import type {InternalConfig} from './useInternalConfig';
import type {SearchableItem, SearchSource} from '../Typeahead/types';
import type {ISODateString} from '../utils/dateTypes';
import type {ISOTimeString} from '../utils';

// Lazy import to avoid circular deps — these are all from the same package
import {TextInput} from '../TextInput';
import {NumberInput} from '../NumberInput';
import {
  resolveNumberInputCommit,
  type NumberInputCommitDecision,
} from '../NumberInput/numberInputCommit';
import {DateInput} from '../DateInput';
import {DateRangeInput, type DateRange} from '../DateRangeInput';
import {resolveDateTimeRangePart} from './resolveDateTimeRangePart';
import {TimeInput} from '../TimeInput';
import {Selector} from '../Selector';
import {Tokenizer} from '../Tokenizer';
import {Typeahead} from '../Typeahead';
import {useLocale, useTranslator} from '../i18n';

export interface PowerSearchValueEditorProps {
  operatorValue: OperatorValue;
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  onEnter?: () => void;
  config: InternalConfig;
  /** Max suggestions in string and entity value typeaheads. */
  maxMenuItems?: number;
  isDisabled?: boolean;
  timezoneID?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function createStaticSource(
  items: SearchableItem[],
): SearchSource<SearchableItem> {
  return {
    search(query: string) {
      const lower = query.toLowerCase();
      return items.filter(item => item.label.toLowerCase().includes(lower));
    },
    bootstrap() {
      return items;
    },
  };
}

function enumItemsToSearchableItems(
  values: ReadonlyArray<EnumItem>,
): SearchableItem[] {
  return values.map(item => ({
    id: item.value,
    label: item.label,
  }));
}

function dateRangePartToISO(
  part: DateTimeRangePart,
  nowSeconds: number,
): ISODateString {
  return new Date(resolveDateTimeRangePart(part, nowSeconds) * 1000)
    .toISOString()
    .split('T')[0] as ISODateString;
}

// =============================================================================
// Individual Editors
// =============================================================================

function StringEditor({
  operatorValue,
  filterValue,
  onChange,
  onEnter: _onEnter,
  maxMenuItems,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'string'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  onEnter?: () => void;
  maxMenuItems?: number;
  isDisabled?: boolean;
}) {
  const t = useTranslator();
  const currentValue = filterValue?.type === 'string' ? filterValue.value : '';

  // When a searchSource is provided, render a typeahead instead of a plain
  // text input so users get suggestions (#1103).
  if (operatorValue.searchSource) {
    const selectedItem: SearchableItem | null = currentValue
      ? {id: currentValue, label: currentValue}
      : null;

    return (
      <Typeahead
        label={t('@astryx.powersearch.valueEditor.value')}
        isLabelHidden
        isDisabled={isDisabled}
        searchSource={operatorValue.searchSource}
        value={selectedItem}
        onChange={item => {
          if (item) {
            onChange({type: 'string', value: item.label}, true);
          } else {
            onChange({type: 'string', value: ''});
          }
        }}
        placeholder={t('@astryx.powersearch.valueEditor.searchPlaceholder')}
        debounceMs={150}
        maxMenuItems={maxMenuItems}
      />
    );
  }

  return (
    <TextInput
      label={t('@astryx.powersearch.valueEditor.value')}
      isLabelHidden
      isDisabled={isDisabled}
      value={currentValue}
      placeholder={t('@astryx.powersearch.valueEditor.enterValuePlaceholder')}
      onChange={(value: string) => {
        onChange({type: 'string', value});
      }}
    />
  );
}

function StringListEditor({
  operatorValue,
  filterValue,
  onChange,
  maxMenuItems,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'string_list'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  maxMenuItems?: number;
  isDisabled?: boolean;
}) {
  const t = useTranslator();
  const currentValue: SearchableItem[] = useMemo(() => {
    if (filterValue?.type !== 'string_list') {
      return [];
    }
    return filterValue.value.map(v => ({id: v, label: v}));
  }, [filterValue]);

  const source = useMemo<SearchSource<SearchableItem>>(() => {
    if (operatorValue.searchSource) {
      return operatorValue.searchSource;
    }
    // Free-text: accept anything typed
    return {
      search: () => [],
      bootstrap: () => [],
    };
  }, [operatorValue.searchSource]);

  // Enable creatable mode when no searchSource is provided (free-text tags)
  // or when isArbitraryStringAllowed is explicitly set (#1107).
  const hasCreate =
    operatorValue.isArbitraryStringAllowed || !operatorValue.searchSource;

  return (
    <Tokenizer
      label={t('@astryx.powersearch.valueEditor.values')}
      isLabelHidden
      isDisabled={isDisabled}
      searchSource={source}
      value={currentValue}
      onChange={items => {
        onChange({
          type: 'string_list',
          value: items.map(item => item.label),
        });
      }}
      placeholder={t('@astryx.powersearch.valueEditor.addValuesPlaceholder')}
      debounceMs={operatorValue.searchSource ? 150 : 0}
      hasCreate={hasCreate}
      maxMenuItems={maxMenuItems}
    />
  );
}

function useNumberEditorHandlers({
  valueType,
  min,
  max,
  isIntegerOnly,
  onChange,
  onEnter,
}: {
  valueType: 'integer' | 'float';
  min?: number;
  max?: number;
  isIntegerOnly: boolean;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  onEnter?: () => void;
}) {
  const locale = useLocale();
  const pendingDecisionRef = useRef<NumberInputCommitDecision | null>(null);
  const toFilterValue = useCallback(
    (value: number): FilterValue =>
      valueType === 'integer'
        ? {type: 'integer', value}
        : {type: 'float', value},
    [valueType],
  );
  const handleChange = useCallback(
    (value: number) => {
      onChange(toFilterValue(value));
    },
    [onChange, toFilterValue],
  );
  const handleFocus = useCallback(() => {
    pendingDecisionRef.current = null;
  }, []);
  const handleInput = useCallback(
    (event: FormEvent<HTMLElement>) => {
      pendingDecisionRef.current = resolveNumberInputCommit(
        (event.currentTarget as HTMLInputElement).value,
        {min, max, isIntegerOnly, locale, hasClear: false},
      );
    },
    [isIntegerOnly, locale, max, min],
  );
  const handleEnter = useCallback(() => {
    const decision = pendingDecisionRef.current;
    pendingDecisionRef.current = null;
    if (decision === null) {
      onEnter?.();
    } else if (decision.type === 'commit') {
      onChange(toFilterValue(decision.value), true);
    }
  }, [onChange, onEnter, toFilterValue]);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.stopPropagation();
      }
    },
    [],
  );

  return {handleChange, handleEnter, handleFocus, handleInput, handleKeyDown};
}

function IntegerEditor({
  operatorValue,
  filterValue,
  onChange,
  onEnter,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'integer'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  onEnter?: () => void;
  isDisabled?: boolean;
}) {
  const t = useTranslator();
  const currentValue =
    filterValue?.type === 'integer' ? filterValue.value : undefined;
  const handlers = useNumberEditorHandlers({
    valueType: 'integer',
    min: operatorValue.minValue,
    max: operatorValue.maxValue,
    isIntegerOnly: true,
    onChange,
    onEnter,
  });

  return (
    <NumberInput
      label={t('@astryx.powersearch.valueEditor.value')}
      isLabelHidden
      isDisabled={isDisabled}
      value={currentValue ?? null}
      onChange={handlers.handleChange}
      onFocus={handlers.handleFocus}
      onInput={handlers.handleInput}
      onEnter={handlers.handleEnter}
      onKeyDown={handlers.handleKeyDown}
      min={operatorValue.minValue}
      max={operatorValue.maxValue}
      units={operatorValue.units}
      isIntegerOnly
      placeholder={t('@astryx.powersearch.valueEditor.enterNumberPlaceholder')}
    />
  );
}

function FloatEditor({
  operatorValue,
  filterValue,
  onChange,
  onEnter,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'float'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  onEnter?: () => void;
  isDisabled?: boolean;
}) {
  const t = useTranslator();
  const currentValue =
    filterValue?.type === 'float' ? filterValue.value : undefined;
  const handlers = useNumberEditorHandlers({
    valueType: 'float',
    min: operatorValue.minValue,
    max: operatorValue.maxValue,
    isIntegerOnly: false,
    onChange,
    onEnter,
  });

  return (
    <NumberInput
      label={t('@astryx.powersearch.valueEditor.value')}
      isLabelHidden
      isDisabled={isDisabled}
      value={currentValue ?? null}
      onChange={handlers.handleChange}
      onFocus={handlers.handleFocus}
      onInput={handlers.handleInput}
      onEnter={handlers.handleEnter}
      onKeyDown={handlers.handleKeyDown}
      min={operatorValue.minValue}
      max={operatorValue.maxValue}
      units={operatorValue.units}
      placeholder={t('@astryx.powersearch.valueEditor.enterNumberPlaceholder')}
    />
  );
}

function TimeEditor({
  operatorValue,
  filterValue,
  onChange,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'time'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  isDisabled?: boolean;
}) {
  const t = useTranslator();
  const currentValue =
    filterValue?.type === 'time'
      ? (filterValue.value as ISOTimeString)
      : undefined;

  return (
    <TimeInput
      label={t('@astryx.powersearch.valueEditor.time')}
      isLabelHidden
      isDisabled={isDisabled}
      value={currentValue}
      onChange={value => {
        if (value != null) {
          onChange({type: 'time', value});
        }
      }}
      min={operatorValue.minValue as ISOTimeString | undefined}
      max={operatorValue.maxValue as ISOTimeString | undefined}
    />
  );
}

function DateAbsoluteEditor({
  filterValue,
  onChange,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'date_absolute'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  isDisabled?: boolean;
}) {
  const t = useTranslator();
  // Convert unixSeconds to ISO date string for the date input
  const currentValue = useMemo(() => {
    if (filterValue?.type !== 'date_absolute') {
      return undefined;
    }
    const date = new Date(filterValue.unixSeconds * 1000);
    return date.toISOString().split('T')[0] as ISODateString;
  }, [filterValue]);

  return (
    <DateInput
      label={t('@astryx.powersearch.valueEditor.date')}
      isLabelHidden
      isDisabled={isDisabled}
      value={currentValue}
      onChange={value => {
        if (value != null) {
          const unixSeconds = Math.floor(new Date(value).getTime() / 1000);
          onChange({type: 'date_absolute', unixSeconds});
        }
      }}
    />
  );
}

function DateRelativeEditor({
  operatorValue,
  filterValue,
  onChange,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'date_relative'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  isDisabled?: boolean;
}) {
  const t = useTranslator();
  const currentValue =
    filterValue?.type === 'date_relative' ? filterValue.value : undefined;

  const options = useMemo(() => {
    const result: {value: string; label: string}[] = [];
    const units = [
      {unit: 'day', plural: 'days'},
      {unit: 'week', plural: 'weeks'},
      {unit: 'month', plural: 'months'},
    ];
    for (const {unit, plural} of units) {
      const amounts =
        unit === 'day'
          ? [1, 3, 7, 14, 30]
          : unit === 'week'
            ? [1, 2, 4]
            : [1, 3, 6, 12];
      for (const amount of amounts) {
        if (operatorValue.isPastAllowed !== false) {
          result.push({
            value: `${amount}${unit[0]}_ago`,
            label: `${amount} ${amount === 1 ? unit : plural} ago`,
          });
        }
        if (operatorValue.isFutureAllowed !== false) {
          result.push({
            value: `${amount}${unit[0]}_from_now`,
            label: `${amount} ${amount === 1 ? unit : plural} from now`,
          });
        }
      }
    }
    return result;
  }, [operatorValue.isPastAllowed, operatorValue.isFutureAllowed]);

  return (
    <Selector
      label={t('@astryx.powersearch.valueEditor.relativeDate')}
      isLabelHidden
      isDisabled={isDisabled}
      options={options}
      value={currentValue}
      onChange={value => {
        onChange({type: 'date_relative', value}, true);
      }}
    />
  );
}

function DateRangeEditor({
  filterValue,
  onChange,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'date_range'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  isDisabled?: boolean;
}) {
  const t = useTranslator();
  const currentValue = useMemo<DateRange | null>(() => {
    if (filterValue?.type !== 'date_range') {
      return null;
    }
    const {start, end} = filterValue.value;
    const nowSeconds = Date.now() / 1000;
    return {
      start: dateRangePartToISO(start, nowSeconds),
      end: dateRangePartToISO(end, nowSeconds),
    };
  }, [filterValue]);

  const handleChange = useCallback(
    (range: DateRange | null) => {
      if (range == null) {
        return;
      }
      onChange({
        type: 'date_range',
        value: {
          start: {
            type: 'ABSOLUTE',
            unixSeconds: Date.parse(`${range.start}T00:00:00Z`) / 1000,
          },
          end: {
            type: 'ABSOLUTE',
            unixSeconds: Date.parse(`${range.end}T00:00:00Z`) / 1000,
          },
        },
      });
    },
    [onChange],
  );

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    // DateRangeInput owns an inner popover. Its Enter activation must not reach
    // the parent PowerSearch shortcut before the focused button's click runs.
    if (event.key === 'Enter') {
      event.stopPropagation();
    }
  }, []);

  return (
    <div onKeyDown={handleKeyDown}>
      <DateRangeInput
        label={t('@astryx.powersearch.valueEditor.dateRange')}
        isLabelHidden
        isDisabled={isDisabled}
        value={currentValue}
        onChange={handleChange}
        hasClear={false}
      />
    </div>
  );
}

function EnumEditor({
  operatorValue,
  filterValue,
  onChange,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'enum'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  isDisabled?: boolean;
}) {
  const t = useTranslator();
  const currentValue =
    filterValue?.type === 'enum' ? filterValue.value : undefined;

  const options = useMemo(
    () =>
      operatorValue.values.map(item => ({
        value: item.value,
        label: item.label,
      })),
    [operatorValue.values],
  );

  return (
    <Selector
      label={t('@astryx.powersearch.valueEditor.value')}
      isLabelHidden
      isDisabled={isDisabled}
      options={options}
      value={currentValue}
      onChange={value => {
        onChange({type: 'enum', value}, true);
      }}
    />
  );
}

function EnumListEditor({
  operatorValue,
  filterValue,
  onChange,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'enum_list'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  isDisabled?: boolean;
}) {
  const t = useTranslator();
  const items = useMemo(
    () => enumItemsToSearchableItems(operatorValue.values),
    [operatorValue.values],
  );

  const source = useMemo(() => createStaticSource(items), [items]);

  const currentValue: SearchableItem[] = useMemo(() => {
    if (filterValue?.type !== 'enum_list') {
      return [];
    }
    return filterValue.value.map(v => {
      const item = operatorValue.values.find(e => e.value === v);
      return {id: v, label: item?.label ?? v};
    });
  }, [filterValue, operatorValue.values]);

  return (
    <Tokenizer
      label={t('@astryx.powersearch.valueEditor.values')}
      isLabelHidden
      isDisabled={isDisabled}
      searchSource={source}
      value={currentValue}
      onChange={selectedItems => {
        onChange({
          type: 'enum_list',
          value: selectedItems.map(item => item.id),
        });
      }}
      placeholder={t('@astryx.powersearch.valueEditor.selectValuesPlaceholder')}
      hasEntriesOnFocus
      debounceMs={0}
      // A closed vocabulary: every value is a valid choice, so the menu shows
      // all of them instead of BaseTypeahead's 10-suggestion default, which
      // would silently drop valid choices with no way to reach them.
      maxMenuItems={items.length}
    />
  );
}

function EntityListEditor({
  operatorValue,
  filterValue,
  onChange,
  maxMenuItems,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'entity_list'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  maxMenuItems?: number;
  isDisabled?: boolean;
}) {
  const t = useTranslator();
  const source = useMemo<SearchSource<SearchableItem>>(() => {
    if (operatorValue.searchSource) {
      return operatorValue.searchSource;
    }
    return {
      search: () => [],
      bootstrap: () => [],
    };
  }, [operatorValue.searchSource]);

  // Preserve photo in auxiliaryData so it round-trips through the tokenizer (#1106).
  const currentValue: SearchableItem[] = useMemo(() => {
    if (filterValue?.type !== 'entity_list') {
      return [];
    }
    return filterValue.value.map((entity: PowerSearchEntity) => ({
      id: entity.id,
      label: entity.label,
      auxiliaryData: entity.photo ? {photo: entity.photo} : undefined,
    }));
  }, [filterValue]);

  return (
    <Tokenizer
      label={t('@astryx.powersearch.valueEditor.entities')}
      isLabelHidden
      isDisabled={isDisabled}
      searchSource={source}
      value={currentValue}
      onChange={items => {
        onChange({
          type: 'entity_list',
          // Round-trip photo from auxiliaryData back to PowerSearchEntity (#1106).
          value: items.map(item => {
            const aux = item.auxiliaryData as {photo?: string} | undefined;
            return {
              id: item.id,
              label: item.label,
              ...(aux?.photo ? {photo: aux.photo} : {}),
            };
          }),
        });
      }}
      renderItem={operatorValue.renderItem}
      placeholder={t('@astryx.powersearch.valueEditor.searchPlaceholder')}
      debounceMs={operatorValue.searchSource ? 150 : 0}
      maxMenuItems={maxMenuItems}
    />
  );
}

function CustomEditor({
  operatorValue,
  filterValue,
  onChange,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'custom'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  isDisabled?: boolean;
}) {
  const t = useTranslator();
  const currentValue =
    filterValue?.type === 'custom' ? filterValue.value : null;
  const EditorComponent = operatorValue.Editor;

  return (
    <EditorComponent
      isDisabled={isDisabled}
      onChange={value => {
        if (value != null) {
          onChange({type: 'custom', value});
        }
      }}
      placeholder={t('@astryx.powersearch.valueEditor.enterValuePlaceholder')}
      value={currentValue}
    />
  );
}

// =============================================================================
// Main Dispatcher
// =============================================================================

export function PowerSearchValueEditor({
  operatorValue,
  filterValue,
  onChange,
  onEnter,
  maxMenuItems,
  isDisabled,
}: PowerSearchValueEditorProps) {
  switch (operatorValue.type) {
    case 'empty':
      return null;

    case 'string':
      return (
        <StringEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          onEnter={onEnter}
          maxMenuItems={maxMenuItems}
        />
      );

    case 'string_list':
      return (
        <StringListEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          maxMenuItems={maxMenuItems}
        />
      );

    case 'integer':
      return (
        <IntegerEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          onEnter={onEnter}
        />
      );

    case 'float':
      return (
        <FloatEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          onEnter={onEnter}
        />
      );

    case 'time':
      return (
        <TimeEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
        />
      );

    case 'date_absolute':
      return (
        <DateAbsoluteEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
        />
      );

    case 'date_relative':
      return (
        <DateRelativeEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
        />
      );

    case 'date_range':
      return (
        <DateRangeEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
        />
      );

    case 'enum':
      return (
        <EnumEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
        />
      );

    case 'enum_list':
      return (
        <EnumListEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
        />
      );

    case 'entity_list':
      return (
        <EntityListEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          maxMenuItems={maxMenuItems}
        />
      );

    case 'custom':
      return (
        <CustomEditor
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          isDisabled={isDisabled}
        />
      );

    case 'nested':
      // Nested filters are complex — simplified v1 just shows a message
      return null;

    default:
      return null;
  }
}
