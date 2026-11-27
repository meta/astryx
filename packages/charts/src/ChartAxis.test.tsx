// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartAxis.test.tsx
 * @input Uses vitest, @testing-library/react, InternationalizationProvider,
 *        the full Temporal polyfill, Chart, ChartAxis, the built-in
 *        formatters, bar mark; platform Intl gives the expected tick text
 * @output Functional tests for axis rendering — group semantics, band/linear
 *         tick labels, physical edge placement, default edge-line rules,
 *         custom formatting with the provider locale and calendar,
 *         grapheme-safe truncation and density, and label capping
 * @position Colocated test for ChartAxis.tsx (issue #4295 viz coverage)
 */

import {
  describe,
  it,
  expect,
  expectTypeOf,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import {render, screen, act, within} from '@testing-library/react';
import {InternationalizationProvider} from '@astryxdesign/core';
import {Temporal as TemporalPolyfill} from 'temporal-polyfill/full';
import {Chart} from './Chart';
import {ChartAxis, type ChartAxisProps} from './ChartAxis';
import {
  compactNumber,
  currency,
  monthYear,
  percent,
  shortDate,
} from './formatters';
import {bar} from './marks/bar';
import type {ChartValueFormat} from './types';

const DATA = [
  {month: 'Jan', sales: 4},
  {month: 'Feb', sales: 10},
  {month: 'Mar', sales: 2},
];

// Capture the ResizeObserver callback so tests can drive the reported width.
let resizeCallback: ResizeObserverCallback | undefined;

beforeEach(() => {
  resizeCallback = undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function reportWidth(width: number) {
  act(() => {
    resizeCallback?.(
      [{contentRect: {width}} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  });
}

function renderChart(axes: React.ReactNode, data = DATA) {
  const utils = render(
    <Chart data={data} xKey="month" series={[bar('sales')]} axes={axes} />,
  );
  reportWidth(600);
  return utils;
}

function tickLabels(name: string): string[] {
  const axis = screen.getByRole('group', {name});
  return Array.from(axis.querySelectorAll('text'), t => t.textContent ?? '');
}

describe('ChartAxis bottom (band scale)', () => {
  it('renders a labeled group with one tick label per category', () => {
    renderChart(<ChartAxis position="bottom" />);
    const axis = screen.getByRole('group', {name: 'bottom axis'});
    expect(within(axis).getByText('Jan')).toBeInTheDocument();
    expect(within(axis).getByText('Feb')).toBeInTheDocument();
    expect(within(axis).getByText('Mar')).toBeInTheDocument();
  });

  it('is translated to the bottom edge of the plot and draws its edge line by default', () => {
    renderChart(<ChartAxis position="bottom" />);
    const axis = screen.getByRole('group', {name: 'bottom axis'});
    // Inner height for the default 300px chart: 300 - 24 - 32 = 244.
    expect(axis).toHaveAttribute('transform', 'translate(0,244)');
    const edge = axis.querySelector('line')!;
    expect(edge).not.toBeNull();
    expect(edge).toHaveAttribute('x2', '528');
  });

  it('keeps the category text when formatTick returns undefined', () => {
    renderChart(<ChartAxis position="bottom" formatTick={() => undefined} />);
    expect(tickLabels('bottom axis')).toEqual(['Jan', 'Feb', 'Mar']);
  });

  it('caps labels to maxTicks by evenly skipping categories', () => {
    renderChart(<ChartAxis position="bottom" maxTicks={2} />);
    const axis = screen.getByRole('group', {name: 'bottom axis'});
    // 3 categories capped at 2 → step 2 → indices 0 and 2 survive.
    expect(within(axis).getByText('Jan')).toBeInTheDocument();
    expect(within(axis).getByText('Mar')).toBeInTheDocument();
    expect(within(axis).queryByText('Feb')).not.toBeInTheDocument();
  });

  it('keeps the last label when thinning cannot land on it', () => {
    const days = Array.from({length: 14}, (_, index) => ({
      month: `Day ${index + 1}`,
      sales: index,
    }));
    renderChart(<ChartAxis position="bottom" maxTicks={7} />, days);
    const axis = screen.getByRole('group', {name: 'bottom axis'});
    const labels = Array.from(axis.querySelectorAll('text')).map(
      text => text.textContent,
    );
    // 14 labels capped at 7 → step 2. Day 13 would be the last kept label;
    // Day 14 replaces it because it sits closer than one step.
    expect(labels).toEqual([
      'Day 1',
      'Day 3',
      'Day 5',
      'Day 7',
      'Day 9',
      'Day 11',
      'Day 14',
    ]);
  });

  it('automatically reduces categorical labels as the plot narrows', () => {
    const denseData = Array.from({length: 20}, (_, index) => ({
      month: `Period ${index + 1}`,
      sales: index,
    }));
    renderChart(<ChartAxis position="bottom" />, denseData);
    const axis = screen.getByRole('group', {name: 'bottom axis'});
    const wideLabelCount = axis.querySelectorAll('text').length;

    reportWidth(120);

    const narrowLabelCount = axis.querySelectorAll('text').length;
    expect(narrowLabelCount).toBeGreaterThan(0);
    expect(narrowLabelCount).toBeLessThan(wideLabelCount);
  });

  it('keeps the same auto-thinned labels after ASCII and Unicode truncation', () => {
    const asciiData = Array.from({length: 9}, (_, index) => ({
      month: `${index + 1}AB`,
      sales: index,
    }));
    const clusters = ['👨‍👩‍👧‍👦', '🇯🇵', '👩🏽‍🚀'];
    const unicodeData = Array.from({length: 9}, (_, index) => ({
      month: `${index + 1}${clusters[index % clusters.length]}X`,
      sales: index,
    }));

    const retainedIndexes = (data: typeof asciiData) => {
      const {unmount} = renderChart(
        <ChartAxis position="bottom" truncate={2} />,
        data,
      );
      reportWidth(300);
      const indexes = Array.from(
        screen
          .getByRole('group', {name: 'bottom axis'})
          .querySelectorAll('text'),
        label => Number(label.textContent?.match(/^(\d+)/)?.[1]),
      );
      unmount();
      return indexes;
    };

    expect(retainedIndexes(unicodeData)).toEqual(retainedIndexes(asciiData));
  });

  it('truncates long category labels with an ellipsis', () => {
    renderChart(<ChartAxis position="bottom" truncate={4} />, [
      {month: 'January', sales: 4},
      {month: 'Feb', sales: 10},
    ]);
    const axis = screen.getByRole('group', {name: 'bottom axis'});
    expect(within(axis).getByText('Janu…')).toBeInTheDocument();
    // Short labels are left alone.
    expect(within(axis).getByText('Feb')).toBeInTheDocument();
  });

  it('preserves whole grapheme clusters when truncating labels', () => {
    const family = '👨‍👩‍👧‍👦';
    renderChart(<ChartAxis position="bottom" truncate={1} />, [
      {month: `${family}Q`, sales: 4},
    ]);
    const axis = screen.getByRole('group', {name: 'bottom axis'});
    expect(within(axis).getByText(`${family}…`)).toBeInTheDocument();
  });
});

describe('ChartAxis left (linear scale)', () => {
  it('renders d3-formatted value ticks without an edge line by default', () => {
    renderChart(<ChartAxis position="left" />);
    const axis = screen.getByRole('group', {name: 'left axis'});
    // Bar series pins a zero baseline → domain [0, 10] → ticks 0,2,...,10.
    expect(within(axis).getByText('0')).toBeInTheDocument();
    expect(within(axis).getByText('4')).toBeInTheDocument();
    expect(within(axis).getByText('10')).toBeInTheDocument();
    // Documented default: only the bottom axis draws its edge line.
    expect(axis.querySelector('line')).toBeNull();
  });

  it('applies a custom tick formatter', () => {
    renderChart(
      <ChartAxis position="left" formatTick={v => `$${String(v)}`} />,
    );
    const axis = screen.getByRole('group', {name: 'left axis'});
    expect(within(axis).getByText('$0')).toBeInTheDocument();
    expect(within(axis).getByText('$10')).toBeInTheDocument();
  });

  it('shows the default tick text when formatTick returns null', () => {
    const data = [
      {month: 'Jan', sales: 1_200_000},
      {month: 'Feb', sales: 1_500_000},
    ];
    const {unmount} = renderChart(<ChartAxis position="left" />, data);
    const defaults = tickLabels('left axis');
    unmount();

    renderChart(<ChartAxis position="left" formatTick={() => null} />, data);
    expect(tickLabels('left axis')).toEqual(defaults);
    // d3's default groups digits; String(1000000) would not.
    expect(defaults).toContain('1,000,000');
  });

  it('accepts a currency() format as formatTick', () => {
    expectTypeOf(currency('$')).toExtend<
      NonNullable<ChartAxisProps['formatTick']>
    >();
    renderChart(
      <ChartAxis position="left" formatTick={currency('$', 'en-US')} />,
    );
    expect(tickLabels('left axis')).toContain('$10');
  });

  it('showTicks draws a perpendicular mark per tick and forces the axis line on', () => {
    renderChart(<ChartAxis position="left" showTicks />);
    const axis = screen.getByRole('group', {name: 'left axis'});
    const lines = axis.querySelectorAll('line');
    // 6 ticks (0..10 by 2) + the forced edge line.
    expect(lines).toHaveLength(7);
  });
});

describe('ChartAxis top and right positions', () => {
  it('places both axes on their physical plot edges with outward labels', () => {
    renderChart(
      <>
        <ChartAxis position="top" showTicks />
        <ChartAxis position="right" showTicks />
      </>,
    );

    const top = screen.getByRole('group', {name: 'top axis'});
    expect(top).not.toHaveAttribute('transform');
    expect(within(top).getByText('Jan')).toHaveAttribute('y', '-10');

    const right = screen.getByRole('group', {name: 'right axis'});
    expect(right).toHaveAttribute('transform', 'translate(528,0)');
    expect(within(right).getByText('0')).toHaveAttribute('x', '10');
    expect(within(right).getByText('0')).toHaveAttribute(
      'text-anchor',
      'start',
    );
  });
});

type FormatTick = NonNullable<ChartAxisProps['formatTick']>;

const LARGE = [
  {month: 'Jan', sales: 1_200_000},
  {month: 'Feb', sales: 1_500_000},
];
const RATIOS = [
  {month: 'Jan', sales: 0.25},
  {month: 'Feb', sales: 0.45},
];
const DATES = [
  {month: '2025-01-05', sales: 4},
  {month: '2025-03-12', sales: 10},
];

function renderInProvider(
  axes: React.ReactNode,
  data: Record<string, unknown>[],
  provider: {
    locale: string;
    calendar?: React.ComponentProps<
      typeof InternationalizationProvider
    >['calendar'];
  },
) {
  const utils = render(
    <InternationalizationProvider
      locale={provider.locale}
      calendar={provider.calendar}
      messages={{[provider.locale]: {}}}>
      <Chart data={data} xKey="month" series={[bar('sales')]} axes={axes} />
    </InternationalizationProvider>,
  );
  reportWidth(600);
  return utils;
}

/** The raw tick values the axis draws, read through a pass-through format. */
function rawTicks(
  position: ChartAxisProps['position'],
  data: Record<string, unknown>[],
): unknown[] {
  const seen: unknown[] = [];
  const {unmount} = renderInProvider(
    <ChartAxis
      position={position}
      formatTick={value => {
        seen.push(value);
        return null;
      }}
    />,
    data,
    {locale: 'fr'},
  );
  unmount();
  return [...new Set(seen)];
}

const SERIES = [bar('sales')];
const MESSAGES = {en: {}, fr: {}};

const frCompact = new Intl.NumberFormat('fr', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** UTC midnight of a `YYYY-MM-DD` string. */
function utcDate(iso: unknown): Date {
  const [year, month, day] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

describe('ChartAxis formatTick', () => {
  it('takes the chart value format type', () => {
    expectTypeOf<FormatTick>().toEqualTypeOf<ChartValueFormat>();
    expectTypeOf(compactNumber).toExtend<FormatTick>();
    expectTypeOf(percent).toExtend<FormatTick>();
    expectTypeOf(shortDate).toExtend<FormatTick>();
    expectTypeOf(monthYear).toExtend<FormatTick>();
    expectTypeOf(currency('$')).toExtend<FormatTick>();
    expectTypeOf<(value: unknown) => string>().toExtend<FormatTick>();
  });

  it('passes each tick the provider locale and shows the returned text', () => {
    const values = rawTicks('left', LARGE);
    expect(values.length).toBeGreaterThan(1);
    renderInProvider(
      <ChartAxis
        position="left"
        formatTick={(value, locale) => `${String(value)} ${locale}`}
      />,
      LARGE,
      {locale: 'fr'},
    );
    expect(tickLabels('left axis')).toEqual(values.map(v => `${String(v)} fr`));
  });

  it.each([
    {
      name: 'compactNumber',
      format: compactNumber,
      position: 'left',
      data: LARGE,
      intl: (v: unknown) => frCompact.format(Number(v)),
    },
    {
      name: "currency('$')",
      format: currency('$'),
      position: 'left',
      data: LARGE,
      intl: (v: unknown) =>
        `$${
          Math.abs(Number(v)) >= 1000
            ? frCompact.format(Math.abs(Number(v)))
            : new Intl.NumberFormat('fr').format(Math.abs(Number(v)))
        }`,
    },
    {
      name: 'percent',
      format: percent,
      position: 'left',
      data: RATIOS,
      intl: (v: unknown) =>
        new Intl.NumberFormat('fr', {
          style: 'percent',
          maximumFractionDigits: 1,
        }).format(Number(v)),
    },
    {
      name: 'shortDate',
      format: shortDate,
      position: 'bottom',
      data: DATES,
      intl: (v: unknown) =>
        new Intl.DateTimeFormat('fr', {
          month: 'short',
          day: 'numeric',
          calendar: 'gregory',
          timeZone: 'UTC',
        }).format(utcDate(v)),
    },
    {
      name: 'monthYear',
      format: monthYear,
      position: 'bottom',
      data: DATES,
      intl: (v: unknown) =>
        new Intl.DateTimeFormat('fr', {
          month: 'short',
          year: 'numeric',
          calendar: 'gregory',
          timeZone: 'UTC',
        }).format(utcDate(v)),
    },
  ] as const)(
    'writes $name ticks in the provider locale without a wrapper',
    ({format, position, data, intl}) => {
      const values = rawTicks(position, data);
      expect(values.length).toBeGreaterThan(1);
      const expected = values.map(intl);
      expect(expected).not.toEqual(
        values.map(v => (format as ChartValueFormat)(v, 'en', 'gregory')),
      );
      renderInProvider(
        <ChartAxis position={position} formatTick={format} />,
        data,
        {locale: 'fr'},
      );
      expect(tickLabels(`${position} axis`)).toEqual(expected);
    },
  );

  it('rewrites the ticks when only the provider locale changes', () => {
    const axes = <ChartAxis position="left" formatTick={compactNumber} />;
    const tree = (locale: string) => (
      <InternationalizationProvider locale={locale} messages={MESSAGES}>
        <Chart data={LARGE} xKey="month" series={SERIES} axes={axes} />
      </InternationalizationProvider>
    );
    const values = rawTicks('left', LARGE);
    const enCompact = new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    const {rerender} = render(tree('en'));
    reportWidth(600);
    expect(tickLabels('left axis')).toEqual(
      values.map(v => enCompact.format(Number(v))),
    );
    rerender(tree('fr'));
    expect(tickLabels('left axis')).toEqual(
      values.map(v => frCompact.format(Number(v))),
    );
  });

  it('truncates the formatted text, not the raw value', () => {
    renderChart(
      <ChartAxis
        position="bottom"
        truncate={4}
        formatTick={value => `${String(value)}!`}
      />,
      [
        {month: 'January', sales: 4},
        {month: 'Feb', sales: 10},
      ],
    );
    expect(tickLabels('bottom axis')).toEqual(['Janu…', 'Feb!']);
  });
});

describe('ChartAxis formatTick calendar', () => {
  const monthYearIn = (calendar: 'persian' | 'gregory') =>
    DATES.map(d =>
      new Intl.DateTimeFormat('en', {
        month: 'short',
        year: 'numeric',
        calendar,
        timeZone: 'UTC',
      }).format(utcDate(d.month)),
    );

  it('passes the provider calendar when Temporal supports it', () => {
    vi.stubGlobal('Temporal', TemporalPolyfill);
    const calendars: unknown[] = [];
    renderInProvider(
      <ChartAxis
        position="bottom"
        formatTick={(value, locale, calendar) => {
          calendars.push(calendar);
          return monthYear(value, locale, calendar);
        }}
      />,
      DATES,
      {locale: 'en', calendar: 'persian'},
    );
    expect(new Set(calendars)).toEqual(new Set(['persian']));
    expect(monthYearIn('persian')).not.toEqual(monthYearIn('gregory'));
    expect(tickLabels('bottom axis')).toEqual(monthYearIn('persian'));
  });

  it('passes gregory when the runtime cannot show the provider calendar', () => {
    vi.stubGlobal('Temporal', undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calendars: unknown[] = [];
    renderInProvider(
      <ChartAxis
        position="bottom"
        formatTick={(value, locale, calendar) => {
          calendars.push(calendar);
          return monthYear(value, locale, calendar);
        }}
      />,
      DATES,
      {locale: 'en', calendar: 'persian'},
    );
    expect(new Set(calendars)).toEqual(new Set(['gregory']));
    expect(tickLabels('bottom axis')).toEqual(monthYearIn('gregory'));
    warn.mockRestore();
  });

  it('rewrites the ticks when only the provider calendar changes', () => {
    vi.stubGlobal('Temporal', TemporalPolyfill);
    const axes = <ChartAxis position="bottom" formatTick={monthYear} />;
    const tree = (calendar: 'persian' | 'gregory') => (
      <InternationalizationProvider
        locale="en"
        calendar={calendar}
        messages={MESSAGES}>
        <Chart data={DATES} xKey="month" series={SERIES} axes={axes} />
      </InternationalizationProvider>
    );
    const {rerender} = render(tree('gregory'));
    reportWidth(600);
    expect(tickLabels('bottom axis')).toEqual(monthYearIn('gregory'));
    rerender(tree('persian'));
    expect(tickLabels('bottom axis')).toEqual(monthYearIn('persian'));
  });

  it('passes gregory without a provider calendar', () => {
    const calendars: unknown[] = [];
    renderChart(
      <ChartAxis
        position="bottom"
        formatTick={(value, _locale, calendar) => {
          calendars.push(calendar);
          return String(value);
        }}
      />,
    );
    expect(new Set(calendars)).toEqual(new Set(['gregory']));
  });
});
