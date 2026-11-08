// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ThreeDScatter.test.tsx
 * @input ThreeDScatter inside a ThreeDChart at 600x400 with the default
 *   camera (azimuth 35, elevation 25)
 * @output Render-smoke coverage: one circle per datum, color, and the
 *   painter's-algorithm depth sort (radius grows with depth, so DOM order
 *   must be strictly increasing in radius for this dataset)
 * @position Colocated test for ThreeDScatter.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {ThreeDChart} from './ThreeDChart';
import {ThreeDScatter} from './ThreeDScatter';

// Chosen so that data order is NOT depth order under the default camera:
// depths are roughly -0.32, +0.32, -0.16 — sorted order is rows 0, 2, 1.
const data = [
  {x: 0, y: 0, z: 0},
  {x: 2, y: 2, z: 2},
  {x: 1, y: 2, z: 0},
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

function renderScatter(children: React.ReactNode) {
  const result = render(
    <ThreeDChart data={data} xKey="x" yKey="y" zKey="z">
      {children}
    </ThreeDChart>,
  );
  reportWidth(600);
  return result;
}

describe('ThreeDScatter', () => {
  it('renders one circle per datum with the given color', () => {
    const {container} = renderScatter(<ThreeDScatter color="#ff0000" />);

    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(3);
    for (const circle of circles) {
      expect(circle).toHaveAttribute('fill', '#ff0000');
      expect(parseFloat(circle.getAttribute('cx') ?? '')).not.toBeNaN();
      expect(parseFloat(circle.getAttribute('cy') ?? '')).not.toBeNaN();
    }
  });

  it('draws far points first: DOM order is sorted by depth (radius ascends)', () => {
    const {container} = renderScatter(<ThreeDScatter color="#ff0000" />);

    // r = radius * (0.75 + (depth + 0.5) * 0.25) grows monotonically with
    // depth, and this dataset's data order is not its depth order — an
    // unsorted render would fail this.
    const rs = Array.from(container.querySelectorAll('circle'), c =>
      parseFloat(c.getAttribute('r') ?? ''),
    );
    expect(rs).toHaveLength(3);
    expect(rs[0]).toBeLessThan(rs[1]);
    expect(rs[1]).toBeLessThan(rs[2]);
  });

  it('scales circle radius and opacity from the radius and opacity props', () => {
    const {container} = renderScatter(
      <ThreeDScatter color="#ff0000" radius={10} opacity={0.5} />,
    );

    for (const circle of container.querySelectorAll('circle')) {
      // depthFactor is in (0.5, 1], so r <= radius and opacity <= 0.5.
      const r = parseFloat(circle.getAttribute('r') ?? '');
      const fillOpacity = parseFloat(circle.getAttribute('fill-opacity') ?? '');
      expect(r).toBeGreaterThan(5);
      expect(r).toBeLessThanOrEqual(10);
      expect(fillOpacity).toBeGreaterThan(0.25);
      expect(fillOpacity).toBeLessThanOrEqual(0.5);
    }
  });
});
