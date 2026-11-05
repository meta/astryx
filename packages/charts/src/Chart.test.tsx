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

import {createRef} from 'react';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, act, within, fireEvent} from '@testing-library/react';
import {Chart} from './Chart';
import {bar, line} from './marks';
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
