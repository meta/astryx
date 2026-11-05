// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadialAxis.test.tsx
 * @input RadialAxis inside a spider-mode RadialChart (600x400 → cx=300,
 *   cy=200, outerRadius=160); three axes at -90/30/150 degrees
 * @output Render-smoke coverage: one label per axis, position-derived text
 *   anchors, label offset geometry, pie-mode guard
 * @position Colocated test for RadialAxis.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, within, act} from '@testing-library/react';
import {RadialChart} from './RadialChart';
import {RadialAxis} from './RadialAxis';

const spiderData = [
  {model: 'A', speed: 10, handling: 5, comfort: 8},
  {model: 'B', speed: 5, handling: 10, comfort: 4},
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

function renderSpider(children: React.ReactNode) {
  const {container} = render(
    <RadialChart data={spiderData} axes={['speed', 'handling', 'comfort']}>
      {children}
    </RadialChart>,
  );
  reportWidth(600);
  // Scope label queries to the svg: RadialChart also renders a visually
  // hidden data table whose column headers repeat the axis keys (#4382), so
  // an unscoped getByText('speed') would match two nodes.
  const svg = within(screen.getByRole('img'));
  return {container, svg};
}

describe('RadialAxis', () => {
  it('renders one label per axis, named after the axis key', () => {
    const {container, svg} = renderSpider(<RadialAxis />);

    expect(container.querySelectorAll('text')).toHaveLength(3);
    expect(svg.getByText('speed')).toBeInTheDocument();
    expect(svg.getByText('handling')).toBeInTheDocument();
    expect(svg.getByText('comfort')).toBeInTheDocument();
  });

  it('anchors labels by their side of the chart: top=middle, right=start, left=end', () => {
    const {svg} = renderSpider(<RadialAxis />);

    // Axes start at the top (-90 degrees) and step clockwise by 120 degrees:
    // speed at -90 (top), handling at 30 (right), comfort at 150 (left).
    expect(svg.getByText('speed')).toHaveAttribute('text-anchor', 'middle');
    expect(svg.getByText('handling')).toHaveAttribute('text-anchor', 'start');
    expect(svg.getByText('comfort')).toHaveAttribute('text-anchor', 'end');
  });

  it('positions labels labelOffset px beyond the outer radius', () => {
    const {svg} = renderSpider(<RadialAxis labelOffset={16} />);

    // Top axis: y = cy - (radius + 16) = 200 - 176 = 24, x = cx = 300.
    const top = svg.getByText('speed');
    expect(parseFloat(top.getAttribute('x') ?? '')).toBeCloseTo(300, 6);
    expect(parseFloat(top.getAttribute('y') ?? '')).toBeCloseTo(24, 6);
  });

  it('renders nothing inside a pie-mode chart', () => {
    const {container} = render(
      <RadialChart data={spiderData} valueKey="speed" labelKey="model">
        <RadialAxis />
      </RadialChart>,
    );
    reportWidth(600);

    expect(container.querySelector('text')).toBeNull();
  });
});
