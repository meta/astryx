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
import {formatDateAbsoluteCompact} from './formatFilterValue';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import type {CalendarSystem} from '../utils/calendarSystem';
import {__resetDevWarnings} from '../utils/devWarning';
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
      const expected = formatDateAbsoluteCompact(
        UNIX_SECONDS,
        locale,
        calendar,
      );
      expect(expected).toContain(year);
      expect(screen.getByText(expected)).toBeInTheDocument();
    },
  );

  it('keeps Gregorian dates without a provider calendar', () => {
    renderSearch({locale: 'fa-IR'});
    expect(
      screen.getByText(formatDateAbsoluteCompact(UNIX_SECONDS, 'fa-IR')),
    ).toBeInTheDocument();
  });

  it('writes the PowerSearchToken value in the provider calendar', () => {
    renderToken({locale: 'en', calendar: 'persian'});
    expect(screen.getByText(/Aban 8, 1405 AP/)).toBeInTheDocument();
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
        screen.getByText(formatDateAbsoluteCompact(UNIX_SECONDS, 'en')),
      ).toBeInTheDocument();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('needs Temporal'),
      );
    });

    it('still shows the buddhist calendar, which needs no Temporal', () => {
      renderSearch({locale: 'en', calendar: 'buddhist'});
      expect(
        screen.getByText(
          formatDateAbsoluteCompact(UNIX_SECONDS, 'en', 'buddhist'),
        ),
      ).toBeInTheDocument();
    });
  });
});
