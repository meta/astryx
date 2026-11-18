// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadialTooltip.test.tsx
 * @input RadialTooltip inside pie- and spider-mode RadialCharts (600x400 →
 *   outerRadius=160)
 * @output Mount and pointer interaction coverage with stubbed SVG coordinate
 *   APIs; native touch scrolling requires browser evidence.
 * @position Colocated test for RadialTooltip.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';
import {RadialChart} from './RadialChart';
import {RadialSlice} from './RadialSlice';
import {RadialTooltip} from './RadialTooltip';

const pieData = [
  {region: 'NA', revenue: 500},
  {region: 'EU', revenue: 300},
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

function tooltipChart(interactive?: boolean) {
  return (
    <RadialChart
      data={pieData}
      valueKey="revenue"
      labelKey="region"
      interactive={interactive}>
      <RadialSlice colors={['#111111', '#222222']} />
      <RadialTooltip
        render={datum => (
          <span data-testid="tooltip-datum">
            {datum.label}: {datum.value}
          </span>
        )}
      />
    </RadialChart>
  );
}

function preparePointerTarget(container: HTMLElement) {
  reportWidth(600);
  const svg = container.querySelector('svg');
  const capture = container.querySelector('circle[fill="transparent"]');
  if (!svg || !capture) {
    throw new Error('Expected a measured chart with a tooltip target');
  }

  // jsdom has no SVG coordinate transforms; use screen coordinates as SVG units.
  Object.defineProperties(svg, {
    createSVGPoint: {
      value: () => ({
        x: 0,
        y: 0,
        matrixTransform() {
          return {x: this.x, y: this.y};
        },
      }),
    },
    getScreenCTM: {value: () => ({inverse: () => ({})})},
  });
  return capture;
}

const firstSlice = {clientX: 400, clientY: 200};
const secondSlice = {clientX: 200, clientY: 200};

function expectIgnoredTouch(capture: Element) {
  const pointerType = 'touch';
  expect(
    fireEvent.pointerDown(capture, {
      ...firstSlice,
      pointerType,
      cancelable: true,
    }),
  ).toBe(true);
  expect(screen.queryByTestId('tooltip-datum')).not.toBeInTheDocument();
  fireEvent.pointerMove(capture, {...secondSlice, pointerType});
  expect(screen.queryByTestId('tooltip-datum')).not.toBeInTheDocument();
  fireEvent.pointerUp(capture, {pointerType});
}

describe('RadialTooltip', () => {
  it('mounts in a pie-mode chart and renders the event-capture circle', () => {
    const {container} = render(
      <RadialChart data={pieData} valueKey="revenue" labelKey="region">
        <RadialSlice colors={['#111111', '#222222']} />
        <RadialTooltip />
      </RadialChart>,
    );
    reportWidth(600);

    // Capture circle covers the chart: r = radius + 10 = 170.
    const capture = container.querySelector('circle[fill="transparent"]');
    expect(capture).not.toBeNull();
    expect(capture).toHaveAttribute('r', '170');
  });

  it('leaves touch input alone by default', () => {
    const {container} = render(tooltipChart());
    expectIgnoredTouch(preparePointerTarget(container));
  });

  it('leaves touch input alone when interactive is false', () => {
    const {container} = render(tooltipChart(false));
    expectIgnoredTouch(preparePointerTarget(container));
  });

  it('scrubs with touch only after contact and dismisses on release', () => {
    const {container} = render(tooltipChart(true));
    const capture = preparePointerTarget(container);
    const pointerType = 'touch';

    fireEvent.pointerMove(capture, {...firstSlice, pointerType});
    expect(screen.queryByTestId('tooltip-datum')).not.toBeInTheDocument();
    expect(
      fireEvent.pointerDown(capture, {
        ...firstSlice,
        pointerType,
        cancelable: true,
      }),
    ).toBe(false);
    expect(screen.getByTestId('tooltip-datum')).toHaveTextContent('NA: 500');
    fireEvent.pointerMove(capture, {...secondSlice, pointerType});
    expect(screen.getByTestId('tooltip-datum')).toHaveTextContent('EU: 300');
    fireEvent.pointerUp(capture, {pointerType});
    expect(screen.queryByTestId('tooltip-datum')).not.toBeInTheDocument();
    fireEvent.pointerMove(capture, {...firstSlice, pointerType});
    expect(screen.queryByTestId('tooltip-datum')).not.toBeInTheDocument();
  });

  it('ends an active touch on disable without reviving it on re-enable', () => {
    const {container, rerender} = render(tooltipChart(true));
    const capture = preparePointerTarget(container);
    const pointerType = 'touch';

    fireEvent.pointerDown(capture, {...firstSlice, pointerType});
    expect(screen.getByTestId('tooltip-datum')).toHaveTextContent('NA: 500');
    rerender(tooltipChart(false));
    expect(screen.queryByTestId('tooltip-datum')).not.toBeInTheDocument();
    fireEvent.pointerMove(capture, {...secondSlice, pointerType});
    expect(screen.queryByTestId('tooltip-datum')).not.toBeInTheDocument();

    rerender(tooltipChart(true));
    fireEvent.pointerMove(capture, {...secondSlice, pointerType});
    expect(screen.queryByTestId('tooltip-datum')).not.toBeInTheDocument();
    fireEvent.pointerDown(capture, {...secondSlice, pointerType});
    expect(screen.getByTestId('tooltip-datum')).toHaveTextContent('EU: 300');
    fireEvent.pointerUp(capture, {pointerType});
    expect(screen.queryByTestId('tooltip-datum')).not.toBeInTheDocument();
  });

  it('preserves mouse hover across every interactive setting', () => {
    const {container, rerender} = render(tooltipChart());
    const capture = preparePointerTarget(container);
    const pointerType = 'mouse';
    fireEvent.pointerMove(capture, {...firstSlice, pointerType});

    for (const interactive of [undefined, true, false]) {
      rerender(tooltipChart(interactive));
      expect(screen.getByTestId('tooltip-datum')).toHaveTextContent('NA: 500');
      expect(
        fireEvent.pointerDown(capture, {
          ...firstSlice,
          pointerType,
          cancelable: true,
        }),
      ).toBe(true);
      fireEvent.pointerUp(capture, {pointerType});
      expect(screen.getByTestId('tooltip-datum')).toHaveTextContent('NA: 500');
      fireEvent.pointerMove(capture, {...secondSlice, pointerType});
      expect(screen.getByTestId('tooltip-datum')).toHaveTextContent('EU: 300');
      fireEvent.pointerMove(capture, {...firstSlice, pointerType});
    }
    fireEvent.pointerLeave(capture, {pointerType});
    expect(screen.queryByTestId('tooltip-datum')).not.toBeInTheDocument();
  });

  it('mounts in a spider-mode chart without crashing', () => {
    const {container} = render(
      <RadialChart
        data={[
          {model: 'A', speed: 10, handling: 5},
          {model: 'B', speed: 5, handling: 10},
        ]}
        axes={['speed', 'handling']}>
        <RadialTooltip />
      </RadialChart>,
    );
    reportWidth(600);

    expect(
      container.querySelector('circle[fill="transparent"]'),
    ).not.toBeNull();
  });
});
