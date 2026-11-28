// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Chart.test.tsx
 * @input Uses vitest, @testing-library/react, Chart root + bar/line marks
 * @output Unit tests for Chart accessibility (WCAG 1.1.1), localized fallback
 *         text, root DOM/ref passthrough, and the chart root's functional
 *         contract — measurement gate, per-series render
 *         delegation, event layer geometry, palette assignment, and the
 *         declarative legend/tooltip slots (issue #4295 viz coverage)
 * @position Testing; validates Chart.tsx accessible name + data-table fallback
 */

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRef} from 'react';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, act, within, fireEvent} from '@testing-library/react';
import {Chart} from './Chart';
import {bar, dot, line} from './marks';
import {heatmapGL} from './marks/heatmapGL';
import {streamGL} from './marks/streamGL';
import {computeLayout} from './layout';
import {InternationalizationProvider} from '@astryxdesign/core';

const data = [
  {month: 'Jan', revenue: 100, profit: 20},
  {month: 'Feb', revenue: 200, profit: 40},
  {month: 'Mar', revenue: 150, profit: 30},
];

// Capture the ResizeObserver callback so tests can drive the reported width.
let resizeCallback: ResizeObserverCallback | undefined;
let observedElement: Element | undefined;

beforeEach(() => {
  resizeCallback = undefined;
  observedElement = undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
      observe(element: Element) {
        observedElement = element;
      }
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function reportWidth(width: number) {
  if (!observedElement) {
    throw new Error('Chart did not subscribe to ResizeObserver');
  }
  act(() => {
    resizeCallback?.(
      [
        {
          target: observedElement,
          contentRect: {width},
        } as unknown as ResizeObserverEntry,
      ],
      {} as ResizeObserver,
    );
  });
}

describe('Chart accessible name', () => {
  it('exposes the svg as a named image with a default label', () => {
    render(
      <Chart
        data={data}
        xKey="month"
        series={[bar('revenue'), bar('profit')]}
      />,
    );
    reportWidth(600);

    expect(
      screen.getByRole('img', {name: 'Chart of revenue and profit by month'}),
    ).toBeInTheDocument();
  });

  it('ignores xDomain for a categorical x-axis', () => {
    const {container} = render(
      <Chart
        data={data}
        xKey="month"
        series={[bar('revenue')]}
        xDomain={[0, 10]}
      />,
    );
    reportWidth(600);

    // xDomain is documented as ignored for band scales: the categories must
    // still drive the axis and the bars must still render.
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Mar')).toBeInTheDocument();
    const plot = container.querySelector('g[clip-path]');
    expect(plot).not.toBeNull();
    const bars = Array.from(plot!.querySelectorAll('path'));
    expect(bars).toHaveLength(3);
    for (const path of bars) {
      expect(path.getAttribute('d')).not.toContain('NaN');
    }
  });

  it('keeps xDomain as a linear window for Date and numeric-string x', () => {
    const start = Date.UTC(2026, 0, 1);
    const hour = 60 * 60 * 1000;
    for (const toX of [
      (ms: number) => new Date(ms),
      (ms: number) => String(ms),
    ]) {
      const {xScale} = computeLayout({
        data: [
          {t: toX(start), v: 1},
          {t: toX(start + hour), v: 2},
          {t: toX(start + 3 * hour), v: 3},
        ],
        xKey: 't',
        series: [line('v')],
        width: 600,
        height: 300,
        xDomain: [start, start + 3 * hour],
      });
      // A band scale would space the readings evenly; the window places
      // them by time.
      expect('bandwidth' in xScale).toBe(false);
      expect((xScale as (value: number) => number)(start + hour)).toBeCloseTo(
        200,
      );
    }
  });

  it('insets a linear x range by the widest mark overhang', () => {
    const data = [
      {i: 0, v: 1},
      {i: 13, v: 2},
    ];
    const rangeFor = (series: Parameters<typeof computeLayout>[0]['series']) =>
      (
        computeLayout({
          data,
          xKey: 'i',
          series,
          width: 600,
          height: 300,
          xDomain: [0, 13],
        }).xScale as {range(): number[]}
      ).range();
    // Without dots nothing draws past the end points.
    expect(rangeFor([line('v')])).toEqual([0, 600]);
    // End dots draw whole inside the clipped plot; the domain stays exact.
    expect(rangeFor([line('v', {dots: true})])).toEqual([3, 597]);
    expect(rangeFor([line('v', {dots: true}), dot('v', {radius: 6})])).toEqual([
      6, 594,
    ]);
  });

  it('prefers the title prop as the accessible name', () => {
    render(
      <Chart
        data={data}
        xKey="month"
        series={[bar('revenue')]}
        title="Quarterly revenue"
      />,
    );
    reportWidth(600);

    expect(
      screen.getByRole('img', {name: 'Quarterly revenue'}),
    ).toBeInTheDocument();
  });

  it('describes the svg from the subtitle and mirrors the title in an svg <title>', () => {
    const {container} = render(
      <Chart
        data={data}
        xKey="month"
        series={[bar('revenue')]}
        title="Quarterly revenue"
        subtitle="Revenue per month"
      />,
    );
    reportWidth(600);

    const svg = container.querySelector('svg')!;
    expect(svg.querySelector('title')!.textContent).toBe('Quarterly revenue');
    const desc = svg.querySelector('desc')!;
    expect(desc.textContent).toBe('Revenue per month');
    expect(svg.getAttribute('aria-describedby')).toBe(desc.id);
  });

  it('localizes the generated name, list, and data-table caption', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        messages={{
          fr: {
            '@astryx.chart.label': {defaultMessage: 'Graphique'},
            '@astryx.chart.labelWithSeries': {
              defaultMessage: 'Graphique de {series} par {xKey}',
            },
            '@astryx.chart.dataTableCaption': {
              defaultMessage: 'Données pour {label}',
            },
          },
        }}>
        <Chart
          data={data}
          xKey="month"
          series={[bar('revenue'), bar('profit')]}
        />
      </InternationalizationProvider>,
    );
    reportWidth(600);

    const label = 'Graphique de revenue et profit par month';
    expect(screen.getByRole('img', {name: label})).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAccessibleName(
      `Données pour ${label}`,
    );
  });
});

describe('Chart data table fallback', () => {
  it('renders a visually hidden table mirroring the data', () => {
    render(
      <Chart
        data={data}
        xKey="month"
        series={[bar('revenue'), bar('profit')]}
      />,
    );
    reportWidth(600);

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    expect(
      screen.getByRole('columnheader', {name: 'month'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', {name: 'revenue'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', {name: 'profit'}),
    ).toBeInTheDocument();

    expect(screen.getByRole('rowheader', {name: 'Feb'})).toBeInTheDocument();
    expect(screen.getByRole('cell', {name: '200'})).toBeInTheDocument();
    expect(screen.getByRole('cell', {name: '40'})).toBeInTheDocument();

    // Visually hidden, but still in the a11y tree.
    const wrapper = table.parentElement as HTMLElement;
    expect(wrapper.getAttribute('class')).toBeTruthy();
    expect(wrapper).not.toHaveAttribute('hidden');
  });

  it('skips the table when the dataset exceeds the size cutoff', () => {
    const big = Array.from({length: 101}, (_, i) => ({
      month: `m${i}`,
      revenue: i,
    }));
    render(<Chart data={big} xKey="month" series={[bar('revenue')]} />);
    reportWidth(600);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  describe('series without a value key', () => {
    const canvasProto = HTMLCanvasElement.prototype;
    let originalGetContext: typeof canvasProto.getContext;
    const svgProto = SVGElement.prototype as unknown as {
      getScreenCTM?: () => unknown;
    };
    let hadGetScreenCTM: boolean;

    beforeEach(() => {
      originalGetContext = canvasProto.getContext;
      canvasProto.getContext = vi.fn(
        () => null,
      ) as unknown as typeof canvasProto.getContext;
      hadGetScreenCTM = 'getScreenCTM' in svgProto;
      if (!hadGetScreenCTM) {
        svgProto.getScreenCTM = () => null;
      }
    });

    afterEach(() => {
      canvasProto.getContext = originalGetContext;
      if (!hadGetScreenCTM) {
        delete svgProto.getScreenCTM;
      }
    });

    const heatmap = () =>
      heatmapGL({
        xKey: 'month',
        yKey: 'month',
        valueKey: 'profit',
        colorRange: ['#ffffff', '#000000'],
      });
    const stream = () => streamGL({color: '#00ff00'});

    it.each([
      ['heatmapGL', heatmap],
      ['streamGL', stream],
    ])('omits the table for a %s-only chart', (_name, makeKeyless) => {
      render(<Chart data={data} xKey="month" series={[makeKeyless()]} />);
      reportWidth(600);

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it.each([
      ['heatmapGL', heatmap],
      ['streamGL', stream],
    ])(
      'keeps %s out of the table columns when rendered beside a bar series',
      (_name, makeKeyless) => {
        render(
          <Chart
            data={data}
            xKey="month"
            series={[bar('revenue'), makeKeyless()]}
          />,
        );
        reportWidth(600);

        const table = screen.getByRole('table');
        expect(
          within(table)
            .getAllByRole('columnheader')
            .map(el => el.textContent),
        ).toEqual(['month', 'revenue']);
        expect(
          within(table)
            .getAllByRole('cell')
            .map(el => el.textContent),
        ).toEqual(['100', '200', '150']);
      },
    );
  });
});

describe('Chart data table empty values', () => {
  const englishCatalog = JSON.parse(
    readFileSync(join(__dirname, '../../core/locales/en.json'), 'utf8'),
  ) as Record<string, {defaultMessage: string}>;
  const NO_DATA = englishCatalog['@astryx.chart.noData'].defaultMessage;

  const tableText = () =>
    within(screen.getByRole('table'))
      .getAllByRole('row')
      .map(row =>
        Array.from(row.querySelectorAll('th, td')).map(
          cell => cell.textContent,
        ),
      );

  it('shows the catalog phrase for empty cells and row headers', () => {
    render(
      <Chart
        data={[
          {month: 'Jan', revenue: 100, profit: Number.NaN},
          {month: 'Feb', revenue: null, profit: 40},
          {month: 'Mar', revenue: 150},
          {month: null, revenue: Number.POSITIVE_INFINITY, profit: 0},
          {month: 'May', revenue: '', profit: 30},
        ]}
        xKey="month"
        series={[bar('revenue'), bar('profit')]}
      />,
    );
    reportWidth(600);

    expect(tableText()).toEqual([
      ['month', 'revenue', 'profit'],
      ['Jan', '100', 'NaN'],
      ['Feb', NO_DATA, '40'],
      ['Mar', '150', NO_DATA],
      [NO_DATA, 'Infinity', '0'],
      ['May', '', '30'],
    ]);
  });

  it('translates the phrase for the provider locale', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        messages={{
          fr: {'@astryx.chart.noData': {defaultMessage: 'Aucune donnée'}},
        }}>
        <Chart
          data={[
            {month: 'Jan', revenue: 100},
            {month: 'Feb', revenue: null},
          ]}
          xKey="month"
          series={[bar('revenue')]}
        />
      </InternationalizationProvider>,
    );
    reportWidth(600);

    expect(tableText()).toEqual([
      ['month', 'revenue'],
      ['Jan', '100'],
      ['Feb', 'Aucune donnée'],
    ]);
  });
});

describe('Chart measurement gate', () => {
  it('renders only an empty height-reserving placeholder until the container reports a width', () => {
    const {container} = render(
      <Chart data={data} xKey="month" series={[bar('revenue')]} height={300} />,
    );

    expect(container.querySelector('svg')).toBeNull();
    const placeholder = container.firstElementChild as HTMLElement;
    expect(placeholder.tagName).toBe('DIV');
    expect(placeholder.style.height).toBe('300px');
    expect(placeholder.childElementCount).toBe(0);
  });
});

describe('Chart root contract', () => {
  it('forwards DOM props and the ref to the root container', () => {
    const ref = createRef<HTMLDivElement>();
    const onClick = vi.fn();

    render(
      <Chart
        ref={ref}
        data-testid="chart-root"
        className="consumer-chart"
        style={{maxWidth: 480}}
        onClick={onClick}
        data={data}
        xKey="month"
        series={[bar('revenue')]}
      />,
    );
    reportWidth(600);

    const root = screen.getByTestId('chart-root');
    expect(ref.current).toBe(root);
    expect(root).toHaveClass('consumer-chart');
    expect(root).toHaveStyle({maxWidth: '480px'});

    fireEvent.click(root);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('Chart render delegation', () => {
  it('renders one clipped group per series', () => {
    const {container} = render(
      <Chart
        data={data}
        xKey="month"
        series={[bar('revenue'), line('profit')]}
      />,
    );
    reportWidth(600);

    const plot = container.querySelector('g[clip-path]');
    expect(plot).not.toBeNull();
    const seriesGroups = Array.from(plot!.children).filter(
      el => el.tagName === 'g',
    );
    expect(seriesGroups).toHaveLength(2);
    // Each series' render() output lands in its own group: bar paths in the
    // first, the line's stroke path in the second.
    expect(seriesGroups[0].querySelectorAll('path').length).toBeGreaterThan(0);
    expect(seriesGroups[1].querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('sizes the transparent event-capture rect to the plot area inside the default margins', () => {
    const {container} = render(
      <Chart data={data} xKey="month" series={[bar('revenue')]} height={300} />,
    );
    reportWidth(600);

    // 600 - 48 (left) - 24 (right) = 528; 300 - 24 (top) - 32 (bottom) = 244.
    const eventRect = container.querySelector(
      'svg > g > rect[fill="transparent"]',
    );
    expect(eventRect).not.toBeNull();
    expect(eventRect).toHaveAttribute('width', '528');
    expect(eventRect).toHaveAttribute('height', '244');
  });

  it('assigns distinct palette colors to series that do not declare one', () => {
    const {container} = render(
      <Chart
        data={data}
        xKey="month"
        series={[line('revenue'), line('profit')]}
      />,
    );
    reportWidth(600);

    const strokes = Array.from(
      container.querySelectorAll('g[clip-path] path[stroke]'),
    ).map(p => p.getAttribute('stroke'));
    expect(strokes).toHaveLength(2);
    expect(strokes[0]).toBeTruthy();
    expect(strokes[1]).toBeTruthy();
    expect(strokes[0]).not.toBe(strokes[1]);
  });
});

describe('Chart legend slot', () => {
  it('derives legend items from series labels when legend is enabled', () => {
    render(
      <Chart
        data={data}
        xKey="month"
        series={[bar('revenue', {label: 'Revenue'}), line('profit')]}
        legend
      />,
    );
    reportWidth(600);

    const list = screen.getByRole('list', {name: 'Chart legend'});
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Revenue')).toBeInTheDocument();
    // Label falls back to the dataKey when not provided.
    expect(within(rows[1]).getByText('profit')).toBeInTheDocument();
  });
});

describe('Chart tooltip slot', () => {
  it('mounts the grouped tooltip portal only when tooltip is enabled', () => {
    const {unmount} = render(
      <Chart data={data} xKey="month" series={[bar('revenue')]} />,
    );
    reportWidth(600);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    unmount();

    render(
      <Chart data={data} xKey="month" series={[bar('revenue')]} tooltip />,
    );
    reportWidth(600);
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  });
});
