// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getWeekdayHeaderNames.test.ts
 * @input Private weekday header resolver and generated CLDR data
 * @output Regression coverage for the per-locale width, exact, language,
 *   extension, and safe fallback
 * @position Tests for getWeekdayHeaderNames.ts
 */

import {describe, expect, it} from 'vitest';
import {getWeekdayHeaderNames} from './getWeekdayHeaderNames';
import {weekdayHeaderNamesByLocale} from './weekdayHeaderNames.generated';

describe('getWeekdayHeaderNames', () => {
  it('gives English its three-letter abbreviated names', () => {
    expect(getWeekdayHeaderNames('en')).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
  });

  it('gives a locale whose abbreviated names fit in four characters those names', () => {
    expect(getWeekdayHeaderNames('fr-FR')).toEqual([
      'dim.',
      'lun.',
      'mar.',
      'mer.',
      'jeu.',
      'ven.',
      'sam.',
    ]);
  });

  it('keeps the short names where an abbreviated name runs past four characters', () => {
    // pt-PT abbreviates with whole words (domingo), pl with "niedz.".
    expect(getWeekdayHeaderNames('pt-PT')).toEqual([
      'dom.',
      'seg.',
      'ter.',
      'qua.',
      'qui.',
      'sex.',
      'sáb.',
    ]);
    expect(getWeekdayHeaderNames('pl-PL')).toEqual([
      'nie',
      'pon',
      'wto',
      'śro',
      'czw',
      'pią',
      'sob',
    ]);
  });

  it('returns an exact generated locale entry', () => {
    expect(getWeekdayHeaderNames('ar-SA')).toBe(
      weekdayHeaderNamesByLocale['ar-SA'],
    );
  });

  it('ignores Unicode extensions when resolving an exact locale', () => {
    const expected = weekdayHeaderNamesByLocale['zh-TW'];

    expect(getWeekdayHeaderNames('zh-TW')).toBe(expected);
    expect(getWeekdayHeaderNames('zh-TW-u-ca-chinese')).toBe(expected);
  });

  it('falls back from a regional locale to its base language', () => {
    expect(getWeekdayHeaderNames('es-ES')).toBe(weekdayHeaderNamesByLocale.es);
  });

  it('safely falls back to English for malformed and unsupported locales', () => {
    expect(getWeekdayHeaderNames('not_a_locale')).toBe(
      weekdayHeaderNamesByLocale.en,
    );
    expect(getWeekdayHeaderNames('xx-ZZ')).toBe(weekdayHeaderNamesByLocale.en);
  });
});
