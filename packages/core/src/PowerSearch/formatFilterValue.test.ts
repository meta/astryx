// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {formatDateAbsolute, formatFilterValue} from './formatFilterValue';
import type {TranslatorFn} from '../i18n';
import type {OperatorValue, FilterValue} from './types';

// Minimal stand-in for the real translator: resolves just the count/range keys
// formatFilterValue uses, with the same singular/plural forms as en.json so the
// overflow-summary assertions ("3 items", "2 entities", "1 filter") hold.
const t: TranslatorFn = (key, values) => {
  const count = Number(values?.count ?? 0);
  switch (key) {
    case '@astryx.powersearch.valueEditor.itemsCount':
      return `${count} ${count === 1 ? 'item' : 'items'}`;
    case '@astryx.powersearch.valueEditor.entitiesCount':
      return `${count} ${count === 1 ? 'entity' : 'entities'}`;
    case '@astryx.powersearch.valueEditor.filtersCount':
      return `${count} ${count === 1 ? 'filter' : 'filters'}`;
    case '@astryx.powersearch.valueEditor.dateRange':
      return 'date range';
    default:
      return key;
  }
};

// _config is unused by formatFilterValue; a stub keeps the call type-clean.
const fmt = (
  operator: OperatorValue,
  value: FilterValue,
  maxLength = 20,
  timezoneID?: string,
): string =>
  formatFilterValue(
    {} as never,
    operator,
    value,
    maxLength,
    t,
    'en-US',
    timezoneID,
  );

const ELLIPSIS = '…';

describe('formatFilterValue', () => {
  it('returns an empty string for an empty value', () => {
    expect(fmt({type: 'empty'}, {type: 'empty'})).toBe('');
  });

  describe('string', () => {
    it('returns the string unchanged when within maxLength', () => {
      expect(fmt({type: 'string'}, {type: 'string', value: 'hello'})).toBe(
        'hello',
      );
    });

    it('truncates with an ellipsis when longer than maxLength', () => {
      const out = fmt(
        {type: 'string'},
        {type: 'string', value: 'abcdefghij'},
        5,
      );
      expect(out).toBe('abcd' + ELLIPSIS);
      expect(out.length).toBe(5);
    });

    it('keeps a string exactly at the boundary intact', () => {
      expect(fmt({type: 'string'}, {type: 'string', value: 'abcde'}, 5)).toBe(
        'abcde',
      );
    });

    it('truncates by characters, never splitting an emoji (#4759)', () => {
      // Four surrogate-pair emoji: 8 code units, 4 user-perceived characters.
      // The exact-string assertion also proves no surrogate pair was split.
      const out = fmt(
        {type: 'string'},
        {type: 'string', value: '\u{1F600}'.repeat(4)},
        3,
      );
      expect(out).toBe('\u{1F600}'.repeat(2) + ELLIPSIS);
    });

    it('keeps multi-unit characters within maxLength intact (#4759)', () => {
      // Three emoji are 6 code units but only 3 user-perceived characters.
      expect(
        fmt(
          {type: 'string'},
          {type: 'string', value: '\u{1F600}'.repeat(3)},
          3,
        ),
      ).toBe('\u{1F600}'.repeat(3));
    });
  });

  describe('integer / float', () => {
    it('formats the same number differently when the locale changes', () => {
      const args = [
        {} as never,
        {type: 'float'} as OperatorValue,
        {type: 'float', value: 1234.5} as FilterValue,
        40,
        t,
      ] as const;
      expect(formatFilterValue(...args, 'en-US')).toBe('1,234.5');
      expect(formatFilterValue(...args, 'de-DE')).toBe('1.234,5');
    });

    it('formats an integer with locale grouping', () => {
      const expected = new Intl.NumberFormat('en-US').format(1234567);
      expect(
        fmt({type: 'integer'}, {type: 'integer', value: 1234567}, 40),
      ).toBe(expected);
    });

    it('appends integer units only when the operator is an integer', () => {
      expect(
        fmt({type: 'integer', units: 'ms'}, {type: 'integer', value: 42}),
      ).toBe('42 ms');
      // mismatched operator type → no units
      expect(fmt({type: 'string'}, {type: 'integer', value: 42})).toBe('42');
    });

    it('appends float units only when the operator is a float', () => {
      expect(
        fmt({type: 'float', units: 'kg'}, {type: 'float', value: 3.5}),
      ).toBe('3.5 kg');
      expect(fmt({type: 'string'}, {type: 'float', value: 3.5})).toBe('3.5');
    });
  });

  describe('enum', () => {
    const enumOp: OperatorValue = {
      type: 'enum',
      values: [
        {value: 'us', label: 'United States'},
        {value: 'ca', label: 'Canada'},
      ],
    };

    it('maps the stored value to its label', () => {
      expect(fmt(enumOp, {type: 'enum', value: 'ca'}, 40)).toBe('Canada');
    });

    it('falls back to the raw value when no label matches', () => {
      expect(fmt(enumOp, {type: 'enum', value: 'mx'}, 40)).toBe('mx');
    });

    it('uses the raw value when the operator is not an enum', () => {
      expect(fmt({type: 'string'}, {type: 'enum', value: 'ca'}, 40)).toBe('ca');
    });

    it('truncates a long enum label', () => {
      expect(fmt(enumOp, {type: 'enum', value: 'us'}, 5)).toBe(
        'Unit' + ELLIPSIS,
      );
    });
  });

  describe('string_list', () => {
    const op: OperatorValue = {type: 'string_list'};
    it('returns an empty string for no items', () => {
      expect(fmt(op, {type: 'string_list', value: []})).toBe('');
    });
    it('returns the single item, truncated', () => {
      expect(fmt(op, {type: 'string_list', value: ['solo']})).toBe('solo');
    });
    it('joins multiple items when they fit', () => {
      expect(fmt(op, {type: 'string_list', value: ['a', 'b', 'c']})).toBe(
        'a, b, c',
      );
    });
    it('summarizes as a count when the join exceeds maxLength', () => {
      expect(
        fmt(op, {type: 'string_list', value: ['alpha', 'bravo', 'charlie']}, 8),
      ).toBe('3 items');
    });
  });

  describe('enum_list', () => {
    const enumOp: OperatorValue = {
      type: 'enum_list',
      values: [
        {value: 'r', label: 'Red'},
        {value: 'g', label: 'Green'},
      ],
    };
    it('returns an empty string for no items', () => {
      expect(fmt(enumOp, {type: 'enum_list', value: []})).toBe('');
    });
    it('maps a single value to its label', () => {
      expect(fmt(enumOp, {type: 'enum_list', value: ['g']}, 40)).toBe('Green');
    });
    it('joins mapped labels when they fit', () => {
      expect(fmt(enumOp, {type: 'enum_list', value: ['r', 'g']}, 40)).toBe(
        'Red, Green',
      );
    });
    it('summarizes labels as a count when too long', () => {
      expect(fmt(enumOp, {type: 'enum_list', value: ['r', 'g']}, 5)).toBe(
        '2 items',
      );
    });
    it('uses raw values with a non-enum operator', () => {
      expect(
        fmt({type: 'string'}, {type: 'enum_list', value: ['x', 'y']}, 40),
      ).toBe('2 items');
      expect(
        fmt({type: 'string'}, {type: 'enum_list', value: ['solo']}, 40),
      ).toBe('solo');
    });
  });

  describe('entity_list', () => {
    const op: OperatorValue = {type: 'entity_list'};
    it('returns an empty string for no entities', () => {
      expect(fmt(op, {type: 'entity_list', value: []})).toBe('');
    });
    it('returns a single entity label', () => {
      expect(
        fmt(op, {type: 'entity_list', value: [{id: '1', label: 'Ada'}]}),
      ).toBe('Ada');
    });
    it('joins entity labels when they fit', () => {
      expect(
        fmt(op, {
          type: 'entity_list',
          value: [
            {id: '1', label: 'Ada'},
            {id: '2', label: 'Bob'},
          ],
        }),
      ).toBe('Ada, Bob');
    });
    it('summarizes as an entity count when too long', () => {
      expect(
        fmt(
          op,
          {
            type: 'entity_list',
            value: [
              {id: '1', label: 'Alexander'},
              {id: '2', label: 'Bartholomew'},
            ],
          },
          8,
        ),
      ).toBe('2 entities');
    });
  });

  describe('dates and time', () => {
    it('returns a time value verbatim', () => {
      expect(fmt({type: 'time'}, {type: 'time', value: '14:30'})).toBe('14:30');
    });
    it('returns a relative date value verbatim', () => {
      expect(
        fmt({type: 'date_relative'}, {type: 'date_relative', value: '7d'}),
      ).toBe('7d');
    });
    it('renders a fixed placeholder for a date range', () => {
      expect(
        fmt(
          {type: 'date_range'},
          {
            type: 'date_range',
            value: {start: {type: 'NOW'}, end: {type: 'NOW'}},
          },
        ),
      ).toBe('date range');
    });
    it('reads a date-only value as its day in the zone, with no time, and a time-of-day value with its time', () => {
      // 2024-03-10T03:00:00Z: March 10 in Tokyo, March 9 in Los Angeles.
      const unixSeconds = Date.parse('2024-03-10T03:00:00Z') / 1000;
      expect(formatDateAbsolute(unixSeconds, 'en-US', 'Asia/Tokyo')).toBe(
        'Mar 10, 2024',
      );
      expect(
        formatDateAbsolute(unixSeconds, 'en-US', 'America/Los_Angeles'),
      ).toBe('Mar 9, 2024');
      expect(formatDateAbsolute(unixSeconds, 'en-US', undefined)).toBe(
        'Mar 10, 2024',
      );
      expect(
        formatDateAbsolute(unixSeconds, 'en-US', 'America/Los_Angeles', false),
      ).toBe('Mar 9, 2024, 7:00 PM');
    });

    it('keeps Gregorian years for locales that default to another calendar', () => {
      const unixSeconds = Date.parse('2026-08-22T12:00:00Z') / 1000;
      for (const value of [
        formatDateAbsolute(unixSeconds, 'th-TH', 'UTC'),
        formatDateAbsolute(unixSeconds, 'th-TH', undefined),
        formatDateAbsolute(unixSeconds, 'th-TH', 'UTC', false),
        formatDateAbsolute(unixSeconds, 'th-TH', undefined, false),
      ]) {
        expect(value).toContain('2026');
        expect(value).not.toContain('2569');
      }
    });

    describe.each([
      {calendar: 'persian', locale: 'en', year: '1405'},
      {calendar: 'persian', locale: 'fa', year: '۱۴۰۵'},
      {calendar: 'hebrew', locale: 'en', year: '5787'},
      {calendar: 'hebrew', locale: 'he', year: '5787'},
      {calendar: 'buddhist', locale: 'en', year: '2569'},
      {calendar: 'buddhist', locale: 'th', year: '2569'},
    ] as const)(
      'absolute dates in $calendar under $locale',
      ({calendar, locale, year}) => {
        const instant = Date.parse('2026-10-30T12:00:00Z');
        const unixSeconds = instant / 1000;

        it('writes the editor summary in the calendar, with its time', () => {
          const value = formatDateAbsolute(
            unixSeconds,
            locale,
            'UTC',
            false,
            calendar,
          );
          expect(value).toBe(
            new Intl.DateTimeFormat(locale, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'UTC',
              calendar,
            }).format(instant),
          );
          expect(value).toContain(year);
          expect(value).not.toContain('2026');
        });

        it('writes the token value in the calendar', () => {
          const value = formatDateAbsolute(
            unixSeconds,
            locale,
            'UTC',
            true,
            calendar,
          );
          expect(value).toBe(
            new Intl.DateTimeFormat(locale, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
              calendar,
            }).format(instant),
          );
          expect(value).toContain(year);
        });

        it('passes the calendar through formatFilterValue', () => {
          expect(
            formatFilterValue(
              {} as never,
              {type: 'date_absolute'},
              {type: 'date_absolute', unixSeconds},
              60,
              t,
              locale,
              'UTC',
              calendar,
            ),
          ).toBe(
            formatDateAbsolute(unixSeconds, locale, 'UTC', true, calendar),
          );
        });
      },
    );

    it('defaults absolute dates to the Gregorian calendar', () => {
      const unixSeconds = Date.parse('2026-10-30T12:00:00Z') / 1000;
      expect(formatDateAbsolute(unixSeconds, 'fa', 'UTC')).toBe(
        formatDateAbsolute(unixSeconds, 'fa', 'UTC', true, 'gregory'),
      );
      expect(formatDateAbsolute(unixSeconds, 'fa', 'UTC', false)).toBe(
        formatDateAbsolute(unixSeconds, 'fa', 'UTC', false, 'gregory'),
      );
      expect(
        fmt(
          {type: 'date_absolute'},
          {type: 'date_absolute', unixSeconds},
          60,
          'UTC',
        ),
      ).toContain('2026');
    });

    it('keeps time and relative values unchanged in another calendar', () => {
      const inCalendar = (value: FilterValue) =>
        formatFilterValue(
          {} as never,
          {type: value.type} as OperatorValue,
          value,
          20,
          t,
          'fa',
          'UTC',
          'persian',
        );
      expect(inCalendar({type: 'time', value: '14:30'})).toBe('14:30');
      expect(inCalendar({type: 'date_relative', value: '7d'})).toBe('7d');
    });

    it('formats an absolute date and truncates to maxLength', () => {
      const full = fmt(
        {type: 'date_absolute'},
        {type: 'date_absolute', unixSeconds: 0},
        60,
        'UTC',
      );
      expect(full).toContain('1970');
      const short = fmt(
        {type: 'date_absolute'},
        {type: 'date_absolute', unixSeconds: 0},
        6,
        'UTC',
      );
      expect(short.length).toBe(6);
      expect(short.endsWith(ELLIPSIS)).toBe(true);
    });
  });

  describe('custom', () => {
    it('stringifies via the operator getString and truncates', () => {
      const op: OperatorValue = {
        type: 'custom',
        Editor: (() => null) as never,
        getString: v => `custom:${v}`,
      };
      expect(fmt(op, {type: 'custom', value: 'x'})).toBe('custom:x');
    });
    it('returns the raw value when the operator is not custom', () => {
      expect(fmt({type: 'string'}, {type: 'custom', value: 'raw'})).toBe('raw');
    });
  });

  describe('nested', () => {
    it('uses the singular form for a single nested filter', () => {
      expect(
        fmt({type: 'nested'}, {type: 'nested', value: [{} as never]}),
      ).toBe('1 filter');
    });
    it('uses the plural form for multiple nested filters', () => {
      expect(
        fmt(
          {type: 'nested'},
          {
            type: 'nested',
            value: [{} as never, {} as never, {} as never],
          },
        ),
      ).toBe('3 filters');
    });
  });
});
