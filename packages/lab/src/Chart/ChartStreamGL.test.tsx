// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartStreamGL.test.tsx
 * @input Renders ChartStreamGL inside Chart with stubbed ResizeObserver, WebGL-less
 *   canvas (getContext → null), and a getScreenCTM polyfill returning null (the
 *   spec value for unrendered elements — jsdom lacks the method entirely)
 * @output Render-smoke coverage for the GL stream: marker group, overlay canvas,
 *   and safe imperative pushes without a WebGL context (#4295)
 * @position Colocated test for ChartStreamGL.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from './Chart';
import {ChartStreamGL, type ChartStreamGLHandle} from './ChartStreamGL';

// Streaming charts start empty and take their window from explicit domains.
const streamProps = {
  data: [] as Record<string, unknown>[],
  xKey: 't',
  yKeys: ['v'],
  xDomain: [0, 10] as [number, number],
  yDomain: [0, 1] as [number, number],
};

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

describe('ChartStreamGL', () => {
  it('mounts a positioning marker group without a WebGL context', () => {
    const {container} = render(
      <Chart {...streamProps}>
        <ChartStreamGL color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    expect(container.querySelector('svg > g > g')).not.toBeNull();
  });

  it('mounts the overlay canvas as a sibling of the svg', () => {
    const {container} = render(
      <Chart {...streamProps}>
        <ChartStreamGL color="#0064E0" />
      </Chart>,
    );

    reportWidth(464);

    const canvas = container.querySelector('canvas');
    const svg = container.querySelector('svg');
    expect(canvas).not.toBeNull();
    expect(canvas?.parentElement).toBe(svg?.parentElement);
  });

  it('accepts streamed points and clear without a WebGL context', () => {
    let handle: ChartStreamGLHandle | null = null;

    render(
      <Chart {...streamProps}>
        <ChartStreamGL
          color="#0064E0"
          handleRef={h => {
            handle = h;
          }}
        />
      </Chart>,
    );

    reportWidth(464);

    expect(handle).not.toBeNull();
    expect(() =>
      act(() => {
        handle?.push(1, 0.5);
        handle?.push(2, 0.7);
        handle?.push(3, 0.4);
        handle?.clear();
      }),
    ).not.toThrow();
  });
});
