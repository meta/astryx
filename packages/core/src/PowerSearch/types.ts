// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file types.ts
 * @input None
 * @output Exports all PowerSearch type definitions
 * @position Type definitions; consumed by all PowerSearch modules
 *
 * SYNC: When modified, update:
 * - /packages/core/src/PowerSearch/index.ts
 */

import type {ComponentType, ReactNode} from 'react';
import type {SearchSource, SearchableItem} from '../Typeahead/types';

// =============================================================================
// Operator Value Types — define what kind of editor to show
// =============================================================================

export interface EmptyOperatorValue {
  readonly type: 'empty';
}

export interface StringOperatorValue {
  readonly type: 'string';
  /** When provided, shows a typeahead instead of a plain text input. */
  readonly searchSource?: SearchSource;
  /** Allow arbitrary strings not in the search source. @default false */
  readonly isArbitraryStringAllowed?: boolean;
}

export interface StringListOperatorValue {
  readonly type: 'string_list';
  /** When provided, shows a tokenizer with search. */
  readonly searchSource?: SearchSource;
  /** Allow arbitrary strings not in the search source. @default false */
  readonly isArbitraryStringAllowed?: boolean;
  /** Tokenization config for paste behavior. */
  readonly tokenization?: OperatorTokenizationConfig;
}

export interface IntegerOperatorValue {
  readonly type: 'integer';
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly units?: string;
}

export interface FloatOperatorValue {
  readonly type: 'float';
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly units?: string;
}

export interface TimeOperatorValue {
  readonly type: 'time';
  readonly minValue?: string;
  readonly maxValue?: string;
}

export interface DateAbsoluteOperatorValue {
  readonly type: 'date_absolute';
  /**
   * True or unset: the value is a calendar day, edited with a date picker.
   * False: the value is an instant with a time of day, edited with a date
   * picker and a time field and shown with its time in `timezoneID`, else
   * the viewer's zone.
   */
  readonly isDateOnly?: boolean;
}

export interface DateRelativeOperatorValue {
  readonly type: 'date_relative';
  /** Allow past dates. @default true */
  readonly isPastAllowed?: boolean;
  /** Allow future dates. @default true */
  readonly isFutureAllowed?: boolean;
}

export interface DateRangeOperatorValue {
  readonly type: 'date_range';
  /** Preset date ranges (e.g. "Last 7 days"). */
  readonly intervalDatePresets?: ReadonlyArray<DateRangeFilterPreset>;
  /** Preset relative dates. */
  readonly relativeDatePresets?: ReadonlyArray<RelativeDateFilterPreset>;
}

export interface EnumItem {
  readonly value: string;
  readonly label: string;
  readonly icon?: ReactNode;
}

export interface EnumOperatorValue {
  readonly type: 'enum';
  readonly values: ReadonlyArray<EnumItem>;
}

export interface EnumListOperatorValue {
  readonly type: 'enum_list';
  readonly values: ReadonlyArray<EnumItem>;
}

export interface EntityListOperatorValue {
  readonly type: 'entity_list';
  /** Search source for entities. */
  readonly searchSource?: SearchSource;
  /** Allow arbitrary strings not in the search source. @default false */
  readonly isArbitraryStringAllowed?: boolean;
  /** Tokenization config for paste behavior. */
  readonly tokenization?: OperatorTokenizationConfig;
  /** Custom renderer for items in the search dropdown. */
  readonly renderItem?: (item: SearchableItem) => ReactNode;
}

export interface CustomOperatorValue {
  readonly type: 'custom';
  /** Custom editor component. */
  readonly Editor: React.ComponentType<{
    isDisabled?: boolean;
    onChange: (value: string | null) => void;
    placeholder: string;
    value: string | null;
  }>;
  /** Convert JSON value to display string. */
  readonly getString: (value: string) => string;
}

export interface NestedOperatorValue {
  readonly type: 'nested';
}

export type OperatorValue =
  | EmptyOperatorValue
  | StringOperatorValue
  | StringListOperatorValue
  | IntegerOperatorValue
  | FloatOperatorValue
  | TimeOperatorValue
  | DateAbsoluteOperatorValue
  | DateRelativeOperatorValue
  | DateRangeOperatorValue
  | EnumOperatorValue
  | EnumListOperatorValue
  | EntityListOperatorValue
  | CustomOperatorValue
  | NestedOperatorValue;

// =============================================================================
// Filter Value Types — the actual stored values
// =============================================================================

export interface FilterValueEmpty {
  readonly type: 'empty';
}

export interface FilterValueString {
  readonly type: 'string';
  readonly value: string;
}

export interface FilterValueStringList {
  readonly type: 'string_list';
  readonly value: ReadonlyArray<string>;
}

export interface FilterValueInteger {
  readonly type: 'integer';
  readonly value: number;
}

export interface FilterValueFloat {
  readonly type: 'float';
  readonly value: number;
}

export interface FilterValueTime {
  readonly type: 'time';
  readonly value: string;
}

export interface FilterValueDateAbsolute {
  readonly type: 'date_absolute';
  readonly unixSeconds: number;
}

export interface FilterValueDateRelative {
  readonly type: 'date_relative';
  readonly value: string;
}

export interface FilterValueDateRange {
  readonly type: 'date_range';
  readonly value: DateTimeRange;
}

export interface FilterValueEnum {
  readonly type: 'enum';
  readonly value: string;
}

export interface FilterValueEnumList {
  readonly type: 'enum_list';
  readonly value: ReadonlyArray<string>;
}

export interface PowerSearchEntity {
  readonly id: string;
  readonly label: string;
  readonly photo?: string;
}

export interface FilterValueEntityList {
  readonly type: 'entity_list';
  readonly value: ReadonlyArray<PowerSearchEntity>;
}

export interface FilterValueCustom {
  readonly type: 'custom';
  /** Custom values are stored as JSON strings. */
  readonly value: string;
}

export interface FilterValueNested {
  readonly type: 'nested';
  readonly value: ReadonlyArray<PowerSearchFilter>;
}

export type FilterValue =
  | FilterValueEmpty
  | FilterValueString
  | FilterValueStringList
  | FilterValueInteger
  | FilterValueFloat
  | FilterValueTime
  | FilterValueDateAbsolute
  | FilterValueDateRelative
  | FilterValueDateRange
  | FilterValueEnum
  | FilterValueEnumList
  | FilterValueEntityList
  | FilterValueCustom
  | FilterValueNested;

// =============================================================================
// Supporting Types
// =============================================================================

export interface OperatorTokenizationConfig {
  /** Regex to apply to pasted text. */
  readonly regex?: string;
  /** Sort tokens after tokenizing. */
  readonly sort?: boolean;
}

export type DateTimeRangePart =
  | {readonly type: 'NOW'}
  | {readonly type: 'ABSOLUTE'; readonly unixSeconds: number}
  | {
      readonly type: 'RELATIVE';
      readonly backValue: number;
      readonly unit:
        'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
      readonly anchorKey?: string;
    };

export interface DateTimeRange {
  readonly start: DateTimeRangePart;
  readonly end: DateTimeRangePart;
}

export interface DateRangeFilterPreset {
  readonly label: string;
  readonly value: DateTimeRange;
}

export interface RelativeDateFilterPreset {
  readonly label: string;
  readonly value: string;
}

// =============================================================================
// Config Types
// =============================================================================

export interface PowerSearchOperatorBase {
  readonly key: string;
  readonly value: OperatorValue;
}

/**
 * Operator variant that provides its label as raw text. The consumer owns
 * translation of that string. Use this for genuinely custom operator labels
 * that don't correspond to an entry in astryx's shipped translation catalog
 * (e.g. `label: 'in my rotations'`).
 */
export interface PowerSearchOperatorWithLabel extends PowerSearchOperatorBase {
  readonly label: string;
  readonly i18nKey?: never;
}

/**
 * Operator variant that references a translation-catalog key. The library
 * looks the key up against the active InternationalizationProvider locale.
 * Use `@astryx.powersearch.operator.*` for astryx's shipped defaults, or a
 * key from your own catalog registered via InternationalizationProvider
 * `messages` / `overrides` props.
 */
export interface PowerSearchOperatorWithI18nKey extends PowerSearchOperatorBase {
  readonly i18nKey: string;
  readonly label?: never;
}

/**
 * A discriminated union: an operator must supply EXACTLY ONE of `label`
 * (raw text) or `i18nKey` (catalog lookup). The type system prevents
 * accidental omission — a bare `{key, value}` is a compile error.
 */
export type PowerSearchOperator =
  PowerSearchOperatorWithLabel | PowerSearchOperatorWithI18nKey;

export interface PowerSearchField {
  readonly key: string;
  readonly label: string;
  readonly operators: ReadonlyArray<PowerSearchOperator>;
  /** Icon displayed next to the field name. */
  readonly icon?: ReactNode;
  /** Default operator key when the field is selected. */
  readonly defaultOperator?: string;
  /** Group label for organizing fields. */
  readonly group?: string;
  /** Description text for the field. */
  readonly description?: string;
  /** Alternative strings that match this field in typeahead. */
  readonly typeaheadAliases?: ReadonlyArray<string>;
  /** Minimum query length before this field appears in typeahead. */
  readonly typeaheadMinQueryLength?: number;
  /** Whether to show this field as a "value match" in typeahead. @default true */
  readonly isValueMatchAllowed?: boolean;
}

export interface PowerSearchConfig {
  readonly name: string;
  readonly fields: ReadonlyArray<PowerSearchField>;
  /** Key of the field used for content/text search. */
  readonly contentSearchFieldKey?: string;
  /**
   * How free text (not starting with a field label) suggests values.
   * `'field-prefix'` (default) only offers the content-search item;
   * `'all-string-fields'` additionally emits a `<Field> <op> "<text>"` item
   * for every visible string/string_list operator.
   */
  readonly valueMatchMode?: 'field-prefix' | 'all-string-fields';
}

// =============================================================================
// Filter Types
// =============================================================================

export interface PowerSearchFilter {
  readonly field: string;
  readonly operator: string;
  readonly value: FilterValue;
  /** Prevent editing this filter. */
  readonly isReadOnly?: boolean;
}

export interface PartialFilter {
  readonly field: string;
  readonly operator?: string;
  readonly value?: FilterValue;
  readonly isReadOnly?: boolean;
}

// =============================================================================
// Change & Handle Types
// =============================================================================

export type PowerSearchChangeType = 'add' | 'edit' | 'remove';

export interface PowerSearchHandle {
  /** Focus the typeahead input. */
  focusTypeahead(): void;
  /** Blur the typeahead input. */
  blurTypeahead(): void;
}

// =============================================================================
// Internal auxiliary data for tokenizer items
// =============================================================================

export interface PowerSearchAuxData {
  readonly fieldKey: string;
  readonly operatorKey?: string;
  readonly filterValue?: FilterValue;
  /** Index in the filters array (for editing/removing). */
  readonly filterIndex?: number;
  /** Section heading for field-browser entries. */
  readonly group?: string;
}

export type PowerSearchItem = SearchableItem<PowerSearchAuxData>;

// =============================================================================
// Components Map — per-type overrides for token and editor rendering
// =============================================================================

/**
 * Props for a custom Token component.
 * Renders the full token pill for a filter of a given type.
 */
export interface PowerSearchTokenProps {
  readonly config: PowerSearchConfig;
  readonly filter: PowerSearchFilter;
  readonly field: PowerSearchField;
  readonly operator: PowerSearchOperator;
  readonly maxLength: number;
  readonly onClick?: () => void;
  readonly onRemove?: () => void;
  readonly isDisabled?: boolean;
  /** The zone the field reads date values in; see PowerSearch `timezoneID`. */
  readonly timezoneID?: string;
}

/**
 * Props for a custom Editor component.
 * Renders the full editor popover content for a filter of a given type.
 */
export interface PowerSearchEditorProps {
  readonly config: PowerSearchConfig;
  readonly filter: PartialFilter;
  readonly mode: 'create' | 'edit';
  readonly onSave: (filter: PowerSearchFilter | null) => void;
  readonly onCancel: () => void;
  readonly saveButtonLabel?: string;
  readonly isReadOnly?: boolean;
  readonly timezoneID?: string;
}

export interface PowerSearchComponentOverride {
  /** Replaces the full token pill for filters of this type. */
  readonly Token?: ComponentType<PowerSearchTokenProps>;
  /** Replaces the full editor popover content for filters of this type. */
  readonly Editor?: ComponentType<PowerSearchEditorProps>;
}

export type PowerSearchComponents = Partial<
  Record<OperatorValue['type'], PowerSearchComponentOverride>
>;
