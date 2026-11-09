// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file powerSearchSheetUtils.ts
 * @input PowerSearch config/filter types and the field typeahead source
 * @output Pure helpers for the sheet presentation: which operators the
 *   sheet's own controls edit, field matching, filter identity tracking
 *   across controlled re-renders, the focus target after a removal, and the
 *   content search's suggestion source over the field typeahead
 * @position Helper module; consumed by PowerSearchBottomSheet.tsx and its
 *   tests
 */

import type {SearchSource} from '../Typeahead/types';
import type {InternalConfig} from './useInternalConfig';
import type {
  PowerSearchField,
  PowerSearchFilter,
  PowerSearchItem,
  PowerSearchOperator,
} from './types';

// =============================================================================
// Operators and fields
// =============================================================================

/**
 * Whether the value step edits an operator's value with a sheet-native
 * control (choice rows, or the popover's editor in its sheet presentation).
 * A `nested` value is the exception: it is edited by the popover's built-in
 * NestedEditor, rendered in the step's body,
 * so every operator opens an editable step and no field is left out.
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

/** Synchronous suggestion source; the sheet renders results inline. */
export interface SheetSuggestionSource {
  search(query: string): PowerSearchItem[];
  bootstrap(): PowerSearchItem[];
}

/**
 * The field typeahead source as the content search's rows: the popover
 * presentation's own suggestions, minus any whose field the config no longer
 * knows. That source resolves synchronously from the config; a promise (none
 * today) yields no rows rather than a stale list.
 */
export function createSheetSuggestionSource(
  config: InternalConfig,
  source: SearchSource<PowerSearchItem>,
): SheetSuggestionSource {
  // Every suggestion whose field the config knows is offered: the value step
  // edits every operator, `nested` included.
  const isEditable = (item: PowerSearchItem): boolean => {
    const aux = item.auxiliaryData;
    return aux != null && config.getField(aux.fieldKey) != null;
  };
  const settle = (
    results: PowerSearchItem[] | Promise<PowerSearchItem[]>,
  ): PowerSearchItem[] =>
    Array.isArray(results) ? results.filter(isEditable) : [];
  return {
    search: query => settle(source.search(query)),
    bootstrap: () => settle(source.bootstrap()),
  };
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
 * Stable identities for the Filters rows across controlled updates, so a row
 * keeps its element — and its focus — when the parent reorders the filters or
 * removes one above it. A filter object seen before keeps its
 * id; a new object takes the id of a filter from the previous update with the
 * same signature that no present object claims (a parent that clones its
 * values on every change); anything else mints a new id. Two equal filters
 * are told apart by order. Call `next` once per render with the current list.
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
 * Finds the filter a step was opened on after the controlled parent may have
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
 * After removing the filter at `removedIndex`, focus should land on the
 * nearest remaining row that is a button, preferring the one after it.
 * `isRowButton` is the Filters sheet's own rule for which rows are buttons:
 * the field interactive and the filter not read-only (a `nested` or stale
 * filter's row is a button too).
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
