// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getWeekdayHeaderNames.test.ts
 * @input Private weekday header resolver and generated CLDR data
 * @output Regression coverage for the per-locale width, rotation, exact,
 *   language, extension, platform, and English fallbacks
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

  it('starts the row on weekStartsOn', () => {
    expect(getWeekdayHeaderNames('en', 1)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    expect(getWeekdayHeaderNames('en', 6)[0]).toBe('Sat');
  });

  it('returns an exact generated locale entry', () => {
    expect(getWeekdayHeaderNames('ar-SA')).toEqual(
      weekdayHeaderNamesByLocale['ar-SA'],
    );
  });

  it('ignores Unicode extensions when resolving an exact locale', () => {
    const expected = weekdayHeaderNamesByLocale['zh-TW'];

    expect(getWeekdayHeaderNames('zh-TW')).toEqual(expected);
    expect(getWeekdayHeaderNames('zh-TW-u-ca-chinese')).toEqual(expected);
  });

  it('falls back from a regional locale to its base language', () => {
    expect(getWeekdayHeaderNames('es-ES')).toEqual(
      weekdayHeaderNamesByLocale.es,
    );
  });

  it('formats the platform abbreviated names for a language with no generated row', () => {
    expect(getWeekdayHeaderNames('id-ID')).toEqual([
      'Min',
      'Sen',
      'Sel',
      'Rab',
      'Kam',
      'Jum',
      'Sab',
    ]);
  });

  it('uses the platform narrow names where an unshipped language abbreviates past four characters', () => {
    // sw abbreviates with whole words (Jumapili), fa with up to eight letters.
    expect(getWeekdayHeaderNames('sw-KE')).toEqual([
      'S',
      'M',
      'T',
      'W',
      'T',
      'F',
      'S',
    ]);
    expect(getWeekdayHeaderNames('fa-IR')).toEqual([
      'ی',
      'د',
      'س',
      'چ',
      'پ',
      'ج',
      'ش',
    ]);
  });

  it('safely falls back to English for malformed and unknown locales', () => {
    expect(getWeekdayHeaderNames('not_a_locale')).toEqual(
      weekdayHeaderNamesByLocale.en,
    );
    expect(getWeekdayHeaderNames('xx-ZZ')).toEqual(
      weekdayHeaderNamesByLocale.en,
    );
  });
});
