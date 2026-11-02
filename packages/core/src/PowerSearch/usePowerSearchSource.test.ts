// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file usePowerSearchSource.test.ts
 * @input usePowerSearchSource, useInternalConfig
 * @output Tests for field typeahead search source, including contentSearchFieldKey
 * @position Testing; validates usePowerSearchSource.ts
 */

import {describe, it, expect} from 'vitest';
import {renderHook} from '@testing-library/react';
import {usePowerSearchSource} from './usePowerSearchSource';
import {useInternalConfig} from './useInternalConfig';
import type {
  PowerSearchConfig,
  PowerSearchAuxData,
  PowerSearchItem,
} from './types';

// =============================================================================
// Helpers
// =============================================================================

function createSource(
  config: PowerSearchConfig,
  // Uncapped by default so these tests exercise matching and ranking rather
  // than the typed-result cap, which has its own test below.
  maxTypedResults: number = Number.POSITIVE_INFINITY,
) {
  const {result} = renderHook(() => {
    const internal = useInternalConfig(config);
    return usePowerSearchSource(internal, maxTypedResults);
  });
  return result.current;
}

function syncBootstrap(
  source: ReturnType<typeof createSource>,
): PowerSearchItem[] {
  const result = source.bootstrap();
  if (result instanceof Promise) {
    throw new Error('Expected synchronous bootstrap');
  }
  return result;
}

function syncSearch(
  source: ReturnType<typeof createSource>,
  query: string,
): PowerSearchItem[] {
  const result = source.search(query);
  if (result instanceof Promise) {
    throw new Error('Expected synchronous search');
  }
  return result;
}

// =============================================================================
// Fixtures
// =============================================================================

const baseConfig: PowerSearchConfig = {
  name: 'TestSearch',
  fields: [
    {
      key: 'title',
      label: 'Title',
      defaultOperator: 'contains',
      operators: [
        {key: 'contains', label: 'contains', value: {type: 'string'}},
        {key: 'is', label: 'is', value: {type: 'string'}},
      ],
    },
    {
      key: 'status',
      label: 'Status',
      defaultOperator: 'is',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {
            type: 'enum',
            values: [
              {value: 'open', label: 'Open'},
              {value: 'closed', label: 'Closed'},
            ],
          },
        },
      ],
    },
  ],
};

const configWithContentSearch: PowerSearchConfig = {
  ...baseConfig,
  contentSearchFieldKey: 'title',
};

const groupedConfig: PowerSearchConfig = {
  name: 'GroupedSearch',
  fields: [
    field('team_a', 'Field Team A', 'Team'),
    field('plain_a', 'Field Plain A'),
    field('time_a', 'Field Time A', 'Time'),
    field('team_b', 'Field Team B', 'Team'),
    field('plain_b', 'Field Plain B'),
    field('time_b', 'Field Time B', 'Time'),
  ],
};

function field(key: string, label: string, group?: string) {
  return {
    key,
    label,
    group,
    operators: [{key: 'is', label: 'is', value: {type: 'string'} as const}],
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('usePowerSearchSource', () => {
  describe('bootstrap (no query)', () => {
    it('returns only field names without operator labels', () => {
      const source = createSource(baseConfig);
      const items = syncBootstrap(source);

      expect(items.map((i: PowerSearchItem) => i.label)).toEqual([
        'Title',
        'Status',
      ]);
    });

    it('sets defaultOperator on bootstrap items', () => {
      const source = createSource(baseConfig);
      const items = syncBootstrap(source);

      const titleAux = items[0].auxiliaryData as PowerSearchAuxData;
      expect(titleAux.fieldKey).toBe('title');
      expect(titleAux.operatorKey).toBe('contains');

      const statusAux = items[1].auxiliaryData as PowerSearchAuxData;
      expect(statusAux.fieldKey).toBe('status');
      expect(statusAux.operatorKey).toBe('is');
    });

    it('empty search returns same as bootstrap', () => {
      const source = createSource(baseConfig);
      expect(syncSearch(source, '')).toEqual(syncBootstrap(source));
    });

    it('orders ungrouped fields before named groups', () => {
      const items = syncBootstrap(createSource(groupedConfig));
      expect(items.map(item => item.label)).toEqual([
        'Field Plain A',
        'Field Plain B',
        'Field Team A',
        'Field Team B',
        'Field Time A',
        'Field Time B',
      ]);
      expect(
        items.map(item => (item.auxiliaryData as PowerSearchAuxData).group),
      ).toEqual([undefined, undefined, 'Team', 'Team', 'Time', 'Time']);
    });
  });

  describe('search (with query)', () => {
    it('shows field name for partial match', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'tit');

      expect(results.some(r => r.label === 'Title')).toBe(true);
    });

    it('shows all field+operator combos for partial match', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'tit');
      const labels = results.map(r => r.label);

      expect(labels).toContain('Title');
      expect(labels).toContain('Title contains');
      expect(labels).toContain('Title is');
    });

    it('matches query against combined field and operator label', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'title contains');

      expect(results.some(r => r.label === 'Title contains')).toBe(true);
    });

    it('matches partial field + operator query', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'title con');

      expect(results.some(r => r.label === 'Title contains')).toBe(true);
    });

    it('field name item uses defaultOperator', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'tit');

      const titleItem = results.find(r => r.label === 'Title');
      const aux = titleItem?.auxiliaryData as PowerSearchAuxData;
      expect(aux.operatorKey).toBe('contains');
    });

    it('field+operator items use specific operator', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'tit');

      const isItem = results.find(r => r.label === 'Title is');
      const aux = isItem?.auxiliaryData as PowerSearchAuxData;
      expect(aux.operatorKey).toBe('is');
    });

    it('leaves ranked results flat and in relevance order', () => {
      const results = syncSearch(createSource(groupedConfig), 'field');
      expect(results.slice(0, 6).map(item => item.label)).toEqual([
        'Field Team A',
        'Field Team A is',
        'Field Plain A',
        'Field Plain A is',
        'Field Time A',
        'Field Time A is',
      ]);
      expect(
        results.every(
          item => (item.auxiliaryData as PowerSearchAuxData).group == null,
        ),
      ).toBe(true);
    });
  });

  describe('contentSearchFieldKey', () => {
    it('shows content search item for non-matching query', () => {
      const source = createSource(configWithContentSearch);
      const results = syncSearch(source, 'foobar');

      expect(results[0].label).toBe('"foobar"');
      const aux = results[0].auxiliaryData as PowerSearchAuxData;
      expect(aux.fieldKey).toBe('title');
      expect(aux.operatorKey).toBe('contains');
      expect(aux.filterValue).toEqual({type: 'string', value: 'foobar'});
    });

    it('does not show content search item when query exactly matches a field name', () => {
      const source = createSource(configWithContentSearch);
      const results = syncSearch(source, 'title');

      const contentItem = results.find(r => r.label.startsWith('"'));
      expect(contentItem).toBeUndefined();
    });

    it('does not show content search item when query exactly matches field + operator', () => {
      const source = createSource(configWithContentSearch);
      const results = syncSearch(source, 'Title contains');

      const contentItem = results.find(r => r.label.startsWith('"'));
      expect(contentItem).toBeUndefined();
    });

    it('exact match check is case-insensitive', () => {
      const source = createSource(configWithContentSearch);
      const results = syncSearch(source, 'TITLE');

      const contentItem = results.find(r => r.label.startsWith('"'));
      expect(contentItem).toBeUndefined();
    });

    it('shows content search item for partial field match', () => {
      const source = createSource(configWithContentSearch);
      const results = syncSearch(source, 'tit');

      expect(results[0].label).toBe('"tit"');
      // Field and field+operator results should still appear after
      expect(results.some(r => r.label === 'Title')).toBe(true);
      expect(results.some(r => r.label === 'Title contains')).toBe(true);
    });

    it('does not show content search item when contentSearchFieldKey is not set', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'foobar');

      const contentItem = results.find(r => r.label.startsWith('"'));
      expect(contentItem).toBeUndefined();
    });

    it('content search item is first in results', () => {
      const source = createSource(configWithContentSearch);
      const results = syncSearch(source, 'sta');

      expect(results[0].label).toBe('"sta"');
      expect(results.length).toBeGreaterThan(1);
    });
  });

  describe('field+operator+value suggestions', () => {
    it('suggests all string-valued operators for "title foobar"', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'title foobar');

      const valueItems = results.filter(r => r.label.includes('"foobar"'));
      expect(valueItems.map(r => r.label)).toEqual([
        'Title contains "foobar"',
        'Title is "foobar"',
      ]);

      const containsAux = valueItems[0].auxiliaryData as PowerSearchAuxData;
      expect(containsAux.fieldKey).toBe('title');
      expect(containsAux.operatorKey).toBe('contains');
      expect(containsAux.filterValue).toEqual({
        type: 'string',
        value: 'foobar',
      });

      const isAux = valueItems[1].auxiliaryData as PowerSearchAuxData;
      expect(isAux.operatorKey).toBe('is');
    });

    it('suggests only the matching operator for "title contains foobar"', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'title contains foobar');

      const valueItems = results.filter(r => r.label.includes('"foobar"'));
      expect(valueItems).toHaveLength(1);
      expect(valueItems[0].label).toBe('Title contains "foobar"');
      const aux = valueItems[0].auxiliaryData as PowerSearchAuxData;
      expect(aux.operatorKey).toBe('contains');
      expect(aux.filterValue).toEqual({type: 'string', value: 'foobar'});
    });

    it('does not suggest "<field> <value>" matches when explicit operator matched', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'title contains foobar');

      // Should NOT have 'Title is "contains foobar"' or similar
      const spurious = results.filter(r =>
        r.label.includes('"contains foobar"'),
      );
      expect(spurious).toHaveLength(0);
    });

    it('suggests only the matching operator for "title is foobar"', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'title is foobar');

      const valueItems = results.filter(r => r.label.includes('"foobar"'));
      expect(valueItems).toHaveLength(1);
      expect(valueItems[0].label).toBe('Title is "foobar"');
      const aux = valueItems[0].auxiliaryData as PowerSearchAuxData;
      expect(aux.operatorKey).toBe('is');
    });

    it('is case-insensitive for field and operator matching', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'TITLE CONTAINS hello');

      const valueItem = results.find(r => r.label === 'Title contains "hello"');
      expect(valueItem).toBeDefined();
    });

    it('preserves original case of the value', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'title FooBar');

      const valueItem = results.find(
        r => r.label === 'Title contains "FooBar"',
      );
      expect(valueItem).toBeDefined();
      const aux = valueItem!.auxiliaryData as PowerSearchAuxData;
      expect(aux.filterValue).toEqual({type: 'string', value: 'FooBar'});
    });

    it('does not suggest value match for non-string operators', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'status foobar');

      const valueItem = results.find(r => r.label.includes('"foobar"'));
      expect(valueItem).toBeUndefined();
    });

    it('does not suggest value match when remainder matches an operator prefix', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'title con');

      // "con" is a prefix of "contains", so should not suggest a value match
      const valueItem = results.find(r => r.label.includes('"con"'));
      expect(valueItem).toBeUndefined();
    });

    it('does not suggest value match when field has isValueMatchAllowed=false', () => {
      const config: PowerSearchConfig = {
        name: 'Test',
        fields: [
          {
            key: 'title',
            label: 'Title',
            isValueMatchAllowed: false,
            operators: [
              {key: 'contains', label: 'contains', value: {type: 'string'}},
            ],
          },
        ],
      };
      const source = createSource(config);
      const results = syncSearch(source, 'title foobar');

      const valueItem = results.find(r => r.label.includes('"foobar"'));
      expect(valueItem).toBeUndefined();
    });

    it('uses string_list filter value for string_list operators', () => {
      const config: PowerSearchConfig = {
        name: 'Test',
        fields: [
          {
            key: 'tags',
            label: 'Tags',
            operators: [
              {
                key: 'contains',
                label: 'contains',
                value: {type: 'string_list'},
              },
            ],
          },
        ],
      };
      const source = createSource(config);
      const results = syncSearch(source, 'tags hello');

      const valueItem = results.find(r => r.label === 'Tags contains "hello"');
      expect(valueItem).toBeDefined();
      const aux = valueItem!.auxiliaryData as PowerSearchAuxData;
      expect(aux.filterValue).toEqual({type: 'string_list', value: ['hello']});
    });

    it('suggests matching enum values for "<field> <value>"', () => {
      const config: PowerSearchConfig = {
        name: 'Test',
        fields: [
          {
            key: 'genre',
            label: 'Genre',
            operators: [
              {
                key: 'is',
                label: 'is',
                value: {
                  type: 'enum',
                  values: [
                    {value: 'fiction', label: 'Fiction'},
                    {value: 'nonfiction', label: 'Non-Fiction'},
                    {value: 'science', label: 'Science'},
                  ],
                },
              },
              {
                key: 'is_not',
                label: 'is not',
                value: {
                  type: 'enum',
                  values: [
                    {value: 'fiction', label: 'Fiction'},
                    {value: 'nonfiction', label: 'Non-Fiction'},
                    {value: 'science', label: 'Science'},
                  ],
                },
              },
            ],
          },
        ],
      };
      const source = createSource(config);
      const results = syncSearch(source, 'genre fiction');

      const valueItems = results.filter(
        r => r.label.startsWith('Genre ') && r.label.includes('Fiction'),
      );
      // "fiction" matches both "Fiction" and "Non-Fiction"
      expect(valueItems.map(r => r.label)).toEqual([
        'Genre is Fiction',
        'Genre is Non-Fiction',
        'Genre is not Fiction',
        'Genre is not Non-Fiction',
      ]);

      const isAux = valueItems[0].auxiliaryData as PowerSearchAuxData;
      expect(isAux.filterValue).toEqual({type: 'enum', value: 'fiction'});
    });

    it('suggests only matching operator for "<field> <operator> <value>" with enum', () => {
      const config: PowerSearchConfig = {
        name: 'Test',
        fields: [
          {
            key: 'genre',
            label: 'Genre',
            operators: [
              {
                key: 'is',
                label: 'is',
                value: {
                  type: 'enum',
                  values: [
                    {value: 'fiction', label: 'Fiction'},
                    {value: 'nonfiction', label: 'Non-Fiction'},
                  ],
                },
              },
              {
                key: 'is_not',
                label: 'is not',
                value: {
                  type: 'enum',
                  values: [
                    {value: 'fiction', label: 'Fiction'},
                    {value: 'nonfiction', label: 'Non-Fiction'},
                  ],
                },
              },
            ],
          },
        ],
      };
      const source = createSource(config);
      const results = syncSearch(source, 'genre is fiction');

      const valueItems = results.filter(r => r.label === 'Genre is Fiction');
      expect(valueItems).toHaveLength(1);
      // Should NOT include "is not" operator results
      const isNotItems = results.filter(r =>
        r.label.startsWith('Genre is not'),
      );
      expect(isNotItems).toHaveLength(0);
    });

    it('suggests multiple matching enum values for partial match', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'status o');

      // "o" matches "Open" and "Closed"
      const valueItems = results.filter(
        r => r.label.startsWith('Status is ') && r.label !== 'Status is',
      );
      expect(valueItems.map(r => r.label)).toEqual([
        'Status is Open',
        'Status is Closed',
      ]);
    });

    it('does not suggest enum values when no labels match', () => {
      const source = createSource(baseConfig);
      const results = syncSearch(source, 'status xyz');

      const valueItems = results.filter(
        r => r.label.startsWith('Status is ') && r.label !== 'Status is',
      );
      expect(valueItems).toHaveLength(0);
    });

    it('uses enum_list filter value for enum_list operators', () => {
      const config: PowerSearchConfig = {
        name: 'Test',
        fields: [
          {
            key: 'tags',
            label: 'Tags',
            operators: [
              {
                key: 'includes',
                label: 'includes',
                value: {
                  type: 'enum_list',
                  values: [
                    {value: 'bug', label: 'Bug'},
                    {value: 'feature', label: 'Feature'},
                  ],
                },
              },
            ],
          },
        ],
      };
      const source = createSource(config);
      const results = syncSearch(source, 'tags bug');

      const valueItem = results.find(r => r.label === 'Tags includes Bug');
      expect(valueItem).toBeDefined();
      const aux = valueItem!.auxiliaryData as PowerSearchAuxData;
      expect(aux.filterValue).toEqual({type: 'enum_list', value: ['bug']});
    });
  });
  describe("valueMatchMode: 'all-string-fields'", () => {
    const allStringsConfig: PowerSearchConfig = {
      ...baseConfig,
      contentSearchFieldKey: 'title',
      valueMatchMode: 'all-string-fields',
    };

    it('is off by default: free text offers only the content-search item', () => {
      const source = createSource(configWithContentSearch);
      const results = syncSearch(source, 'nest');
      expect(results.map(r => r.label)).toEqual(['"nest"']);
    });

    it('emits one item per visible string operator for free text', () => {
      const source = createSource(allStringsConfig);
      const results = syncSearch(source, 'nest');

      // Content-search item still leads; per-field value items follow.
      expect(results.map(r => r.label)).toEqual([
        '"nest"',
        'Title contains "nest"',
        'Title is "nest"',
      ]);

      const aux = results[1].auxiliaryData as PowerSearchAuxData;
      expect(aux.fieldKey).toBe('title');
      expect(aux.operatorKey).toBe('contains');
      expect(aux.filterValue).toEqual({type: 'string', value: 'nest'});
    });

    it('skips enum operators and enum-only fields', () => {
      const source = createSource(allStringsConfig);
      const results = syncSearch(source, 'open');
      // Status is enum-only: no 'Status is "open"' value item.
      expect(results.some(r => r.label.startsWith('Status '))).toBe(false);
    });

    it('respects isValueMatchAllowed: false', () => {
      const config: PowerSearchConfig = {
        name: 'OptOut',
        contentSearchFieldKey: 'title',
        valueMatchMode: 'all-string-fields',
        fields: [
          {
            key: 'title',
            label: 'Title',
            isValueMatchAllowed: false,
            operators: [
              {key: 'contains', label: 'contains', value: {type: 'string'}},
            ],
          },
        ],
      };
      const results = syncSearch(createSource(config), 'nest');
      expect(results.map(r => r.label)).toEqual(['"nest"']);
    });

    it('respects typeaheadMinQueryLength', () => {
      const config: PowerSearchConfig = {
        name: 'MinLength',
        valueMatchMode: 'all-string-fields',
        fields: [
          {
            key: 'title',
            label: 'Title',
            typeaheadMinQueryLength: 5,
            operators: [
              {key: 'contains', label: 'contains', value: {type: 'string'}},
            ],
          },
        ],
      };
      expect(syncSearch(createSource(config), 'nest')).toEqual([]);
      expect(
        syncSearch(createSource(config), 'nest/').map(r => r.label),
      ).toEqual(['Title contains "nest/"']);
    });

    it('skips search-source operators without arbitrary strings', () => {
      const ownerSource = {
        search: () => [{id: 'nest', label: 'nest'}],
        bootstrap: () => [],
      };
      const config: PowerSearchConfig = {
        name: 'SourceValues',
        contentSearchFieldKey: 'title',
        valueMatchMode: 'all-string-fields',
        fields: [
          {
            key: 'title',
            label: 'Title',
            operators: [
              {key: 'contains', label: 'contains', value: {type: 'string'}},
            ],
          },
          {
            key: 'owner',
            label: 'Owner',
            operators: [
              {
                key: 'is',
                label: 'is',
                value: {type: 'string', searchSource: ownerSource},
              },
              {
                key: 'is-either',
                label: 'is-either',
                value: {
                  type: 'string',
                  searchSource: ownerSource,
                  isArbitraryStringAllowed: true,
                },
              },
            ],
          },
        ],
      };
      const labels = syncSearch(createSource(config), 'nest').map(r => r.label);
      // Committing 'Owner is "nest"' would offer a value the Owner editor
      // never lists, so the closed operator stays out; the open one and the
      // plain Title operators still match.
      expect(labels).toContain('Title contains "nest"');
      expect(labels).toContain('Owner is-either "nest"');
      expect(labels.some(l => l.startsWith('Owner is '))).toBe(false);
    });

    it('leaves field-prefixed queries to the exact value path', () => {
      const source = createSource(allStringsConfig);
      const results = syncSearch(source, 'title nest');

      // The prefix path owns this query: no field item may reuse the whole
      // query ('title nest') as the value. (The content-search item quotes
      // the raw query by design, so it is excluded here.)
      const valueItems = results.filter(
        r => !String(r.id).startsWith('__content_search__'),
      );
      expect(valueItems.some(r => r.label.includes('"title nest"'))).toBe(
        false,
      );
      expect(valueItems.map(r => r.label)).toContain('Title contains "nest"');
    });
  });
});

describe('typed-result cap', () => {
  const manyFields: PowerSearchConfig = {
    name: 'many',
    fields: Array.from({length: 25}, (_, i) => ({
      key: `field_${i}`,
      label: `Zebra ${String(i).padStart(2, '0')}`,
      operators: [{key: 'is', label: 'is', value: {type: 'string'} as const}],
    })),
  };

  it('caps results for a typed query', () => {
    const source = createSource(manyFields, 10);
    expect(source.search('zebra')).toHaveLength(10);
  });

  it('never caps the field list for an empty query', () => {
    const source = createSource(manyFields, 10);
    expect(syncBootstrap(source)).toHaveLength(25);
    expect(source.search('')).toHaveLength(25);
  });
});
