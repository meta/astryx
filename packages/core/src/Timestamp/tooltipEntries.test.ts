// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tooltipEntries.test.ts
 * @input formatTooltipLines and its entry types
 * @output Coverage for zone/format/label resolution of Timestamp tooltip lines
 * @position Unit tests for the pure tooltip-line formatter
 *
 * These tests must pass under ANY machine timezone. The repo pins TZ neither in
 * vitest.config.ts nor in CI, so a developer machine (e.g. America/New_York) and
 * CI (typically UTC) run the same assertions. Every exact-string expectation
 * therefore names an explicit zone and uses a `system_*` format, which is built
 * from numeric parts and is both timezone- and locale-independent. Assertions
 * about locale-formatted output stay structural.
 */

import {describe, it, expect, vi} from 'vitest';
import {SHARED_DATE_FORMAT_OPTIONS} from '../utils/plainDate';
import {formatTooltipLines as formatTooltipLinesForLocale} from './tooltipEntries';

const formatTooltipLines = (
  date: Parameters<typeof formatTooltipLinesForLocale>[0],
  entries: Parameters<typeof formatTooltipLinesForLocale>[1],
) => formatTooltipLinesForLocale(date, entries, 'en-US');

/** 2026-02-19T17:00:00Z — chosen so several zones land on different dates. */
const INSTANT = new Date('2026-02-19T17:00:00Z');

const LOCAL_ZONE = Intl.DateTimeFormat('en-US').resolvedOptions().timeZone;

describe('formatTooltipLines', () => {
  // --- Explicit zones: exact, locale-free, TZ-agnostic ---

  it('renders system_date_time in an explicit zone', () => {
    const lines = formatTooltipLines(INSTANT, [
      {timezoneID: 'UTC', format: 'system_date_time'},
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].value).toBe('2026-02-19 17:00:00');
  });

  it('crosses the date line for a zone that is a day ahead', () => {
    // 17:00Z is 02:00 the NEXT day in Tokyo. A naive local-getter
    // implementation would return the viewer's date here.
    const lines = formatTooltipLines(INSTANT, [
      {timezoneID: 'Asia/Tokyo', format: 'system_date_time'},
    ]);
    expect(lines[0].value).toBe('2026-02-20 02:00:00');
  });

  it('handles a half-hour offset zone', () => {
    const lines = formatTooltipLines(INSTANT, [
      {timezoneID: 'Asia/Kolkata', format: 'system_date_time'},
    ]);
    expect(lines[0].value).toBe('2026-02-19 22:30:00');
  });

  it('renders system_date and system_time in an explicit zone', () => {
    const lines = formatTooltipLines(INSTANT, [
      {timezoneID: 'America/Los_Angeles', format: 'system_date'},
      {timezoneID: 'America/Los_Angeles', format: 'system_time'},
    ]);
    expect(lines[0].value).toBe('2026-02-19');
    expect(lines[1].value).toBe('09:00:00');
  });

  it('honors the zone across a DST transition rather than a fixed offset', () => {
    // Los Angeles is UTC-8 in January and UTC-7 in July. A fixed-offset
    // implementation would get one of these wrong.
    const winter = formatTooltipLines(new Date('2026-01-15T20:00:00Z'), [
      {timezoneID: 'America/Los_Angeles', format: 'system_date_time'},
    ]);
    const summer = formatTooltipLines(new Date('2026-07-15T20:00:00Z'), [
      {timezoneID: 'America/Los_Angeles', format: 'system_date_time'},
    ]);
    expect(winter[0].value).toBe('2026-01-15 12:00:00');
    expect(summer[0].value).toBe('2026-07-15 13:00:00');
  });

  // --- The shared date vocabulary ---

  it.each(['date', 'date_long', 'date_weekday'] as const)(
    'renders %s from the shared option bag, in the requested zone',
    format => {
      // These three members are owned by SHARED_DATE_FORMAT_OPTIONS so that
      // Timestamp's rendered text and DateInput's display path cannot drift.
      // A tooltip line must come from the same bag: rebuilding the expected
      // string from the shared constant here fails the moment this file
      // inlines its own options again. Locale-agnostic — both sides format
      // under whatever locale the machine has.
      for (const timezoneID of ['UTC', 'Asia/Tokyo']) {
        const [line] = formatTooltipLines(INSTANT, [{timezoneID, format}]);
        expect(line.value).toBe(
          new Intl.DateTimeFormat('en-US', {
            ...SHARED_DATE_FORMAT_OPTIONS[format],
            timeZone: timezoneID,
          }).format(INSTANT),
        );
      }

      // 17:00Z is already the next calendar day in Tokyo, so the two zones
      // must disagree — proof the zone reached Intl rather than being dropped.
      const [utc] = formatTooltipLines(INSTANT, [{timezoneID: 'UTC', format}]);
      const [tokyo] = formatTooltipLines(INSTANT, [
        {timezoneID: 'Asia/Tokyo', format},
      ]);
      expect(tokyo.value).not.toBe(utc.value);
    },
  );

  // --- Equivalence with the untouched local implementation ---

  it('matches the local-getter output character-for-character for the viewer zone', () => {
    // The existing formatTimestamp() builds system_* from date.getFullYear()/
    // getHours()/... Naming the viewer's own zone explicitly must produce the
    // identical string, or the two code paths have drifted.
    const pad = (n: number) => String(n).padStart(2, '0');
    const expected = `${INSTANT.getFullYear()}-${pad(INSTANT.getMonth() + 1)}-${pad(
      INSTANT.getDate(),
    )} ${pad(INSTANT.getHours())}:${pad(INSTANT.getMinutes())}:${pad(
      INSTANT.getSeconds(),
    )}`;

    const explicit = formatTooltipLines(INSTANT, [
      {timezoneID: LOCAL_ZONE, format: 'system_date_time'},
    ]);
    const implicit = formatTooltipLines(INSTANT, [
      {format: 'system_date_time'},
    ]);

    expect(explicit[0].value).toBe(expected);
    expect(implicit[0].value).toBe(expected);
  });

  // --- The 'local' sentinel ---

  it("treats timezoneID 'local' as an alias for the viewer's zone", () => {
    const omitted = formatTooltipLines(INSTANT, [{format: 'system_date_time'}]);
    const sentinel = formatTooltipLines(INSTANT, [
      {timezoneID: 'local', format: 'system_date_time'},
    ]);
    expect(sentinel[0].value).toBe(omitted[0].value);
  });

  it("does not treat 'local' as an IANA id to be looked up", () => {
    // 'local' is not a real zone; it must never reach Intl, which would throw.
    expect(() =>
      formatTooltipLines(INSTANT, [{timezoneID: 'local'}]),
    ).not.toThrow();
  });

  // --- Defaults ---

  it("defaults an entry's format to the full absolute style", () => {
    const [line] = formatTooltipLines(INSTANT, [{timezoneID: 'UTC'}]);
    // The full style carries date, time-with-seconds and a zone name.
    expect(line.value).toContain('2026');
    expect(line.value).toMatch(/\d{1,2}:00:00/);
    expect(line.value).toContain('UTC');
  });

  it('defaults an entry to the viewer zone when no timezoneID is given', () => {
    const [line] = formatTooltipLines(INSTANT, [{}]);
    expect(line.value).toContain('2026');
    expect(line.label).toBeUndefined();
  });

  // --- Labels ---

  it('passes a consumer label through verbatim', () => {
    const lines = formatTooltipLines(INSTANT, [
      {label: 'Your time'},
      {timezoneID: 'UTC', label: 'UTC'},
    ]);
    expect(lines[0].label).toBe('Your time');
    expect(lines[1].label).toBe('UTC');
  });

  it('never invents a label when none is supplied', () => {
    const lines = formatTooltipLines(INSTANT, [{}, {timezoneID: 'Asia/Tokyo'}]);
    expect(lines[0].label).toBeUndefined();
    expect(lines[1].label).toBeUndefined();
  });

  // --- Auto zone abbreviation (the disambiguation rule) ---

  it('appends a zone abbreviation to date_time lines when zones differ', () => {
    const lines = formatTooltipLines(INSTANT, [
      {format: 'date_time'},
      {timezoneID: 'UTC', format: 'date_time'},
    ]);
    // Two distinct zones were asked for, so each line must say which it is.
    expect(lines[1].value).toContain('UTC');
  });

  it('marks even the unnamed local line once a second zone is on screen', () => {
    // This is the case only the multiple-zones half of the rule can reach: the
    // first entry names nothing, so without that clause it would sit unmarked
    // beside a marked foreign line and read as though it were the foreign one.
    const alone = formatTooltipLines(INSTANT, [{format: 'date_time'}]);
    const beside = formatTooltipLines(INSTANT, [
      {format: 'date_time'},
      {timezoneID: 'UTC', format: 'date_time'},
    ]);
    expect(beside[0].value).not.toBe(alone[0].value);
    expect(beside[0].value.startsWith(alone[0].value)).toBe(true);
  });

  it('omits the zone abbreviation when one unnamed zone is shown twice', () => {
    // Same viewer zone rendered in two formats, neither of them steered by the
    // consumer — a zone marker here would be noise.
    const lines = formatTooltipLines(INSTANT, [
      {format: 'date_time'},
      {format: 'system_date_time'},
    ]);
    const localName = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
    })
      .formatToParts(INSTANT)
      .find(part => part.type === 'timeZoneName')?.value;
    expect(lines[0].value).not.toContain(localName);
  });

  it('never appends a zone abbreviation to system_* lines', () => {
    const lines = formatTooltipLines(INSTANT, [
      {format: 'system_date_time'},
      {timezoneID: 'Asia/Tokyo', format: 'system_date_time'},
    ]);
    // Two distinct zones, but system_* output stays machine-clean.
    expect(lines[1].value).toBe('2026-02-20 02:00:00');
  });

  it('marks a single explicitly-named zone so it cannot be read as local', () => {
    // The tooltip is never read in isolation: it is the <time>'s
    // aria-describedby, and that element's accessible name is the LOCAL
    // absolute time. A lone foreign-zone line with no marker is therefore
    // announced right after a local time, with nothing to say it is not one.
    const zoneName = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      timeZoneName: 'short',
    })
      .formatToParts(INSTANT)
      .find(part => part.type === 'timeZoneName')?.value;

    const [line] = formatTooltipLines(INSTANT, [
      {timezoneID: 'Asia/Tokyo', format: 'date_time'},
    ]);
    expect(zoneName).toBeTruthy();
    expect(line.value).toContain(zoneName);
  });

  it('leaves an unnamed local line unmarked', () => {
    // The consumer never named a zone, so there is nothing to disambiguate
    // against — this must stay as bare as the visible text is by default.
    const [line] = formatTooltipLines(INSTANT, [{format: 'date_time'}]);
    const localName = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
    })
      .formatToParts(INSTANT)
      .find(part => part.type === 'timeZoneName')?.value;
    expect(line.value).not.toContain(localName);
  });

  it('always carries a zone name on the full style, even for a single line', () => {
    const [line] = formatTooltipLines(INSTANT, [{timezoneID: 'UTC'}]);
    expect(line.value).toContain('UTC');
  });

  // --- Invalid zone handling ---

  it('falls back to the viewer zone instead of throwing on an invalid zone id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const lines = formatTooltipLines(INSTANT, [
        {timezoneID: 'Not/AZone', format: 'system_date_time'},
      ]);
      const local = formatTooltipLines(INSTANT, [{format: 'system_date_time'}]);
      expect(lines[0].value).toBe(local[0].value);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Not/AZone'));
    } finally {
      warn.mockRestore();
    }
  });

  it('warns once per unknown zone, however many times it is used', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // The same bad id twice in one call, then again on a re-render. A live
      // timestamp re-renders every second, so one typo must not turn into an
      // unbounded stream of identical console warnings.
      formatTooltipLines(INSTANT, [
        {timezoneID: 'Bad/RepeatedZone'},
        {timezoneID: 'Bad/RepeatedZone'},
      ]);
      formatTooltipLines(INSTANT, [{timezoneID: 'Bad/RepeatedZone'}]);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('falls back for an empty or whitespace-only zone id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const local = formatTooltipLines(INSTANT, [{format: 'system_date_time'}]);
      // Intl rejects both of these, so they must take the same degraded path
      // as any other unknown identifier rather than reaching the formatter.
      for (const timezoneID of ['', '   ']) {
        const lines = formatTooltipLines(INSTANT, [
          {timezoneID, format: 'system_date_time'},
        ]);
        expect(lines[0].value).toBe(local[0].value);
      }
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  it('rejects a zone id padded with whitespace rather than trimming it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const local = formatTooltipLines(INSTANT, [{format: 'system_date_time'}]);
      // ' UTC ' is not a valid identifier. Silently trimming would be a guess
      // about intent; degrading to the viewer's zone with a warning is not.
      const padded = formatTooltipLines(INSTANT, [
        {timezoneID: ' UTC ', format: 'system_date_time'},
      ]);
      expect(padded[0].value).toBe(local[0].value);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(' UTC '));
    } finally {
      warn.mockRestore();
    }
  });

  it('accepts a legacy link id and resolves it to the modern zone', () => {
    // Intl accepts the old US/* names; they must not be mistaken for junk.
    const legacy = formatTooltipLines(INSTANT, [
      {timezoneID: 'US/Pacific', format: 'system_date_time'},
    ]);
    expect(legacy[0].value).toBe('2026-02-19 09:00:00');
  });

  it('treats a fixed-offset id like EST as fixed, not as US Eastern', () => {
    // Intl ACCEPTS 'EST', so no warning fires — but it is a fixed UTC-5 zone
    // that never observes daylight saving. A consumer who writes 'EST' meaning
    // "US Eastern" is silently an hour out for half the year. Pinned here so
    // the trap is visible in the tests, and steered against in the docs.
    const summer = new Date('2026-07-19T17:00:00Z');
    const fixed = formatTooltipLines(summer, [
      {timezoneID: 'EST', format: 'system_date_time'},
    ]);
    const region = formatTooltipLines(summer, [
      {timezoneID: 'America/New_York', format: 'system_date_time'},
    ]);
    expect(fixed[0].value).toBe('2026-07-19 12:00:00');
    expect(region[0].value).toBe('2026-07-19 13:00:00');
  });

  it('keeps the remaining lines intact when one entry has a bad zone', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const lines = formatTooltipLines(INSTANT, [
        {timezoneID: 'Not/AZone', format: 'system_date_time'},
        {timezoneID: 'UTC', format: 'system_date_time'},
      ]);
      expect(lines).toHaveLength(2);
      expect(lines[1].value).toBe('2026-02-19 17:00:00');
    } finally {
      warn.mockRestore();
    }
  });

  // --- Wall-clock edges ---

  it('renders midnight as 00, never 24', () => {
    // The parts are read under hourCycle 'h23'. Under 'h24' the same instant
    // comes back as hour 24 and every midnight timestamp renders wrong.
    const lines = formatTooltipLines(new Date('2026-02-19T00:00:00Z'), [
      {timezoneID: 'UTC', format: 'system_date_time'},
    ]);
    expect(lines[0].value).toBe('2026-02-19 00:00:00');
  });

  it('rolls midnight into the next day for a zone that is ahead', () => {
    // 15:00Z is exactly 00:00 the following day in Tokyo — midnight and a
    // date rollover in the same assertion.
    const lines = formatTooltipLines(new Date('2026-02-19T15:00:00Z'), [
      {timezoneID: 'Asia/Tokyo', format: 'system_date_time'},
    ]);
    expect(lines[0].value).toBe('2026-02-20 00:00:00');
  });

  it('handles a 45-minute offset zone', () => {
    // Nepal is UTC+5:45. Anything that assumes whole- or half-hour offsets
    // gets this wrong.
    const lines = formatTooltipLines(INSTANT, [
      {timezoneID: 'Asia/Kathmandu', format: 'system_date_time'},
    ]);
    expect(lines[0].value).toBe('2026-02-19 22:45:00');
  });

  it('spans the full range either side of the date line', () => {
    // +14 and -11 are the extremes in use; the same instant is 25 hours and
    // two calendar days apart between them.
    const lines = formatTooltipLines(INSTANT, [
      {timezoneID: 'Pacific/Kiritimati', format: 'system_date_time'},
      {timezoneID: 'Pacific/Niue', format: 'system_date_time'},
    ]);
    expect(lines.map(l => l.value)).toEqual([
      '2026-02-20 07:00:00',
      '2026-02-19 06:00:00',
    ]);
  });

  it('carries the year across a new-year boundary', () => {
    const lines = formatTooltipLines(new Date('2025-12-31T23:30:00Z'), [
      {timezoneID: 'Asia/Tokyo', format: 'system_date_time'},
    ]);
    expect(lines[0].value).toBe('2026-01-01 08:30:00');
  });

  it('renders a leap day', () => {
    const lines = formatTooltipLines(new Date('2028-02-29T12:00:00Z'), [
      {timezoneID: 'UTC', format: 'system_date'},
    ]);
    expect(lines[0].value).toBe('2028-02-29');
  });

  it('renders both halves of a repeated DST hour identically', () => {
    // On the fall-back date, 01:30 local happens twice. Mapping an instant to
    // a wall clock is many-to-one, so both instants legitimately render the
    // same machine string — which is exactly why system_* output is not
    // sufficient on its own to identify an instant. Pinned so nobody "fixes"
    // it into a fake distinction.
    const beforeShift = formatTooltipLines(new Date('2026-11-01T05:30:00Z'), [
      {timezoneID: 'America/New_York', format: 'system_date_time'},
    ]);
    const afterShift = formatTooltipLines(new Date('2026-11-01T06:30:00Z'), [
      {timezoneID: 'America/New_York', format: 'system_date_time'},
    ]);
    expect(beforeShift[0].value).toBe('2026-11-01 01:30:00');
    expect(afterShift[0].value).toBe('2026-11-01 01:30:00');
  });

  // --- Distinct-zone counting drives the abbreviation rule ---

  it('counts a zone that fell back to local as the local zone', () => {
    // The bad entry degrades to the viewer's zone, so the tooltip is really
    // showing ONE zone and must not start labelling lines as if it showed two.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const single = formatTooltipLines(INSTANT, [{format: 'date_time'}]);
      const withBad = formatTooltipLines(INSTANT, [
        {format: 'date_time'},
        {timezoneID: 'Bad/CountingZone', format: 'date_time'},
      ]);
      expect(withBad[0].value).toBe(single[0].value);
      expect(withBad[1].value).toBe(single[0].value);
    } finally {
      warn.mockRestore();
    }
  });

  it('renders two alias spellings of one zone identically to a single one', () => {
    // 'UTC' and 'GMT' are aliases, so the distinctness key counts them as two
    // zones. That can never show, because a line whose zone the consumer named
    // is marked whether or not a second zone is present — all three renderings
    // below must agree. If the marker rule ever narrows back to "more than one
    // zone", this pair would start disagreeing with the single entry and read
    // as two lines that need telling apart while being character-identical.
    const pair = formatTooltipLines(INSTANT, [
      {timezoneID: 'UTC', format: 'date_time'},
      {timezoneID: 'GMT', format: 'date_time'},
    ]);
    const solo = formatTooltipLines(INSTANT, [
      {timezoneID: 'UTC', format: 'date_time'},
    ]);
    expect(pair[0].value).toBe(solo[0].value);
    expect(pair[1].value).toBe(solo[0].value);
  });

  it('renders the same zone spelled in different casing identically', () => {
    // Zone ids are case-insensitive per ECMA-402, and the distinctness key
    // lowercases to match, so neither line can drift from the other.
    const lines = formatTooltipLines(INSTANT, [
      {timezoneID: 'UTC', format: 'date_time'},
      {timezoneID: 'utc', format: 'date_time'},
    ]);
    expect(lines[0].value).toBe(lines[1].value);
  });

  it("counts an omitted zone and 'local' as one zone", () => {
    const single = formatTooltipLines(INSTANT, [{format: 'date_time'}]);
    const both = formatTooltipLines(INSTANT, [
      {format: 'date_time'},
      {timezoneID: 'local', format: 'date_time'},
    ]);
    expect(both[0].value).toBe(single[0].value);
    expect(both[1].value).toBe(single[0].value);
  });

  // --- Entry shape ---

  it('treats an explicitly undefined format as absent', () => {
    const explicit = formatTooltipLines(INSTANT, [
      {timezoneID: 'UTC', format: undefined},
    ]);
    const omitted = formatTooltipLines(INSTANT, [{timezoneID: 'UTC'}]);
    expect(explicit[0].value).toBe(omitted[0].value);
  });

  it('keeps an empty-string label rather than dropping it', () => {
    // '' is a deliberate "this line has no label" that still occupies the
    // label column; only an omitted label is truly absent.
    const [line] = formatTooltipLines(INSTANT, [{label: ''}]);
    expect(line.label).toBe('');
  });

  it('marks lines read-only by default and copyable only when opted in', () => {
    const lines = formatTooltipLines(INSTANT, [
      {label: 'Local'},
      {label: 'ISO', format: 'system_date_time', isCopyable: true},
      {label: 'Off', isCopyable: false},
    ]);
    expect(lines.map(l => l.isCopyable)).toEqual([false, true, false]);
  });

  // --- Ordering and arity ---

  it('preserves entry order', () => {
    const lines = formatTooltipLines(INSTANT, [
      {timezoneID: 'Asia/Tokyo', format: 'system_date', label: 'Tokyo'},
      {timezoneID: 'UTC', format: 'system_date', label: 'UTC'},
      {timezoneID: 'America/Los_Angeles', format: 'system_date', label: 'LA'},
    ]);
    expect(lines.map(l => l.label)).toEqual(['Tokyo', 'UTC', 'LA']);
    expect(lines.map(l => l.value)).toEqual([
      '2026-02-20',
      '2026-02-19',
      '2026-02-19',
    ]);
  });

  it('returns one line per entry, including duplicates', () => {
    const lines = formatTooltipLines(INSTANT, [
      {timezoneID: 'UTC'},
      {timezoneID: 'UTC'},
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].value).toBe(lines[1].value);
  });

  it('returns an empty array for no entries', () => {
    expect(formatTooltipLines(INSTANT, [])).toEqual([]);
  });

  // --- Zone ids are case-insensitive per ECMA-402 ---

  it('accepts a lowercase IANA id', () => {
    const lines = formatTooltipLines(INSTANT, [
      {timezoneID: 'asia/tokyo', format: 'system_date_time'},
    ]);
    expect(lines[0].value).toBe('2026-02-20 02:00:00');
  });
});

describe('formatTooltipLines calendar', () => {
  const CALENDAR_INSTANT = new Date('2026-10-30T12:00:00Z');

  it.each([
    {calendar: 'persian', locale: 'en', year: '1405'},
    {calendar: 'persian', locale: 'fa', year: '۱۴۰۵'},
    {calendar: 'hebrew', locale: 'en', year: '5787'},
    {calendar: 'hebrew', locale: 'he', year: '5787'},
    {calendar: 'buddhist', locale: 'en', year: '2569'},
    {calendar: 'buddhist', locale: 'th', year: '2569'},
  ] as const)(
    'writes date rows in $calendar under $locale and keeps system rows ISO',
    ({calendar, locale, year}) => {
      const [dateLine, systemLine] = formatTooltipLinesForLocale(
        CALENDAR_INSTANT,
        [
          {timezoneID: 'UTC', format: 'date_long'},
          {timezoneID: 'UTC', format: 'system_date_time'},
        ],
        locale,
        calendar,
      );
      expect(dateLine.value).toBe(
        new Intl.DateTimeFormat(locale, {
          ...SHARED_DATE_FORMAT_OPTIONS.date_long,
          timeZone: 'UTC',
          calendar,
        }).format(CALENDAR_INSTANT),
      );
      expect(dateLine.value).toContain(year);
      expect(systemLine.value).toBe('2026-10-30 12:00:00');
    },
  );

  it('defaults to the Gregorian calendar', () => {
    const [line] = formatTooltipLinesForLocale(
      CALENDAR_INSTANT,
      [{timezoneID: 'UTC', format: 'date_long'}],
      'fa',
    );
    expect(line.value).toBe(
      formatTooltipLinesForLocale(
        CALENDAR_INSTANT,
        [{timezoneID: 'UTC', format: 'date_long'}],
        'fa',
        'gregory',
      )[0].value,
    );
  });
});
