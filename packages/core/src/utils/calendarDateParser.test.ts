// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file calendarDateParser.test.ts
 * @input Uses vitest, temporal-polyfill, calendarDateParser
 * @output Unit tests for typed dates in every calendar: reading, years,
 *   rejection kinds, completeness, committed text, and the format hint
 * @position Testing; validates calendarDateParser.ts
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {Temporal as TemporalPolyfill} from 'temporal-polyfill/full';
import {
  type CalendarDateParseOptions,
  type CalendarDateParseResult,
  calendarDisplayName,
  formatCalendarDateText,
  formatCalendarDateHint,
  getCalendarDateLexicon,
  parseCalendarDate,
} from './calendarDateParser';
import type {CalendarSystem} from './calendarSystem';
import {formatSharedDate} from './plainDate';

const host = globalThis as {Temporal?: unknown};
const hadTemporal = host.Temporal != null;
beforeAll(() => {
  host.Temporal ??= TemporalPolyfill;
});
afterAll(() => {
  if (!hadTemporal) {
    delete host.Temporal;
  }
});

const TODAY = {year: 2026, month: 11, day: 2};

function parse(
  locale: string,
  calendar: CalendarSystem,
  text: string,
  options: CalendarDateParseOptions = {},
): CalendarDateParseResult {
  return parseCalendarDate(text, getCalendarDateLexicon(locale, calendar), {
    today: TODAY,
    ...options,
  });
}

/** The ISO date a text reads as, or the result kind when it is not a date. */
function iso(locale: string, calendar: CalendarSystem, text: string): string {
  const result = parse(locale, calendar, text);
  if (result.kind !== 'value') {
    return result.kind;
  }
  const {year, month, day} = result.date;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function complete(locale: string, calendar: CalendarSystem, text: string) {
  const result = parse(locale, calendar, text);
  return 'isComplete' in result ? result.isComplete : result.kind;
}

describe('reading dates written in the calendar (FR9)', () => {
  it('reads any Unicode decimal digits, in mixed scripts', () => {
    expect(iso('fa-IR', 'persian', '۱۴۰۵/۸/۱۱')).toBe('2026-11-02');
    expect(iso('fa-IR', 'persian', '١٤٠٥/٨/١١')).toBe('2026-11-02');
    expect(iso('fa-IR', 'persian', '۱۴۰۵/8/١١')).toBe('2026-11-02');
    expect(iso('hi-IN', 'indian', '११/८/१९४८ शक')).toBe('2026-11-02');
  });

  it('ignores bidirectional marks', () => {
    expect(
      iso('ar-SA', 'islamic-umalqura', '\u200f٢٢\u200f/٥\u200f/١٤٤٨ هـ'),
    ).toBe('2026-11-02');
  });

  it("follows the locale's numeric field order", () => {
    expect(iso('fa-IR', 'persian', '1405/8/11')).toBe('2026-11-02');
    expect(iso('en-US', 'persian', '8/11/1405')).toBe('2026-11-02');
    expect(iso('he', 'hebrew', '22/2/5787')).toBe('2026-11-02');
    expect(iso('en-GB', 'gregory', '12/01/2026')).toBe('2026-01-12');
    expect(iso('en-US', 'gregory', '12/01/2026')).toBe('2026-12-01');
  });

  it('reads a number of three or more digits beside a month name as the year', () => {
    expect(iso('fa-IR', 'persian', '۱۱ آبان ۱۴۰۵')).toBe('2026-11-02');
    expect(iso('fa-IR', 'persian', '۱۴۰۵ آبان ۱۱')).toBe('2026-11-02');
    expect(iso('en-US', 'gregory', '2026 Nov 2')).toBe('2026-11-02');
  });

  it('reads month and era names of the locale and English, in every width', () => {
    expect(iso('fa-IR', 'persian', '11 Aban 1405')).toBe('2026-11-02');
    expect(iso('en-US', 'persian', 'Aban 11, 1405 AP')).toBe('2026-11-02');
    expect(iso('th-TH', 'buddhist', '2 พ.ย. 2569')).toBe('2026-11-02');
    expect(iso('th-TH', 'buddhist', '2 พฤศจิกายน พ.ศ. 2569')).toBe(
      '2026-11-02',
    );
    expect(iso('ja-JP', 'japanese', 'R8/11/2')).toBe('2026-11-02');
    expect(iso('ja-JP', 'japanese', 'Reiwa 8/11/2')).toBe('2026-11-02');
    expect(iso('de-DE', 'gregory', 'Mo., 2. Nov. 2026')).toBe('2026-11-02');
    // A weekday word that is also a month name.
    expect(iso('fr-FR', 'gregory', 'mar. 3 nov. 2026')).toBe('2026-11-03');
    expect(iso('it-IT', 'gregory', 'mar 3 mar 2026')).toBe('2026-03-03');
    expect(iso('vi-VN', 'gregory', 'Thứ 3, 3 thg 11, 2026')).toBe('2026-11-03');
  });

  it('ignores case and Latin diacritics', () => {
    expect(iso('en-US', 'japanese', 'Jan 7, 64 Shōwa')).toBe('1989-01-07');
    expect(iso('en-US', 'japanese', 'JAN 7, 64 showa')).toBe('1989-01-07');
  });

  it('reads an abbreviation that starts only one month name', () => {
    expect(iso('en-US', 'gregory', 'Sept 1, 2026')).toBe('2026-09-01');
    expect(iso('en-US', 'gregory', 'Ma 1, 2026')).toBe('unreadable');
  });

  it('reads Hebrew month numbers as positions in the typed year', () => {
    expect(iso('he', 'hebrew', '1/6/5784')).toBe('2024-02-10');
    expect(iso('he', 'hebrew', '1/7/5784')).toBe('2024-03-11');
    expect(iso('he', 'hebrew', '1/6/5785')).toBe('2025-03-01');
  });

  it('reads a plain Adar in a Hebrew leap year as Adar II', () => {
    expect(iso('en-US', 'hebrew', '1 Adar 5784')).toBe('2024-03-11');
    expect(iso('en-US', 'hebrew', '1 Adar II 5784')).toBe('2024-03-11');
    expect(iso('en-US', 'hebrew', '1 Adar I 5784')).toBe('2024-02-10');
    expect(iso('he', 'hebrew', '1 אדר 5784')).toBe('2024-03-11');
    expect(iso('he', 'hebrew', '1 אדר 5785')).toBe('2025-03-01');
  });

  it('reads Hebrew month names with the ב prefix and a typed apostrophe', () => {
    expect(iso('he', 'hebrew', '22 בחשוון 5787')).toBe('2026-11-02');
    expect(iso('he', 'hebrew', "1 אדר א' 5784")).toBe('2024-02-10');
  });

  it('reads Chinese and Korean month numbers with the leap marker', () => {
    expect(iso('zh-CN', 'chinese', '2025年闰六月1')).toBe('2025-07-25');
    expect(iso('zh-CN', 'chinese', '2025年六月1')).toBe('2025-06-25');
    expect(iso('zh-CN', 'chinese', '2025/6/1')).toBe('2025-06-25');
    expect(iso('ko-KR', 'dangi', '2025. 윤6. 1.')).toBe('2025-07-25');
    expect(iso('ko-KR', 'dangi', '2025. 6. 1.')).toBe('2025-06-25');
  });

  it('rejects traditional numerals', () => {
    expect(iso('zh-CN', 'chinese', '2026丙午年九月廿四')).toBe('unreadable');
    expect(iso('he', 'hebrew', 'כ״ב בחשוון תשפ״ז')).toBe('unreadable');
  });

  it('rejects mixed separators between numbers', () => {
    expect(iso('en-US', 'gregory', '1/25.2026')).toBe('unreadable');
  });

  it('reads ISO-shaped text as calendar fields, and as ISO for system_date', () => {
    expect(iso('sv-SE', 'persian', '1405-08-11 AP')).toBe('2026-11-02');
    expect(iso('en-US', 'persian', '1405-08-11')).toBe('2026-11-02');
    const result = parse('en-US', 'persian', '2026-11-02', {
      isoIsGregorian: true,
    });
    expect(result).toEqual({
      kind: 'value',
      date: TODAY,
      isComplete: true,
    });
  });
});

describe('years of the calendar (FR10)', () => {
  it('reads a Buddhist year literally', () => {
    expect(iso('th-TH', 'buddhist', '2/11/2569')).toBe('2026-11-02');
    expect(iso('th-TH', 'buddhist', '2/11/2026')).toBe('1483-11-02');
  });

  it('reads Japanese years in the current era or as Gregorian years', () => {
    expect(iso('ja-JP', 'japanese', '8/11/25')).toBe('2026-11-25');
    expect(iso('ja-JP', 'japanese', '2026/11/2')).toBe('2026-11-02');
    expect(iso('ja-JP', 'japanese', '令和元年5月1日')).toBe('2019-05-01');
  });

  it('rejects a Japanese era year outside its era', () => {
    expect(iso('ja-JP', 'japanese', '平成31年4月30日')).toBe('2019-04-30');
    expect(iso('ja-JP', 'japanese', '平成31年5月1日')).toBe('nonexistent');
    expect(iso('ja-JP', 'japanese', '令和1年4月30日')).toBe('nonexistent');
    expect(iso('ja-JP', 'japanese', 'S64/1/8')).toBe('nonexistent');
    expect(iso('en-US', 'japanese', 'May 1, 31 Heisei')).toBe('nonexistent');
  });

  it('reads ROC years of up to three digits in the 民國 era', () => {
    expect(iso('zh-TW', 'roc', '115/11/2')).toBe('2026-11-02');
    expect(iso('zh-TW', 'roc', '民國115/11/2')).toBe('2026-11-02');
    expect(iso('zh-TW', 'roc', '民國前12年1月1日')).toBe('1900-01-01');
  });

  it('reads Ethiopic years in the AM era unless AA is typed', () => {
    expect(iso('am-ET', 'ethiopic', '23/2/2019')).toBe('2026-11-02');
    expect(iso('am-ET', 'ethiopic', '1/1/7519 AA')).toBe('2026-09-11');
  });

  it('resolves a two-digit year within 80 years before and 19 after', () => {
    expect(iso('en-US', 'gregory', '1/2/45')).toBe('2045-01-02');
    expect(iso('en-US', 'gregory', '1/2/46')).toBe('1946-01-02');
    expect(iso('th-TH', 'buddhist', '2/11/69')).toBe('2026-11-02');
    expect(iso('fa-IR', 'persian', '05/8/11')).toBe('2026-11-02');
  });

  it('shows the era in the hint and the committed text', () => {
    expect(formatCalendarDateHint(TODAY, 'th-TH', 'buddhist')).toContain(
      'พ.ศ.',
    );
    expect(
      formatCalendarDateText(TODAY, 'date_long', 'th-TH', 'buddhist'),
    ).toBe('2 พฤศจิกายน พ.ศ. 2569');
    expect(formatCalendarDateHint(TODAY, 'zh-TW', 'roc')).toContain('民國');
    expect(formatCalendarDateText(TODAY, 'date', 'zh-TW', 'roc')).toContain(
      '民國',
    );
  });
});

describe('rejection kinds (FR11, AR3)', () => {
  it('reports dates the calendar does not have, without adjusting them', () => {
    expect(iso('fa-IR', 'persian', '1404/12/30')).toBe('nonexistent');
    expect(iso('fa-IR', 'persian', '1403/12/30')).toBe('2025-03-20');
    expect(iso('en-US', 'hebrew', '1 Adar I 5785')).toBe('nonexistent');
    expect(iso('am-ET', 'ethiopic', '6/13/2016')).toBe('nonexistent');
    expect(iso('am-ET', 'ethiopic', '6/13/2015')).toBe('2023-09-11');
    expect(iso('ar-SA', 'islamic-umalqura', '30/1/1448')).toBe('nonexistent');
    expect(iso('zh-CN', 'chinese', '2026年闰六月1')).toBe('nonexistent');
    expect(iso('en-US', 'gregory', '2/30/2026')).toBe('nonexistent');
  });

  it('reports unreadable text and part of a date apart', () => {
    expect(iso('en-US', 'gregory', 'not a date')).toBe('unreadable');
    expect(iso('en-US', 'gregory', '25/1/2026')).toBe('unreadable');
    expect(iso('en-US', 'gregory', 'No')).toBe('incomplete');
    expect(iso('fa-IR', 'persian', '۱۴۰۵/۸')).toBe('incomplete');
    expect(iso('en-US', 'gregory', '   ')).toBe('empty');
  });

  it('reports a date the constraints reject as out of range', () => {
    const result = parse('fa-IR', 'persian', '1405/8/11', {
      isDateDisabled: date => date.year === 2026,
    });
    expect(result).toEqual({kind: 'outOfRange', date: TODAY, isComplete: true});
  });
});

describe('complete input (FR12)', () => {
  it('reports only the finished text of a day-first numeric date as complete', () => {
    const typed = '12/01/2026';
    const states = [...typed].map((_, i) => {
      const text = typed.slice(0, i + 1);
      const result = parse('en-GB', 'gregory', text);
      return result.kind === 'value' && result.isComplete ? text : null;
    });
    expect(states.filter(Boolean)).toEqual(['12/01/2026']);
  });

  it('leaves two-digit years and omitted years for Enter or blur', () => {
    expect(complete('en-GB', 'gregory', '12/01/90')).toBe(false);
    expect(iso('en-GB', 'gregory', '12/01/90')).toBe('1990-01-12');
    expect(complete('en-US', 'gregory', 'Jan 25')).toBe(false);
    expect(iso('en-US', 'gregory', 'Jan 25')).toBe('2026-01-25');
  });

  it('waits while a separator trails or the last field can take a digit', () => {
    expect(complete('en-US', 'gregory', '11/2/2026/')).toBe(false);
    expect(complete('fa-IR', 'persian', '1405/8/3')).toBe(false);
    expect(complete('fa-IR', 'persian', '1405/8/4')).toBe(true);
    expect(complete('ja-JP', 'japanese', '令和8年11月2')).toBe(false);
    expect(complete('ja-JP', 'japanese', '令和8年11月2日')).toBe(true);
    expect(complete('ko-KR', 'dangi', '2026. 9. 2')).toBe(false);
    expect(complete('ko-KR', 'dangi', '2026. 9. 2.')).toBe(true);
    // A 3 can start a 30 that the month lacks.
    expect(complete('fa-IR', 'persian', '1404/12/3')).toBe(false);
    expect(complete('sv-SE', 'gregory', '2026-02-3')).toBe(false);
  });

  it('counts an era year with its era as a complete year', () => {
    expect(complete('ja-JP', 'japanese', '令和8年11月25日')).toBe(true);
    expect(complete('en-US', 'japanese', 'November 25, 8 Reiwa')).toBe(true);
  });
});

describe('committed text (FR13)', () => {
  it('keeps Gregorian text identical to the shared date formats', () => {
    for (const format of ['date', 'date_long', 'date_weekday'] as const) {
      expect(formatCalendarDateText(TODAY, format, 'en-US', 'gregory')).toBe(
        formatSharedDate(TODAY, format, 'en-US'),
      );
    }
  });

  it('keeps system_date ISO in every calendar', () => {
    expect(
      formatCalendarDateText(TODAY, 'system_date', 'fa-IR', 'persian'),
    ).toBe('2026-11-02');
  });

  it('writes the named formats in the calendar', () => {
    expect(formatCalendarDateText(TODAY, 'date_long', 'en-US', 'persian')).toBe(
      'Aban 11, 1405 AP',
    );
    expect(formatCalendarDateText(TODAY, 'date_long', 'en-US', 'hebrew')).toBe(
      '22 Heshvan 5787 AM',
    );
  });

  it('includes the related Gregorian year in Chinese text', () => {
    const text = formatCalendarDateText(TODAY, 'date', 'ja', 'chinese');
    expect(text).toContain('2026');
    expect(iso('ja', 'chinese', text)).toBe('2026-11-02');
  });

  it('writes the format hint in the numeric pattern', () => {
    expect(formatCalendarDateHint(TODAY, 'fa-IR', 'persian')).toBe('۱۴۰۵/۸/۱۱');
    expect(formatCalendarDateHint(TODAY, 'en-US', 'gregory')).toBe('11/2/2026');
  });
});

describe('calendar names (AR2)', () => {
  it('names the calendar in the locale', () => {
    expect(calendarDisplayName('persian', 'en')).toBe('Persian Calendar');
    expect(calendarDisplayName('hebrew', 'he')).toBe('לוח השנה העברי');
  });
});

describe('without Temporal', () => {
  let saved: unknown;
  beforeEach(() => {
    saved = host.Temporal;
    delete host.Temporal;
  });
  afterEach(() => {
    host.Temporal = saved;
  });

  it('reads Buddhist, ROC, and Japanese dates', () => {
    expect(iso('th', 'buddhist', '2/11/2569')).toBe('2026-11-02');
    expect(iso('zh-Hant', 'roc', '民國115/11/2')).toBe('2026-11-02');
    expect(iso('ja', 'japanese', '令和8年11月2日')).toBe('2026-11-02');
    expect(iso('ja', 'japanese', '平成31年5月1日')).toBe('nonexistent');
  });

  it('reads Gregorian dates where a calendar needs Temporal', () => {
    expect(iso('en', 'persian', 'November 2, 2026')).toBe('2026-11-02');
    expect(formatCalendarDateText(TODAY, 'date_long', 'en', 'persian')).toBe(
      'November 2, 2026',
    );
  });
});
