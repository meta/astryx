// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file mobilePowerSearchUtils.ts
 * @input Public @astryxdesign/core PowerSearch config/filter types, i18n
 *   translator, Typeahead SearchableItem, plain-date utilities
 * @output Pure helpers for MobilePowerSearch: a local InternalConfig adapter
 *   (Core's useInternalConfig is private), the content-search suggestion
 *   source, filter identity tracking across controlled re-renders, nested
 *   operator exclusion, field matching, and timezone-aware date conversion
 * @position Lab helper module; consumed by MobilePowerSearch.tsx and
 *   MobilePowerSearchValueEditor.tsx
 */

import {useMemo} from 'react';
import type {
  FilterValue,
  PowerSearchConfig,
  PowerSearchField,
  PowerSearchFilter,
  PowerSearchOperator,
} from '@astryxdesign/core/PowerSearch';
import {resolveOperatorLabel} from '@astryxdesign/core/PowerSearch';
import type {InternalConfig} from '@astryxdesign/core/PowerSearch/utils';
import type {TranslatorFn} from '@astryxdesign/core/i18n';
import type {SearchableItem} from '@astryxdesign/core/Typeahead';
import type {ISODateTimeString} from '@astryxdesign/core/DateTimeInput';
import type {ISODateString} from '@astryxdesign/core/utils';
import {
  groupItems,
  plainDateFromDate,
  plainDateFromInstant,
  plainDateFromISO,
  plainDateToDate,
  plainDateToInstant,
  plainDateToISO,
} from '@astryxdesign/core/utils';

// =============================================================================
// Config adapter
// =============================================================================

/**
 * Builds the `InternalConfig` shape that `formatFilterValue` and the rest of
 * the public PowerSearch utilities take. Core's `useInternalConfig` is private
 * to the package, so Lab carries this equivalent.
 */
export function createMobilePowerSearchConfig(
  config: PowerSearchConfig,
): InternalConfig {
  const fieldMap = new Map<string, PowerSearchField>();
  const operatorMap = new Map<string, Map<string, PowerSearchOperator>>();
  for (const field of config.fields) {
    fieldMap.set(field.key, field);
    const opMap = new Map<string, PowerSearchOperator>();
    for (const op of field.operators) {
      opMap.set(op.key, op);
    }
    operatorMap.set(field.key, opMap);
  }
  return {
    config,
    getField(key) {
      return fieldMap.get(key);
    },
    getOperator(fieldKey, operatorKey) {
      return operatorMap.get(fieldKey)?.get(operatorKey);
    },
    getDefaultOperator(fieldKey) {
      const field = fieldMap.get(fieldKey);
      if (!field) {
        return undefined;
      }
      if (field.defaultOperator) {
        return operatorMap.get(fieldKey)?.get(field.defaultOperator);
      }
      return field.operators[0];
    },
    getVisibleFields() {
      return config.fields;
    },
    getVisibleOperators(fieldKey) {
      return fieldMap.get(fieldKey)?.operators ?? [];
    },
  };
}

export function useMobilePowerSearchConfig(
  config: PowerSearchConfig,
): InternalConfig {
  return useMemo(() => createMobilePowerSearchConfig(config), [config]);
}

// =============================================================================
// Operators and fields
// =============================================================================

/**
 * Operators the sheet editor can render. Nested filter groups have no touch
 * editor yet: offering the field and then showing a blank sheet is worse than
 * leaving it out, so fields whose every operator is nested are dropped (with a
 * development warning).
 */
export function isSupportedOperator(operator: PowerSearchOperator): boolean {
  return operator.value.type !== 'nested';
}

export function fieldMatchesQuery(
  field: PowerSearchField,
  normalizedQuery: string,
): boolean {
  if (normalizedQuery === '') {
    return true;
  }
  if (field.label.toLowerCase().includes(normalizedQuery)) {
    return true;
  }
  return (
    field.typeaheadAliases?.some(alias =>
      alias.toLowerCase().includes(normalizedQuery),
    ) ?? false
  );
}

// =============================================================================
// Filter identity across controlled updates
// =============================================================================

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value != null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/**
 * Stable identities for the Filters rows and the trigger's tokens across
 * controlled updates, so a row keeps its element — and its focus — when the
 * parent reorders the filters or removes one above it. A filter object seen
 * before keeps its id; a new object takes the id of a filter from the
 * previous update with the same signature that no present object claims (a
 * parent that clones its values on every change); anything else mints a new
 * id. Two equal filters are told apart by order. Call `next` once per render
 * with the current list.
 */
export function createFilterIdentities(): {
  next: (filters: ReadonlyArray<PowerSearchFilter>) => number[];
} {
  const byObject = new WeakMap<PowerSearchFilter, number>();
  let previousBySignature = new Map<string, number[]>();
  let nextId = 0;
  return {
    next(filters) {
      const used = new Set<number>();
      const ids: (number | null)[] = filters.map(filter => {
        const known = byObject.get(filter);
        if (known == null || used.has(known)) {
          return null;
        }
        used.add(known);
        return known;
      });
      const bySignature = new Map<string, number[]>();
      filters.forEach((filter, index) => {
        const signature = filterSignature(filter);
        let id = ids[index];
        if (id == null) {
          id =
            previousBySignature
              .get(signature)
              ?.find(candidate => !used.has(candidate)) ?? nextId++;
          used.add(id);
          byObject.set(filter, id);
          ids[index] = id;
        }
        bySignature.set(signature, [...(bySignature.get(signature) ?? []), id]);
      });
      previousBySignature = bySignature;
      return ids as number[];
    },
  };
}

/**
 * A `date_absolute` value as the Core PowerSearch token shows it
 * (`component:PowerSearch` FR11, FR12): year, abbreviated month and day in
 * the locale's Gregorian calendar, with no time of day, read in the
 * browser's zone — the same text, so a Lab token or row and a Core token
 * agree byte for byte. (The editors read the UTC day the value stores, as
 * Core's do; Core's record carries the zone difference as a known gap.)
 */
export function formatDateDay(unixSeconds: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    calendar: 'gregory',
  }).format(unixSeconds * 1000);
}

/** Structural snapshot of a filter, for parents that clone their values. */
export function filterSignature(filter: PowerSearchFilter): string {
  return stableSerialize({
    field: filter.field,
    operator: filter.operator,
    value: filter.value,
    isReadOnly: filter.isReadOnly ?? false,
  });
}

/**
 * Finds the filter a draft was opened on after the controlled parent may have
 * reordered, cloned, or removed it: object identity first, then the original
 * slot when it still holds a structurally equal filter, then a unique
 * structural match anywhere. Returns null when the target is gone or
 * ambiguous, so an edit never lands on a different filter.
 */
export function resolveFilterIdentityIndex(
  filters: ReadonlyArray<PowerSearchFilter>,
  sourceFilter: PowerSearchFilter,
  sourceSignature: string,
  preferredIndex: number,
): number | null {
  const identityIndex = filters.indexOf(sourceFilter);
  if (identityIndex >= 0) {
    return identityIndex;
  }
  if (
    filters[preferredIndex] != null &&
    filterSignature(filters[preferredIndex]) === sourceSignature
  ) {
    return preferredIndex;
  }
  const matchingIndices = filters.flatMap((filter, index) =>
    filterSignature(filter) === sourceSignature ? [index] : [],
  );
  return matchingIndices.length === 1 ? matchingIndices[0] : null;
}

/**
 * After removing the filter at `removedIndex`, the editable row focus should
 * land on: the nearest remaining editable filter, preferring the one after.
 */
export function nearestEditableIndex(
  nextFilters: ReadonlyArray<PowerSearchFilter>,
  removedIndex: number,
  isRowButton: (filter: PowerSearchFilter) => boolean = filter =>
    !filter.isReadOnly,
): number | undefined {
  const editableIndices = nextFilters.flatMap((candidate, candidateIndex) =>
    isRowButton(candidate) ? [candidateIndex] : [],
  );
  return editableIndices.reduce<number | undefined>((nearest, candidate) => {
    if (nearest == null) {
      return candidate;
    }
    const candidateDistance = Math.abs(candidate - removedIndex);
    const nearestDistance = Math.abs(nearest - removedIndex);
    if (candidateDistance < nearestDistance) {
      return candidate;
    }
    if (
      candidateDistance === nearestDistance &&
      candidate >= removedIndex &&
      nearest < removedIndex
    ) {
      return candidate;
    }
    return nearest;
  }, undefined);
}

// =============================================================================
// Content-search suggestions
// =============================================================================

export interface MobilePowerSearchAuxData {
  readonly fieldKey: string;
  readonly operatorKey?: string;
  readonly filterValue?: FilterValue;
  readonly group?: string;
}

export type MobilePowerSearchItem = SearchableItem<MobilePowerSearchAuxData>;

/** Synchronous suggestion source; the sheet renders results inline. */
export interface ContentSearchSource {
  search(query: string): MobilePowerSearchItem[];
  bootstrap(): MobilePowerSearchItem[];
}

interface ValueMatch {
  displayValue: string;
  filterValue: FilterValue;
  quoted: boolean;
}

function resolveValueMatches(
  op: PowerSearchOperator,
  rawValue: string,
): ValueMatch[] {
  const opType = op.value.type;
  if (opType === 'string') {
    return [
      {
        displayValue: rawValue,
        filterValue: {type: 'string', value: rawValue},
        quoted: true,
      },
    ];
  }
  if (opType === 'string_list') {
    return [
      {
        displayValue: rawValue,
        filterValue: {type: 'string_list', value: [rawValue]},
        quoted: true,
      },
    ];
  }
  if (opType === 'enum') {
    const lower = rawValue.toLowerCase();
    return op.value.values
      .filter(item => item.label.toLowerCase().includes(lower))
      .map(item => ({
        displayValue: item.label,
        filterValue: {type: 'enum' as const, value: item.value},
        quoted: false,
      }));
  }
  if (opType === 'enum_list') {
    const lower = rawValue.toLowerCase();
    return op.value.values
      .filter(item => item.label.toLowerCase().includes(lower))
      .map(item => ({
        displayValue: item.label,
        filterValue: {type: 'enum_list' as const, value: [item.value]},
        quoted: false,
      }));
  }
  return [];
}

/**
 * The suggestion source behind Add filter's content search: field names,
 * field + operator combinations, field + operator + value matches for string
 * and enum operators, and a leading free-text `"query"` item for the
 * configured content-search field. Mirrors Core PowerSearch's typeahead
 * suggestions, which are private to Core; nested-only fields are excluded.
 */
export function createContentSearchSource(
  config: InternalConfig,
  t: TranslatorFn,
  maxTypedResults: number,
): ContentSearchSource {
  const fields = config
    .getVisibleFields()
    .filter(field => field.operators.some(isSupportedOperator));
  const opLabel = (op: PowerSearchOperator): string =>
    resolveOperatorLabel(op, t);
  const allItems: MobilePowerSearchItem[] = groupItems(
    fields.map(field => ({
      id: field.key,
      label: field.label,
      auxiliaryData: {
        fieldKey: field.key,
        operatorKey: config.getDefaultOperator(field.key)?.key,
        group: field.group,
      },
    })),
    {ungroupedFirst: true},
  ).flatMap(group => group.items);

  return {
    search(query: string): MobilePowerSearchItem[] {
      const lower = query.toLowerCase().trim();
      if (lower === '') {
        return allItems;
      }
      const results: MobilePowerSearchItem[] = [];
      const seen = new Set<string>();

      for (const field of fields) {
        if (
          field.typeaheadMinQueryLength != null &&
          lower.length < field.typeaheadMinQueryLength
        ) {
          continue;
        }
        if (fieldMatchesQuery(field, lower) && !seen.has(field.key)) {
          seen.add(field.key);
          results.push({
            id: field.key,
            label: field.label,
            auxiliaryData: {
              fieldKey: field.key,
              operatorKey: config.getDefaultOperator(field.key)?.key,
            },
          });
        }
        for (const op of field.operators.filter(isSupportedOperator)) {
          const combinedLabel = `${field.label} ${opLabel(op)}`;
          if (combinedLabel.toLowerCase().includes(lower)) {
            const id = `${field.key}:${op.key}`;
            if (!seen.has(id)) {
              seen.add(id);
              results.push({
                id,
                label: combinedLabel,
                auxiliaryData: {fieldKey: field.key, operatorKey: op.key},
              });
            }
          }
        }
      }

      for (const field of fields) {
        if (field.isValueMatchAllowed === false) {
          continue;
        }
        const operators = field.operators.filter(isSupportedOperator);
        const fieldLabel = field.label.toLowerCase();
        const pushMatches = (op: PowerSearchOperator, rawValue: string) => {
          const matches = resolveValueMatches(op, rawValue);
          for (const match of matches) {
            const id = `${field.key}:${op.key}:value:${match.displayValue}`;
            if (!seen.has(id)) {
              seen.add(id);
              results.push({
                id,
                label: `${field.label} ${opLabel(op)} ${
                  match.quoted ? `"${match.displayValue}"` : match.displayValue
                }`,
                auxiliaryData: {
                  fieldKey: field.key,
                  operatorKey: op.key,
                  filterValue: match.filterValue,
                },
              });
            }
          }
          return matches.length > 0;
        };

        let hasExactOperatorMatch = false;
        for (const op of operators) {
          const prefix = `${fieldLabel} ${opLabel(op).toLowerCase()} `;
          if (lower.startsWith(prefix) && lower.length > prefix.length) {
            if (pushMatches(op, query.slice(prefix.length))) {
              hasExactOperatorMatch = true;
            }
          }
        }

        const fieldPrefix = `${fieldLabel} `;
        if (
          !hasExactOperatorMatch &&
          lower.startsWith(fieldPrefix) &&
          lower.length > fieldPrefix.length
        ) {
          const remainder = lower.slice(fieldPrefix.length);
          const isOperatorPrefix = operators.some(op =>
            opLabel(op).toLowerCase().startsWith(remainder),
          );
          if (!isOperatorPrefix) {
            const rawValue = query.slice(fieldPrefix.length);
            for (const op of operators) {
              pushMatches(op, rawValue);
            }
          }
        }
      }

      const contentFieldKey = config.config.contentSearchFieldKey;
      const hasExactMatch = fields.some(
        field =>
          field.label.toLowerCase() === lower ||
          field.operators.some(
            op => `${field.label} ${opLabel(op)}`.toLowerCase() === lower,
          ),
      );
      if (contentFieldKey != null && !hasExactMatch) {
        const contentOp = config.getDefaultOperator(contentFieldKey);
        if (
          config.getField(contentFieldKey) != null &&
          contentOp?.value.type === 'string'
        ) {
          results.unshift({
            id: `__content_search__:${query}`,
            label: `"${query}"`,
            auxiliaryData: {
              fieldKey: contentFieldKey,
              operatorKey: contentOp.key,
              filterValue: {type: 'string', value: query},
            },
          });
        }
      }

      return results.slice(0, maxTypedResults);
    },
    bootstrap(): MobilePowerSearchItem[] {
      return allItems;
    },
  };
}

// =============================================================================
// Dates
// =============================================================================

/**
 * The calendar date an instant falls on in `timezoneID`, or in the viewer's
 * zone when none is configured. The same zone drives `formatFilterValue`, so
 * the editor and the token agree on a boundary date.
 */
export function unixSecondsToISODate(
  unixSeconds: number,
  timezoneID: string | undefined,
): ISODateString {
  const instant = unixSeconds * 1000;
  const plain =
    timezoneID != null
      ? plainDateFromInstant(instant, timezoneID)
      : plainDateFromDate(new Date(instant));
  return plainDateToISO(plain);
}

/** Wall-clock `YYYY-MM-DDTHH:mm` of an instant in `timezoneID` or the viewer's zone. */
export function unixSecondsToISODateTime(
  unixSeconds: number,
  timezoneID: string | undefined,
): ISODateTimeString {
  const date = new Date(unixSeconds * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    ...(timezoneID != null ? {timeZone: timezoneID} : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    calendar: 'gregory',
  }).formatToParts(date);
  const lookup = Object.fromEntries(
    parts.filter(part => part.type !== 'literal').map(p => [p.type, p.value]),
  );
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}` as ISODateTimeString;
}

/** The instant a wall-clock `YYYY-MM-DDTHH:mm` names in `timezoneID` or the viewer's zone. */
export function isoDateTimeToUnixSeconds(
  value: ISODateTimeString,
  timezoneID: string | undefined,
): number {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [hour, minute] = timePart.split(':').map(Number);
  const plain = plainDateFromISO(datePart as ISODateString);
  const instant =
    timezoneID != null
      ? plainDateToInstant(plain, timezoneID, hour, minute)
      : new Date(
          plain.year,
          plain.month - 1,
          plain.day,
          hour,
          minute,
        ).getTime();
  return Math.floor(instant / 1000);
}

/** Midnight at the start of `date` in `timezoneID` (or the viewer's zone). */
export function isoDateToUnixSeconds(
  date: ISODateString,
  timezoneID: string | undefined,
): number {
  const plain = plainDateFromISO(date);
  const instant =
    timezoneID != null
      ? plainDateToInstant(plain, timezoneID)
      : plainDateToDate(plain).getTime();
  return Math.floor(instant / 1000);
}
