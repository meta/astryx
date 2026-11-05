// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ThreeDAxis.test.tsx
 * @input ThreeDAxis inside a ThreeDChart at 600x400 with the default camera;
 *   domains computed from data as [0, 2] on every key
 * @output Render-smoke coverage: three axis lines from a shared origin,
 *   key + domain labels, and the labels={false} switch
 * @position Colocated test for ThreeDAxis.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {ThreeDChart} from './ThreeDChart';
import {ThreeDAxis} from './ThreeDAxis';

const data = [
  {x: 0, y: 0, z: 0},
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

function renderAxis(children: React.ReactNode) {
  const result = render(
    <ThreeDChart data={data} xKey="x" yKey="y" zKey="z">
      {children}
    </ThreeDChart>,
  );
  reportWidth(600);
  return result;
}

describe('ThreeDAxis', () => {
  it('renders the three axis lines radiating from a shared origin', () => {
    const {container} = renderAxis(<ThreeDAxis />);

    const lines = container.querySelectorAll('line');
    expect(lines).toHaveLength(3);

    // All three lines start at project(0, 0, 0).
    const origins = Array.from(lines, l => [
      parseFloat(l.getAttribute('x1') ?? ''),
      parseFloat(l.getAttribute('y1') ?? ''),
    ]);
    expect(origins[1]).toEqual(origins[0]);
    expect(origins[2]).toEqual(origins[0]);
    expect(origins[0][0]).not.toBeNaN();
    expect(origins[0][1]).not.toBeNaN();
  });

  it('labels each axis with its data key and domain', () => {
    const {container} = renderAxis(<ThreeDAxis />);

    const labels = Array.from(
      container.querySelectorAll('text'),
      t => t.textContent,
    );
    expect(labels).toEqual(['x [0-2]', 'y [0-2]', 'z [0-2]']);
  });

  it('renders no labels when labels is false', () => {
    const {container} = renderAxis(<ThreeDAxis labels={false} />);

    expect(container.querySelectorAll('line')).toHaveLength(3);
    expect(container.querySelector('text')).toBeNull();
  });
});
