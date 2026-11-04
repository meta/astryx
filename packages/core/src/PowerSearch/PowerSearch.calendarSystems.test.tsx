// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PowerSearch.calendarSystems.test.tsx
 * @input PowerSearch, PowerSearchToken, InternationalizationProvider, the
 *   full Temporal polyfill
 * @output Tests that date values follow the provider's calendar
 * @position Colocated tests; the polyfill stands in for the native Temporal of
 *   a supporting runtime
 */

import 'temporal-polyfill/full/global';
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {PowerSearch} from './PowerSearch';
import {PowerSearchToken} from './PowerSearchToken';
import {formatDateAbsolute} from './formatFilterValue';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import type {CalendarSystem} from '../utils/calendarSystem';
import {__resetDevWarnings} from '../utils/devWarning';
import {withChineseTemporalAheadOfIntl} from '../__tests__/temporalAheadOfIntl';
import type {
  PowerSearchConfig,
  PowerSearchField,
  PowerSearchFilter,
  PowerSearchOperator,
} from './types';

const UNIX_SECONDS = Date.parse('2026-10-30T12:00:00Z') / 1000;

const isOperator: PowerSearchOperator = {
  key: 'is',
  label: 'is',
  value: {type: 'date_absolute'},
};

const createdField: PowerSearchField = {
  key: 'created',
  label: 'Created',
  defaultOperator: 'is',
  operators: [isOperator],
};

const config: PowerSearchConfig = {name: 'Dates', fields: [createdField]};

const filter: PowerSearchFilter = {
  field: 'created',
  operator: 'is',
  value: {type: 'date_absolute', unixSeconds: UNIX_SECONDS},
};

function renderSearch(provider: {locale: string; calendar?: CalendarSystem}) {
  return render(
    <InternationalizationProvider {...provider}>
      <PowerSearch config={config} filters={[filter]} onChange={() => {}} />
    </InternationalizationProvider>,
  );
}

function renderToken(provider: {locale: string; calendar?: CalendarSystem}) {
  return render(
    <InternationalizationProvider {...provider}>
      <PowerSearchToken
        config={config}
        filter={filter}
        field={createdField}
        operator={isOperator}
        maxLength={60}
      />
    </InternationalizationProvider>,
  );
}

afterEach(() => {
  __resetDevWarnings();
  vi.restoreAllMocks();
});

describe('PowerSearch date values in the provider calendar', () => {
  it.each([
    {calendar: 'persian', locale: 'en', year: '1405'},
    {calendar: 'persian', locale: 'fa', year: '۱۴۰۵'},
    {calendar: 'hebrew', locale: 'en', year: '5787'},
    {calendar: 'hebrew', locale: 'he', year: '5787'},
    {calendar: 'buddhist', locale: 'en', year: '2569'},
    {calendar: 'buddhist', locale: 'th', year: '2569'},
  ] as const)(
    'writes the token value in $calendar under $locale',
    ({calendar, locale, year}) => {
      renderSearch({locale, calendar});
      const expected = formatDateAbsolute(
        UNIX_SECONDS,
        locale,
        undefined,
        true,
        calendar,
      );
      expect(expected).toContain(year);
      expect(screen.getByText(expected)).toBeInTheDocument();
    },
  );

  it('keeps Gregorian dates without a provider calendar', () => {
    renderSearch({locale: 'fa-IR'});
    expect(
      screen.getByText(formatDateAbsolute(UNIX_SECONDS, 'fa-IR', undefined)),
    ).toBeInTheDocument();
  });

  it('writes the PowerSearchToken value in the provider calendar', () => {
    renderToken({locale: 'en', calendar: 'persian'});
    expect(screen.getByText(/Aban 8, 1405 AP/)).toBeInTheDocument();
  });

  it('writes a date and time on the `chinese` day that Calendar shows', () => {
    const lunarNewYear = Date.parse('2027-02-06T12:00:00Z') / 1000;
    const value = withChineseTemporalAheadOfIntl(() =>
      formatDateAbsolute(lunarNewYear, 'en', 'UTC', false, 'chinese'),
    );
    // Intl alone names the 30th day of the Twelfth Month of 2026.
    expect(value).toMatch(/^Mo1 1, 2027, 12:00\sPM$/);
  });

  it('writes a date and time in `iso8601` as in `gregory`', () => {
    expect(
      formatDateAbsolute(UNIX_SECONDS, 'en', 'UTC', false, 'iso8601'),
    ).toBe(formatDateAbsolute(UNIX_SECONDS, 'en', 'UTC', false));
  });

  describe('without Temporal', () => {
    const globals = globalThis as {Temporal?: unknown};
    let savedTemporal: unknown;

    beforeAll(() => {
      savedTemporal = globals.Temporal;
      delete globals.Temporal;
    });

    afterAll(() => {
      globals.Temporal = savedTemporal;
    });

    it('shows Gregorian dates for a calendar that needs Temporal', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      renderSearch({locale: 'en', calendar: 'persian'});
      expect(
        screen.getByText(formatDateAbsolute(UNIX_SECONDS, 'en', undefined)),
      ).toBeInTheDocument();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('needs a Temporal that supports it'),
      );
    });

    it('still shows the buddhist calendar, which needs no Temporal', () => {
      renderSearch({locale: 'en', calendar: 'buddhist'});
      expect(
        screen.getByText(
          formatDateAbsolute(UNIX_SECONDS, 'en', undefined, true, 'buddhist'),
        ),
      ).toBeInTheDocument();
    });
  });
});
