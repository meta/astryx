// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadialSlice.test.tsx
 * @input RadialSlice inside a pie-mode RadialChart (600x400 → cx=300, cy=200,
 *   outerRadius=160)
 * @output Render-smoke coverage: one path per datum, color cycling, pie vs
 *   donut arc paths, percentage labels + threshold, empty/spider guards
 * @position Colocated test for RadialSlice.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import {RadialChart} from './RadialChart';
import {RadialSlice} from './RadialSlice';

const pieData = [
  {region: 'NA', revenue: 500},
  {region: 'EU', revenue: 300},
  {region: 'APAC', revenue: 200},
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

function renderPie(ui: React.ReactElement) {
  const result = render(ui);
  reportWidth(600);
  return result;
}

/** Count SVG arc commands in a path's `d` attribute. */
function arcCommandCount(d: string): number {
  return d.split('A ').length - 1;
}

describe('RadialSlice', () => {
  it('renders one path per datum, filled with the given colors in data order', () => {
    const {container} = renderPie(
      <RadialChart data={pieData} valueKey="revenue" labelKey="region">
        <RadialSlice colors={['#111111', '#222222', '#333333']} />
      </RadialChart>,
    );

    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(3);
    expect(paths[0]).toHaveAttribute('fill', '#111111');
    expect(paths[1]).toHaveAttribute('fill', '#222222');
    expect(paths[2]).toHaveAttribute('fill', '#333333');
  });

  it('cycles colors when there are more slices than colors', () => {
    const {container} = renderPie(
      <RadialChart data={pieData} valueKey="revenue" labelKey="region">
        <RadialSlice colors={['#111111', '#222222']} />
      </RadialChart>,
    );

    const paths = container.querySelectorAll('path');
    expect(paths[2]).toHaveAttribute('fill', '#111111');
  });

  it('draws pie slices as single arcs anchored at the chart center', () => {
    const {container} = renderPie(
      <RadialChart data={pieData} valueKey="revenue" labelKey="region">
        <RadialSlice colors={['#111111']} />
      </RadialChart>,
    );

    for (const path of container.querySelectorAll('path')) {
      const d = path.getAttribute('d') ?? '';
      // Pie slices start at the center (cx=300, cy=200) and use one arc.
      expect(d.startsWith('M 300 200')).toBe(true);
      expect(arcCommandCount(d)).toBe(1);
    }
  });

  it('draws donut slices as annular sectors with an inner and outer arc', () => {
    const {container} = renderPie(
      <RadialChart
        data={pieData}
        valueKey="revenue"
        labelKey="region"
        innerRadius={0.6}>
        <RadialSlice colors={['#111111']} />
      </RadialChart>,
    );

    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(3);
    for (const path of paths) {
      const d = path.getAttribute('d') ?? '';
      expect(d.startsWith('M 300 200')).toBe(false);
      expect(arcCommandCount(d)).toBe(2);
    }
  });

  it('drops the hairline separator stroke when cornerRadius is set', () => {
    const {container} = renderPie(
      <RadialChart data={pieData} valueKey="revenue" labelKey="region">
        <RadialSlice colors={['#111111']} cornerRadius={4} />
      </RadialChart>,
    );

    for (const path of container.querySelectorAll('path')) {
      expect(path).toHaveAttribute('stroke-width', '0');
    }
  });

  it('separates slices with a 1px surface-colored stroke by default', () => {
    const {container} = renderPie(
      <RadialChart data={pieData} valueKey="revenue" labelKey="region">
        <RadialSlice colors={['#111111']} />
      </RadialChart>,
    );

    for (const path of container.querySelectorAll('path')) {
      expect(path).toHaveAttribute('stroke-width', '1');
    }
  });

  it('labels each slice with its rounded percentage of the total', () => {
    renderPie(
      <RadialChart data={pieData} valueKey="revenue" labelKey="region">
        <RadialSlice colors={['#111111']} />
      </RadialChart>,
    );

    // 500/300/200 out of 1000.
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
  });

  it('hides labels for slices below the label threshold', () => {
    renderPie(
      <RadialChart
        data={[
          {region: 'big', revenue: 97},
          {region: 'tiny', revenue: 3},
        ]}
        valueKey="revenue"
        labelKey="region">
        <RadialSlice colors={['#111111']} />
      </RadialChart>,
    );

    expect(screen.getByText('97%')).toBeInTheDocument();
    // 3% is below the default 5% threshold.
    expect(screen.queryByText('3%')).not.toBeInTheDocument();
  });

  it('renders nothing when every value is zero', () => {
    const {container} = renderPie(
      <RadialChart
        data={[
          {region: 'a', revenue: 0},
          {region: 'b', revenue: 0},
        ]}
        valueKey="revenue"
        labelKey="region">
        <RadialSlice colors={['#111111']} />
      </RadialChart>,
    );

    expect(container.querySelector('path')).toBeNull();
  });

  it('renders nothing inside a spider-mode chart', () => {
    const {container} = renderPie(
      <RadialChart data={pieData} axes={['revenue']}>
        <RadialSlice colors={['#111111']} />
      </RadialChart>,
    );

    expect(container.querySelector('path')).toBeNull();
  });
});
