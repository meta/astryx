// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadialGrid.test.tsx
 * @input RadialGrid inside a spider-mode RadialChart (600x400 → cx=300,
 *   cy=200, outerRadius=160)
 * @output Render-smoke coverage: ring polygon count, axis line count,
 *   ring/line geometry, pie-mode guard
 * @position Colocated test for RadialGrid.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {RadialChart} from './RadialChart';
import {RadialGrid} from './RadialGrid';

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

describe('RadialGrid', () => {
  it('renders one concentric ring polygon per ring', () => {
    const {container} = renderSpider(<RadialGrid rings={4} />);

    expect(container.querySelectorAll('polygon')).toHaveLength(4);
  });

  it('defaults to five rings', () => {
    const {container} = renderSpider(<RadialGrid />);

    expect(container.querySelectorAll('polygon')).toHaveLength(5);
  });

  it('gives each ring one vertex per axis', () => {
    const {container} = renderSpider(<RadialGrid />);

    for (const polygon of container.querySelectorAll('polygon')) {
      const pairs = (polygon.getAttribute('points') ?? '').split(' ');
      expect(pairs).toHaveLength(3);
    }
  });

  it('draws the outermost ring at the outer radius', () => {
    const {container} = renderSpider(<RadialGrid />);

    const polygons = container.querySelectorAll('polygon');
    const outer = polygons[polygons.length - 1];
    // First vertex is the top axis at full radius: (cx, cy - 160) = (300, 40).
    const [x, y] = (outer.getAttribute('points') ?? '')
      .split(' ')[0]
      .split(',')
      .map(parseFloat);
    expect(x).toBeCloseTo(300, 6);
    expect(y).toBeCloseTo(40, 6);
  });

  it('draws one axis line per axis from the center to the outer radius', () => {
    const {container} = renderSpider(<RadialGrid />);

    const lines = container.querySelectorAll('line');
    expect(lines).toHaveLength(3);

    // Top axis line: center (300, 200) to top vertex (300, 40).
    const top = lines[0];
    expect(parseFloat(top.getAttribute('x1') ?? '')).toBeCloseTo(300, 6);
    expect(parseFloat(top.getAttribute('y1') ?? '')).toBeCloseTo(200, 6);
    expect(parseFloat(top.getAttribute('x2') ?? '')).toBeCloseTo(300, 6);
    expect(parseFloat(top.getAttribute('y2') ?? '')).toBeCloseTo(40, 6);
  });

  it('renders nothing inside a pie-mode chart', () => {
    const {container} = render(
      <RadialChart data={spiderData} valueKey="speed" labelKey="model">
        <RadialGrid />
      </RadialChart>,
    );
    reportWidth(600);

    expect(container.querySelector('polygon')).toBeNull();
    expect(container.querySelector('line')).toBeNull();
  });
});
