// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartDotGL.test.tsx
 * @input Renders ChartDotGL inside Chart with stubbed ResizeObserver, WebGL-less
 *   canvas (getContext → null), and a getScreenCTM polyfill returning null (the
 *   spec value for unrendered elements — jsdom lacks the method entirely)
 * @output Render-smoke coverage for the GL scatter: marker group, overlay canvas
 *   mount and unmount, no crash without WebGL (#4295)
 * @position Colocated test for ChartDotGL.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartDotGL} from './ChartDotGL';

const data = [
  {x: 0, y: 1},
  {x: 1, y: 2},
  {x: 2, y: 3},
];

// Capture the ResizeObserver callback so tests can drive the reported width.
let resizeCallback: ResizeObserverCallback | undefined;

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let hadGetScreenCTM = false;

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

  // Behave like a browser without WebGL — the GL marks null-guard this.
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;

  // jsdom has no getScreenCTM at all; a real browser returns null for
  // undisplayed elements and mountCanvasOverSVG handles that branch.
  const svgProto = SVGElement.prototype as unknown as {
    getScreenCTM?: () => unknown;
  };
  hadGetScreenCTM = typeof svgProto.getScreenCTM === 'function';
  if (!hadGetScreenCTM) {
    svgProto.getScreenCTM = () => null;
  }
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  if (!hadGetScreenCTM) {
    delete (SVGElement.prototype as unknown as {getScreenCTM?: unknown})
      .getScreenCTM;
  }
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

describe('ChartDotGL', () => {
  it('mounts a positioning marker group without a WebGL context', () => {
    const {container} = render(
      <Chart data={data} xKey="x" yKeys={['y']}>
        <ChartDotGL dataKey="y" color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelector('svg > g > g')).not.toBeNull();
  });

  it('mounts the overlay canvas as a sibling of the svg', () => {
    const {container} = render(
      <Chart data={data} xKey="x" yKeys={['y']}>
        <ChartDotGL dataKey="y" color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    const canvas = container.querySelector('canvas');
    const svg = container.querySelector('svg');
    expect(canvas).not.toBeNull();
    expect(canvas?.parentElement).toBe(svg?.parentElement);
    expect(canvas?.style.position).toBe('absolute');
    expect(canvas?.style.pointerEvents).toBe('none');
  });

  it('removes the overlay canvas on unmount', () => {
    const {container, unmount} = render(
      <Chart data={data} xKey="x" yKeys={['y']}>
        <ChartDotGL dataKey="y" color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);
    expect(container.querySelector('canvas')).not.toBeNull();

    unmount();

    expect(document.querySelector('canvas')).toBeNull();
  });
});
