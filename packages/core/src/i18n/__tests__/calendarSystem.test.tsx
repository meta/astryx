// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file calendarSystem.test.tsx
 * @input InternationalizationProvider, useCalendarSystem
 * @output Tests for calendar resolution and the fallback without Temporal
 * @position Runs without a Temporal polyfill, as an application that loads
 *   none does; the Gregorian-aligned calendars need no Temporal.
 */

import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {render} from '@testing-library/react';
import {use} from 'react';
import {InternationalizationProvider} from '../InternationalizationProvider';
import {InternationalizationContext} from '../InternationalizationContext';
import {useCalendarSystem} from '../useCalendarSystem';
import {
  CALENDAR_SYSTEMS,
  type CalendarSystem,
} from '../../utils/calendarSystem';
import {__resetDevWarnings} from '../../utils/devWarning';

const globals = globalThis as {Temporal?: unknown};
let savedTemporal: unknown;

beforeAll(() => {
  savedTemporal = globals.Temporal;
  delete globals.Temporal;
});

afterAll(() => {
  if (savedTemporal !== undefined) {
    globals.Temporal = savedTemporal;
  }
});

afterEach(() => {
  __resetDevWarnings();
  vi.restoreAllMocks();
});

function Probe({calendar}: {calendar?: CalendarSystem}) {
  const requested = use(InternationalizationContext).calendar;
  const shown = useCalendarSystem(calendar, 'Probe');
  return (
    <>
      <span data-testid="requested">{requested ?? 'none'}</span>
      <span data-testid="shown">{shown}</span>
    </>
  );
}

function renderProbe(
  provider: {locale: string; calendar?: CalendarSystem} | null,
  calendar?: CalendarSystem,
) {
  const probe = <Probe calendar={calendar} />;
  const view = render(
    provider == null ? (
      probe
    ) : (
      <InternationalizationProvider {...provider}>
        {probe}
      </InternationalizationProvider>
    ),
  );
  const result = {
    requested: view.getByTestId('requested').textContent,
    shown: view.getByTestId('shown').textContent,
  };
  view.unmount();
  return result;
}

function silenceWarnings() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {});
}

describe('calendar resolution order', () => {
  it('is Gregorian without a provider', () => {
    expect(renderProbe(null).shown).toBe('gregory');
  });

  it("uses the component's calendar over the provider's", () => {
    expect(
      renderProbe({locale: 'th-TH-u-ca-buddhist', calendar: 'roc'}, 'japanese')
        .shown,
    ).toBe('japanese');
  });

  it("uses the provider's calendar over a -u-ca- keyword in its locale", () => {
    expect(
      renderProbe({locale: 'th-TH-u-ca-buddhist', calendar: 'roc'}).shown,
    ).toBe('roc');
  });

  it('uses a -u-ca- keyword in the provider locale', () => {
    expect(renderProbe({locale: 'th-TH-u-ca-buddhist'}).shown).toBe('buddhist');
  });

  it("never applies a locale's default calendar", () => {
    expect(renderProbe({locale: 'fa-IR'}).shown).toBe('gregory');
    expect(renderProbe({locale: 'th-TH'}).shown).toBe('gregory');
  });

  it('keeps the calendar independent of the language', () => {
    expect(renderProbe({locale: 'en', calendar: 'buddhist'}).shown).toBe(
      'buddhist',
    );
  });
});

describe('calendar identifiers', () => {
  it.each(CALENDAR_SYSTEMS)('the provider accepts %s', calendar => {
    silenceWarnings();
    expect(renderProbe({locale: 'en', calendar}).requested).toBe(calendar);
  });

  it('resolves a -u-ca-islamic keyword to islamic-tbla', () => {
    silenceWarnings();
    expect(renderProbe({locale: 'ar-u-ca-islamic'}).requested).toBe(
      'islamic-tbla',
    );
  });

  it('resolves an unknown identifier to gregory and warns once', () => {
    const warn = silenceWarnings();
    const unknown = 'martian' as CalendarSystem;
    expect(renderProbe({locale: 'en', calendar: unknown}).shown).toBe(
      'gregory',
    );
    expect(renderProbe(null, unknown).shown).toBe('gregory');
    const unsupported = warn.mock.calls.filter(([message]) =>
      String(message).includes('"martian"'),
    );
    expect(unsupported).toHaveLength(1);
  });
});

describe('without Temporal', () => {
  it('shows Gregorian for a calendar that needs Temporal and warns once for it', () => {
    const warn = silenceWarnings();
    expect(renderProbe({locale: 'fa-IR', calendar: 'persian'}).shown).toBe(
      'gregory',
    );
    expect(renderProbe(null, 'persian').shown).toBe('gregory');
    expect(renderProbe(null, 'hebrew').shown).toBe('gregory');

    const messages = warn.mock.calls.map(([message]) => String(message));
    expect(messages.filter(m => m.includes('"persian"'))).toHaveLength(1);
    expect(messages.filter(m => m.includes('"hebrew"'))).toHaveLength(1);
    expect(messages[0]).toContain('temporal-polyfill/full/global');
  });

  it('treats a Temporal without the calendar as missing', () => {
    const warn = silenceWarnings();
    // The default temporal-polyfill build knows only the ISO calendar.
    globals.Temporal = {
      PlainDate: class {
        constructor(_y: number, _m: number, _d: number, calendar: string) {
          if (calendar !== 'iso8601') {
            throw new RangeError(`Unknown calendar ${calendar}`);
          }
        }
      },
    };
    try {
      expect(renderProbe(null, 'persian').shown).toBe('gregory');
    } finally {
      delete globals.Temporal;
    }
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      'needs a Temporal that supports it',
    );
  });

  it.each(['gregory', 'iso8601', 'buddhist', 'roc', 'japanese'] as const)(
    'shows %s with no warning',
    calendar => {
      const warn = silenceWarnings();
      expect(renderProbe(null, calendar).shown).toBe(calendar);
      expect(warn).not.toHaveBeenCalled();
    },
  );
});
