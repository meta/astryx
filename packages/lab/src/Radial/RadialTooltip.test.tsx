// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadialTooltip.test.tsx
 * @input RadialTooltip inside pie- and spider-mode RadialCharts (600x400 →
 *   outerRadius=160)
 * @output Mount smoke coverage only: the pointer pipeline needs
 *   createSVGPoint/getScreenCTM, which jsdom does not implement, so hover
 *   behavior is not exercised here. Asserts the event-capture circle mounts.
 * @position Colocated test for RadialTooltip.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
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
