// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ThreeDScatterGL.test.tsx
 * @input ThreeDScatterGL inside a ThreeDChart with
 *   HTMLCanvasElement.prototype.getContext stubbed to return null (jsdom has
 *   no WebGL)
 * @output Mount smoke coverage: the sibling canvas is created and sized, the
 *   null-context guard prevents a crash, and unmount removes the canvas
 * @position Colocated test for ThreeDScatterGL.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {ThreeDChart} from './ThreeDChart';
import {ThreeDScatterGL} from './ThreeDScatterGL';

const data = [
  {x: 0, y: 0, z: 0},
  {x: 2, y: 2, z: 2},
];

// Capture the ResizeObserver callback so tests can drive the reported width.
let resizeCallback: ResizeObserverCallback | undefined;

// jsdom has no WebGL — return null so the component's null-context guard runs.
const originalGetContext = HTMLCanvasElement.prototype.getContext;

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
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
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

describe('ThreeDScatterGL', () => {
  it('mounts a sibling canvas sized to the chart even when WebGL is unavailable', () => {
    const {container} = render(
      <ThreeDChart data={data} xKey="x" yKey="y" zKey="z">
        <ThreeDScatterGL color="#ff0000" />
      </ThreeDChart>,
    );
    reportWidth(600);

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    // Canvas sits next to the svg, not inside it.
    expect(canvas?.parentElement).toBe(
      container.querySelector('svg')?.parentElement,
    );
    // CSS size is logical pixels; the buffer is supersampled.
    expect(canvas?.style.width).toBe('600px');
    expect(canvas?.style.height).toBe('400px');
  });

  it('removes the canvas on unmount', () => {
    const {container, unmount} = render(
      <ThreeDChart data={data} xKey="x" yKey="y" zKey="z">
        <ThreeDScatterGL color="#ff0000" />
      </ThreeDChart>,
    );
    reportWidth(600);

    expect(container.querySelector('canvas')).not.toBeNull();

    unmount();

    expect(document.querySelector('canvas')).toBeNull();
  });
});
