// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AreaChart.test.tsx
 * @input Uses vitest, @testing-library/react, AreaChart
 * @output Unit tests for AreaChart composition — accessible name, legend
 *         defaults, series labels, and root DOM/ref passthrough
 * @position Testing; validates AreaChart.tsx composed defaults
 */

import {createRef} from 'react';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, act, within} from '@testing-library/react';
import {AreaChart} from './AreaChart';

const data = [
  {month: 'Jan', revenue: 100, profit: 20},
  {month: 'Feb', revenue: 200, profit: 40},
  {month: 'Mar', revenue: 150, profit: 30},
];

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
    throw new Error('AreaChart did not subscribe to ResizeObserver');
  }
  act(() => {
    resizeCallback?.(
      [
        {
          target: observedElement,
          contentRect: {width},
        } as unknown as ResizeObserverEntry,
      ],
      {} as unknown as ResizeObserver,
    );
  });
}

describe('AreaChart accessible name', () => {
  it('prefers the title prop as the accessible name', () => {
    render(
      <AreaChart
        data={data}
        xKey="month"
        yKeys={['revenue']}
        title="Quarterly revenue"
      />,
    );
    reportWidth(600);

    expect(
      screen.getByRole('img', {name: 'Quarterly revenue'}),
    ).toBeInTheDocument();
  });

  it('derives a default name from the series labels', () => {
    render(<AreaChart data={data} xKey="month" yKeys={['revenue']} />);
    reportWidth(600);

    expect(
      screen.getByRole('img', {name: 'Chart of revenue by month'}),
    ).toBeInTheDocument();
  });
});

describe('AreaChart series composition', () => {
  it('shows a legend entry per series when more than one y key is given', () => {
    render(
      <AreaChart data={data} xKey="month" yKeys={['revenue', 'profit']} />,
    );
    reportWidth(600);

    expect(
      within(screen.getByRole('list')).getByText('revenue'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list')).getByText('profit'),
    ).toBeInTheDocument();
  });

  it('omits the legend for a single series by default', () => {
    render(<AreaChart data={data} xKey="month" yKeys={['revenue']} />);
    reportWidth(600);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('uses custom labels for legend entries', () => {
    render(
      <AreaChart
        data={data}
        xKey="month"
        yKeys={['revenue', 'profit']}
        labels={{revenue: 'Revenue', profit: 'Profit'}}
      />,
    );
    reportWidth(600);

    expect(
      within(screen.getByRole('list')).getByText('Revenue'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list')).getByText('Profit'),
    ).toBeInTheDocument();
  });

  it('accepts a single y key as a string', () => {
    render(
      <AreaChart
        data={data}
        xKey="month"
        yKeys="revenue"
        title="Single string key"
      />,
    );
    reportWidth(600);

    expect(
      screen.getByRole('img', {name: 'Single string key'}),
    ).toBeInTheDocument();
  });

  it('stacks areas on a shared baseline and fades the fill when gradient', () => {
    const {container, rerender} = render(
      <AreaChart
        data={data}
        xKey="month"
        yKeys={['revenue', 'profit']}
        title="Stacked revenue"
      />,
    );
    reportWidth(600);

    expect(
      screen.getByRole('img', {name: 'Stacked revenue'}),
    ).toBeInTheDocument();
    const fills = () =>
      Array.from(container.querySelectorAll('path[fill]:not([fill="none"])'));
    const overlaid = fills().map(path => path.getAttribute('d'));

    rerender(
      <AreaChart
        data={data}
        xKey="month"
        yKeys={['revenue', 'profit']}
        stacked
        gradient
        title="Stacked revenue"
      />,
    );

    const stacked = fills();
    expect(stacked.length).toBeGreaterThan(0);
    expect(
      stacked.every(path =>
        (path.getAttribute('fill') ?? '').startsWith('url(#area-grad-'),
      ),
    ).toBe(true);
    expect(container.querySelector('linearGradient')).not.toBeNull();
    // Stacking lifts the second series onto the first, so the fill geometry
    // differs from the overlaid render.
    expect(stacked.map(path => path.getAttribute('d'))).not.toEqual(overlaid);
  });

  it('gives two charts over the same key their own gradient ids', () => {
    // The file-level observer stub keeps one callback; collect both charts'
    // callbacks here so each chart measures a width and renders its svg.
    const callbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          callbacks.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    render(
      <>
        <AreaChart
          data={data}
          xKey="month"
          yKeys={['revenue']}
          gradient
          title="First revenue"
        />
        <AreaChart
          data={data}
          xKey="month"
          yKeys={['revenue']}
          gradient
          title="Second revenue"
        />
      </>,
    );
    act(() => {
      for (const cb of callbacks) {
        cb(
          [{contentRect: {width: 600}} as unknown as ResizeObserverEntry],
          {} as ResizeObserver,
        );
      }
    });

    const gradients = Array.from(document.querySelectorAll('linearGradient'));
    expect(gradients).toHaveLength(2);
    const ids = gradients.map(g => g.getAttribute('id'));
    expect(new Set(ids).size).toBe(2);
    for (const chart of screen.getAllByRole('img')) {
      const fill =
        chart
          .querySelector('path[fill]:not([fill="none"])')
          ?.getAttribute('fill') ?? '';
      const match = fill.match(/^url\(#(.+)\)$/);
      expect(match).not.toBeNull();
      expect(chart.querySelector(`#${match?.[1]}`)).not.toBeNull();
    }
  });

  it('hides the legend when legend is false', () => {
    render(
      <AreaChart
        data={data}
        xKey="month"
        yKeys={['revenue', 'profit']}
        legend={false}
      />,
    );
    reportWidth(600);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('AreaChart root passthrough', () => {
  it('forwards the ref to the root chart container', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <AreaChart data={data} xKey="month" yKeys={['revenue']} ref={ref} />,
    );
    reportWidth(600);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
