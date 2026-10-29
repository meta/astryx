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

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Profit')).toBeInTheDocument();
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

  it('renders stacked and gradient variants without crashing', () => {
    render(
      <AreaChart
        data={data}
        xKey="month"
        yKeys={['revenue', 'profit']}
        stacked
        gradient
        title="Stacked revenue"
      />,
    );
    reportWidth(600);

    expect(
      screen.getByRole('img', {name: 'Stacked revenue'}),
    ).toBeInTheDocument();
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
