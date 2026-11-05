// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadialArea.test.tsx
 * @input RadialArea inside a spider-mode RadialChart (600x400 → cx=300,
 *   cy=200, outerRadius=160); axis domains are floored at 0
 * @output Render-smoke coverage: polygon per selected row, value-to-radius
 *   mapping, row selection by dataKey, first-row fallback, vertex dots,
 *   pie-mode guard
 * @position Colocated test for RadialArea.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {RadialChart} from './RadialChart';
import {RadialArea} from './RadialArea';

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
  const result = render(
    <RadialChart data={spiderData} axes={['speed', 'handling', 'comfort']}>
      {children}
    </RadialChart>,
  );
  reportWidth(600);
  return result;
}

/** Parse a polygon's points attribute into [x, y] pairs. */
function parsePoints(polygon: Element): number[][] {
  return (polygon.getAttribute('points') ?? '')
    .split(' ')
    .map(pair => pair.split(',').map(parseFloat));
}

describe('RadialArea', () => {
  it('renders a single polygon with one vertex per axis', () => {
    const {container} = renderSpider(
      <RadialArea dataKey="A" color="#ff0000" />,
    );

    const polygons = container.querySelectorAll('polygon');
    expect(polygons).toHaveLength(1);
    expect(parsePoints(polygons[0])).toHaveLength(3);
    expect(polygons[0]).toHaveAttribute('fill', '#ff0000');
  });

  it('maps the axis maximum to the outer radius', () => {
    const {container} = renderSpider(
      <RadialArea dataKey="A" color="#ff0000" />,
    );

    // Row A has the speed max (10); domain [0, 10] → t=1 → r=160.
    // Top axis vertex: (300, 200 - 160) = (300, 40).
    const [first] = parsePoints(container.querySelector('polygon')!);
    expect(first[0]).toBeCloseTo(300, 6);
    expect(first[1]).toBeCloseTo(40, 6);
  });

  it('selects the row whose fields contain the dataKey value', () => {
    const {container} = renderSpider(
      <RadialArea dataKey="B" color="#ff0000" />,
    );

    // Row B: speed 5 in domain [0, 10] → t=0.5 → r=80 → (300, 120).
    const [first] = parsePoints(container.querySelector('polygon')!);
    expect(first[0]).toBeCloseTo(300, 6);
    expect(first[1]).toBeCloseTo(120, 6);
  });

  it('falls back to the first row when no field matches the dataKey', () => {
    const {container} = renderSpider(
      <RadialArea dataKey="does-not-exist" color="#ff0000" />,
    );

    // Falls back to row A → top vertex at the outer radius.
    const [first] = parsePoints(container.querySelector('polygon')!);
    expect(first[1]).toBeCloseTo(40, 6);
  });

  it('renders a dot at each vertex when dots is set', () => {
    const {container} = renderSpider(
      <RadialArea dataKey="A" color="#ff0000" dots dotRadius={6} />,
    );

    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(3);
    for (const circle of circles) {
      expect(circle).toHaveAttribute('r', '6');
      expect(circle).toHaveAttribute('fill', '#ff0000');
    }
  });

  it('renders no dots by default', () => {
    const {container} = renderSpider(
      <RadialArea dataKey="A" color="#ff0000" />,
    );

    expect(container.querySelector('circle')).toBeNull();
  });

  it('renders nothing when the chart has no data', () => {
    const {container} = render(
      <RadialChart data={[]} axes={['speed', 'handling', 'comfort']}>
        <RadialArea dataKey="A" color="#ff0000" />
      </RadialChart>,
    );
    reportWidth(600);

    expect(container.querySelector('polygon')).toBeNull();
  });

  it('renders nothing inside a pie-mode chart', () => {
    const {container} = render(
      <RadialChart data={spiderData} valueKey="speed" labelKey="model">
        <RadialArea dataKey="A" color="#ff0000" />
      </RadialChart>,
    );
    reportWidth(600);

    expect(container.querySelector('polygon')).toBeNull();
  });
});
