// Copyright (c) Meta Platforms, Inc. and affiliates.

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
import {render, screen, act, waitFor, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Profiler} from 'react';
import {hydrateRoot, type Root} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Timestamp} from './Timestamp';
import {formatInstant} from './formatInstant';
import {formatTooltipLines} from './tooltipEntries';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {InternationalizationProvider} from '../i18n';

async function openTimestampHoverCard(): Promise<HTMLElement> {
  const timestamp = document.querySelector('time');
  if (timestamp == null) {
    throw new Error('Expected Timestamp to render a <time> element');
  }
  const trigger = timestamp.parentElement;
  if (trigger == null) {
    throw new Error('Expected Timestamp to render a hover-card trigger');
  }

  fireEvent.mouseEnter(trigger);
  await waitFor(() => {
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
  });

  return screen.getByRole('dialog', {hidden: true});
}

describe('Timestamp', () => {
  // The hover card is loaded lazily (React.lazy + Suspense), so its chunk
  // resolves asynchronously the first time a card renders. Warm the module
  // cache once up front so findByRole('dialog') never races the cold import's
  // resolution against its default 1s timeout.
  beforeAll(async () => {
    await import('./TimestampHoverCard');
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a <time> element with ISO datetime attribute', () => {
    render(
      <Timestamp
        value="2026-03-25T10:00:00Z"
        format="date_time"
        data-testid="ts"
      />,
    );
    const el = screen.getByTestId('ts');
    expect(el.tagName).toBe('TIME');
    expect(el.getAttribute('datetime')).toBe('2026-03-25T10:00:00.000Z');
  });

  it('renders relative format for recent times', () => {
    const twoHoursAgo = Date.now() / 1000 - 7200;
    render(<Timestamp value={twoHoursAgo} format="relative" />);
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
  });

  it('does not round a tier up past its own boundary', () => {
    // Just under each threshold the count must stay within the tier, e.g.
    // 59.98 minutes is "59 minutes ago", never "60 minutes ago".
    const {rerender} = render(
      <Timestamp value={Date.now() / 1000 - 3599} format="relative" />,
    );
    expect(screen.getByText('59 minutes ago')).toBeInTheDocument();

    rerender(<Timestamp value={Date.now() / 1000 - 86399} format="relative" />);
    expect(screen.getByText('23 hours ago')).toBeInTheDocument();

    rerender(
      <Timestamp value={Date.now() / 1000 - 2591999} format="relative" />,
    );
    expect(screen.getByText('29 days ago')).toBeInTheDocument();

    // Same guarantee on the future side.
    rerender(<Timestamp value={Date.now() / 1000 + 3599} format="relative" />);
    expect(screen.getByText('in 59 minutes')).toBeInTheDocument();
  });

  it('renders "now" for very recent times', () => {
    const fiveSecondsAgo = Date.now() / 1000 - 5;
    render(<Timestamp value={fiveSecondsAgo} format="relative" />);
    expect(screen.getByText('now')).toBeInTheDocument();
  });

  it('renders "now" for the current instant (not a future phrase)', () => {
    // A value equal to "right now". Because the internal `now` baseline is
    // captured at render time, it can lag the value by a fraction of a second,
    // producing a tiny negative delta that must not be treated as the future.
    render(<Timestamp value={Date.now() / 1000} format="relative" />);
    expect(screen.queryByText(/^in /)).not.toBeInTheDocument();
    expect(screen.getByText('now')).toBeInTheDocument();
  });

  it('renders "now" for a value a hair in the future (clock skew)', () => {
    // Real-world clock / captured-now skew can make a current-ish value land a
    // fraction of a second in the future relative to the component's internal
    // `now`. This must read as the present ("now"), never "in a few
    // seconds". Regression test for the right-now -> future-phrase bug.
    const aHairInTheFuture = Date.now() / 1000 + 0.6;
    render(<Timestamp value={aHairInTheFuture} format="relative" />);
    expect(screen.queryByText(/^in /)).not.toBeInTheDocument();
    expect(screen.getByText('now')).toBeInTheDocument();
  });

  it('renders "yesterday" for times ~1 day ago', () => {
    const yesterday = Date.now() / 1000 - 100000;
    render(<Timestamp value={yesterday} format="relative" />);
    expect(screen.getByText('yesterday')).toBeInTheDocument();
  });

  // --- relative_short format ---

  describe('relative_short format', () => {
    it('renders "now" for very recent times', () => {
      render(
        <Timestamp value={Date.now() / 1000 - 5} format="relative_short" />,
      );
      expect(screen.getByText('now')).toBeInTheDocument();
    });

    it('abbreviates each past tier (s/m/h/d/mo/y)', () => {
      const {rerender} = render(
        <Timestamp value={Date.now() / 1000 - 30} format="relative_short" />,
      );
      expect(screen.getByText('30s ago')).toBeInTheDocument();

      rerender(
        <Timestamp
          value={Date.now() / 1000 - 5 * 60}
          format="relative_short"
        />,
      );
      expect(screen.getByText('5m ago')).toBeInTheDocument();

      rerender(
        <Timestamp
          value={Date.now() / 1000 - 2 * 3600}
          format="relative_short"
        />,
      );
      expect(screen.getByText('2h ago')).toBeInTheDocument();

      rerender(
        <Timestamp
          value={Date.now() / 1000 - 3 * 86400}
          format="relative_short"
        />,
      );
      expect(screen.getByText('3d ago')).toBeInTheDocument();

      rerender(
        <Timestamp
          value={Date.now() / 1000 - 90 * 86400}
          format="relative_short"
        />,
      );
      expect(screen.getByText('3mo ago')).toBeInTheDocument();

      rerender(
        <Timestamp
          value={Date.now() / 1000 - 730 * 86400}
          format="relative_short"
        />,
      );
      expect(screen.getByText('2y ago')).toBeInTheDocument();
    });

    it('uses "mo" for months so it never collides with "m" (minutes)', () => {
      // 45 days → months tier. A bare "m" here would be indistinguishable from
      // the minutes unit, so months must render as "mo".
      render(
        <Timestamp
          value={Date.now() / 1000 - 45 * 86400}
          format="relative_short"
        />,
      );
      expect(screen.getByText('1mo ago')).toBeInTheDocument();
    });

    it('renders a single day as "1d ago" (no "yesterday" idiom in short form)', () => {
      render(
        <Timestamp
          value={Date.now() / 1000 - 100000}
          format="relative_short"
        />,
      );
      expect(screen.getByText('1d ago')).toBeInTheDocument();
    });

    it('renders future times with the "in" prefix and abbreviated units', () => {
      const {rerender} = render(
        <Timestamp
          value={Date.now() / 1000 + 5 * 60}
          format="relative_short"
        />,
      );
      expect(screen.getByText('in 5m')).toBeInTheDocument();

      rerender(
        <Timestamp
          value={Date.now() / 1000 + 2 * 3600}
          format="relative_short"
        />,
      );
      expect(screen.getByText('in 2h')).toBeInTheDocument();
    });

    it('does not round a tier up past its own boundary', () => {
      const {rerender} = render(
        <Timestamp value={Date.now() / 1000 - 3599} format="relative_short" />,
      );
      expect(screen.getByText('59m ago')).toBeInTheDocument();

      rerender(
        <Timestamp value={Date.now() / 1000 - 86399} format="relative_short" />,
      );
      expect(screen.getByText('23h ago')).toBeInTheDocument();
    });

    it('treats a hair in the future as "now" (clock skew)', () => {
      render(
        <Timestamp value={Date.now() / 1000 + 2} format="relative_short" />,
      );
      expect(screen.getByText('now')).toBeInTheDocument();
    });

    it('keeps the full absolute date as the accessible name', () => {
      render(
        <Timestamp
          value={Date.now() / 1000 - 2 * 3600}
          format="relative_short"
        />,
      );
      const el = screen.getByText('2h ago');
      // Same a11y contract as the long relative form: the visible short label
      // is backed by the full absolute date for screen readers.
      expect(el).toHaveAttribute('aria-label');
      expect(el.getAttribute('aria-label')).not.toBe('2h ago');
    });
  });

  it.each([
    {format: 'relative' as const, style: 'long' as const},
    {format: 'relative_short' as const, style: 'narrow' as const},
    {format: 'auto' as const, style: 'long' as const},
  ])(
    'updates $format output when the provider locale changes',
    ({format, style}) => {
      const value = Date.now() / 1000 - 2 * 3600;
      const timestamp = (locale: string) => (
        <InternationalizationProvider locale={locale}>
          <Timestamp
            value={value}
            format={format}
            hasTooltip={false}
            data-testid="ts"
          />
        </InternationalizationProvider>
      );
      const expected = (locale: string) =>
        new Intl.RelativeTimeFormat(locale, {
          numeric: 'always',
          style,
        }).format(-2, 'hour');

      const {rerender} = render(timestamp('en-US'));
      expect(screen.getByTestId('ts')).toHaveTextContent(expected('en-US'));

      rerender(timestamp('fr-FR'));
      expect(screen.getByTestId('ts')).toHaveTextContent(expected('fr-FR'));
    },
  );

  it('localizes relative idioms from the provider locale', () => {
    const timestamp = (value: number) => (
      <InternationalizationProvider locale="fr-FR">
        <Timestamp
          value={value}
          format="relative"
          hasTooltip={false}
          data-testid="ts"
        />
      </InternationalizationProvider>
    );
    const formatter = new Intl.RelativeTimeFormat('fr-FR', {
      numeric: 'auto',
      style: 'long',
    });

    const {rerender} = render(timestamp(Date.now() / 1000 - 5));
    expect(screen.getByTestId('ts')).toHaveTextContent(
      formatter.format(0, 'second'),
    );

    rerender(timestamp(Date.now() / 1000 - 100000));
    expect(screen.getByTestId('ts')).toHaveTextContent(
      formatter.format(-1, 'day'),
    );
  });

  // --- Standard display formats ---

  it('updates absolute output when the provider locale changes', () => {
    const value = '2026-01-25T12:00:00Z';
    const timestamp = (locale: string) => (
      <InternationalizationProvider locale={locale}>
        <Timestamp
          value={value}
          format="date_long"
          hasTooltip={false}
          data-testid="ts"
        />
      </InternationalizationProvider>
    );

    const {rerender} = render(timestamp('en-US'));
    expect(screen.getByTestId('ts')).toHaveTextContent('January 25, 2026');

    rerender(timestamp('de-DE'));
    expect(screen.getByTestId('ts')).toHaveTextContent('25. Januar 2026');
  });

  it.each(['full', 'date', 'date_long', 'date_weekday', 'date_time'] as const)(
    'keeps Gregorian years for the %s format under a non-Gregorian locale',
    format => {
      const value = formatInstant(
        new Date('2026-08-22T12:00:00Z'),
        format,
        'th-TH',
        {timeZone: 'UTC'},
      );
      expect(value).toContain('2026');
      expect(value).not.toContain('2569');
    },
  );

  it('keeps Gregorian years in Timestamp output under a non-Gregorian locale', () => {
    render(
      <InternationalizationProvider locale="th-TH">
        <Timestamp
          value="2026-08-22T12:00:00Z"
          format="date_long"
          hasTooltip={false}
          data-testid="ts"
        />
      </InternationalizationProvider>,
    );

    expect(screen.getByTestId('ts')).toHaveTextContent('2026');
    expect(screen.getByTestId('ts')).not.toHaveTextContent('2569');
  });

  it('renders date format', () => {
    render(
      <Timestamp value="2026-02-19T17:00:00Z" format="date" data-testid="ts" />,
    );
    const el = screen.getByTestId('ts');
    expect(el.textContent).toContain('2026');
    // Should not contain time
    expect(el.textContent).not.toContain(':');
  });

  it('renders date_weekday format with a weekday prefix', () => {
    render(
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="date_weekday"
        data-testid="ts"
      />,
    );
    const el = screen.getByTestId('ts');
    // Includes the year and a leading weekday abbreviation, no time portion.
    expect(el.textContent).toContain('2026');
    expect(el.textContent).not.toContain(':');
    // en-US short weekday for 2026-02-19 is "Thu"; assert a weekday word is
    // present without over-fitting the exact locale punctuation.
    expect(el.textContent).toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
  });

  it('renders date_long format with a full month name', () => {
    render(
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="date_long"
        data-testid="ts"
      />,
    );
    const el = screen.getByTestId('ts');
    // Long-month shape: full month name, year, no time portion.
    expect(el.textContent).toContain('February');
    expect(el.textContent).toContain('2026');
    expect(el.textContent).not.toContain(':');
  });

  it('renders date_time format', () => {
    render(
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="date_time"
        data-testid="ts"
      />,
    );
    const el = screen.getByTestId('ts');
    expect(el.textContent).toContain('2026');
    // Should contain a colon for the time portion
    expect(el.textContent).toContain(':');
  });

  it('renders time format', () => {
    render(
      <Timestamp value="2026-02-19T17:00:00Z" format="time" data-testid="ts" />,
    );
    const el = screen.getByTestId('ts');
    // Should contain time but not year
    expect(el.textContent).toContain(':');
    expect(el.textContent).not.toContain('2026');
  });

  // --- System formats ---

  it('renders system_date format', () => {
    render(
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="system_date"
        data-testid="ts"
      />,
    );
    const el = screen.getByTestId('ts');
    expect(el.textContent).toMatch(/2026-02-\d{2}/);
  });

  it('renders system_date_time format', () => {
    render(
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="system_date_time"
        data-testid="ts"
      />,
    );
    const el = screen.getByTestId('ts');
    expect(el.textContent).toMatch(/2026-02-\d{2} \d{2}:\d{2}:\d{2}/);
  });

  it('renders system_time format', () => {
    render(
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="system_time"
        data-testid="ts"
      />,
    );
    const el = screen.getByTestId('ts');
    expect(el.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('renders unix_seconds format as whole epoch seconds (zone-independent)', () => {
    // 2026-02-19T17:00:00Z is 1771520400 seconds since the epoch. The value is
    // absolute, so it is the same regardless of the viewer's zone.
    render(
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="unix_seconds"
        data-testid="ts"
      />,
    );
    expect(screen.getByTestId('ts').textContent).toBe('1771520400');
  });

  it('renders unix_seconds from a Unix-seconds value input unchanged', () => {
    render(
      <Timestamp value={1771520400} format="unix_seconds" data-testid="ts" />,
    );
    expect(screen.getByTestId('ts').textContent).toBe('1771520400');
  });

  // --- Auto format ---

  it('auto format uses relative for recent times', () => {
    const oneHourAgo = Date.now() / 1000 - 3600;
    render(<Timestamp value={oneHourAgo} format="auto" />);
    expect(screen.getByText('1 hour ago')).toBeInTheDocument();
  });

  it('auto format uses date_time for old times', () => {
    const oldDate = '2026-01-01T12:00:00Z';
    render(<Timestamp value={oldDate} format="auto" data-testid="ts" />);
    const el = screen.getByTestId('ts');
    expect(el.textContent).toContain('2026');
    expect(el.textContent).not.toContain('ago');
  });

  // --- Accessibility ---

  it('sets aria-label with full absolute time in relative mode', () => {
    const oneHourAgo = Date.now() / 1000 - 3600;
    render(
      <Timestamp
        value={oneHourAgo}
        format="relative"
        hasTooltip={false}
        data-testid="ts"
      />,
    );
    const el = screen.getByTestId('ts');
    expect(el.getAttribute('aria-label')).toBeTruthy();
    expect(el.getAttribute('aria-label')).toContain('2026');
  });

  it('does not set aria-label in non-relative mode', () => {
    render(
      <Timestamp
        value="2026-02-19T17:00:00Z"
        format="date_time"
        data-testid="ts"
      />,
    );
    const el = screen.getByTestId('ts');
    expect(el.getAttribute('aria-label')).toBeNull();
  });

  // Timezone abbreviations like "PST" or "GMT+2" are unexpanded abbreviations
  // to a screen-reader user (WCAG 3.1.4) — the AT-facing aria-label must spell
  // the timezone out in full, while visible text keeps the compact short form.
  it('uses the long timezone name in the aria-label (WCAG 3.1.4)', () => {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    render(
      <Timestamp
        value={oneHourAgo.getTime() / 1000}
        format="relative"
        hasTooltip={false}
        data-testid="ts"
      />,
    );

    const longTz =
      new Intl.DateTimeFormat('en', {timeZoneName: 'long'})
        .formatToParts(oneHourAgo)
        .find(p => p.type === 'timeZoneName')?.value ?? '';
    expect(longTz).not.toBe('');
    expect(screen.getByTestId('ts').getAttribute('aria-label')).toContain(
      longTz,
    );
  });

  it('keeps the short timezone form in visible text when isTimezoneShown', () => {
    const date = new Date('2026-03-25T10:00:00Z');
    render(
      <Timestamp
        value="2026-03-25T10:00:00Z"
        format="time"
        isTimezoneShown
        data-testid="ts"
      />,
    );

    const tzPart = (form: 'short' | 'long') =>
      new Intl.DateTimeFormat('en', {timeZoneName: form})
        .formatToParts(date)
        .find(p => p.type === 'timeZoneName')?.value ?? '';
    const text = screen.getByTestId('ts').textContent ?? '';
    expect(text).toContain(tzPart('short'));
    expect(text).not.toContain(tzPart('long'));
  });

  // --- Input handling ---

  it('accepts Unix timestamp in seconds', () => {
    render(<Timestamp value={1740000000} format="date" data-testid="ts" />);
    const el = screen.getByTestId('ts');
    expect(el.getAttribute('datetime')).toBeTruthy();
  });

  it('accepts ISO string', () => {
    render(
      <Timestamp
        value="2026-03-25T10:00:00Z"
        format="date_time"
        data-testid="ts"
      />,
    );
    const el = screen.getByTestId('ts');
    expect(el.getAttribute('datetime')).toBe('2026-03-25T10:00:00.000Z');
  });

  // --- Live updates ---

  it('live updates relative time', () => {
    const now = Date.now() / 1000;
    render(<Timestamp value={now - 5} format="relative" isLive />);
    expect(screen.getByText('now')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText('35 seconds ago')).toBeInTheDocument();
  });

  // --- Ref ---

  it('forwards ref', () => {
    const ref = {current: null as HTMLTimeElement | null};
    render(
      <Timestamp ref={ref} value="2026-03-25T10:00:00Z" format="date_time" />,
    );
    expect(ref.current).toBeInstanceOf(HTMLTimeElement);
  });

  // --- Test ID ---

  it('spreads data-testid', () => {
    render(
      <Timestamp
        value="2026-03-25T10:00:00Z"
        format="date_time"
        data-testid="my-timestamp"
      />,
    );
    expect(screen.getByTestId('my-timestamp')).toBeInTheDocument();
  });

  // --- Future dates ---

  it('handles future dates in relative mode', () => {
    const oneHourFromNow = Date.now() / 1000 + 3600;
    render(<Timestamp value={oneHourFromNow} format="relative" />);
    expect(screen.getByText('in 1 hour')).toBeInTheDocument();
  });

  it('renders "now" for a value a few seconds in the future (clock skew)', () => {
    // Beyond the sub-second render lag but still within the skew tolerance: a
    // value ~20s ahead of our clock is almost always skew (the value's clock
    // running fast), not a genuine future event, so it should read as the
    // present rather than "in a few seconds".
    const twentySecondsFromNow = Date.now() / 1000 + 20;
    render(<Timestamp value={twentySecondsFromNow} format="relative" />);
    expect(screen.queryByText(/^in /)).not.toBeInTheDocument();
    expect(screen.getByText('now')).toBeInTheDocument();
  });

  it('renders a genuine near-future time beyond the skew tolerance with the native formatter', () => {
    // Past the skew window — this is a real upcoming time, not clock drift.
    const fortyFiveSecondsFromNow = Date.now() / 1000 + 45;
    render(
      <Timestamp
        value={fortyFiveSecondsFromNow}
        format="relative"
        hasTooltip={false}
      />,
    );
    expect(
      screen.getByText(
        new Intl.RelativeTimeFormat('en', {
          numeric: 'always',
          style: 'long',
        }).format(45, 'second'),
      ),
    ).toBeInTheDocument();
  });

  // --- Long-ago relative ---

  it('renders months ago for dates older than 30 days', () => {
    const threeMonthsAgo = Date.now() / 1000 - 90 * 86400;
    render(<Timestamp value={threeMonthsAgo} format="relative" />);
    expect(screen.getByText('3 months ago')).toBeInTheDocument();
  });

  it('renders years ago for dates older than 365 days', () => {
    const twoYearsAgo = Date.now() / 1000 - 730 * 86400;
    render(<Timestamp value={twoYearsAgo} format="relative" />);
    expect(screen.getByText('2 years ago')).toBeInTheDocument();
  });

  // --- Auto threshold ---

  it('respects custom autoThreshold', () => {
    const twoHoursAgo = Date.now() / 1000 - 7200;
    render(
      <Timestamp value={twoHoursAgo} format="auto" autoThreshold={3600} />,
    );
    const el = screen.getByRole('time');
    expect(el.textContent).not.toContain('ago');
  });

  // --- Invalid values ---

  it('renders nothing instead of crashing on an unparseable string value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const {container} = render(
        <Timestamp value="not-a-date" data-testid="ts" />,
      );
      expect(container).toBeEmptyDOMElement();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('could not parse value'),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('renders nothing instead of crashing on a NaN value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const {container} = render(<Timestamp value={NaN} data-testid="ts" />);
      expect(container).toBeEmptyDOMElement();
    } finally {
      warn.mockRestore();
    }
  });

  // --- Hover card keyboard reachability (WCAG 1.4.13 / 2.1.1) ---

  describe('hover card keyboard reachability', () => {
    const originalMatches = HTMLElement.prototype.matches;
    const originalShowPopover = HTMLElement.prototype.showPopover;
    const originalHidePopover = HTMLElement.prototype.hidePopover;

    beforeEach(() => {
      // The card content renders inline in a (mocked) popover; real timers let
      // RTL's findBy* and the async paths resolve (the outer beforeEach
      // installs fake timers, which would stall them).
      vi.useRealTimers();

      // Mock the Popover API, which jsdom does not implement.
      HTMLElement.prototype.showPopover = vi.fn();
      HTMLElement.prototype.hidePopover = vi.fn();

      // jsdom does not derive :focus-visible from keyboard focus for a <time>
      // element; treat the focused element as focus-visible so the card's
      // keyboard-focus path can be exercised.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (HTMLElement.prototype as any).matches = function (
        selector: string,
      ): boolean {
        if (selector === ':focus-visible') {
          return this === document.activeElement;
        }
        return originalMatches.call(this, selector);
      };
    });

    afterEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (HTMLElement.prototype as any).matches = originalMatches;
      HTMLElement.prototype.showPopover = originalShowPopover;
      HTMLElement.prototype.hidePopover = originalHidePopover;
    });

    it("keeps a caller's tabIndex while the hover card is attached (FR9)", async () => {
      render(
        <Timestamp
          value={Date.now() / 1000 - 3600}
          format="relative"
          tabIndex={-1}
          data-testid="ts"
        />,
      );
      expect(screen.getByTestId('ts')).toHaveAttribute('tabindex', '-1');
      await openTimestampHoverCard();
      expect(screen.getByTestId('ts')).toHaveAttribute('tabindex', '-1');
    });

    it('makes the <time> element focusable while the hover card is attached', () => {
      render(
        <Timestamp
          value={Date.now() / 1000 - 3600}
          format="relative"
          data-testid="ts"
        />,
      );
      expect(screen.getByTestId('ts')).toHaveAttribute('tabindex', '0');
    });

    it('does not put aria-expanded on the role-less hover-card trigger', async () => {
      render(
        <Timestamp
          value={Date.now() / 1000 - 3600}
          format="relative"
          data-testid="ts"
        />,
      );
      const trigger = screen.getByTestId('ts').parentElement;
      // The trigger is Text's <span>, which has no role, so aria-expanded is
      // invalid on it (axe aria-allowed-attr, critical). aria-haspopup is
      // global and still advertises the dialog.
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
      });
      expect(trigger).not.toHaveAttribute('aria-expanded');
    });

    it('shows the hover card when the timestamp receives keyboard focus', async () => {
      const user = userEvent.setup();
      render(
        <Timestamp
          value={Date.now() / 1000 - 3600}
          format="relative"
          data-testid="ts"
        />,
      );
      const el = screen.getByTestId('ts');

      // The card carries the full absolute time in its visible form (short
      // timezone abbreviation) as its single default copyable row. The
      // aria-label spells the timezone out in full (WCAG 3.1.4), so the two
      // strings intentionally differ — compare the card against an
      // independently formatted short-form string after opening it.
      // Compare with normalized whitespace: Intl output can contain narrow
      // no-break spaces that jest-dom's matcher normalization would break on.
      const normalize = (s: string) => s.replace(/\s+/g, ' ');
      const datetime = new Date(el.getAttribute('datetime') ?? '');
      const expected = new Intl.DateTimeFormat('en', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      }).format(datetime);
      // Tab onto the timestamp — the only tab stop in the document.
      await user.tab();
      expect(el).toHaveFocus();
      await waitFor(() => {
        expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
      });
      const card = screen.getByRole('dialog', {hidden: true});
      expect(normalize(card.textContent ?? '')).toContain(normalize(expected));
    });

    it('does not add a tab stop when the hover card is disabled', () => {
      render(
        <Timestamp
          value={Date.now() / 1000 - 3600}
          format="relative"
          hasTooltip={false}
          data-testid="ts"
        />,
      );
      expect(screen.getByTestId('ts')).not.toHaveAttribute('tabindex');
    });

    it('does not add a tab stop for absolute formats (no hover card)', () => {
      render(
        <Timestamp
          value="2026-02-19T17:00:00Z"
          format="date_time"
          data-testid="ts"
        />,
      );
      expect(screen.getByTestId('ts')).not.toHaveAttribute('tabindex');
    });

    it('keeps the full absolute aria-label while the hover card is attached', () => {
      render(
        <Timestamp
          value={Date.now() / 1000 - 3600}
          format="relative"
          data-testid="ts"
        />,
      );
      const label = screen.getByTestId('ts').getAttribute('aria-label');
      expect(label).toBeTruthy();
      // The label is the full absolute string, not the relative text.
      expect(label).not.toContain('ago');
    });
  });

  // --- Default hover card (no tooltipEntries) ---

  describe('default hover card (no tooltipEntries)', () => {
    const originalShowPopover = HTMLElement.prototype.showPopover;
    const originalHidePopover = HTMLElement.prototype.hidePopover;

    beforeEach(() => {
      // The card content renders inline in a (mocked) popover; real timers let
      // RTL's findBy* and the async clipboard write resolve (the outer
      // beforeEach installs fake timers).
      vi.useRealTimers();
      HTMLElement.prototype.showPopover = vi.fn();
      HTMLElement.prototype.hidePopover = vi.fn();
      // jsdom does not implement the async Clipboard API.
      Object.defineProperty(navigator, 'clipboard', {
        value: {writeText: vi.fn().mockResolvedValue(undefined)},
        configurable: true,
      });
    });

    afterEach(() => {
      HTMLElement.prototype.showPopover = originalShowPopover;
      HTMLElement.prototype.hidePopover = originalHidePopover;
      __resetLiveRegionsForTest();
    });

    it('renders the unified copyable card with a single default absolute row', async () => {
      render(
        <Timestamp
          value={Date.now() / 1000 - 3600}
          format="relative"
          data-testid="ts"
        />,
      );
      // With no entries the hover surface is still the copyable card — one
      // surface, one styling — never the old read-only tooltip. (The copy
      // button carries its own small "Copy" tooltip; that is not the hover
      // surface, so exclude it.)
      expect(
        screen
          .queryAllByRole('tooltip', {hidden: true})
          .filter(el => !/^(Copy|Copied)$/.test(el.textContent?.trim() ?? '')),
      ).toHaveLength(0);
      const card = await openTimestampHoverCard();
      // The default card is the named details card, exactly as the configured
      // one is.
      expect(card).toHaveAttribute('aria-label', 'Timestamp details');
      // Exactly one row, carrying the full absolute time in its visible form
      // (short timezone abbreviation) with its own copy button. The
      // aria-label spells the timezone out in full (WCAG 3.1.4), so the two
      // strings intentionally differ — compare the row against an
      // independently formatted short-form string.
      expect(card.querySelectorAll('dd')).toHaveLength(1);
      expect(card.querySelectorAll('button')).toHaveLength(1);

      const normalize = (s: string) => s.replace(/\s+/g, ' ');
      const datetime = new Date(
        screen.getByTestId('ts').getAttribute('datetime') ?? '',
      );
      const expected = new Intl.DateTimeFormat('en', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      }).format(datetime);
      expect(normalize(card.textContent ?? '')).toContain(normalize(expected));
    });

    it("copies the default absolute row's value", async () => {
      render(<Timestamp value={Date.now() / 1000 - 3600} format="relative" />);
      const card = await openTimestampHoverCard();
      const rowValue = card.querySelector('dd')?.textContent ?? '';
      expect(rowValue).toBeTruthy();
      fireEvent.click(card.querySelector('button')!);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(rowValue);
      // Let the async copy resolve and flip the button into its copied state
      // so the state update settles inside act().
      await waitFor(() => {
        expect(
          screen.getByRole('button', {name: 'Copied', hidden: true}),
        ).toBeInTheDocument();
      });
    });

    it("shows a 'Copy' tooltip on the copy button, flipping to 'Copied' after a copy", async () => {
      render(<Timestamp value={Date.now() / 1000 - 3600} format="relative" />);
      const card = await openTimestampHoverCard();
      const button = card.querySelector('button')!;
      // The visible tooltip content defaults to the short imperative 'Copy'
      // (the full "Copy <value>" string stays the button's aria-label).
      fireEvent.mouseEnter(button);
      await waitFor(() =>
        expect(
          screen.getByText('Copy', {
            selector: '[role="tooltip"] *, [role="tooltip"]',
          }),
        ).toBeInTheDocument(),
      );
      fireEvent.click(button);
      // After a successful copy the tooltip content flips to 'Copied' in step
      // with the icon/aria-label.
      await waitFor(() =>
        expect(
          screen.getByText('Copied', {
            selector: '[role="tooltip"] *, [role="tooltip"]',
          }),
        ).toBeInTheDocument(),
      );
    });
  });

  // --- Multi-zone / multi-format copyable hover card (tooltipEntries) ---

  describe('tooltipEntries copyable hover card', () => {
    // A fixed instant that lands on a different calendar day in Tokyo, so a
    // zone-blind implementation is visible in the output.
    const VALUE = '2026-02-19T17:00:00Z';

    const originalShowPopover = HTMLElement.prototype.showPopover;
    const originalHidePopover = HTMLElement.prototype.hidePopover;

    beforeEach(() => {
      // The card content renders inline in a (mocked) popover, so its rows are
      // in the DOM without opening it. Real timers so RTL's findBy* and the
      // async clipboard write resolve (the outer beforeEach installs fake ones).
      vi.useRealTimers();
      HTMLElement.prototype.showPopover = vi.fn();
      HTMLElement.prototype.hidePopover = vi.fn();
      // jsdom does not implement the async Clipboard API.
      Object.defineProperty(navigator, 'clipboard', {
        value: {writeText: vi.fn().mockResolvedValue(undefined)},
        configurable: true,
      });
    });

    afterEach(() => {
      HTMLElement.prototype.showPopover = originalShowPopover;
      HTMLElement.prototype.hidePopover = originalHidePopover;
      __resetLiveRegionsForTest();
    });

    it('presents configured entries as a named card, not a read-only tooltip', async () => {
      render(
        <Timestamp
          value={VALUE}
          format="relative"
          tooltipEntries={[{label: 'Local'}, {timezoneID: 'UTC', label: 'UTC'}]}
        />,
      );
      // Entries present — the surface is the interactive card, never the
      // lightweight read-only tooltip. (The copy button's own "Copy" tooltip
      // is not the hover surface, so exclude it.)
      expect(
        screen
          .queryAllByRole('tooltip', {hidden: true})
          .filter(el => !/^(Copy|Copied)$/.test(el.textContent?.trim() ?? '')),
      ).toHaveLength(0);
      const card = await openTimestampHoverCard();
      expect(card).toHaveAttribute('aria-label', 'Timestamp details');
    });

    it('renders one row per configured entry, read-only by default', async () => {
      render(
        <Timestamp
          value={VALUE}
          format="relative"
          tooltipEntries={[
            {label: 'Local'},
            {timezoneID: 'UTC', label: 'UTC'},
            {timezoneID: 'Asia/Tokyo', label: 'Tokyo'},
          ]}
        />,
      );
      const card = await openTimestampHoverCard();
      expect(card.querySelectorAll('dd')).toHaveLength(3);
      // Entries are read-only unless they opt in, so no copy buttons and no
      // trailing action column are rendered.
      expect(card.querySelectorAll('button')).toHaveLength(0);
      expect(card.textContent).toContain('Local');
      expect(card.textContent).toContain('UTC');
      expect(card.textContent).toContain('Tokyo');
    });

    it('renders a copy button only on rows that opt into isCopyable', async () => {
      render(
        <Timestamp
          value={VALUE}
          format="relative"
          tooltipEntries={[
            {label: 'Local'},
            {timezoneID: 'UTC', label: 'UTC'},
            {
              timezoneID: 'UTC',
              format: 'system_date_time',
              label: 'ISO',
              isCopyable: true,
            },
          ]}
        />,
      );
      const card = await openTimestampHoverCard();
      // Three rows, but only the opted-in row carries a copy button.
      expect(card.querySelectorAll('dd')).toHaveLength(3);
      expect(card.querySelectorAll('button')).toHaveLength(1);
    });

    it('renders each entry in the time zone it names', async () => {
      render(
        <Timestamp
          value={VALUE}
          format="relative"
          tooltipEntries={[
            {timezoneID: 'UTC', format: 'system_date_time', label: 'UTC'},
            {
              timezoneID: 'Asia/Tokyo',
              format: 'system_date_time',
              label: 'Tokyo',
            },
          ]}
        />,
      );
      const card = await openTimestampHoverCard();
      const values = Array.from(card.querySelectorAll('dd')).map(
        el => el.textContent,
      );
      // Machine formats are locale- and host-timezone-independent, so these
      // hold on any developer machine and on CI.
      expect(values).toEqual(['2026-02-19 17:00:00', '2026-02-20 02:00:00']);
    });

    it("copies an opted-in row's value and flips the button to the copied state", async () => {
      render(
        <Timestamp
          value={VALUE}
          format="relative"
          tooltipEntries={[
            {
              label: 'ISO',
              format: 'system_date_time',
              timezoneID: 'UTC',
              isCopyable: true,
            },
          ]}
        />,
      );
      const card = await openTimestampHoverCard();
      const [rowValue] = Array.from(card.querySelectorAll('dd')).map(
        el => el.textContent ?? '',
      );
      const copyButton = card.querySelectorAll('button')[0];

      fireEvent.click(copyButton);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(rowValue);

      // The button announces and flips its icon/label to the copied state.
      await waitFor(() => {
        expect(
          screen.getByRole('button', {name: 'Copied', hidden: true}),
        ).toBeInTheDocument();
      });
    });

    it('announces the copy to a polite live region through the i18n catalog', async () => {
      render(
        <InternationalizationProvider
          locale="fr"
          overrides={{fr: {'@astryx.timestamp.copied': 'Copié'}}}>
          <Timestamp
            value={VALUE}
            format="relative"
            tooltipEntries={[
              {timezoneID: 'UTC', label: 'UTC', isCopyable: true},
            ]}
          />
        </InternationalizationProvider>,
      );
      const card = await openTimestampHoverCard();
      fireEvent.click(card.querySelector('button')!);
      await waitFor(() => {
        expect(
          document.querySelector('[data-astryx-live-region="polite"]'),
        ).toHaveTextContent('Copié');
      });
    });

    it('shows the card for absolute formats once entries are configured', async () => {
      render(
        <Timestamp
          value={VALUE}
          format="date_time"
          tooltipEntries={[{timezoneID: 'UTC', label: 'UTC'}]}
          data-testid="ts"
        />,
      );
      // Without entries an absolute format has no hover surface at all;
      // configuring entries must not be silently ignored.
      const card = await openTimestampHoverCard();
      expect(card.textContent).toContain('UTC');
      // ...and the anchor becomes keyboard-reachable, as it is for relative.
      expect(screen.getByTestId('ts')).toHaveAttribute('tabindex', '0');
    });

    it('treats an empty entry list exactly like no configuration', () => {
      render(
        <Timestamp
          value={VALUE}
          format="date_time"
          tooltipEntries={[]}
          data-testid="ts"
        />,
      );
      // An empty array is not a way to configure the card — with no lines to
      // show, an absolute format stays surface-less (no tab stop, no card).
      expect(screen.getByTestId('ts')).not.toHaveAttribute('tabindex');
      expect(screen.queryByRole('dialog', {hidden: true})).toBeNull();
    });

    it('stays inert when hasTooltip is false even with entries configured', () => {
      render(
        <Timestamp
          value={VALUE}
          format="relative"
          hasTooltip={false}
          tooltipEntries={[{timezoneID: 'UTC', label: 'UTC'}]}
          data-testid="ts"
        />,
      );
      // hasTooltip stays the on/off switch: false suppresses the surface even
      // when entries would otherwise upgrade it to the card.
      expect(screen.queryByRole('dialog', {hidden: true})).toBeNull();
      expect(
        screen
          .queryAllByRole('tooltip', {hidden: true})
          .filter(el => !/^(Copy|Copied)$/.test(el.textContent?.trim() ?? '')),
      ).toHaveLength(0);
      expect(screen.getByTestId('ts')).not.toHaveAttribute('tabindex');
      expect(
        screen.getByTestId('ts').getAttribute('aria-describedby'),
      ).toBeNull();
    });

    it('leaves the accessible name unchanged when entries are configured', () => {
      const value = Date.now() / 1000 - 3600;
      const {unmount} = render(
        <Timestamp value={value} format="relative" data-testid="a" />,
      );
      const before = screen.getByTestId('a').getAttribute('aria-label');
      unmount();

      render(
        <Timestamp
          value={value}
          format="relative"
          tooltipEntries={[{timezoneID: 'UTC', label: 'UTC'}]}
          data-testid="b"
        />,
      );
      // The accessible name stays the canonical absolute time in the viewer's
      // own zone; the extra zones reach assistive tech through the card, not
      // by being stuffed into the name.
      expect(screen.getByTestId('b').getAttribute('aria-label')).toBe(before);
    });

    it('does not add an accessible name to absolute formats with entries', () => {
      render(
        <Timestamp
          value={VALUE}
          format="date_time"
          tooltipEntries={[{timezoneID: 'UTC'}]}
          data-testid="ts"
        />,
      );
      expect(screen.getByTestId('ts').getAttribute('aria-label')).toBeNull();
    });

    it('renders nothing for an unparseable value even with entries', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const {container} = render(
          <Timestamp
            value="not-a-date"
            tooltipEntries={[{timezoneID: 'UTC', label: 'UTC'}]}
          />,
        );
        // The invalid-value bail-out runs before any hover-surface work, so
        // there is no half-rendered card anchored to nothing.
        expect(container).toBeEmptyDOMElement();
      } finally {
        warn.mockRestore();
      }
    });

    it('shows configured entries when auto resolves to an absolute format', async () => {
      render(
        <Timestamp
          value={VALUE}
          format="auto"
          autoThreshold={0}
          tooltipEntries={[
            {timezoneID: 'UTC', format: 'system_date_time', label: 'UTC'},
          ]}
          data-testid="ts"
        />,
      );
      // autoThreshold={0} forces the absolute branch regardless of the clock.
      const card = await openTimestampHoverCard();
      expect(card.textContent).toContain('2026-02-19 17:00:00');
      expect(screen.getByTestId('ts')).toHaveAttribute('tabindex', '0');
    });

    it('accepts a unix-seconds value alongside entries', async () => {
      render(
        <Timestamp
          value={Date.parse(VALUE) / 1000}
          format="relative"
          tooltipEntries={[
            {timezoneID: 'UTC', format: 'system_date_time', label: 'UTC'},
          ]}
        />,
      );
      const card = await openTimestampHoverCard();
      expect(card.textContent).toContain('2026-02-19 17:00:00');
    });

    it('pairs exactly one label cell with one value cell per entry', async () => {
      render(
        <Timestamp
          value={VALUE}
          format="relative"
          tooltipEntries={[
            {timezoneID: 'UTC', label: 'UTC'},
            {timezoneID: 'Asia/Tokyo'},
            {timezoneID: 'Europe/London', label: 'London'},
          ]}
        />,
      );
      const card = await openTimestampHoverCard();
      // An unlabeled entry still emits its label cell, so the grid stays
      // aligned and the <dl> stays valid markup.
      expect(card.querySelectorAll('dt')).toHaveLength(3);
      expect(card.querySelectorAll('dd')).toHaveLength(3);
      expect(card.querySelectorAll('dt')[1].textContent).toBe('');
    });

    it('gives the tab stop back when entries are removed', () => {
      const {rerender} = render(
        <Timestamp
          value={VALUE}
          format="date_time"
          tooltipEntries={[{timezoneID: 'UTC'}]}
          data-testid="ts"
        />,
      );
      expect(screen.getByTestId('ts')).toHaveAttribute('tabindex', '0');

      rerender(<Timestamp value={VALUE} format="date_time" data-testid="ts" />);
      // The surface is driven purely by entry presence, so dropping the prop
      // must also drop the tab stop rather than stranding one.
      expect(screen.getByTestId('ts')).not.toHaveAttribute('tabindex');
    });

    it('does not crash on an unknown time zone', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        render(
          <Timestamp
            value={VALUE}
            format="relative"
            tooltipEntries={[
              {timezoneID: 'Not/AZone', format: 'system_date_time'},
              {timezoneID: 'UTC', format: 'system_date_time'},
            ]}
          />,
        );
        const card = await openTimestampHoverCard();
        const values = Array.from(card.querySelectorAll('dd')).map(
          el => el.textContent,
        );
        expect(values).toHaveLength(2);
        expect(values[1]).toBe('2026-02-19 17:00:00');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Not/AZone'));
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('one formatter behind both surfaces', () => {
    // The rendered text and a tooltip line are two views of the same instant.
    // They are meant to come from one formatter parameterized by zone, not two
    // that happen to agree: a format added or reshaped on one surface and not
    // the other is a silent drift, invisible until someone compares them.
    // These assertions compare the two surfaces directly, so re-forking either
    // one fails here. Locale- and timezone-agnostic: nothing is pinned to a
    // literal, only the two paths to each other.
    const VALUE = '2026-02-19T17:00:00Z';

    const SHARED_FORMATS = [
      'date',
      'date_long',
      'date_weekday',
      'date_time',
      'time',
      'system_date',
      'system_date_time',
      'system_time',
    ] as const;

    it.each(SHARED_FORMATS)(
      'renders %s identically as text and as a zone-less tooltip line',
      format => {
        render(
          <Timestamp
            value={VALUE}
            format={format}
            hasTooltip={false}
            data-testid="ts"
          />,
        );
        const [line] = formatTooltipLines(new Date(VALUE), [{format}], 'en');
        expect(line.value).toBe(screen.getByTestId('ts').textContent);
      },
    );

    it('renders the full style as the aria-label and as a line, differing only in zone-name spelling', () => {
      // 'full' is the one member with no visible-text counterpart — it backs
      // the accessible name of a relative timestamp and the tooltip's default
      // line. The two must not drift apart on anything but the zone name: the
      // aria-label spells the zone out in full for assistive tech (WCAG 3.1.4),
      // the visible line keeps the abbreviation. Comparing them after swapping
      // the abbreviation for the spelled-out form keeps this a direct
      // surface-to-surface check, so re-forking either path still fails here.
      render(
        <Timestamp
          value={VALUE}
          format="relative"
          hasTooltip={false}
          data-testid="ts"
        />,
      );
      const date = new Date(VALUE);
      const tzPart = (form: 'short' | 'long') =>
        new Intl.DateTimeFormat('en', {timeZoneName: form})
          .formatToParts(date)
          .find(p => p.type === 'timeZoneName')?.value ?? '';
      const [line] = formatTooltipLines(date, [{format: 'full'}], 'en');
      expect(screen.getByTestId('ts').getAttribute('aria-label')).toBe(
        line.value.replace(tzPart('short'), tzPart('long')),
      );
    });
  });
});

describe('Timestamp pass-through props', () => {
  it('forwards pass-through props to the time element', () => {
    render(
      <Timestamp
        value="2024-01-15T10:30:00Z"
        format="date_time"
        aria-label="Published"
        id="published-at"
        data-source="cms"
        data-testid="stamp"
      />,
    );
    const time = screen.getByTestId('stamp');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('aria-label', 'Published');
    expect(time).toHaveAttribute('id', 'published-at');
    expect(time).toHaveAttribute('data-source', 'cms');
  });

  it("keeps a caller's aria-label on a relative timestamp (FR5)", () => {
    render(
      <Timestamp
        value={Date.now()}
        format="relative"
        aria-label="Caller label"
        data-source="cms"
        data-testid="stamp"
      />,
    );
    const stamp = screen.getByTestId('stamp');
    expect({
      ariaLabel: stamp.getAttribute('aria-label'),
      dataSource: stamp.getAttribute('data-source'),
    }).toEqual({ariaLabel: 'Caller label', dataSource: 'cms'});
  });

  it('names a relative timestamp by the full date when the caller names nothing (FR5)', () => {
    render(
      <Timestamp
        value={Date.now()}
        format="relative"
        aria-label={undefined}
        data-testid="stamp"
      />,
    );
    expect(screen.getByTestId('stamp').getAttribute('aria-label')).toMatch(
      /\d{4}/,
    );
  });
});

/**
 * Counts `new Date()` calls with no argument (reads of the current time) made
 * while `run` executes.
 */
function countClockReads(run: () => void): number {
  const ActiveDate = globalThis.Date;
  let reads = 0;
  class CountingDate extends ActiveDate {
    constructor(...args: [] | [string | number | Date]) {
      if (args.length === 0) {
        reads += 1;
      }
      super(...(args as [string | number | Date]));
    }
  }
  globalThis.Date = CountingDate as DateConstructor;
  try {
    run();
  } finally {
    globalThis.Date = ActiveDate;
  }
  return reads;
}

describe('Timestamp server rendering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['date', 'date_time', 'time', 'unix_seconds'] as const)(
    'never reads the current time for the absolute %s format',
    format => {
      const element = (
        <Timestamp value="2026-03-25T10:00:00Z" format={format} />
      );
      expect(countClockReads(() => renderToString(element))).toBe(0);
      expect(countClockReads(() => render(element))).toBe(0);
    },
  );

  it.each(['relative', 'relative_short', 'auto'] as const)(
    'renders the %s format as the full date and time in UTC on the server without reading the clock',
    format => {
      const value = '2026-03-25T10:00:00Z';
      let html = '';
      expect(
        countClockReads(() => {
          html = renderToString(<Timestamp value={value} format={format} />);
        }),
      ).toBe(0);
      const host = document.createElement('div');
      host.innerHTML = html;
      expect(host.textContent).toBe(
        formatInstant(new Date(value), 'date_time', 'en-US', {
          timeZone: 'UTC',
          isTimezoneShown: true,
        }),
      );
    },
  );

  it('never commits the UTC placeholder when a client Timestamp switches to a relative format', () => {
    const value = Date.now() / 1000 - 7200;
    const committed: string[] = [];
    function Spy({format}: {format: 'date' | 'relative'}) {
      return (
        <Profiler
          id="ts"
          onRender={() => {
            committed.push(document.querySelector('time')?.textContent ?? '');
          }}>
          <Timestamp value={value} format={format} hasTooltip={false} />
        </Profiler>
      );
    }
    const {rerender} = render(<Spy format="date" />);
    committed.length = 0;
    rerender(<Spy format="relative" />);
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
    expect(committed.some(text => text.includes('UTC'))).toBe(false);
  });

  describe('across time zones', () => {
    const originalTZ = process.env.TZ;

    afterEach(() => {
      if (originalTZ === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTZ;
      }
    });

    it('writes the same server markup whatever the server time zone', () => {
      const element = (
        <Timestamp value="2026-03-25T10:00:00Z" format="relative" />
      );
      process.env.TZ = 'UTC';
      const utc = renderToString(element);
      process.env.TZ = 'Asia/Tokyo';
      expect(renderToString(element)).toBe(utc);
    });

    it('hydrates server markup from another time zone without a mismatch', () => {
      const value = Date.now() / 1000 - 7200;
      const element = (
        <Timestamp value={value} format="relative" hasTooltip={false} />
      );
      process.env.TZ = 'UTC';
      const host = document.createElement('div');
      document.body.appendChild(host);
      host.innerHTML = renderToString(element);

      process.env.TZ = 'America/Los_Angeles';
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      let root: Root | undefined;
      try {
        act(() => {
          root = hydrateRoot(host, element, {
            onRecoverableError: error => {
              throw error;
            },
          });
        });
        expect(host.textContent).toBe('2 hours ago');
        expect(errors).not.toHaveBeenCalled();
      } finally {
        errors.mockRestore();
        act(() => root?.unmount());
        host.remove();
      }
    });
  });

  it('hydrates the server markup without a mismatch, then shows the relative phrase', () => {
    const value = Date.now() / 1000 - 7200;
    const element = (
      <Timestamp value={value} format="relative" hasTooltip={false} />
    );
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.innerHTML = renderToString(element);
    expect(host.textContent).not.toBe('2 hours ago');

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: Root | undefined;
    try {
      act(() => {
        root = hydrateRoot(host, element);
      });
      expect(host.textContent).toBe('2 hours ago');
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
      act(() => root?.unmount());
      host.remove();
    }
  });
});
