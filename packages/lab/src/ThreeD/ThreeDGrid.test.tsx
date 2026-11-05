// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ThreeDGrid.test.tsx
 * @input ThreeDGrid inside a ThreeDChart at 600x400 with the default camera
 * @output Render-smoke coverage: (divisions + 1) * 2 floor lines with finite
 *   projected endpoints
 * @position Colocated test for ThreeDGrid.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {ThreeDChart} from './ThreeDChart';
import {ThreeDGrid} from './ThreeDGrid';

const data = [
  {x: 0, y: 0, z: 0},
  {x: 1, y: 1, z: 1},
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

function renderGrid(children: React.ReactNode) {
  const result = render(
    <ThreeDChart data={data} xKey="x" yKey="y" zKey="z">
      {children}
    </ThreeDChart>,
  );
  reportWidth(600);
  return result;
}

describe('ThreeDGrid', () => {
  it('renders two lines per division boundary (12 for the default 5 divisions)', () => {
    const {container} = renderGrid(<ThreeDGrid />);

    expect(container.querySelectorAll('line')).toHaveLength(12);
  });

  it('renders (divisions + 1) * 2 lines for a custom division count', () => {
    const {container} = renderGrid(<ThreeDGrid divisions={2} />);

    expect(container.querySelectorAll('line')).toHaveLength(6);
  });

  it('projects every line endpoint to finite pixel coordinates', () => {
    const {container} = renderGrid(<ThreeDGrid />);

    for (const line of container.querySelectorAll('line')) {
      for (const attr of ['x1', 'y1', 'x2', 'y2']) {
        expect(Number.isFinite(parseFloat(line.getAttribute(attr) ?? ''))).toBe(
          true,
        );
      }
    }
  });
});
