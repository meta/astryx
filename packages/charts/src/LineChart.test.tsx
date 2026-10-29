// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LineChart.test.tsx
 * @input Uses vitest, @testing-library/react, LineChart
 * @output Unit tests for LineChart composition — accessible name, legend
 *         defaults, series labels, and root DOM/ref passthrough
 * @position Testing; validates LineChart.tsx composed defaults
 */

import {createRef} from 'react';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, act, within} from '@testing-library/react';
import {LineChart} from './LineChart';

const data = [
  {month: 'Jan', revenue: 100, trend: 90},
  {month: 'Feb', revenue: 200, trend: 150},
  {month: 'Mar', revenue: 150, trend: 140},
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
    throw new Error('LineChart did not subscribe to ResizeObserver');
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

describe('LineChart accessible name', () => {
  it('prefers the title prop as the accessible name', () => {
    render(
      <LineChart
        data={data}
        xKey="month"
        yKeys={['revenue', 'trend']}
        title="Revenue vs trend"
      />,
    );
    reportWidth(600);

    expect(
      screen.getByRole('img', {name: 'Revenue vs trend'}),
    ).toBeInTheDocument();
  });

  it('derives a default name from the series labels', () => {
    render(<LineChart data={data} xKey="month" yKeys={['revenue']} />);
    reportWidth(600);

    expect(
      screen.getByRole('img', {name: 'Chart of revenue by month'}),
    ).toBeInTheDocument();
  });
});

describe('LineChart series composition', () => {
  it('shows a legend entry per series when more than one y key is given', () => {
    render(<LineChart data={data} xKey="month" yKeys={['revenue', 'trend']} />);
    reportWidth(600);

    expect(
      within(screen.getByRole('list')).getByText('revenue'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list')).getByText('trend'),
    ).toBeInTheDocument();
  });

  it('omits the legend for a single series by default', () => {
    render(<LineChart data={data} xKey="month" yKeys={['revenue']} />);
    reportWidth(600);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('uses custom labels for legend entries', () => {
    render(
      <LineChart
        data={data}
        xKey="month"
        yKeys={['revenue', 'trend']}
        labels={{revenue: 'Revenue', trend: 'Trend'}}
      />,
    );
    reportWidth(600);

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Trend')).toBeInTheDocument();
  });

  it('renders dots and custom stroke variants without crashing', () => {
    render(
      <LineChart
        data={data}
        xKey="month"
        yKeys={['revenue']}
        dots
        strokeWidth={3}
        curve="step"
        title="Stepped revenue"
      />,
    );
    reportWidth(600);

    expect(
      screen.getByRole('img', {name: 'Stepped revenue'}),
    ).toBeInTheDocument();
  });

  it('hides the legend when legend is false', () => {
    render(
      <LineChart
        data={data}
        xKey="month"
        yKeys={['revenue', 'trend']}
        legend={false}
      />,
    );
    reportWidth(600);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('LineChart root passthrough', () => {
  it('forwards the ref to the root chart container', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <LineChart data={data} xKey="month" yKeys={['revenue']} ref={ref} />,
    );
    reportWidth(600);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
