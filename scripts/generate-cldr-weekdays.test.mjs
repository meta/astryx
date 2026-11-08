// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  getGeneratedLocales,
  getGeneratedLocaleSources,
  MAX_ABBREVIATED_LENGTH,
  renderGeneratedFile,
  resolveCldrSourceLocale,
} from './generate-cldr-weekdays.mjs';
import {weekdayHeaderNamesByLocale} from '../packages/core/src/Calendar/weekdayHeaderNames.generated';
import {MAX_ABBREVIATED_HEADER_LENGTH} from '../packages/core/src/Calendar/getWeekdayHeaderNames';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLDR_ROOT = path.dirname(require.resolve('cldr-dates-full/package.json'));
const OUTPUT_FILE = path.join(
  ROOT,
  'packages/core/src/Calendar/weekdayHeaderNames.generated.ts',
);
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const graphemes = new Intl.Segmenter('en', {granularity: 'grapheme'});

function readRawCldr(locale, width) {
  const document = JSON.parse(
    fs.readFileSync(
      path.join(CLDR_ROOT, 'main', locale, 'ca-gregorian.json'),
      'utf8',
    ),
  );
  const days =
    document.main[locale].dates.calendars.gregorian.days['stand-alone'][width];
  return DAY_KEYS.map(day => days[day]);
}

function expectedHeaderNames(locale) {
  const abbreviated = readRawCldr(locale, 'abbreviated');
  const fits = abbreviated.every(
    name => [...graphemes.segment(name)].length <= MAX_ABBREVIATED_LENGTH,
  );
  return fits ? abbreviated : readRawCldr(locale, 'short');
}

describe('generate-cldr-weekdays', () => {
  it('matches checked-in generated output deterministically', async () => {
    const first = await renderGeneratedFile();
    const second = await renderGeneratedFile();

    expect(first).toBe(second);
    expect(first).toBe(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  });

  it('resolves exact, base-language, and script-parent CLDR sources', () => {
    expect(resolveCldrSourceLocale('en', new Set(['en']))).toBe('en');
    expect(resolveCldrSourceLocale('es-MX', new Set(['es']))).toBe('es');
    expect(resolveCldrSourceLocale('zh-TW', new Set(['zh', 'zh-Hant']))).toBe(
      'zh-Hant',
    );
  });

  it('matches every generated locale to its pinned raw CLDR source', () => {
    const generatedLocales = getGeneratedLocales();
    const sources = getGeneratedLocaleSources();
    const checkedInLocales = Object.keys(weekdayHeaderNamesByLocale);

    expect(checkedInLocales.toSorted()).toEqual(generatedLocales.toSorted());

    for (const locale of generatedLocales) {
      const source = sources[locale];
      const weekdays = weekdayHeaderNamesByLocale[locale];

      expect(source).toBeDefined();
      expect(weekdays).toEqual(expectedHeaderNames(source));
      expect(weekdays).toHaveLength(7);
      for (const weekday of weekdays) {
        expect(typeof weekday).toBe('string');
        expect(weekday.length).toBeGreaterThan(0);
      }
      expect(new Set(weekdays).size).toBe(7);
    }
  });

  it('picks abbreviated names only where all seven fit in four characters', () => {
    expect(MAX_ABBREVIATED_LENGTH).toBe(4);
    // The runtime fallback for unshipped languages applies the same limit.
    expect(MAX_ABBREVIATED_HEADER_LENGTH).toBe(MAX_ABBREVIATED_LENGTH);
    expect(weekdayHeaderNamesByLocale.en).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
    expect(weekdayHeaderNamesByLocale.en).toEqual(
      readRawCldr('en', 'abbreviated'),
    );
    expect(weekdayHeaderNamesByLocale.fr).toEqual(
      readRawCldr('fr', 'abbreviated'),
    );
    // Whole-word or longer abbreviations keep the whole locale on short names.
    for (const locale of ['pt-PT', 'pl', 'he', 'da', 'vi', 'ar']) {
      expect(weekdayHeaderNamesByLocale[locale]).toEqual(
        readRawCldr(getGeneratedLocaleSources()[locale], 'short'),
      );
    }
  });
});
