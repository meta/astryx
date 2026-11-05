// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ThreeDSurface.test.tsx
 * @input ThreeDSurface inside a ThreeDChart at 600x400; grid datasets built
 *   from distinct x/z values
 * @output Render-smoke coverage: quad-face triangulation counts, four
 *   corners per face, color ramp fill, wireframe mode, degenerate-grid and
 *   missing-cell guards
 * @position Colocated test for ThreeDSurface.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {ThreeDChart} from './ThreeDChart';
import {ThreeDSurface} from './ThreeDSurface';

/** Full grid over x, z in {0, 1, 2} — a 3x3 mesh with 4 quad faces. */
const grid3x3: Record<string, number>[] = [];
for (const x of [0, 1, 2]) {
  for (const z of [0, 1, 2]) {
    grid3x3.push({x, y: x + z, z});
  }
}

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

function renderSurface(
  data: Record<string, number>[],
  children: React.ReactNode,
) {
  const result = render(
    <ThreeDChart data={data} xKey="x" yKey="y" zKey="z">
      {children}
    </ThreeDChart>,
  );
  reportWidth(600);
  return result;
}

describe('ThreeDSurface', () => {
  it('triangulates a 3x3 grid into four quad faces', () => {
    const {container} = renderSurface(
      grid3x3,
      <ThreeDSurface colorRange={['#336699']} />,
    );

    const polygons = container.querySelectorAll('polygon');
    expect(polygons).toHaveLength(4);
    for (const polygon of polygons) {
      const pairs = (polygon.getAttribute('points') ?? '').split(' ');
      expect(pairs).toHaveLength(4);
    }
  });

  it('triangulates a 2x2 grid into a single face', () => {
    const data = [
      {x: 0, y: 0, z: 0},
      {x: 1, y: 1, z: 0},
      {x: 0, y: 1, z: 1},
      {x: 1, y: 2, z: 1},
    ];
    const {container} = renderSurface(
      data,
      <ThreeDSurface colorRange={['#336699']} />,
    );

    expect(container.querySelectorAll('polygon')).toHaveLength(1);
  });

  it('fills faces from the color ramp', () => {
    const {container} = renderSurface(
      grid3x3,
      <ThreeDSurface colorRange={['#336699']} />,
    );

    for (const polygon of container.querySelectorAll('polygon')) {
      expect(polygon).toHaveAttribute('fill', '#336699');
    }
  });

  it('picks the nearest ramp color by face height', () => {
    // Face heights (normalized avg y over yDomain [0,4]): 0.25, 0.5, 0.5,
    // 0.75 → with a 2-stop ramp, 0.25 snaps to the low color, the rest high.
    const {container} = renderSurface(
      grid3x3,
      <ThreeDSurface colorRange={['#aaaaaa', '#bbbbbb']} />,
    );

    const fills = Array.from(container.querySelectorAll('polygon'), p =>
      p.getAttribute('fill'),
    );
    expect(fills.filter(f => f === '#aaaaaa')).toHaveLength(1);
    expect(fills.filter(f => f === '#bbbbbb')).toHaveLength(3);
  });

  it('draws unfilled outlines in wireframe mode', () => {
    const {container} = renderSurface(
      grid3x3,
      <ThreeDSurface colorRange={['#336699']} wireframe />,
    );

    const polygons = container.querySelectorAll('polygon');
    expect(polygons).toHaveLength(4);
    for (const polygon of polygons) {
      expect(polygon).toHaveAttribute('fill', 'none');
      expect(polygon).toHaveAttribute('stroke', '#336699');
    }
  });

  it('renders nothing when the data has fewer than two distinct z values', () => {
    const flat = [
      {x: 0, y: 1, z: 0},
      {x: 1, y: 2, z: 0},
      {x: 2, y: 1, z: 0},
    ];
    const {container} = renderSurface(
      flat,
      <ThreeDSurface colorRange={['#336699']} />,
    );

    expect(container.querySelector('polygon')).toBeNull();
  });

  it('skips faces with a missing grid cell', () => {
    const holed = grid3x3.filter(d => !(d.x === 2 && d.z === 2));
    const {container} = renderSurface(
      holed,
      <ThreeDSurface colorRange={['#336699']} />,
    );

    // Only the face touching the missing (2,2) corner is dropped.
    expect(container.querySelectorAll('polygon')).toHaveLength(3);
  });
});
