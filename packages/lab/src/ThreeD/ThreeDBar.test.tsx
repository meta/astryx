// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ThreeDBar.test.tsx
 * @input ThreeDBar inside a ThreeDChart at 600x400 with the default camera
 * @output Render-smoke coverage: three shaded faces per bar (front 0.9,
 *   right 0.7, top 1), four corners per face
 * @position Colocated test for ThreeDBar.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {ThreeDChart} from './ThreeDChart';
import {ThreeDBar} from './ThreeDBar';

const data = [
  {x: 0, y: 1, z: 0},
  {x: 2, y: 2, z: 2},
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

function renderBars(children: React.ReactNode) {
  const result = render(
    <ThreeDChart data={data} xKey="x" yKey="y" zKey="z">
      {children}
    </ThreeDChart>,
  );
  reportWidth(600);
  return result;
}

describe('ThreeDBar', () => {
  it('renders three face polygons per datum', () => {
    const {container} = renderBars(<ThreeDBar color="#00ff00" />);

    const barGroups = container.querySelectorAll('svg g g');
    expect(barGroups).toHaveLength(2);
    expect(container.querySelectorAll('polygon')).toHaveLength(6);
  });

  it('shades each bar face: front 0.9, right 0.7, top 1', () => {
    const {container} = renderBars(<ThreeDBar color="#00ff00" />);

    for (const bar of container.querySelectorAll('svg g g')) {
      const opacities = Array.from(bar.querySelectorAll('polygon'), p =>
        p.getAttribute('fill-opacity'),
      );
      expect(opacities).toEqual(['0.9', '0.7', '1']);
    }
  });

  it('gives every face four projected corners and the bar color', () => {
    const {container} = renderBars(<ThreeDBar color="#00ff00" />);

    for (const polygon of container.querySelectorAll('polygon')) {
      const pairs = (polygon.getAttribute('points') ?? '').split(' ');
      expect(pairs).toHaveLength(4);
      for (const pair of pairs) {
        const [px, py] = pair.split(',').map(parseFloat);
        expect(px).not.toBeNaN();
        expect(py).not.toBeNaN();
      }
      expect(polygon).toHaveAttribute('fill', '#00ff00');
    }
  });
});
