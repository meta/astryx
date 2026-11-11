// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {createISODateTimeString} from './createISODateTimeString';

describe('createISODateTimeString', () => {
  it('accepts a date with HH:MM or HH:MM:SS', () => {
    expect(createISODateTimeString('2026-01-28T14:30')).toBe(
      '2026-01-28T14:30',
    );
    expect(createISODateTimeString('2026-01-28T14:30:15')).toBe(
      '2026-01-28T14:30:15',
    );
  });

  it('trims, pads the time, and drops a seconds fraction', () => {
    expect(createISODateTimeString('  2026-01-28T9:5  ')).toBe(
      '2026-01-28T09:05',
    );
    expect(createISODateTimeString('2026-01-28T14:30:15.250')).toBe(
      '2026-01-28T14:30:15',
    );
  });

  it('accepts February 29 only in a leap year', () => {
    expect(createISODateTimeString('2024-02-29T00:00')).toBe(
      '2024-02-29T00:00',
    );
    expect(createISODateTimeString('2026-02-29T00:00')).toBeNull();
  });

  it.each([
    ['an empty string', ''],
    ['a date with no time', '2026-01-28'],
    ['a time with no date', '14:30'],
    ['a space in place of T', '2026-01-28 14:30'],
    ['a lowercase t', '2026-01-28t14:30'],
    ['whitespace after T', '2026-01-28T 14:30'],
    ['month 13', '2026-13-01T14:30'],
    ['month 00', '2026-00-01T14:30'],
    ['day 00', '2026-01-00T14:30'],
    ['a day past the month end', '2026-04-31T14:30'],
    ['a one-digit month', '2026-1-28T14:30'],
    ['hour 24', '2026-01-28T24:00'],
    ['a non-digit time field', '2026-01-28T2:30 PM'],
    ['a UTC suffix', '2026-01-28T14:30Z'],
    ['an offset suffix', '2026-01-28T14:30+02:00'],
  ])('rejects %s', (_, value) => {
    expect(createISODateTimeString(value)).toBeNull();
  });

  it('answers null for a non-string', () => {
    expect(createISODateTimeString(undefined as unknown as string)).toBeNull();
  });
});
