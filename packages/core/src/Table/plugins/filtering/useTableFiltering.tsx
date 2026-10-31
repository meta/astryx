// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableFiltering.tsx
 * @input React, types, Astryx components, theme tokens
 * @output Exports useTableFiltering hook and filter type definitions
 * @position Filtering plugin; consumed by Table via plugins prop
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/useTableFiltering.doc.mjs (props table)
 * - /packages/core/src/Table/Table.doc.mjs (filtering documentation)
 * - /packages/core/src/Table/index.ts (exports)
 * - /apps/storybook/stories/TableFiltering.stories.tsx (variant coverage)
 */

import {
  createContext,
  use,
  useRef,
  useMemo,
  useState,
  useEffect,
  useCallback,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {spacingVars, radiusVars} from '../../../theme/tokens.stylex';
import {Icon} from '../../../Icon';
import {Badge} from '../../../Badge';
import {Button} from '../../../Button';
import {BottomSheet} from '../../../BottomSheet';
import {CheckboxList, CheckboxListItem} from '../../../CheckboxList';
import {RadioList, RadioListItem} from '../../../RadioList';
import {Heading} from '../../../Heading';
import {HStack} from '../../../HStack';
import {VStack} from '../../../VStack';
import {useAdaptivePresentation} from '../../../hooks/useAdaptivePresentation';
import {Popover} from '../../../Popover';
import {TextInput} from '../../../TextInput';
import {NumberInput} from '../../../NumberInput';
import {
  parseNumberInput,
  resolveNumberInputCommit,
} from '../../../NumberInput/numberInputCommit';
import {DateInput} from '../../../DateInput';
import type {ISODateString} from '../../../utils/dateTypes';
import {TimeInput} from '../../../TimeInput';
import type {ISOTimeString} from '../../../utils/timeParser';
import {Selector} from '../../../Selector';
import {MultiSelector} from '../../../MultiSelector';
import {Tokenizer} from '../../../Tokenizer';
import type {
  TablePlugin,
  TableColumn,
  HeaderCellRenderProps,
} from '../../types';
import {proportional} from '../../columnUtils';
import {TableColumnsContext} from '../../TableColumnsContext';
import {useLocale, useTranslator} from '../../../i18n';
import type {
  PowerSearchConfig,
  PowerSearchField,
  PowerSearchOperator,
  PowerSearchFilter,
  FilterValue,
  OperatorValue,
  IntegerOperatorValue,
  FloatOperatorValue,
  EnumOperatorValue,
  EnumListOperatorValue,
  StringListOperatorValue,
  EntityListOperatorValue,
} from '../../../PowerSearch/types';

// =============================================================================
// Filter Value Types
// =============================================================================

/** Union of all filter value types (text=string, number=number, enum/list=string[]) */
export type TableFilterValue = string | number | string[];

/**
 * Reference to a PowerSearch field.
 * Instead of defining the filter inline, point to a field in a shared
 * `PowerSearchConfig`. The plugin resolves the operator's value type
 * and renders the appropriate control.
 *
 * - **String form** — field key only, uses the field's `defaultOperator`:
 *   `filter: 'status'`
 *
 * - **Object form** — field key + explicit operator:
 *   `filter: { field: 'status', operator: 'is_not' }`
 *
 * Both require `searchConfig` on the plugin config.
 */
export interface TableFilterFieldRef {
  /** Key of the PowerSearchField in the searchConfig. */
  field: string;
  /**
   * Key of the operator on that field. When omitted, uses the field's
   * `defaultOperator` or the first operator.
   */
  operator?: string;
}

// =============================================================================
// PowerSearch → Table Filter Resolution
// =============================================================================

/**
 * Resolve the operator for a PowerSearch field.
 * Uses the specified operator key, the field's defaultOperator, or the first.
 */
function resolveOperator(
  field: PowerSearchField,
  operatorKey?: string,
): PowerSearchOperator | undefined {
  if (operatorKey) {
    return field.operators.find(o => o.key === operatorKey);
  }
  if (field.defaultOperator) {
    return field.operators.find(o => o.key === field.defaultOperator);
  }
  return field.operators[0];
}

/**
 * Resolve a column's filter field reference to a concrete OperatorValue.
 *
 * - String → field key, uses defaultOperator.
 * - Object with `field` → look up field + optional operator.
 * - Returns undefined if the field/operator can't be resolved.
 */
function resolveFilterConfig(
  filter: TableFilterFieldRef | string,
  searchConfig: PowerSearchConfig,
): OperatorValue | undefined {
  const fieldKey = typeof filter === 'string' ? filter : filter.field;
  const operatorKey = typeof filter === 'string' ? undefined : filter.operator;

  const field = searchConfig.fields.find(f => f.key === fieldKey);
  if (!field) {
    return undefined;
  }

  const operator = resolveOperator(field, operatorKey);
  if (!operator) {
    return undefined;
  }

  return operator.value;
}

/**
 * Convert table filter state to PowerSearchFilter[] for use with `applyFilters`.
 *
 * Maps each non-empty entry in the filter state to a `PowerSearchFilter`,
 * resolving the field and operator from the column config + searchConfig.
 * This bridges the table filtering UI with PowerSearch's client-side
 * filter engine — define filters once, apply everywhere.
 *
 * @example
 * ```
 * const { config, applyFilters } = usePowerSearchConfig(defs);
 * const searchFilters = toSearchFilters(filters, columns, config);
 * const filteredData = applyFilters(searchFilters, data);
 * ```
 */
export function toSearchFilters<_T extends Record<string, unknown>>(
  filters: TableFilterState,
  columns: ReadonlyArray<{
    key: string;
    filter?: TableFilterFieldRef | string;
  }>,
  searchConfig: PowerSearchConfig,
): PowerSearchFilter[] {
  const result: PowerSearchFilter[] = [];

  for (const col of columns) {
    if (!col.filter) {
      continue;
    }
    const value = filters[col.key];
    if (value == null) {
      continue;
    }

    const fieldKey =
      typeof col.filter === 'string' ? col.filter : col.filter.field;
    const operatorKey =
      typeof col.filter === 'string' ? undefined : col.filter.operator;

    const field = searchConfig.fields.find(f => f.key === fieldKey);
    if (!field) {
      continue;
    }

    const operator = resolveOperator(field, operatorKey);
    if (!operator) {
      continue;
    }

    const filterValue = tableValueToFilterValue(value, operator.value);
    if (!filterValue) {
      continue;
    }

    result.push({field: fieldKey, operator: operator.key, value: filterValue});
  }

  return result;
}

/**
 * Convert a table filter value to a PowerSearch FilterValue
 * based on the operator's value type.
 */
function tableValueToFilterValue(
  value: TableFilterValue,
  opValue: OperatorValue,
): FilterValue | undefined {
  switch (opValue.type) {
    case 'string':
      return typeof value === 'string' ? {type: 'string', value} : undefined;
    case 'integer':
      return typeof value === 'number' ? {type: 'integer', value} : undefined;
    case 'float':
      return typeof value === 'number' ? {type: 'float', value} : undefined;
    case 'enum':
      return typeof value === 'string' ? {type: 'enum', value} : undefined;
    case 'enum_list':
      return Array.isArray(value)
        ? {type: 'enum_list', value: value}
        : undefined;
    case 'date_absolute':
      return typeof value === 'string'
        ? {
            type: 'date_absolute',
            unixSeconds: Math.floor(new Date(value).getTime() / 1000),
          }
        : undefined;
    case 'time':
      return typeof value === 'string' ? {type: 'time', value} : undefined;
    case 'string_list':
      return Array.isArray(value)
        ? {type: 'string_list', value: value}
        : undefined;
    case 'entity_list':
      return Array.isArray(value)
        ? {
            type: 'entity_list',
            value: value.map(id => ({id, label: id})),
          }
        : undefined;
    case 'nested':
    case 'empty':
    case 'date_relative':
    case 'date_range':
    case 'custom':
      return undefined;
  }
}

// =============================================================================
// Filter State
// =============================================================================

/**
 * Complete filter state — a map from column key to filter value.
 * Missing keys or `undefined` values mean "no filter applied" for that column.
 *
 * @example
 * ```
 * const filters: TableFilterState = {
 *   name: 'alice',
 *   status: 'active',
 *   tags: ['admin', 'user'],
 * };
 * ```
 */
export type TableFilterState = Record<string, TableFilterValue | undefined>;

/**
 * Display variant for the filter controls in the table header.
 *
 * - `'popover'` — filter icon in header; clicking opens a popover with the filter control
 * - `'inline'` — filter control rendered directly below header text inside the header cell
 * - `'inline-compact'` — same as inline but with compact-sized controls
 *
 * Applies while the filters are presented in the header; see
 * {@link UseTableFilteringConfig.presentation}.
 */
export type TableFilterVariant = 'popover' | 'inline' | 'inline-compact';

/**
 * Where the filter controls are presented.
 *
 * - `'header'` — in each column's header cell, as `variant` describes.
 * - `'bottom-sheet'` — out of the header and into one bottom sheet, opened
 *   from a Filter button above the table, on every device.
 * - `'adaptive'` — the bottom sheet on a compact screen under a coarse
 *   primary pointer (a phone), the header everywhere else.
 */
export type TableFilterPresentation = 'header' | 'bottom-sheet' | 'adaptive';

/** The presentation `'adaptive'` resolves to. */
type ResolvedFilterPresentation = Exclude<TableFilterPresentation, 'adaptive'>;

/**
 * Option count up to which the sheet renders an enum filter as a list of
 * checkboxes / radios instead of a Selector. Above it, the Selector's own
 * search and scrolling are worth the nested layer — the same point at which
 * CheckboxList and RadioList hand over to MultiSelector and Selector.
 */
const SHEET_LIST_MAX_OPTIONS = 7;

// =============================================================================
// Hook Config
// =============================================================================

/**
 * Configuration for useTableFiltering.
 *
 * @example
 * ```
 * const {filters, onFilterChange, clearAll} = useTableFilterState();
 * const filterPlugin = useTableFiltering({
 *   filters,
 *   onFilterChange,
 *   onClearAll: clearAll,
 *   variant: 'inline',
 *   presentation: 'adaptive',
 *   searchConfig,
 * });
 * <Table plugins={{ filter: filterPlugin }} columns={columns} data={data} />
 * ```
 */
export interface UseTableFilteringConfig {
  /** Current filter state — map from column key to filter value. */
  filters: TableFilterState;
  /** Called when the user changes a filter value. `null` clears the filter. */
  onFilterChange: (columnKey: string, value: TableFilterValue | null) => void;
  /**
   * Clears every filter at once. When provided, the bottom sheet shows a
   * Reset action that calls it once, so a controlled handler never sees one
   * clear per column. `useTableFilterState` returns one as `clearAll`.
   */
  onClearAll?: () => void;
  /**
   * Display variant for the header controls. Applies while `presentation`
   * resolves to the header.
   *
   * @default 'popover'
   */
  variant?: TableFilterVariant;
  /**
   * Where the filter controls are presented. `'header'` keeps them in the
   * column headers on every device. `'bottom-sheet'` moves every filter into
   * one bottom sheet opened from a Filter button above the table, which
   * carries the active-filter count; the sheet applies each change as it is
   * made and has no scrim, so the rows behind stay visible and keep updating.
   * `'adaptive'` presents the sheet on a compact touch screen, where a
   * column is too narrow to hold a control and a popover anchored to it
   * covers the rows it filters, and the header everywhere else.
   *
   * The server and hydrating renders always present the header. The
   * presentation in place when a filter surface opens stays until it closes.
   *
   * @default 'header'
   */
  presentation?: TableFilterPresentation;
  /**
   * PowerSearch configuration that defines the available filter fields.
   * Columns reference fields by key; the plugin resolves the operator's
   * value type and renders the matching control.
   *
   * Use `createPowerSearchConfig` or `usePowerSearchConfig` to build this
   * from field definitions — the same config can be shared with
   * `PowerSearch` for a unified filtering experience.
   */
  searchConfig: PowerSearchConfig;
}

// =============================================================================
// Filter Store & Context
// =============================================================================

interface FilterStore {
  getConfig: () => UseTableFilteringConfig;
  /**
   * Keeps the current presentation while a filter surface (the sheet or a
   * header popover) is open, so a change of pointer or viewport cannot
   * unmount the surface and drop its focus or an unapplied draft. `null`
   * releases it.
   */
  holdPresentation: (presentation: ResolvedFilterPresentation | null) => void;
}

const FilterStoreContext = createContext<FilterStore | null>(null);
FilterStoreContext.displayName = 'FilterStoreContext';

function useFilterStore(): FilterStore {
  const store = use(FilterStoreContext);
  if (!store) {
    throw new Error(
      'useFilterStore must be used within a Table with filtering',
    );
  }
  return store;
}

/**
 * Hold the plugin's presentation while a filter surface is open, and release
 * it when the surface closes or unmounts.
 */
function useHoldPresentation(
  store: FilterStore,
  presentation: ResolvedFilterPresentation,
  isOpen: boolean,
): void {
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    store.holdPresentation(presentation);
    return () => store.holdPresentation(null);
  }, [store, presentation, isOpen]);
}

/** Variant is stable per plugin instance — kept in a separate context so
 *  slot components can read it without going through the mutable store. */
const FilterVariantContext = createContext<TableFilterVariant>('popover');
FilterVariantContext.displayName = 'FilterVariantContext';

/** True for controls rendered in the bottom sheet rather than a header cell. */
const FilterInSheetContext = createContext(false);
FilterInSheetContext.displayName = 'FilterInSheetContext';

// =============================================================================
// Styles
// =============================================================================

const filterStyles = stylex.create({
  afterPopover: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  afterInline: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
    marginTop: spacingVars['--spacing-1'],
    minWidth: 0,
  },
  triggerButton: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    borderRadius: radiusVars['--radius-element'],
    flexShrink: 0,
    // Minimum 44px touch target on coarse pointer devices (iOS guideline).
    '@media (pointer: coarse)': {
      minWidth: '44px',
      minHeight: '44px',
    },
  },
  triggerInactive: {
    opacity: {
      default: 0.35,
      ':is(th:hover *)': 1,
      ':focus-visible': 1,
    },
  },
  triggerActive: {
    opacity: 1,
  },
  popoverContent: {
    width: '240px',
  },
  popoverActions: {
    display: 'flex',
    gap: spacingVars['--spacing-2'],
    marginTop: spacingVars['--spacing-2'],
  },
  popoverActionsSpacer: {
    flex: 1,
  },
  placeholder: {
    height: '32px',
  },
  placeholderCompact: {
    height: '28px',
  },
  sheetToolbar: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: spacingVars['--spacing-2'],
  },
  sheetTrigger: {
    // The one filter affordance on a touch screen; no size token reaches the
    // 44px target on every theme, so the floor is set here. Matches the
    // header trigger above.
    minHeight: {
      default: null,
      '@media (pointer: coarse)': '44px',
    },
  },
});

// =============================================================================
// Filter Control Components
// =============================================================================

/**
 * Label props for one filter control.
 *
 * In a header cell the column name is already on screen, so the control's own
 * label is hidden and spells the column out for assistive tech ("Filter by
 * Status"). In the sheet there is no header cell, so the column name becomes
 * the control's visible label.
 */
function useFilterLabel(header: string): {
  label: string;
  isLabelHidden: boolean;
} {
  const t = useTranslator();
  const isInSheet = use(FilterInSheetContext);
  return isInSheet
    ? {label: header, isLabelHidden: false}
    : {
        label: t('@astryx.tableFiltering.filterByColumn', {header}),
        isLabelHidden: true,
      };
}

function TextFilterControl({
  columnKey,
  header,
  size,
  hasClear,
}: {
  columnKey: string;
  header: string;
  size: 'sm' | 'md';
  hasClear?: boolean;
}) {
  const t = useTranslator();
  const labelProps = useFilterLabel(header);
  const store = useFilterStore();
  const config = store.getConfig();
  const value = config.filters[columnKey];
  const strValue = typeof value === 'string' ? value : '';

  return (
    <TextInput
      {...labelProps}
      value={strValue}
      onChange={(newValue: string) => {
        store
          .getConfig()
          .onFilterChange(columnKey, newValue === '' ? null : newValue);
      }}
      placeholder={t('@astryx.tableFiltering.filterByColumn', {header})}
      size={size}
      hasClear={hasClear}
    />
  );
}

function useLiveNumberFilter({
  value,
  min,
  max,
  hasClear,
  onChange,
}: {
  value: number | null;
  min?: number | null;
  max?: number | null;
  hasClear: boolean;
  onChange: (value: number | null) => void;
}) {
  const locale = useLocale();
  const editStartValueRef = useRef(value);

  const handleChange = useCallback(
    (nextValue: number | null) => {
      editStartValueRef.current = nextValue;
      onChange(nextValue);
    },
    [onChange],
  );
  const handleFocus = useCallback(() => {
    editStartValueRef.current = value;
  }, [value]);
  const handleInput = useCallback(
    (event: FormEvent<HTMLElement>) => {
      const nextValue = parseNumberInput(
        (event.currentTarget as HTMLInputElement).value,
        {
          min,
          max,
          locale,
        },
      );
      if (nextValue !== null && nextValue !== value) {
        onChange(nextValue);
      }
    },
    [locale, max, min, onChange, value],
  );
  const restoreRejectedDraft = useCallback(
    (input: HTMLInputElement) => {
      const decision = resolveNumberInputCommit(input.value, {
        min,
        max,
        locale,
        hasClear,
      });
      if (decision.type === 'revert' && value !== editStartValueRef.current) {
        onChange(editStartValueRef.current);
      }
    },
    [hasClear, locale, max, min, onChange, value],
  );
  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      restoreRejectedDraft(event.currentTarget);
    },
    [restoreRejectedDraft],
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        restoreRejectedDraft(event.currentTarget);
      }
    },
    [restoreRejectedDraft],
  );

  return {handleBlur, handleChange, handleFocus, handleInput, handleKeyDown};
}

function NumberFilterControl({
  columnKey,
  header,
  operatorValue,
  size,
  hasClear,
}: {
  columnKey: string;
  header: string;
  operatorValue: IntegerOperatorValue | FloatOperatorValue;
  size: 'sm' | 'md';
  hasClear?: boolean;
}) {
  const t = useTranslator();
  const labelProps = useFilterLabel(header);
  const store = useFilterStore();
  const config = store.getConfig();
  const value = config.filters[columnKey];
  const numValue = typeof value === 'number' ? value : null;

  const step = operatorValue.type === 'integer' ? 1 : null;

  const updateFilter = useCallback(
    (newValue: number | null) => {
      store.getConfig().onFilterChange(columnKey, newValue);
    },
    [store, columnKey],
  );
  const liveFilter = useLiveNumberFilter({
    value: numValue,
    min: operatorValue.minValue,
    max: operatorValue.maxValue,
    hasClear: !!hasClear,
    onChange: updateFilter,
  });

  if (hasClear) {
    return (
      <NumberInput
        {...labelProps}
        value={numValue}
        onChange={liveFilter.handleChange}
        onFocus={liveFilter.handleFocus}
        onInput={liveFilter.handleInput}
        onBlur={liveFilter.handleBlur}
        onKeyDown={liveFilter.handleKeyDown}
        placeholder={t('@astryx.tableFiltering.filterByColumn', {header})}
        min={operatorValue.minValue ?? null}
        max={operatorValue.maxValue ?? null}
        step={step}
        size={size}
        hasClear
      />
    );
  }

  return (
    <NumberInput
      {...labelProps}
      value={numValue}
      onChange={liveFilter.handleChange}
      onFocus={liveFilter.handleFocus}
      onInput={liveFilter.handleInput}
      onBlur={liveFilter.handleBlur}
      onKeyDown={liveFilter.handleKeyDown}
      placeholder={t('@astryx.tableFiltering.filterByColumn', {header})}
      min={operatorValue.minValue ?? null}
      max={operatorValue.maxValue ?? null}
      step={step}
      size={size}
    />
  );
}

function SelectorFilterControl({
  columnKey,
  header,
  operatorValue,
  size,
  hasClear,
}: {
  columnKey: string;
  header: string;
  operatorValue: EnumOperatorValue;
  size: 'sm' | 'md';
  hasClear?: boolean;
}) {
  const t = useTranslator();
  const labelProps = useFilterLabel(header);
  const store = useFilterStore();
  const config = store.getConfig();
  const value = config.filters[columnKey];
  const strValue = typeof value === 'string' ? value : '';

  const options = operatorValue.values.map(v => ({
    value: v.value,
    label: v.label,
  }));

  const handleChange = useCallback(
    (newValue: string | null) => {
      store
        .getConfig()
        .onFilterChange(
          columnKey,
          newValue === '' || newValue == null ? null : newValue,
        );
    },
    [store, columnKey],
  );

  if (hasClear) {
    return (
      <Selector
        {...labelProps}
        options={options}
        value={strValue || null}
        onChange={handleChange}
        placeholder={t('@astryx.table.filter.allPlaceholder')}
        size={size}
        hasClear
      />
    );
  }

  return (
    <Selector
      {...labelProps}
      options={options}
      value={strValue}
      onChange={handleChange}
      placeholder={t('@astryx.table.filter.allPlaceholder')}
      size={size}
    />
  );
}

function MultiSelectorFilterControl({
  columnKey,
  header,
  operatorValue,
  size,
  hasClear,
}: {
  columnKey: string;
  header: string;
  operatorValue: EnumListOperatorValue;
  size: 'sm' | 'md';
  hasClear?: boolean;
}) {
  const t = useTranslator();
  const labelProps = useFilterLabel(header);
  const store = useFilterStore();
  const config = store.getConfig();
  const value = config.filters[columnKey];
  const arrValue = Array.isArray(value) ? value : [];

  const options = operatorValue.values.map(v => ({
    value: v.value,
    label: v.label,
  }));

  return (
    <MultiSelector
      {...labelProps}
      options={options}
      value={arrValue}
      onChange={(newValue: string[]) => {
        store
          .getConfig()
          .onFilterChange(columnKey, newValue.length === 0 ? null : newValue);
      }}
      placeholder={t('@astryx.table.filter.allPlaceholder')}
      size={size}
      hasSelectAll
      hasSearch={false}
      hasClear={hasClear}
    />
  );
}

function DateFilterControl({
  columnKey,
  header,
  size,
  hasClear,
}: {
  columnKey: string;
  header: string;
  size: 'sm' | 'md';
  hasClear?: boolean;
}) {
  const labelProps = useFilterLabel(header);
  const store = useFilterStore();
  const value = store.getConfig().filters[columnKey] as string | undefined;

  return (
    <DateInput
      {...labelProps}
      value={(value as ISODateString | undefined) ?? undefined}
      onChange={newValue => {
        store.getConfig().onFilterChange(columnKey, newValue ?? null);
      }}
      size={size}
      hasClear={hasClear}
    />
  );
}

function TimeFilterControl({
  columnKey,
  header,
  size,
  hasClear,
}: {
  columnKey: string;
  header: string;
  size: 'sm' | 'md';
  hasClear?: boolean;
}) {
  const labelProps = useFilterLabel(header);
  const store = useFilterStore();
  const value = store.getConfig().filters[columnKey] as string | undefined;

  return (
    <TimeInput
      {...labelProps}
      value={(value as ISOTimeString | undefined) ?? undefined}
      onChange={newValue => {
        store.getConfig().onFilterChange(columnKey, newValue ?? null);
      }}
      size={size}
      hasClear={hasClear}
    />
  );
}

function StringListFilterControl({
  columnKey,
  header,
  operatorValue,
  size,
  hasClear,
}: {
  columnKey: string;
  header: string;
  operatorValue: StringListOperatorValue | EntityListOperatorValue;
  size: 'sm' | 'md';
  hasClear?: boolean;
}) {
  const labelProps = useFilterLabel(header);
  const store = useFilterStore();
  const value =
    (store.getConfig().filters[columnKey] as string[] | undefined) ?? [];

  // Use the operator's search source if provided, otherwise fall back
  // to a simple static source that accepts any typed text as a new tag.
  const fallbackSource = useMemo(
    () => ({
      search: async (query: string) =>
        query.trim() ? [{id: query.trim(), label: query.trim()}] : [],
      bootstrap: () => [] as {id: string; label: string}[],
    }),
    [],
  );

  const searchSource = operatorValue.searchSource ?? fallbackSource;

  return (
    <Tokenizer
      {...labelProps}
      searchSource={searchSource}
      value={value.map(v => ({id: v, label: v}))}
      onChange={items => {
        const newValues = items.map(item => item.id);
        store
          .getConfig()
          .onFilterChange(columnKey, newValues.length > 0 ? newValues : null);
      }}
      size={size}
      hasClear={hasClear}
    />
  );
}

/** Renders the appropriate filter control for a column's operator value type. */
function FilterControl({
  columnKey,
  header,
  operatorValue,
  size,
  hasClear,
}: {
  columnKey: string;
  header: string;
  operatorValue: OperatorValue;
  size: 'sm' | 'md';
  hasClear?: boolean;
}) {
  switch (operatorValue.type) {
    case 'string':
      return (
        <TextFilterControl
          columnKey={columnKey}
          header={header}
          size={size}
          hasClear={hasClear}
        />
      );
    case 'integer':
    case 'float':
      return (
        <NumberFilterControl
          columnKey={columnKey}
          header={header}
          operatorValue={operatorValue}
          size={size}
          hasClear={hasClear}
        />
      );
    case 'enum':
      return (
        <SelectorFilterControl
          columnKey={columnKey}
          header={header}
          operatorValue={operatorValue}
          size={size}
          hasClear={hasClear}
        />
      );
    case 'enum_list':
      return (
        <MultiSelectorFilterControl
          columnKey={columnKey}
          header={header}
          operatorValue={operatorValue}
          size={size}
          hasClear={hasClear}
        />
      );
    case 'date_absolute':
      return (
        <DateFilterControl
          columnKey={columnKey}
          header={header}
          size={size}
          hasClear={hasClear}
        />
      );
    case 'time':
      return (
        <TimeFilterControl
          columnKey={columnKey}
          header={header}
          size={size}
          hasClear={hasClear}
        />
      );
    case 'string_list':
    case 'entity_list':
      return (
        <StringListFilterControl
          columnKey={columnKey}
          header={header}
          operatorValue={operatorValue}
          size={size}
          hasClear={hasClear}
        />
      );
    case 'nested':
    case 'empty':
    case 'date_relative':
    case 'date_range':
    case 'custom':
      return null;
  }
}

// =============================================================================
// Popover Filter Trigger
// =============================================================================

function PopoverFilterTrigger({
  columnKey,
  header,
  operatorValue,
}: {
  columnKey: string;
  header: string;
  operatorValue: OperatorValue;
}) {
  const t = useTranslator();
  const store = useFilterStore();
  const config = store.getConfig();
  const value = config.filters[columnKey];
  const hasValue = value != null;
  const [isOpen, setIsOpen] = useState(false);
  // An open popover keeps the header presentation until it closes, so an
  // adaptive switch to the sheet cannot unmount it and drop the draft.
  useHoldPresentation(store, 'header', isOpen);

  // Buffer the filter value locally while the popover is open.
  // Only commit to the consumer's state on explicit "Apply".
  const [draft, setDraft] = useState<TableFilterValue | null>(null);

  const handleOpen = useCallback(
    (open: boolean) => {
      if (open) {
        // Seed draft from current value when opening
        setDraft(value ?? null);
      }
      setIsOpen(open);
    },
    [value],
  );

  const handleApply = useCallback(() => {
    store.getConfig().onFilterChange(columnKey, draft);
    setIsOpen(false);
  }, [store, columnKey, draft]);

  const handleClear = useCallback(() => {
    store.getConfig().onFilterChange(columnKey, null);
    setIsOpen(false);
  }, [store, columnKey]);

  // Build a local store override so FilterControl writes to the draft
  // instead of the consumer's state.
  const draftStore = useMemo<FilterStore>(
    () => ({
      ...store,
      getConfig() {
        return {
          ...store.getConfig(),
          filters: {
            ...store.getConfig().filters,
            [columnKey]: draft ?? undefined,
          },
          onFilterChange: (_key: string, val: TableFilterValue | null) => {
            setDraft(val);
          },
        };
      },
    }),
    [store, columnKey, draft, setDraft],
  );

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={handleOpen}
      label={t('@astryx.tableFiltering.filterByColumn', {header})}
      placement="below"
      alignment="start"
      content={
        <FilterStoreContext value={draftStore}>
          <div {...stylex.props(filterStyles.popoverContent)}>
            <FilterControl
              columnKey={columnKey}
              header={header}
              operatorValue={operatorValue}
              size="md"
            />
            <div {...stylex.props(filterStyles.popoverActions)}>
              <Button
                label={t('@astryx.table.filter.reset')}
                variant="ghost"
                size="sm"
                onClick={handleClear}
              />
              <div {...stylex.props(filterStyles.popoverActionsSpacer)} />
              <Button
                label={t('@astryx.table.filter.apply')}
                variant="primary"
                size="sm"
                onClick={handleApply}
              />
            </div>
          </div>
        </FilterStoreContext>
      }>
      <button
        type="button"
        aria-label={t('@astryx.tableFiltering.filterByColumn', {header})}
        aria-haspopup="dialog"
        {...stylex.props(
          filterStyles.triggerButton,
          hasValue ? filterStyles.triggerActive : filterStyles.triggerInactive,
        )}>
        <Icon
          icon="funnel"
          size="xsm"
          color={hasValue ? 'accent' : 'secondary'}
        />
      </button>
    </Popover>
  );
}

// =============================================================================
// Helper
// =============================================================================

function getHeaderString(column: TableColumn<Record<string, unknown>>): string {
  if (typeof column.header === 'string') {
    return column.header;
  }
  return column.key;
}

// =============================================================================
// Filter Slot Components
//
// These are stable components rendered by transformHeaderCell. Because the
// component *type* (`FilterSlot` / `InlineFilterSlot`) never changes across
// renders, React keeps the same fiber and no remount occurs when filter state
// updates. All dynamic data (filters, onFilterChange, operatorValue) is read
// from FilterStoreContext at render time — not passed as props.
// =============================================================================

/**
 * Popover variant slot — renders the funnel trigger button for one column.
 * Reads filter state and column config from context.
 */
function FilterSlot({
  columnKey,
  header,
  operatorValue,
}: {
  columnKey: string;
  header: string;
  operatorValue: OperatorValue;
}) {
  return (
    <div {...stylex.props(filterStyles.afterPopover)}>
      <PopoverFilterTrigger
        columnKey={columnKey}
        header={header}
        operatorValue={operatorValue}
      />
    </div>
  );
}

/**
 * Inline variant slot — renders the filter control (or placeholder) for one
 * column. Uses native `hasClear` on each input component for clearing.
 */
function InlineFilterSlot({
  columnKey,
  header,
  operatorValue,
}: {
  columnKey: string;
  header: string;
  operatorValue: OperatorValue | undefined;
}) {
  const variant = use(FilterVariantContext);
  const size = 'sm';
  const placeholderStyle =
    variant === 'inline-compact'
      ? filterStyles.placeholderCompact
      : filterStyles.placeholder;

  return (
    <div {...stylex.props(filterStyles.afterInline)}>
      {operatorValue != null ? (
        <FilterControl
          columnKey={columnKey}
          header={header}
          operatorValue={operatorValue}
          size={size}
          hasClear
        />
      ) : (
        <div aria-hidden="true" {...stylex.props(placeholderStyle)} />
      )}
    </div>
  );
}

// =============================================================================
// Bottom Sheet Presentation
//
// A header cell is the wrong home for a filter on a phone: the column is too
// narrow to hold a control, and a popover anchored to it covers the very rows
// the filter is meant to narrow. The sheet presentation takes every filter out
// of the header and puts it behind one Filter button above the table, in a
// bottom sheet with no scrim — so the rows stay visible and keep updating as
// filters are toggled, which is the whole point of filtering on a small screen.
// =============================================================================

/** One filterable column, with its operator resolved to a control. */
interface SheetFilterField {
  columnKey: string;
  header: string;
  operatorValue: OperatorValue;
}

/** Whether a filter value narrows anything. */
function isFilterActive(value: TableFilterValue | undefined): boolean {
  if (value == null) {
    return false;
  }
  if (typeof value === 'string') {
    return value !== '';
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

/**
 * How many filters narrow the rows: every active entry in the filter state,
 * including one on a column the table does not show right now. Reset clears
 * the same set, so the count and Reset never disagree.
 */
function countActiveFilters(filters: TableFilterState): number {
  let count = 0;
  for (const value of Object.values(filters)) {
    if (isFilterActive(value)) {
      count++;
    }
  }
  return count;
}

/**
 * The columns the sheet renders a control for, in table order, from the final
 * column list the table rendered.
 */
function resolveSheetFields(
  columns: ReadonlyArray<TableColumn<Record<string, unknown>>>,
  searchConfig: PowerSearchConfig,
): SheetFilterField[] {
  const fields: SheetFilterField[] = [];
  for (const column of columns) {
    if (column.filter == null) {
      continue;
    }
    const operatorValue = resolveFilterConfig(column.filter, searchConfig);
    if (!operatorValue) {
      continue;
    }
    fields.push({
      columnKey: column.key,
      header: getHeaderString(column),
      operatorValue,
    });
  }
  return fields;
}

/** Whether an enum filter is short enough to show as a list in the sheet. */
function isSheetList(operatorValue: OperatorValue): boolean {
  return (
    (operatorValue.type === 'enum' || operatorValue.type === 'enum_list') &&
    operatorValue.values.length <= SHEET_LIST_MAX_OPTIONS
  );
}

/**
 * Whether a field renders a text-entry control that brings up the mobile
 * keyboard. Such a sheet opens Tall, the one height that keeps a focused
 * control above the keyboard; date and time filters open their own picker.
 */
function bringsUpKeyboard(operatorValue: OperatorValue): boolean {
  switch (operatorValue.type) {
    case 'string':
    case 'integer':
    case 'float':
    case 'string_list':
    case 'entity_list':
      return true;
    case 'enum':
    case 'enum_list':
    case 'date_absolute':
    case 'time':
    case 'nested':
    case 'empty':
    case 'date_relative':
    case 'date_range':
    case 'custom':
      return false;
  }
}

/**
 * Multi-select filter as a list of checkboxes. Every option is on screen and
 * one tap wide, and nothing opens a second layer on top of the sheet.
 */
function SheetCheckboxFilter({
  columnKey,
  header,
  operatorValue,
}: {
  columnKey: string;
  header: string;
  operatorValue: EnumListOperatorValue;
}) {
  const store = useFilterStore();
  const value = store.getConfig().filters[columnKey];
  const selected = Array.isArray(value) ? value : [];

  return (
    <CheckboxList
      label={header}
      value={selected}
      onChange={(next: string[]) => {
        store
          .getConfig()
          .onFilterChange(columnKey, next.length === 0 ? null : next);
      }}
      hasDividers>
      {operatorValue.values.map(option => (
        <CheckboxListItem
          key={option.value}
          label={option.label}
          value={option.value}
        />
      ))}
    </CheckboxList>
  );
}

/**
 * Single-select filter as a list of radios. The leading option clears the
 * filter, standing in for the Selector's "All" placeholder.
 */
function SheetRadioFilter({
  columnKey,
  header,
  operatorValue,
}: {
  columnKey: string;
  header: string;
  operatorValue: EnumOperatorValue;
}) {
  const t = useTranslator();
  const store = useFilterStore();
  const value = store.getConfig().filters[columnKey];
  const selected = typeof value === 'string' ? value : '';

  return (
    <RadioList
      label={header}
      value={selected}
      onChange={(next: string) => {
        store.getConfig().onFilterChange(columnKey, next === '' ? null : next);
      }}>
      <RadioListItem
        label={t('@astryx.table.filter.allPlaceholder')}
        value=""
      />
      {operatorValue.values.map(option => (
        <RadioListItem
          key={option.value}
          label={option.label}
          value={option.value}
        />
      ))}
    </RadioList>
  );
}

/**
 * One field in the sheet. A short enum becomes a list of checkboxes or radios;
 * everything else keeps the control the header variants use, at full width
 * with its column name as a visible label.
 */
function SheetField({field}: {field: SheetFilterField}) {
  const {columnKey, header, operatorValue} = field;

  if (operatorValue.type === 'enum_list' && isSheetList(operatorValue)) {
    return (
      <SheetCheckboxFilter
        columnKey={columnKey}
        header={header}
        operatorValue={operatorValue}
      />
    );
  }

  if (operatorValue.type === 'enum' && isSheetList(operatorValue)) {
    return (
      <SheetRadioFilter
        columnKey={columnKey}
        header={header}
        operatorValue={operatorValue}
      />
    );
  }

  return (
    <FilterControl
      columnKey={columnKey}
      header={header}
      operatorValue={operatorValue}
      size="md"
      hasClear
    />
  );
}

/**
 * The Filter button above the table and the sheet it opens. Rendered once per
 * table by `transformTableContext`; its fields come from the final column list
 * the table rendered (TableColumnsContext).
 */
function TableFilterSheet() {
  const t = useTranslator();
  const store = useFilterStore();
  const columns = use(TableColumnsContext);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const {filters, searchConfig, onClearAll} = store.getConfig();
  const fields = useMemo(
    () => resolveSheetFields(columns, searchConfig),
    [columns, searchConfig],
  );
  const activeCount = countActiveFilters(filters);
  // A sheet whose last filterable column went away has nothing to show.
  const isSheetOpen = isOpen && fields.length > 0;
  useHoldPresentation(store, 'bottom-sheet', isSheetOpen);

  // Nothing filterable — no button, no sheet.
  if (fields.length === 0) {
    return null;
  }

  const title = t('@astryx.table.filter.title');
  const needsKeyboard = fields.some(
    field =>
      !isSheetList(field.operatorValue) &&
      bringsUpKeyboard(field.operatorValue),
  );

  return (
    <>
      <div {...stylex.props(filterStyles.sheetToolbar)}>
        <Button
          ref={triggerRef}
          label={t('@astryx.table.filter.button')}
          // The count reads as a bare number next to the label otherwise.
          aria-label={
            activeCount > 0
              ? t('@astryx.table.filter.buttonWithCount', {count: activeCount})
              : undefined
          }
          variant="secondary"
          icon={<Icon icon="funnel" size="sm" />}
          endContent={
            activeCount > 0 ? (
              <Badge label={activeCount} variant="info" />
            ) : undefined
          }
          xstyle={filterStyles.sheetTrigger}
          onClick={() => setIsOpen(true)}
        />
      </div>
      <BottomSheet
        isOpen={isSheetOpen}
        // Done, Escape and a swipe all end here, and the sheet's own close
        // returns focus to the Filter button.
        onOpenChange={setIsOpen}
        finalFocusRef={triggerRef}
        label={title}
        height={needsKeyboard ? 'tall' : 'hug'}
        // No scrim: the rows stay visible and keep updating underneath as
        // filters are toggled, so the sheet shows its own effect.
        hasScrim={false}>
        <FilterInSheetContext value>
          <VStack gap={4}>
            <HStack justify="between" align="center" gap={2}>
              <Heading level={3}>{title}</Heading>
              {onClearAll != null && (
                <Button
                  label={t('@astryx.table.filter.reset')}
                  variant="ghost"
                  size="sm"
                  isDisabled={activeCount === 0}
                  onClick={onClearAll}
                />
              )}
            </HStack>
            {fields.map(field => (
              <SheetField key={field.columnKey} field={field} />
            ))}
            <Button
              label={t('@astryx.table.filter.done')}
              variant="primary"
              width="100%"
              onClick={() => setIsOpen(false)}
            />
          </VStack>
        </FilterInSheetContext>
      </BottomSheet>
    </>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * useTableFiltering — table plugin for column filtering.
 *
 * Returns a stable TablePlugin that transforms header cells to add
 * filter controls. Follows the headless pattern: consumer owns filter state,
 * plugin provides UI and interaction.
 *
 * Filter types are configured per-column via the `filter` field on
 * TableColumn. The plugin reads filter config from columns and
 * renders the appropriate control (text input, selector, etc.).
 *
 * @template T - Row data type
 *
 * @example
 * ```
 * const {filters, onFilterChange, clearAll} = useTableFilterState();
 * const filterPlugin = useTableFiltering({
 *   filters,
 *   onFilterChange,
 *   onClearAll: clearAll,
 *   variant: 'popover',
 *   presentation: 'adaptive',
 *   searchConfig,
 * });
 * <Table
 *   data={users}
 *   columns={[
 *     { key: 'name', header: 'Name', filter: 'name' },
 *     { key: 'status', header: 'Status', filter: 'status' },
 *   ]}
 *   plugins={{ filter: filterPlugin }}
 * />
 * ```
 */
export function useTableFiltering<T extends Record<string, unknown>>(
  config: UseTableFilteringConfig,
): TablePlugin<T> {
  const configRef = useRef(config);
  configRef.current = config;

  // The presentation a filter surface opened in, kept until it closes.
  const [heldPresentation, setHeldPresentation] =
    useState<ResolvedFilterPresentation | null>(null);

  const storeRef = useRef<FilterStore | null>(null);
  if (storeRef.current == null) {
    storeRef.current = {
      getConfig() {
        return configRef.current;
      },
      holdPresentation: setHeldPresentation,
    };
  }
  const store = storeRef.current;

  const {variant = 'popover', presentation = 'header'} = config;

  // `'adaptive'` resolves through the shared compact-touch rule: the theme's
  // compact definition under a coarse primary pointer, and never in the
  // server or hydrating render.
  const livePresentation: ResolvedFilterPresentation =
    useAdaptivePresentation(
      presentation === 'header' ? 'popover' : presentation,
    ) === 'bottom-sheet'
      ? 'bottom-sheet'
      : 'header';
  const resolvedPresentation = heldPresentation ?? livePresentation;
  const isSheet = resolvedPresentation === 'bottom-sheet';

  return useMemo(
    (): TablePlugin<T> => ({
      // For inline variants, upgrade columns with filters and no explicit width
      // to proportional(1) so they get a default minWidth from the width resolver.
      // Without this, inline filter inputs can collapse to unusable sizes.
      transformColumns:
        !isSheet && (variant === 'inline' || variant === 'inline-compact')
          ? (columns: TableColumn<T>[]) =>
              columns.map(col => {
                if (col.filter != null && col.width == null) {
                  return {...col, width: proportional(1)};
                }
                return col;
              })
          : undefined,

      transformTableContext(children: ReactNode) {
        return (
          <FilterStoreContext value={store}>
            <FilterVariantContext value={variant}>
              {isSheet && <TableFilterSheet />}
              {children}
            </FilterVariantContext>
          </FilterStoreContext>
        );
      },

      transformHeaderCell(
        props: HeaderCellRenderProps,
        column: TableColumn<T>,
      ): HeaderCellRenderProps {
        // Every control lives in the sheet, so the header keeps nothing but
        // its label.
        if (isSheet) {
          return props;
        }

        const rawFilter = column.filter;
        const header = getHeaderString(
          column as TableColumn<Record<string, unknown>>,
        );

        // Resolve field references to concrete OperatorValue
        const operatorValue = rawFilter
          ? resolveFilterConfig(rawFilter, store.getConfig().searchConfig)
          : undefined;

        if (variant === 'popover') {
          // No operator value on this column — nothing to render.
          if (!operatorValue) {
            return props;
          }

          return {
            ...props,
            after: (
              <>
                {props.after}
                <FilterSlot
                  columnKey={column.key}
                  header={header}
                  operatorValue={operatorValue}
                />
              </>
            ),
          };
        }

        // Inline or inline-compact: render filter controls below the header
        // label row. Uses the `below` slot so controls sit underneath the
        // header content rather than inline after it.
        return {
          ...props,
          below: (
            <>
              {props.below}
              <InlineFilterSlot
                columnKey={column.key}
                header={header}
                operatorValue={operatorValue}
              />
            </>
          ),
        };
      },
    }),
    [store, variant, isSheet],
  );
}
