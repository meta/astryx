// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Chart.test.tsx
 * @input Uses vitest, @testing-library/react, Chart component, useChart
 * @output Unit tests for Chart accessibility (WCAG 1.1.1) plus the root's
 *         measurement gate, margin convention, and the useChart context guard
 *         (issue #4295 viz coverage)
 * @position Testing; validates Chart.tsx accessible name + data-table fallback
 *           and ChartContext.ts's outside-provider error
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, renderHook, screen, act} from '@testing-library/react';
import {Chart} from './Chart';
import {useChart} from './ChartContext';

const data = [
  {month: 'Jan', revenue: 100, profit: 20},
  {month: 'Feb', revenue: 200, profit: 40},
  {month: 'Mar', revenue: 150, profit: 30},
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

describe('Chart accessible name', () => {
  it('exposes the svg as a named image with a default label', () => {
    render(
      <Chart data={data} xKey="month" yKeys={['revenue', 'profit']}>
        <g />
      </Chart>,
    );
    reportWidth(600);

    expect(
      screen.getByRole('img', {name: 'Chart of revenue, profit by month'}),
    ).toBeInTheDocument();
  });

  it('uses a custom label when provided', () => {
    render(
      <Chart data={data} xKey="month" yKeys={['revenue']} label="Q1 revenue">
        <g />
      </Chart>,
    );
    reportWidth(600);

    expect(screen.getByRole('img', {name: 'Q1 revenue'})).toBeInTheDocument();
  });
});

describe('Chart data table fallback', () => {
  it('renders a visually hidden table mirroring the data', () => {
    render(
      <Chart data={data} xKey="month" yKeys={['revenue', 'profit']}>
        <g />
      </Chart>,
    );
    reportWidth(600);

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    // Column headers: x key + each y key
    expect(
      screen.getByRole('columnheader', {name: 'month'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', {name: 'revenue'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', {name: 'profit'}),
    ).toBeInTheDocument();

    // Row headers and values
    expect(screen.getByRole('rowheader', {name: 'Feb'})).toBeInTheDocument();
    expect(screen.getByRole('cell', {name: '200'})).toBeInTheDocument();
    expect(screen.getByRole('cell', {name: '40'})).toBeInTheDocument();

    // Visually hidden, but still in the a11y tree (StyleX clip class attached,
    // not display:none/hidden — jsdom does not apply the stylesheet itself).
    const wrapper = table.parentElement as HTMLElement;
    expect(wrapper.getAttribute('class')).toBeTruthy();
    expect(wrapper).not.toHaveAttribute('hidden');
  });

  it('skips the table when the dataset exceeds the size cutoff', () => {
    const big = Array.from({length: 101}, (_, i) => ({
      month: `m${i}`,
      revenue: i,
    }));
    render(
      <Chart data={big} xKey="month" yKeys={['revenue']}>
        <g />
      </Chart>,
    );
    reportWidth(600);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('Chart measurement gate', () => {
  it('renders no svg until the container reports a width', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <circle data-testid="mark" />
      </Chart>,
    );

    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByTestId('mark')).toBeNull();
  });

  it('renders the svg at the reported width and the default height once measured', () => {
    const {container} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <circle data-testid="mark" />
      </Chart>,
    );

    reportWidth(464);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('width', '464');
    expect(svg).toHaveAttribute('height', '300');
  });

  it('renders children inside the margin-translated group', () => {
    render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <circle data-testid="mark" />
      </Chart>,
    );

    reportWidth(464);

    // Default margins: left 48, top 16 (d3 margin convention)
    const mark = screen.getByTestId('mark');
    expect(mark.closest('g')).toHaveAttribute('transform', 'translate(48,16)');
  });
});

describe('Chart container observation', () => {
  it('observes its container while mounted and stops on unmount', () => {
    const observed = new Set<Element>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(element: Element) {
          observed.add(element);
        }
        unobserve(element: Element) {
          observed.delete(element);
        }
        disconnect() {
          observed.clear();
        }
      },
    );
    const {container, unmount} = render(
      <Chart data={data} xKey="month" yKeys={['revenue']}>
        <g />
      </Chart>,
    );
    const chartContainer = container.firstElementChild;
    expect(chartContainer).not.toBeNull();
    expect(observed.has(chartContainer!)).toBe(true);

    unmount();
    expect(observed.size).toBe(0);
  });
});

describe('useChart', () => {
  it('throws a clear error when used outside <Chart>', () => {
    // React reports the uncaught render error via console.error; keep the
    // test output quiet.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useChart())).toThrow(
        'Chart components must be used inside <Chart>',
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
