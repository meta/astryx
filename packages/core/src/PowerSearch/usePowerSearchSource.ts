// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePowerSearchSource.ts
 * @input InternalConfig
 * @output SearchSource for field typeahead in the main tokenizer
 * @position Hook; consumed by PowerSearch
 *
 * SYNC: When modified, update:
 * - /packages/core/src/PowerSearch/index.ts
 */

import {useMemo} from 'react';
import type {SearchSource} from '../Typeahead/types';
import {groupItems} from '../utils';
import {resolveOperatorLabel} from './resolveOperatorLabel';
import type {InternalConfig} from './useInternalConfig';
import type {PowerSearchItem, PowerSearchOperator, FilterValue} from './types';
import {useComponentTranslator} from '../i18n/useComponentTranslator';

/**
 * @param maxTypedResults Cap applied to ranked results for a non-empty query.
 *   The source never truncates empty-query browsing; PowerSearch's view applies
 *   a separate 1,000-row safety ceiling.
 */
export function usePowerSearchSource(
  config: InternalConfig,
  maxTypedResults: number,
): SearchSource<PowerSearchItem> {
  const t = useComponentTranslator();
  return useMemo(() => {
    const allItems = buildFieldItems(config);
    // Resolver stays inline — `t()` internally memoizes both catalog
    // lookups and parsed IntlMessageFormat instances, so calling it
    // per keystroke is already O(1).
    const opLabel = (op: PowerSearchOperator): string =>
      resolveOperatorLabel(op, t);

    return {
      search(query: string): PowerSearchItem[] {
        const lower = query.toLowerCase().trim();
        if (lower === '') {
          return allItems;
        }

        const results: PowerSearchItem[] = [];
        const seen = new Set<string>();

        for (const field of config.getVisibleFields()) {
          // Respect typeaheadMinQueryLength
          if (
            field.typeaheadMinQueryLength != null &&
            lower.length < field.typeaheadMinQueryLength
          ) {
            continue;
          }

          // Check if query matches field name or aliases
          const fieldMatches =
            field.label.toLowerCase().includes(lower) ||
            field.typeaheadAliases?.some(alias =>
              alias.toLowerCase().includes(lower),
            );

          if (fieldMatches) {
            // Add the field name entry (opens with defaultOperator)
            const defaultOp = config.getDefaultOperator(field.key);
            const fieldId = field.key;
            if (!seen.has(fieldId)) {
              seen.add(fieldId);
              results.push({
                id: fieldId,
                label: field.label,
                auxiliaryData: {
                  fieldKey: field.key,
                  operatorKey: defaultOp?.key,
                },
              });
            }
          }

          // Check each field+operator combo against the query
          for (const op of field.operators) {
            const combinedLabel = `${field.label} ${opLabel(op)}`.toLowerCase();
            if (combinedLabel.includes(lower)) {
              const id = `${field.key}:${op.key}`;
              if (!seen.has(id)) {
                seen.add(id);
                results.push({
                  id,
                  label: `${field.label} ${opLabel(op)}`,
                  auxiliaryData: {
                    fieldKey: field.key,
                    operatorKey: op.key,
                  },
                });
              }
            }
          }
        }

        // Field+operator+value suggestions for string and enum operators.
        // Matches "title foobar" → Title contains "foobar"
        // and "title contains foobar" → Title contains "foobar"
        // and "genre fiction" → Genre is "Fiction"
        for (const field of config.getVisibleFields()) {
          if (field.isValueMatchAllowed === false) {
            continue;
          }

          const fieldLabel = field.label.toLowerCase();

          // Try "<field> <operator> <value>" first (longer match wins)
          let hasExactOperatorMatch = false;
          for (const op of field.operators) {
            const prefix = `${fieldLabel} ${opLabel(op).toLowerCase()} `;
            if (lower.startsWith(prefix) && lower.length > prefix.length) {
              const rawValue = query.slice(prefix.length);
              const matches = resolveValueMatches(op, rawValue);
              if (matches.length > 0) {
                hasExactOperatorMatch = true;
              }
              for (const match of matches) {
                const id = `${field.key}:${op.key}:value:${match.displayValue}`;
                if (!seen.has(id)) {
                  seen.add(id);
                  results.push({
                    id,
                    label: `${field.label} ${opLabel(op)} ${match.quoted ? `"${match.displayValue}"` : match.displayValue}`,
                    auxiliaryData: {
                      fieldKey: field.key,
                      operatorKey: op.key,
                      filterValue: match.filterValue,
                    },
                  });
                }
              }
            }
          }

          // Try "<field> <value>" — suggests all matching operators.
          // Skip if an explicit "<field> <operator> <value>" already matched.
          const fieldPrefix = `${fieldLabel} `;
          if (
            !hasExactOperatorMatch &&
            lower.startsWith(fieldPrefix) &&
            lower.length > fieldPrefix.length
          ) {
            // Check the remainder isn't the start of an operator name
            const remainder = lower.slice(fieldPrefix.length);
            const isOperatorPrefix = field.operators.some(op =>
              opLabel(op).toLowerCase().startsWith(remainder),
            );
            if (!isOperatorPrefix) {
              const rawValue = query.slice(fieldPrefix.length);
              for (const op of field.operators) {
                const matches = resolveValueMatches(op, rawValue);
                for (const match of matches) {
                  const id = `${field.key}:${op.key}:value:${match.displayValue}`;
                  if (!seen.has(id)) {
                    seen.add(id);
                    results.push({
                      id,
                      label: `${field.label} ${opLabel(op)} ${match.quoted ? `"${match.displayValue}"` : match.displayValue}`,
                      auxiliaryData: {
                        fieldKey: field.key,
                        operatorKey: op.key,
                        filterValue: match.filterValue,
                      },
                    });
                  }
                }
              }
            }
          }
        }

        // If contentSearchFieldKey is set and no field or field+operator
        // exactly matches the query, prepend a content search item
        const contentFieldKey = config.config.contentSearchFieldKey;
        const hasExactMatch = config
          .getVisibleFields()
          .some(
            f =>
              f.label.toLowerCase() === lower ||
              f.operators.some(
                op => `${f.label} ${opLabel(op)}`.toLowerCase() === lower,
              ),
          );
        if (contentFieldKey && !hasExactMatch) {
          const contentField = config.getField(contentFieldKey);
          const contentOp = config.getDefaultOperator(contentFieldKey);
          if (contentField && contentOp) {
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

      bootstrap(): PowerSearchItem[] {
        return allItems;
      },
    };
  }, [config, t, maxTypedResults]);
}

interface ValueMatch {
  displayValue: string;
  filterValue: FilterValue;
  /** Whether to wrap the display value in quotes (for arbitrary string values). */
  quoted: boolean;
}

/**
 * Given an operator and a raw typed value, returns matching value suggestions.
 * - string/string_list: returns the raw value as-is
 * - enum/enum_list: returns enum items whose labels match the typed value
 */
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

function buildFieldItems(config: InternalConfig): PowerSearchItem[] {
  const items: PowerSearchItem[] = [];

  for (const field of config.getVisibleFields()) {
    const defaultOp = config.getDefaultOperator(field.key);
    items.push({
      id: field.key,
      label: field.label,
      auxiliaryData: {
        fieldKey: field.key,
        operatorKey: defaultOp?.key,
        group: field.group,
      },
    });
  }

  return groupItems(items, {ungroupedFirst: true}).flatMap(
    group => group.items,
  );
}
