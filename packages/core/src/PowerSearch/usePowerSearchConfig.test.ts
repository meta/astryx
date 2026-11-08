// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file usePowerSearchConfig.test.ts
 * @input createPowerSearchConfig utility
 * @output Tests for every field type + operator combination
 * @position Testing; validates usePowerSearchConfig.ts
 */

import {describe, it, expect, vi} from 'vitest';
import {createPowerSearchConfig} from './usePowerSearchConfig';
import type {InferData} from './usePowerSearchConfig';
import type {PowerSearchFilter} from './types';

// =============================================================================
// Test data setup
// =============================================================================

const statusEnumValues = [
  {value: 'active', label: 'Active'},
  {value: 'inactive', label: 'Inactive'},
  {value: 'pending', label: 'Pending'},
] as const;

const defs = [
  {key: 'name', type: 'string', label: 'Name'},
  {key: 'age', type: 'number', label: 'Age'},
  {key: 'createdAt', type: 'date', label: 'Created At'},
  {key: 'active', type: 'boolean', label: 'Active'},
  {
    key: 'role',
    type: 'enum',
    label: 'Role',
    enumValues: [
      {value: 'admin', label: 'Admin'},
      {value: 'user', label: 'User'},
    ],
  },
  {
    key: 'status',
    type: 'enum_list',
    label: 'Status',
    enumValues: statusEnumValues,
  },
  {key: 'tags', type: 'string_list', label: 'Tags'},
] as const;

const {config, applyFilters} = createPowerSearchConfig(defs, 'TestConfig');

const data: InferData<typeof defs>[] = [
  {
    name: 'Alice Johnson',
    age: 30,
    createdAt: 1700000000,
    active: true,
    role: 'admin',
    status: ['active'],
    tags: ['frontend', 'lead'],
  },
  {
    name: 'Bob Smith',
    age: 25,
    createdAt: 1700100000,
    active: false,
    role: 'user',
    status: ['inactive'],
    tags: ['backend'],
  },
  {
    name: 'Charlie Brown',
    age: 35,
    createdAt: 1700200000,
    active: true,
    role: 'user',
    status: ['pending'],
    tags: ['frontend', 'backend'],
  },
  {
    name: 'Diana Prince',
    age: 28,
    createdAt: 1700300000,
    active: true,
    role: 'admin',
    status: ['active'],
    tags: ['devops'],
  },
];

function filter(
  field: string,
  operator: string,
  value: PowerSearchFilter['value'],
): PowerSearchFilter {
  return {field, operator, value};
}

// =============================================================================
// Config generation
// =============================================================================

describe('createPowerSearchConfig', () => {
  it('generates config with correct name', () => {
    expect(config.name).toBe('TestConfig');
  });

  it('generates a field for each definition', () => {
    expect(config.fields).toHaveLength(7);
    expect(config.fields.map(f => f.key)).toEqual([
      'name',
      'age',
      'createdAt',
      'active',
      'role',
      'status',
      'tags',
    ]);
  });

  it('uses key as label when label is not provided', () => {
    const {config: c} = createPowerSearchConfig([{key: 'foo', type: 'string'}]);
    expect(c.fields[0].label).toBe('foo');
  });

  it('generates string operators', () => {
    const field = config.fields.find(f => f.key === 'name')!;
    expect(field.operators.map(o => o.key)).toEqual([
      'contains',
      'not_contains',
      'starts_with',
      'not_starts_with',
      'ends_with',
      'not_ends_with',
      'is',
      'is_not',
    ]);
    expect(field.defaultOperator).toBe('contains');
  });

  it('generates number operators', () => {
    const field = config.fields.find(f => f.key === 'age')!;
    expect(field.operators.map(o => o.key)).toEqual([
      'equals',
      'not_equals',
      'greater_than',
      'less_than',
      'greater_than_or_equal',
      'less_than_or_equal',
    ]);
    expect(field.defaultOperator).toBe('equals');
  });

  it('generates date operators', () => {
    const field = config.fields.find(f => f.key === 'createdAt')!;
    expect(field.operators.map(o => o.key)).toEqual([
      'before',
      'after',
      'between',
    ]);
    expect(field.defaultOperator).toBe('after');
  });

  it('generates boolean operators', () => {
    const field = config.fields.find(f => f.key === 'active')!;
    expect(field.operators.map(o => o.key)).toEqual(['is_true', 'is_false']);
    expect(field.defaultOperator).toBe('is_true');
  });

  it('generates enum operators with values', () => {
    const field = config.fields.find(f => f.key === 'role')!;
    expect(field.operators.map(o => o.key)).toEqual([
      'is',
      'is_not',
      'is_any_of',
      'is_none_of',
    ]);
    expect(field.defaultOperator).toBe('is');
    expect(field.operators[0].value).toEqual({
      type: 'enum',
      values: [
        {value: 'admin', label: 'Admin'},
        {value: 'user', label: 'User'},
      ],
    });
  });

  it('generates enum_list operators with values', () => {
    const field = config.fields.find(f => f.key === 'status')!;
    expect(field.operators.map(o => o.key)).toEqual([
      'is_any_of',
      'is_none_of',
    ]);
    expect(field.defaultOperator).toBe('is_any_of');
  });

  it('generates string_list operators', () => {
    const field = config.fields.find(f => f.key === 'tags')!;
    expect(field.operators.map(o => o.key)).toEqual([
      'is_any_of',
      'is_none_of',
    ]);
    expect(field.defaultOperator).toBe('is_any_of');
  });
});

// =============================================================================
// applyFilters — empty filters
// =============================================================================

describe('applyFilters', () => {
  it('returns all data when no filters are applied', () => {
    expect(applyFilters([], data)).toHaveLength(4);
  });

  // ===========================================================================
  // String operators
  // ===========================================================================

  describe('string: contains', () => {
    it('matches rows containing substring', () => {
      const result = applyFilters(
        [filter('name', 'contains', {type: 'string', value: 'ali'})],
        data,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice Johnson');
    });
  });

  describe('string: not_contains', () => {
    it('excludes rows containing substring', () => {
      const result = applyFilters(
        [filter('name', 'not_contains', {type: 'string', value: 'ali'})],
        data,
      );
      expect(result).toHaveLength(3);
      expect(result.map(r => r.name)).not.toContain('Alice Johnson');
    });
  });

  describe('string: starts_with', () => {
    it('matches rows starting with prefix', () => {
      const result = applyFilters(
        [filter('name', 'starts_with', {type: 'string', value: 'cha'})],
        data,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Charlie Brown');
    });
  });

  describe('string: not_starts_with', () => {
    it('excludes rows starting with prefix', () => {
      const result = applyFilters(
        [filter('name', 'not_starts_with', {type: 'string', value: 'cha'})],
        data,
      );
      expect(result).toHaveLength(3);
    });
  });

  describe('string: ends_with', () => {
    it('matches rows ending with suffix', () => {
      const result = applyFilters(
        [filter('name', 'ends_with', {type: 'string', value: 'smith'})],
        data,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bob Smith');
    });
  });

  describe('string: not_ends_with', () => {
    it('excludes rows ending with suffix', () => {
      const result = applyFilters(
        [filter('name', 'not_ends_with', {type: 'string', value: 'smith'})],
        data,
      );
      expect(result).toHaveLength(3);
    });
  });

  describe('string: is', () => {
    it('matches exact string (case-insensitive)', () => {
      const result = applyFilters(
        [filter('name', 'is', {type: 'string', value: 'bob smith'})],
        data,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bob Smith');
    });

    it('does not match partial strings', () => {
      const result = applyFilters(
        [filter('name', 'is', {type: 'string', value: 'bob'})],
        data,
      );
      expect(result).toHaveLength(0);
    });
  });

  describe('string: is_not', () => {
    it('excludes exact match', () => {
      const result = applyFilters(
        [filter('name', 'is_not', {type: 'string', value: 'bob smith'})],
        data,
      );
      expect(result).toHaveLength(3);
    });
  });

  // ===========================================================================
  // Number operators
  // ===========================================================================

  describe('number: equals', () => {
    it('matches exact number', () => {
      const result = applyFilters(
        [filter('age', 'equals', {type: 'float', value: 30})],
        data,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice Johnson');
    });
  });

  describe('number: not_equals', () => {
    it('excludes exact number', () => {
      const result = applyFilters(
        [filter('age', 'not_equals', {type: 'float', value: 30})],
        data,
      );
      expect(result).toHaveLength(3);
    });
  });

  describe('number: greater_than', () => {
    it('matches numbers greater than value', () => {
      const result = applyFilters(
        [filter('age', 'greater_than', {type: 'float', value: 29})],
        data,
      );
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name).sort()).toEqual([
        'Alice Johnson',
        'Charlie Brown',
      ]);
    });
  });

  describe('number: less_than', () => {
    it('matches numbers less than value', () => {
      const result = applyFilters(
        [filter('age', 'less_than', {type: 'float', value: 28})],
        data,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bob Smith');
    });
  });

  describe('number: greater_than_or_equal', () => {
    it('matches numbers >= value', () => {
      const result = applyFilters(
        [filter('age', 'greater_than_or_equal', {type: 'float', value: 30})],
        data,
      );
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name).sort()).toEqual([
        'Alice Johnson',
        'Charlie Brown',
      ]);
    });
  });

  describe('number: less_than_or_equal', () => {
    it('matches numbers <= value', () => {
      const result = applyFilters(
        [filter('age', 'less_than_or_equal', {type: 'float', value: 28})],
        data,
      );
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name).sort()).toEqual([
        'Bob Smith',
        'Diana Prince',
      ]);
    });
  });

  // ===========================================================================
  // Date operators
  // ===========================================================================

  describe('date: before', () => {
    it('matches dates before value', () => {
      const result = applyFilters(
        [
          filter('createdAt', 'before', {
            type: 'date_absolute',
            unixSeconds: 1700100000,
          }),
        ],
        data,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice Johnson');
    });
  });

  describe('date: after', () => {
    it('matches dates after value', () => {
      const result = applyFilters(
        [
          filter('createdAt', 'after', {
            type: 'date_absolute',
            unixSeconds: 1700200000,
          }),
        ],
        data,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Diana Prince');
    });
  });

  describe('date: between', () => {
    it('matches dates within absolute range', () => {
      const result = applyFilters(
        [
          filter('createdAt', 'between', {
            type: 'date_range',
            value: {
              start: {type: 'ABSOLUTE', unixSeconds: 1700050000},
              end: {type: 'ABSOLUTE', unixSeconds: 1700250000},
            },
          }),
        ],
        data,
      );
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name).sort()).toEqual([
        'Bob Smith',
        'Charlie Brown',
      ]);
    });

    it('handles NOW range part', () => {
      // All test data timestamps are in the past, so "between <past> and NOW" should include them
      const result = applyFilters(
        [
          filter('createdAt', 'between', {
            type: 'date_range',
            value: {
              start: {type: 'ABSOLUTE', unixSeconds: 1700000000},
              end: {type: 'NOW'},
            },
          }),
        ],
        data,
      );
      expect(result).toHaveLength(4);
    });

    it('handles RELATIVE range part', () => {
      // Use a very large relative range to capture all test data
      const result = applyFilters(
        [
          filter('createdAt', 'between', {
            type: 'date_range',
            value: {
              start: {type: 'RELATIVE', backValue: 3650, unit: 'day'},
              end: {type: 'NOW'},
            },
          }),
        ],
        data,
      );
      expect(result).toHaveLength(4);
    });

    it('resolves both endpoints against one evaluation instant', () => {
      const nowSpy = vi
        .spyOn(Date, 'now')
        .mockReturnValue(1_700_100_000 * 1000);
      try {
        const result = applyFilters(
          [
            filter('createdAt', 'between', {
              type: 'date_range',
              value: {
                start: {type: 'RELATIVE', backValue: 2, unit: 'day'},
                end: {type: 'NOW'},
              },
            }),
          ],
          data.slice(0, 1),
        );

        expect(result).toHaveLength(1);
        expect(nowSpy).toHaveBeenCalledTimes(1);
      } finally {
        nowSpy.mockRestore();
      }
    });
  });

  describe('date: works with Date objects', () => {
    it('converts Date to unix seconds', () => {
      const dateData: InferData<typeof defs>[] = [
        {
          name: 'Test',
          age: 1,
          createdAt: new Date(1700100000 * 1000),
          active: true,
          role: 'user',
          status: ['active'],
          tags: ['a'],
        },
      ];
      const result = applyFilters(
        [
          filter('createdAt', 'after', {
            type: 'date_absolute',
            unixSeconds: 1700000000,
          }),
        ],
        dateData,
      );
      expect(result).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Boolean operators
  // ===========================================================================

  describe('boolean: is_true', () => {
    it('matches truthy values', () => {
      const result = applyFilters(
        [filter('active', 'is_true', {type: 'empty'})],
        data,
      );
      expect(result).toHaveLength(3);
      expect(result.map(r => r.name).sort()).toEqual([
        'Alice Johnson',
        'Charlie Brown',
        'Diana Prince',
      ]);
    });
  });

  describe('boolean: is_false', () => {
    it('matches falsy values', () => {
      const result = applyFilters(
        [filter('active', 'is_false', {type: 'empty'})],
        data,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bob Smith');
    });
  });

  // ===========================================================================
  // Enum operators
  // ===========================================================================

  describe('enum: is', () => {
    it('matches exact enum value', () => {
      const result = applyFilters(
        [filter('role', 'is', {type: 'enum', value: 'admin'})],
        data,
      );
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name).sort()).toEqual([
        'Alice Johnson',
        'Diana Prince',
      ]);
    });
  });

  describe('enum: is_not', () => {
    it('excludes exact enum value', () => {
      const result = applyFilters(
        [filter('role', 'is_not', {type: 'enum', value: 'admin'})],
        data,
      );
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name).sort()).toEqual([
        'Bob Smith',
        'Charlie Brown',
      ]);
    });
  });

  describe('enum: is_any_of', () => {
    it('matches when value is in the list', () => {
      const result = applyFilters(
        [
          filter('role', 'is_any_of', {
            type: 'enum_list',
            value: ['admin', 'user'],
          }),
        ],
        data,
      );
      expect(result).toHaveLength(4);
    });

    it('matches subset of values', () => {
      const result = applyFilters(
        [
          filter('role', 'is_any_of', {
            type: 'enum_list',
            value: ['admin'],
          }),
        ],
        data,
      );
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name).sort()).toEqual([
        'Alice Johnson',
        'Diana Prince',
      ]);
    });
  });

  describe('enum: is_none_of', () => {
    it('excludes rows matching any value in the list', () => {
      const result = applyFilters(
        [
          filter('role', 'is_none_of', {
            type: 'enum_list',
            value: ['admin'],
          }),
        ],
        data,
      );
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name).sort()).toEqual([
        'Bob Smith',
        'Charlie Brown',
      ]);
    });
  });

  // ===========================================================================
  // Enum list operators
  // ===========================================================================

  describe('enum_list: is_any_of', () => {
    it('matches when value is in the list', () => {
      const result = applyFilters(
        [
          filter('status', 'is_any_of', {
            type: 'enum_list',
            value: ['active', 'pending'],
          }),
        ],
        data,
      );
      expect(result).toHaveLength(3);
    });

    it('returns empty when no values match', () => {
      const result = applyFilters(
        [
          filter('status', 'is_any_of', {
            type: 'enum_list',
            value: ['archived'],
          }),
        ],
        data,
      );
      expect(result).toHaveLength(0);
    });
  });

  describe('enum_list: is_none_of', () => {
    it('excludes rows matching any value in the list', () => {
      const result = applyFilters(
        [
          filter('status', 'is_none_of', {
            type: 'enum_list',
            value: ['active'],
          }),
        ],
        data,
      );
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name).sort()).toEqual([
        'Bob Smith',
        'Charlie Brown',
      ]);
    });
  });

  // ===========================================================================
  // String list operators
  // ===========================================================================

  describe('string_list: is_any_of', () => {
    it('matches when any array element is in the filter list', () => {
      const result = applyFilters(
        [filter('tags', 'is_any_of', {type: 'string_list', value: ['devops']})],
        data,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Diana Prince');
    });

    it('matches multiple tags', () => {
      const result = applyFilters(
        [
          filter('tags', 'is_any_of', {
            type: 'string_list',
            value: ['frontend'],
          }),
        ],
        data,
      );
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name).sort()).toEqual([
        'Alice Johnson',
        'Charlie Brown',
      ]);
    });
  });

  describe('string_list: is_none_of', () => {
    it('excludes rows with any matching tag', () => {
      const result = applyFilters(
        [
          filter('tags', 'is_none_of', {
            type: 'string_list',
            value: ['frontend'],
          }),
        ],
        data,
      );
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name).sort()).toEqual([
        'Bob Smith',
        'Diana Prince',
      ]);
    });

    it('excludes rows matching multiple tags', () => {
      const result = applyFilters(
        [
          filter('tags', 'is_none_of', {
            type: 'string_list',
            value: ['frontend', 'devops'],
          }),
        ],
        data,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bob Smith');
    });
  });

  // ===========================================================================
  // Combined filters (AND logic)
  // ===========================================================================

  describe('multiple filters', () => {
    it('applies all filters with AND logic', () => {
      const result = applyFilters(
        [
          filter('role', 'is', {type: 'enum', value: 'admin'}),
          filter('active', 'is_true', {type: 'empty'}),
          filter('age', 'greater_than', {type: 'float', value: 29}),
        ],
        data,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice Johnson');
    });

    it('returns empty when filters are contradictory', () => {
      const result = applyFilters(
        [
          filter('active', 'is_true', {type: 'empty'}),
          filter('active', 'is_false', {type: 'empty'}),
        ],
        data,
      );
      expect(result).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe('edge cases', () => {
    it('unknown operator passes through (does not filter)', () => {
      const result = applyFilters(
        [filter('name', 'unknown_op', {type: 'string', value: 'test'})],
        data,
      );
      expect(result).toHaveLength(4);
    });

    it('string operators are case-insensitive', () => {
      const result = applyFilters(
        [filter('name', 'contains', {type: 'string', value: 'ALICE'})],
        data,
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice Johnson');
    });

    it('handles string_list field with scalar value (non-array)', () => {
      const scalarData: InferData<typeof defs>[] = [
        {
          name: 'Test',
          age: 1,
          createdAt: 0,
          active: true,
          role: 'user',
          status: ['active'],
          tags: 'solo' as unknown as ReadonlyArray<string>,
        },
      ];
      const result = applyFilters(
        [filter('tags', 'is_any_of', {type: 'string_list', value: ['solo']})],
        scalarData,
      );
      expect(result).toHaveLength(1);
    });
  });
});
