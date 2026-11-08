// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePowerSearchConfig.ts
 * @input Field definitions with simplified types
 * @output PowerSearchConfig + applyFilters function for client-side filtering
 * @position Utility hook; sits alongside PowerSearch core types
 */

import {useMemo} from 'react';
import type {
  EnumItem,
  PowerSearchConfig,
  PowerSearchField,
  PowerSearchFilter,
  PowerSearchOperator,
} from './types';
import {resolveDateTimeRangePart} from './resolveDateTimeRangePart';
import {registerEnglishFallback} from '../i18n/englishFallback';
import english from '../i18n/generated-english/PowerSearch/usePowerSearchConfig.generated';

registerEnglishFallback(english);

// =============================================================================
// Public Types
// =============================================================================

type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'enum'
  | 'enum_list'
  | 'string_list';

type FieldTypeToJS = {
  string: string;
  number: number;
  boolean: boolean;
  date: Date | number;
  enum: string;
  enum_list: ReadonlyArray<string>;
  string_list: ReadonlyArray<string>;
};

export interface FieldDefinition<
  K extends string = string,
  T extends FieldType = FieldType,
> {
  readonly key: K;
  readonly type: T;
  readonly label?: string;
  /** Required for 'enum' and 'enum_list' field types. */
  readonly enumValues?: ReadonlyArray<EnumItem>;
}

/** Infers the data record type from a tuple of FieldDefinitions. */
export type InferData<D extends ReadonlyArray<FieldDefinition>> = {
  [F in D[number] as F['key']]: FieldTypeToJS[F['type']];
};

// =============================================================================
// Operator key constants
// =============================================================================

const StringOps = {
  CONTAINS: 'contains',
  NOT_CONTAINS: 'not_contains',
  STARTS_WITH: 'starts_with',
  NOT_STARTS_WITH: 'not_starts_with',
  ENDS_WITH: 'ends_with',
  NOT_ENDS_WITH: 'not_ends_with',
  IS: 'is',
  IS_NOT: 'is_not',
} as const;

const NumberOps = {
  EQUALS: 'equals',
  NOT_EQUALS: 'not_equals',
  GREATER_THAN: 'greater_than',
  LESS_THAN: 'less_than',
  GREATER_THAN_OR_EQUAL: 'greater_than_or_equal',
  LESS_THAN_OR_EQUAL: 'less_than_or_equal',
} as const;

const DateOps = {
  BEFORE: 'before',
  AFTER: 'after',
  BETWEEN: 'between',
} as const;

const BooleanOps = {
  IS_TRUE: 'is_true',
  IS_FALSE: 'is_false',
} as const;

const EnumOps = {
  IS: 'is',
  IS_NOT: 'is_not',
} as const;

const EnumListOps = {
  IS_ANY_OF: 'is_any_of',
  IS_NONE_OF: 'is_none_of',
} as const;

const StringListOps = {
  IS_ANY_OF: 'is_any_of',
  IS_NONE_OF: 'is_none_of',
} as const;

// =============================================================================
// Default operators per field type
// =============================================================================

function stringOperators(): {
  defaultOperator: string;
  operators: ReadonlyArray<PowerSearchOperator>;
} {
  return {
    defaultOperator: StringOps.CONTAINS,
    operators: [
      {
        key: StringOps.CONTAINS,
        i18nKey: '@astryx.powersearch.operator.contains',
        value: {type: 'string'},
      },
      {
        key: StringOps.NOT_CONTAINS,
        i18nKey: '@astryx.powersearch.operator.notContains',
        value: {type: 'string'},
      },
      {
        key: StringOps.STARTS_WITH,
        i18nKey: '@astryx.powersearch.operator.startsWith',
        value: {type: 'string'},
      },
      {
        key: StringOps.NOT_STARTS_WITH,
        i18nKey: '@astryx.powersearch.operator.notStartsWith',
        value: {type: 'string'},
      },
      {
        key: StringOps.ENDS_WITH,
        i18nKey: '@astryx.powersearch.operator.endsWith',
        value: {type: 'string'},
      },
      {
        key: StringOps.NOT_ENDS_WITH,
        i18nKey: '@astryx.powersearch.operator.notEndsWith',
        value: {type: 'string'},
      },
      {
        key: StringOps.IS,
        i18nKey: '@astryx.powersearch.operator.is',
        value: {type: 'string'},
      },
      {
        key: StringOps.IS_NOT,
        i18nKey: '@astryx.powersearch.operator.isNot',
        value: {type: 'string'},
      },
    ],
  };
}

function numberOperators(): {
  defaultOperator: string;
  operators: ReadonlyArray<PowerSearchOperator>;
} {
  return {
    defaultOperator: NumberOps.EQUALS,
    operators: [
      {
        key: NumberOps.EQUALS,
        i18nKey: '@astryx.powersearch.operator.equals',
        value: {type: 'float'},
      },
      {
        key: NumberOps.NOT_EQUALS,
        i18nKey: '@astryx.powersearch.operator.notEquals',
        value: {type: 'float'},
      },
      {
        key: NumberOps.GREATER_THAN,
        i18nKey: '@astryx.powersearch.operator.greaterThan',
        value: {type: 'float'},
      },
      {
        key: NumberOps.LESS_THAN,
        i18nKey: '@astryx.powersearch.operator.lessThan',
        value: {type: 'float'},
      },
      {
        key: NumberOps.GREATER_THAN_OR_EQUAL,
        i18nKey: '@astryx.powersearch.operator.greaterThanOrEqual',
        value: {type: 'float'},
      },
      {
        key: NumberOps.LESS_THAN_OR_EQUAL,
        i18nKey: '@astryx.powersearch.operator.lessThanOrEqual',
        value: {type: 'float'},
      },
    ],
  };
}

function dateOperators(): {
  defaultOperator: string;
  operators: ReadonlyArray<PowerSearchOperator>;
} {
  return {
    defaultOperator: DateOps.AFTER,
    operators: [
      {
        key: DateOps.BEFORE,
        i18nKey: '@astryx.powersearch.operator.before',
        value: {type: 'date_absolute'},
      },
      {
        key: DateOps.AFTER,
        i18nKey: '@astryx.powersearch.operator.after',
        value: {type: 'date_absolute'},
      },
      {
        key: DateOps.BETWEEN,
        i18nKey: '@astryx.powersearch.operator.between',
        value: {type: 'date_range'},
      },
    ],
  };
}

function booleanOperators(): {
  defaultOperator: string;
  operators: ReadonlyArray<PowerSearchOperator>;
} {
  return {
    defaultOperator: BooleanOps.IS_TRUE,
    operators: [
      {
        key: BooleanOps.IS_TRUE,
        i18nKey: '@astryx.powersearch.operator.isTrue',
        value: {type: 'empty'},
      },
      {
        key: BooleanOps.IS_FALSE,
        i18nKey: '@astryx.powersearch.operator.isFalse',
        value: {type: 'empty'},
      },
    ],
  };
}

function enumOperators(values: ReadonlyArray<EnumItem>): {
  defaultOperator: string;
  operators: ReadonlyArray<PowerSearchOperator>;
} {
  return {
    defaultOperator: EnumOps.IS,
    operators: [
      {
        key: EnumOps.IS,
        i18nKey: '@astryx.powersearch.operator.is',
        value: {type: 'enum', values},
      },
      {
        key: EnumOps.IS_NOT,
        i18nKey: '@astryx.powersearch.operator.isNot',
        value: {type: 'enum', values},
      },
      {
        key: EnumListOps.IS_ANY_OF,
        i18nKey: '@astryx.powersearch.operator.isAnyOf',
        value: {type: 'enum_list', values},
      },
      {
        key: EnumListOps.IS_NONE_OF,
        i18nKey: '@astryx.powersearch.operator.isNoneOf',
        value: {type: 'enum_list', values},
      },
    ],
  };
}

function enumListOperators(values: ReadonlyArray<EnumItem>): {
  defaultOperator: string;
  operators: ReadonlyArray<PowerSearchOperator>;
} {
  return {
    defaultOperator: EnumListOps.IS_ANY_OF,
    operators: [
      {
        key: EnumListOps.IS_ANY_OF,
        i18nKey: '@astryx.powersearch.operator.isAnyOf',
        value: {type: 'enum_list', values},
      },
      {
        key: EnumListOps.IS_NONE_OF,
        i18nKey: '@astryx.powersearch.operator.isNoneOf',
        value: {type: 'enum_list', values},
      },
    ],
  };
}

function stringListOperators(): {
  defaultOperator: string;
  operators: ReadonlyArray<PowerSearchOperator>;
} {
  return {
    defaultOperator: StringListOps.IS_ANY_OF,
    operators: [
      {
        key: StringListOps.IS_ANY_OF,
        i18nKey: '@astryx.powersearch.operator.isAnyOf',
        value: {type: 'string_list'},
      },
      {
        key: StringListOps.IS_NONE_OF,
        i18nKey: '@astryx.powersearch.operator.isNoneOf',
        value: {type: 'string_list'},
      },
    ],
  };
}

// =============================================================================
// Config builder
// =============================================================================

function buildField(def: FieldDefinition): PowerSearchField {
  const label = def.label ?? def.key;

  switch (def.type) {
    case 'string': {
      const ops = stringOperators();
      return {key: def.key, label, ...ops};
    }
    case 'number': {
      const ops = numberOperators();
      return {key: def.key, label, ...ops};
    }
    case 'date': {
      const ops = dateOperators();
      return {key: def.key, label, ...ops};
    }
    case 'boolean': {
      const ops = booleanOperators();
      return {key: def.key, label, ...ops};
    }
    case 'enum': {
      const values = def.enumValues ?? [];
      const ops = enumOperators(values);
      return {key: def.key, label, ...ops};
    }
    case 'enum_list': {
      const values = def.enumValues ?? [];
      const ops = enumListOperators(values);
      return {key: def.key, label, ...ops};
    }
    case 'string_list': {
      const ops = stringListOperators();
      return {key: def.key, label, ...ops};
    }
  }
}

// =============================================================================
// Filter application
// =============================================================================

function toUnixSeconds(value: Date | number): number {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  return value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function toStringValues(value: unknown): string[] | null {
  if (typeof value === 'string') {
    return [value];
  }
  if (isStringArray(value)) {
    return value;
  }
  return null;
}

function matchesFilter(
  row: Record<string, unknown>,
  filter: PowerSearchFilter,
): boolean {
  const fieldValue = row[filter.field];
  const {operator, value: filterValue} = filter;

  switch (filterValue.type) {
    case 'empty': {
      if (operator === BooleanOps.IS_TRUE) {
        return Boolean(fieldValue) === true;
      }
      if (operator === BooleanOps.IS_FALSE) {
        return Boolean(fieldValue) === false;
      }
      return true;
    }

    case 'string': {
      if (typeof fieldValue !== 'string') {
        return false;
      }
      const s = fieldValue.toLowerCase();
      const target = filterValue.value.toLowerCase();
      if (operator in stringOpHandlers) {
        return stringOpHandlers[operator as keyof typeof stringOpHandlers](
          s,
          target,
        );
      }
      return true;
    }

    case 'integer':
    case 'float': {
      if (typeof fieldValue !== 'number') {
        return false;
      }
      const n = fieldValue;
      const target = filterValue.value;
      if (operator in numberOpHandlers) {
        return numberOpHandlers[operator as keyof typeof numberOpHandlers](
          n,
          target,
        );
      }
      return true;
    }

    case 'date_absolute': {
      if (!(fieldValue instanceof Date) && typeof fieldValue !== 'number') {
        return false;
      }
      const ts = toUnixSeconds(fieldValue);
      if (operator === DateOps.BEFORE) {
        return ts < filterValue.unixSeconds;
      }
      if (operator === DateOps.AFTER) {
        return ts > filterValue.unixSeconds;
      }
      return true;
    }

    case 'date_range': {
      if (!(fieldValue instanceof Date) && typeof fieldValue !== 'number') {
        return false;
      }
      const ts = toUnixSeconds(fieldValue);
      if (operator === DateOps.BETWEEN) {
        const nowSeconds = Date.now() / 1000;
        const start = resolveDateTimeRangePart(
          filterValue.value.start,
          nowSeconds,
        );
        const end = resolveDateTimeRangePart(filterValue.value.end, nowSeconds);
        return ts >= start && ts <= end;
      }
      return true;
    }

    case 'enum': {
      if (typeof fieldValue !== 'string') {
        return false;
      }
      if (operator === EnumOps.IS) {
        return fieldValue === filterValue.value;
      }
      if (operator === EnumOps.IS_NOT) {
        return fieldValue !== filterValue.value;
      }
      return true;
    }

    case 'enum_list': {
      const values = toStringValues(fieldValue);
      if (values == null) {
        return false;
      }
      if (operator === EnumListOps.IS_ANY_OF) {
        return values.some(v => filterValue.value.includes(v));
      }
      if (operator === EnumListOps.IS_NONE_OF) {
        return values.every(v => !filterValue.value.includes(v));
      }
      return true;
    }

    case 'string_list': {
      const values = toStringValues(fieldValue);
      if (values == null) {
        return false;
      }
      if (operator === StringListOps.IS_ANY_OF) {
        return values.some(v => filterValue.value.includes(v));
      }
      if (operator === StringListOps.IS_NONE_OF) {
        return values.every(v => !filterValue.value.includes(v));
      }
      return true;
    }

    case 'time':
    case 'date_relative':
    case 'entity_list':
    case 'custom':
    case 'nested':
      return true;
  }
}

const stringOpHandlers = {
  [StringOps.CONTAINS]: (s: string, t: string) => s.includes(t),
  [StringOps.NOT_CONTAINS]: (s: string, t: string) => !s.includes(t),
  [StringOps.STARTS_WITH]: (s: string, t: string) => s.startsWith(t),
  [StringOps.NOT_STARTS_WITH]: (s: string, t: string) => !s.startsWith(t),
  [StringOps.ENDS_WITH]: (s: string, t: string) => s.endsWith(t),
  [StringOps.NOT_ENDS_WITH]: (s: string, t: string) => !s.endsWith(t),
  [StringOps.IS]: (s: string, t: string) => s === t,
  [StringOps.IS_NOT]: (s: string, t: string) => s !== t,
} as const;

const numberOpHandlers = {
  [NumberOps.EQUALS]: (n: number, t: number) => n === t,
  [NumberOps.NOT_EQUALS]: (n: number, t: number) => n !== t,
  [NumberOps.GREATER_THAN]: (n: number, t: number) => n > t,
  [NumberOps.LESS_THAN]: (n: number, t: number) => n < t,
  [NumberOps.GREATER_THAN_OR_EQUAL]: (n: number, t: number) => n >= t,
  [NumberOps.LESS_THAN_OR_EQUAL]: (n: number, t: number) => n <= t,
} as const;

// =============================================================================
// Public API
// =============================================================================

/**
 * Creates a PowerSearchConfig and an applyFilters function from field definitions.
 *
 * @example
 * ```
 * const defs = [
 *   { key: 'name', type: 'string', label: 'Name' },
 *   { key: 'age', type: 'number', label: 'Age' },
 *   { key: 'active', type: 'boolean', label: 'Active' },
 * ] as const;
 *
 * const { config, applyFilters } = createPowerSearchConfig(defs);
 * const filtered = applyFilters(filters, data);
 * ```
 */
export function createPowerSearchConfig<
  const D extends ReadonlyArray<FieldDefinition>,
>(
  definitions: D,
  configName?: string,
): {
  config: PowerSearchConfig;
  applyFilters: <T extends InferData<D>>(
    filters: ReadonlyArray<PowerSearchFilter>,
    data: ReadonlyArray<T>,
  ) => T[];
} {
  const fields = definitions.map(buildField);

  const config: PowerSearchConfig = {
    name: configName ?? 'PowerSearchConfig',
    fields,
  };

  function applyFilters<T extends InferData<D>>(
    filters: ReadonlyArray<PowerSearchFilter>,
    data: ReadonlyArray<T>,
  ): T[] {
    if (filters.length === 0) {
      return [...data];
    }
    return data.filter(row =>
      filters.every(f => matchesFilter(row as Record<string, unknown>, f)),
    );
  }

  return {config, applyFilters};
}

/**
 * React hook that memoizes the result of createPowerSearchConfig.
 *
 * @example
 * ```
 * const defs = [
 *   { key: 'name', type: 'string', label: 'Name' },
 *   { key: 'status', type: 'enum', label: 'Status', enumValues: [
 *     { value: 'active', label: 'Active' },
 *     { value: 'inactive', label: 'Inactive' },
 *   ]},
 * ] as const;
 *
 * function MyComponent() {
 *   const { config, applyFilters } = usePowerSearchConfig(defs);
 *   const filtered = applyFilters(filters, data);
 *   // ...
 * }
 * ```
 */
export function usePowerSearchConfig<
  const D extends ReadonlyArray<FieldDefinition>,
>(
  definitions: D,
  configName?: string,
): {
  config: PowerSearchConfig;
  applyFilters: <T extends InferData<D>>(
    filters: ReadonlyArray<PowerSearchFilter>,
    data: ReadonlyArray<T>,
  ) => T[];
} {
  return useMemo(
    () => createPowerSearchConfig(definitions, configName),
    [definitions, configName],
  );
}
