// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input PowerSearch component and types
 * @output Exports all PowerSearch module public API
 * @position Entry point for PowerSearch module
 *
 * SYNC: When adding new PowerSearch files, update exports here
 */

export {PowerSearch} from './PowerSearch';
export type {
  PowerSearchPresentation,
  PowerSearchProps,
  PowerSearchSize,
} from './PowerSearch';

export {PowerSearchToken} from './PowerSearchToken';
export {PowerSearchFilterEditor} from './PowerSearchFilterEditor';

export {resolveOperatorLabel} from './resolveOperatorLabel';

export {
  createPowerSearchConfig,
  usePowerSearchConfig,
} from './usePowerSearchConfig';
export type {FieldDefinition, InferData} from './usePowerSearchConfig';

export type {
  // Config types
  PowerSearchConfig,
  PowerSearchField,
  PowerSearchOperator,
  PowerSearchOperatorBase,
  PowerSearchOperatorWithLabel,
  PowerSearchOperatorWithI18nKey,

  // Operator value types
  OperatorValue,
  EmptyOperatorValue,
  StringOperatorValue,
  StringListOperatorValue,
  IntegerOperatorValue,
  FloatOperatorValue,
  TimeOperatorValue,
  DateAbsoluteOperatorValue,
  DateRelativeOperatorValue,
  DateRangeOperatorValue,
  EnumOperatorValue,
  EnumListOperatorValue,
  EntityListOperatorValue,
  CustomOperatorValue,
  NestedOperatorValue,

  // Filter value types
  FilterValue,
  FilterValueEmpty,
  FilterValueString,
  FilterValueStringList,
  FilterValueInteger,
  FilterValueFloat,
  FilterValueTime,
  FilterValueDateAbsolute,
  FilterValueDateRelative,
  FilterValueDateRange,
  FilterValueEnum,
  FilterValueEnumList,
  FilterValueEntityList,
  FilterValueCustom,
  FilterValueNested,

  // Filter types
  PowerSearchFilter,
  PartialFilter,

  // Supporting types
  EnumItem,
  PowerSearchEntity,
  DateTimeRange,
  DateTimeRangePart,
  DateRangeFilterPreset,
  RelativeDateFilterPreset,
  OperatorTokenizationConfig,
  PowerSearchChangeType,
  PowerSearchHandle,

  // Component override types
  PowerSearchTokenProps,
  PowerSearchEditorProps,
  PowerSearchComponentOverride,
  PowerSearchComponents,
} from './types';
